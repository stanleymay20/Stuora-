// Staging-only, compiled-off group attachment intake. No unreviewed file
// is publicly readable, and the listing-media cutover remains untouched.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { decodeAndEncode } from "../listing-photo-intake/processor.ts";
import { STAGING_API_URL } from "../listing-photo-intake/releaseGate.ts";
import { safeOriginalName, downloadableName, plausiblePdfHeader } from "./preflight.ts";

export const GROUP_FILE_UPLOADS_COMPILED_IN = false;
const MAX_RAW_BYTES = 5_242_880;
const MAX_MULTIPART_BYTES = MAX_RAW_BYTES + 32_768;
const READ_DEADLINE_MS = 15_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const url = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const webOrigin = Deno.env.get("STUORA_ALLOWED_WEB_ORIGIN") ?? "";
const admin = url === STAGING_API_URL && serviceKey
  ? createClient(url, serviceKey, {auth:{persistSession:false,autoRefreshToken:false}})
  : null;

class Rejection extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function reply(status: number, data: object, origin: string|null) {
  const headers: Record<string,string> = {
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
    "Vary":"Origin",
  };
  if (origin && origin === webOrigin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return new Response(JSON.stringify(data),{status,headers});
}

async function readBoundedForm(request: Request): Promise<FormData> {
  if (!request.body) throw new Rejection(400,"Missing upload");
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data;"))
    throw new Rejection(415,"Multipart upload required");
  const announced = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(announced) || announced > MAX_MULTIPART_BYTES)
    throw new Rejection(413,"Attachment too large");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const deadline = Date.now() + READ_DEADLINE_MS;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Rejection(408,"Upload timed out");
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_,reject)=>{
        timer = setTimeout(()=>reject(new Rejection(408,"Upload timed out")),remaining);
      });
      const {done,value} = await Promise.race([reader.read(),timeout])
        .finally(()=>clearTimeout(timer));
      if (done) break;
      length += value.byteLength;
      if (length > MAX_MULTIPART_BYTES) throw new Rejection(413,"Attachment too large");
      chunks.push(value);
    }
  } catch(error) {
    await reader.cancel().catch(()=>{});
    throw error;
  } finally {reader.releaseLock();}
  const buffer=new Uint8Array(length);
  let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
  return new Request(request.url,{
    method:"POST",
    headers:{"content-type":type},
    body:buffer.buffer,
  }).formData();
}

Deno.serve(async request => {
  const origin=request.headers.get("Origin");
  if (!GROUP_FILE_UPLOADS_COMPILED_IN ||
      url!==STAGING_API_URL || !admin || !anonKey ||
      Deno.env.get("STUORA_GROUP_FILES_ACTIVATION")!=="STAGING_APPROVED" ||
      !/^https:\/\/[a-z0-9.-]+$/.test(webOrigin))
    return reply(503,{error:"Group file uploads are not enabled"},origin);
  if (origin && origin!==webOrigin) return reply(403,{error:"Unapproved origin"},null);
  if (request.method==="OPTIONS")return reply(200,{ok:true},origin);
  if (request.method!=="POST")return reply(405,{error:"Method not allowed"},origin);

  let uploadedPath:string|null=null;
  let lease:{actor:string;requestId:string}|null=null;
  try {
    const match=/^Bearer (\S+)$/i.exec(request.headers.get("authorization")??"");
    if(!match)throw new Rejection(401,"Sign in to upload files");
    const userClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:authError}=await userClient.auth.getUser(match[1]);
    if(authError||!user)throw new Rejection(401,"Session unavailable");
    const groupId=new URL(request.url).searchParams.get("groupId");
    if(!groupId||!UUID.test(groupId))throw new Rejection(400,"Invalid group");
    // Server-committed quota charge must precede untrusted body parsing.
    const {data:admitted,error:admissionError}=await admin.rpc("claim_student_group_file_upload",{
      p_actor:user.id,p_group:groupId,
    });
    if(admissionError||typeof admitted!=="boolean")
      throw new Rejection(503,"Upload admission unavailable");
    if(!admitted)throw new Rejection(429,"File uploads are unavailable or rate-limited");
    const form=await readBoundedForm(request);
    const input=form.get("file");
    const formGroup=form.get("groupId");
    if(!(input instanceof File)||formGroup!==groupId ||
      input.size===0||input.size>MAX_RAW_BYTES)
      throw new Rejection(400,"Invalid file or group");
    let name=safeOriginalName(input.name);
    if(!name)throw new Rejection(400,"A filename is required");
    const raw=new Uint8Array(await input.arrayBuffer());
    const isPdf=(input.type==="application/pdf"||(!input.type&&name.toLowerCase().endsWith(".pdf")));
    const fileId=crypto.randomUUID();
    let output:Uint8Array;
    let mime:"image/webp"|"application/pdf";
    let status:"approved"|"pending_review";
    if(isPdf){
      if(!name.toLowerCase().endsWith(".pdf")||!plausiblePdfHeader(raw))
        throw new Rejection(422,"Invalid PDF");
      // No PDF can become readable before trusted antivirus and document review.
      output=raw;mime="application/pdf";status="pending_review";
    } else {
      if(input.type && !["image/jpeg","image/png","image/webp"].includes(input.type))
        throw new Rejection(415,"Unsupported file type");
      // Reuse bounded CPU admission from trusted photo processor. One user and
      // at most four processing leases globally, with expiry on crashes.
      const requestId=crypto.randomUUID();
      const {data:acquired,error:leaseError}=await admin.rpc("acquire_listing_photo_processing_lease",{
        p_student:user.id,p_request:requestId,
      });
      if(leaseError||acquired!==true)throw new Rejection(429,"Image processing unavailable");
      lease={actor:user.id,requestId};
      const sanitized=decodeAndEncode(raw); // strips metadata, converts to clean WebP
      output=sanitized.data;mime="image/webp";status="approved";
      name=downloadableName(name,mime); // real stored bytes are WebP, not JPEG/PNG
    }
    if(output.byteLength<1||output.byteLength>MAX_RAW_BYTES)
      throw new Rejection(413,"Processed file exceeds the size limit");
    const objectPath=`${groupId}/${fileId}.${mime==="image/webp"?"webp":"pdf"}`;
    // Storage upload can succeed server-side yet return a network error.
    // Always attempt cleanup or durable queueing for that uncertain outcome.
    uploadedPath=objectPath;
    const {error:storeError}=await admin.storage.from("stuora-group-files")
      .upload(objectPath,output,{contentType:mime,upsert:false,cacheControl:"0"});
    if(storeError)throw new Rejection(503,"Private file storage unavailable");
    // Revalidate active membership and owner ban state in ONE database commit.
    const {data:committed,error:commitError}=await admin.rpc("commit_student_group_file_upload",{
      p_actor:user.id,p_group:groupId,p_file:fileId,p_original_name:name,
      p_size:output.byteLength,p_media_type:mime,p_object_path:objectPath,p_status:status,
    });
    if(commitError||committed!==fileId)
      throw new Rejection(403,"Group access changed; file was not shared");
    uploadedPath=null; // Metadata now owns the private object; cleanup queue on delete.
    return reply(201,{file:{id:fileId,name,media_type:mime,size_bytes:output.byteLength,status}},origin);
  } catch(error) {
    if(error instanceof Rejection)return reply(error.status,{error:error.message},origin);
    console.error("group-file-intake rejected upload",error instanceof Error?error.name:"unknown");
    return reply(503,{error:"Private file service unavailable"},origin);
  } finally {
    if(uploadedPath && admin) {
      try {
        const {error:cleanupError}=await admin.storage.from("stuora-group-files").remove([uploadedPath]);
        if(cleanupError) {
          const {data:queued,error:queueError}=await admin.rpc("enqueue_student_group_file_orphan",{
            p_object_path:uploadedPath,
          });
          if(queueError || queued!==true)
            console.error("group-file-intake: failed to enqueue orphan cleanup");
        }
      } catch {
        try {
          const {data:queued,error:queueError}=await admin.rpc("enqueue_student_group_file_orphan",{
            p_object_path:uploadedPath,
          });
          if(queueError || queued!==true)
            console.error("group-file-intake: orphan cleanup requires operator attention");
        } catch {
          console.error("group-file-intake: orphan cleanup service unavailable");
        }
      }
    }
    if(lease && admin){
      const {error:releaseError,data:released}=await admin.rpc("release_listing_photo_processing_lease",{
        p_student:lease.actor,p_request:lease.requestId,
      });
      if(releaseError||released!==true)console.error("group-file-intake processing lease requires review");
    }
  }
});
