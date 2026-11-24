// Staging-only trusted PDF scanner bridge. Compiled OFF until a vetted,
// operator-owned malware scanner and data-processing agreements exist.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.117.3";
import {matchingWorkerSecrets} from "../group-file-cleanup/core.ts";
import {MAX_PDF_BYTES,processPdfScanJobs,scanWithService,type PdfJob,type PdfWorkerDeps} from "./core.ts";

const STAGING_URL="https://uptjcspizukpjcoayhtn.supabase.co";
export const GROUP_PDF_SCANNER_COMPILED_IN=false;
const url=Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const workerToken=Deno.env.get("STUORA_PDF_SCAN_WORKER_TOKEN") ?? "";
const scannerEndpoint=Deno.env.get("STUORA_PDF_SCANNER_URL") ?? "";
const scannerHost=Deno.env.get("STUORA_PDF_SCANNER_HOST") ?? "";
const scannerKey=Deno.env.get("STUORA_PDF_SCANNER_AUTH_TOKEN") ?? "";
const admin=url===STAGING_URL && serviceKey
  ? createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
  : null;

function response(status:number,value:object):Response {
  return Response.json(value,{status,headers:{
    "Cache-Control":"no-store,private",
    "X-Content-Type-Options":"nosniff",
  }});
}
function dependencies():PdfWorkerDeps {
  if(!admin)throw Error("Document review unavailable");
  const client=admin;
  return {
    async claim(max) {
      const {data,error}=await client.rpc("claim_student_group_pdf_scan_jobs",{p_limit:max});
      if(error || !Array.isArray(data)) throw Error("PDF scan queue unavailable");
      return data as PdfJob[];
    },
    async load(path) {
      const {data,error}=await client.storage.from("stuora-group-files").download(path);
      if(error || !data || data.size<16 || data.size>MAX_PDF_BYTES)
        throw Error("Document unavailable");
      return new Uint8Array(await data.arrayBuffer());
    },
    async scan(bytes,sha256) {
      return await scanWithService(bytes,sha256,scannerEndpoint,scannerHost,scannerKey);
    },
    async finish(job,verdict,sha256,engine) {
      const {data,error}=await client.rpc("finish_student_group_pdf_scan",{
        p_file:job.file_id,
        p_lease:job.lease_id,
        p_verdict:verdict,
        p_sha256:sha256 ?? null,
        p_engine:engine ?? null,
      });
      if(error) throw Error("PDF scan finalization unavailable");
      return data===true;
    },
  };
}

Deno.serve(async request => {
  // Deliberately no browser CORS. No student token can call the operator worker.
  if(!GROUP_PDF_SCANNER_COMPILED_IN || url!==STAGING_URL || !admin ||
    Deno.env.get("STUORA_GROUP_FILES_ACTIVATION")!=="STAGING_APPROVED")
    return response(503,{error:"PDF scanning is not enabled"});
  if(request.method!=="POST")return response(405,{error:"Method not allowed"});
  const [validServiceKey,validWorkerToken]=await Promise.all([
    matchingWorkerSecrets(request.headers.get("apikey")??"",serviceKey),
    matchingWorkerSecrets(request.headers.get("x-stuora-pdf-scan-token")??"",workerToken),
  ]);
  if(!validServiceKey || !validWorkerToken) return response(403,{error:"Forbidden"});
  try {
    const result=await processPdfScanJobs(dependencies(),2);
    // Counts only; raw filenames, scan payloads and paths never leave the worker.
    return response(200,result);
  }catch {
    console.error("PDF scan service requires operator attention");
    return response(503,{error:"Document review unavailable"});
  }
});
