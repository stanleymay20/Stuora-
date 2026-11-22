// Disabled-by-default staging-only read gateway. No public URLs or signed links.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { authorizedGroupDownload, DownloadDenied, type DownloadDeps, type FileRecord } from "./core.ts";

const STAGING_URL = "https://uptjcspizukpjcoayhtn.supabase.co";
// Compile-time lock: changing it requires explicit review and staging acceptance.
export const GROUP_FILE_DOWNLOADS_COMPILED_IN = false;
const url = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigin = Deno.env.get("STUORA_ALLOWED_WEB_ORIGIN") ?? "";
const admin = url === STAGING_URL && secret
  ? createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function headers(origin: string | null): Record<string,string> {
  const result: Record<string,string> = {
    "Cache-Control": "no-store, private",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
  if (origin && origin === allowedOrigin) {
    result["Access-Control-Allow-Origin"] = origin;
    result["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    result["Access-Control-Allow-Headers"] = "authorization, apikey, x-client-info";
  }
  return result;
}
function errorResponse(status: number, message: string, origin: string|null): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: {
    ...headers(origin), "Content-Type": "application/json; charset=utf-8",
  } });
}
function deps(): DownloadDeps {
  if (!admin) throw new Error("Private storage unavailable");
  const client = admin;
  const fail = (): never => { throw new DownloadDenied(503,"File temporarily unavailable"); };
  return {
    async lookupFile(fileId) {
      const {data,error} = await client.from("student_group_files")
        .select("id,group_id,uploader_id,object_path,original_name,media_type,size_bytes,status,inspection_method,inspected_at")
        .eq("id",fileId).maybeSingle();
      if (error) fail();
      return data as FileRecord|null;
    },
    async activeMembership(groupId,studentId) {
      const {data,error} = await client.from("student_group_members")
        .select("user_id").eq("group_id",groupId).eq("user_id",studentId).maybeSingle();
      if (error) fail();
      return !!data;
    },
    async isBanned(groupId,studentId) {
      const {data,error} = await client.from("student_group_bans")
        .select("user_id").eq("group_id",groupId).eq("user_id",studentId).maybeSingle();
      if (error) fail();
      return !!data;
    },
    async readBytes(path) {
      const {data,error} = await client.storage.from("stuora-group-files").download(path);
      if (error || !data) throw new DownloadDenied(503, "File temporarily unavailable");
      return data;
    },
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (!GROUP_FILE_DOWNLOADS_COMPILED_IN ||
      url !== STAGING_URL || !anonKey || !admin ||
      Deno.env.get("STUORA_GROUP_FILES_ACTIVATION") !== "STAGING_APPROVED")
    return errorResponse(503, "File downloads are not enabled", origin);
  if (origin && origin !== allowedOrigin)
    return errorResponse(403,"Unapproved origin",null);
  if (request.method === "OPTIONS") return new Response(null, {status: 204,headers:headers(origin)});
  if (request.method !== "GET") return errorResponse(405,"Method not allowed",origin);
  try {
    const auth = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "");
    if (!auth) return errorResponse(401, "Sign in to access files", origin);
    const userClient = createClient(url, anonKey, {auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error}=await userClient.auth.getUser(auth[1]);
    if (error || !user) return errorResponse(401,"Invalid session",origin);
    const fileId=new URL(request.url).searchParams.get("fileId");
    const {bytes,name}=await authorizedGroupDownload(deps(),user.id,fileId);
    // Never infer trusted content type from the user-supplied filename.
    const disposition = "attachment; filename*=UTF-8''" + encodeURIComponent(name);
    return new Response(bytes,{status:200,headers:{
      ...headers(origin),
      "Content-Type":"application/octet-stream",
      "Content-Disposition":disposition,
      "Content-Length":String(bytes.size),
      "Content-Security-Policy":"sandbox",
    }});
  } catch(err) {
    if (err instanceof DownloadDenied) return errorResponse(err.status,err.message,origin);
    console.error("group-file-download failed",err instanceof Error?err.name:"unknown");
    return errorResponse(503,"File temporarily unavailable",origin);
  }
});
