// PRIVATE OPERATOR WORKER — intentionally disabled at compile time.
// Do not deploy or schedule before storage/RLS audits and staging acceptance.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { processCleanup, matchingWorkerSecrets, type CleanupLease, type CleanupDeps } from "./core.ts";

const STAGING_URL = "https://uptjcspizukpjcoayhtn.supabase.co";
export const GROUP_FILE_CLEANUP_COMPILED_IN = false;
const apiUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const workerToken = Deno.env.get("STUORA_GROUP_FILE_CLEANUP_WORKER_TOKEN") ?? "";
const admin = apiUrl === STAGING_URL && serviceKey
  ? createClient(apiUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

function reply(status: number, response: object): Response {
  return Response.json(response,{status,headers:{
    "Cache-Control":"no-store, private",
    "X-Content-Type-Options":"nosniff",
  }});
}
function dependencies(): CleanupDeps {
  if (!admin) throw new Error("Cleanup service unavailable");
  const client = admin;
  return {
    async claim(limit) {
      const {data,error}=await client.rpc("claim_student_group_file_cleanup",{p_batch:limit});
      if(error || !Array.isArray(data))throw new Error("Cleanup claim unavailable");
      return data as CleanupLease[];
    },
    async remove(path) {
      const {error}=await client.storage.from("stuora-group-files").remove([path]);
      // No return value is considered success unless Storage explicitly
      // reports the operation completed with no error.
      return !error;
    },
    async finish(item, removed, reason) {
      const {data,error}=await client.rpc("finish_student_group_file_cleanup",{
        p_object_path:item.object_path,
        p_lease_id:item.lease_id,
        p_removed:removed,
        p_error_code:reason ?? null,
      });
      if(error)throw new Error("Cleanup acknowledgement unavailable");
      return data===true;
    },
  };
}

Deno.serve(async request => {
  // This is a server-to-server service. Never grant browser CORS.
  if(!GROUP_FILE_CLEANUP_COMPILED_IN || apiUrl!==STAGING_URL || !admin ||
      Deno.env.get("STUORA_GROUP_FILES_ACTIVATION")!=="STAGING_APPROVED")
    return reply(503,{error:"Group file cleanup is not enabled"});
  if(request.method!=="POST")return reply(405,{error:"Method not allowed"});

  // Require TWO independent secrets, both kept exclusively in Supabase
  // operator secrets/Vault. Never accept a student JWT or a publishable key.
  const validServiceKey=await matchingWorkerSecrets(
    request.headers.get("apikey") ?? "",serviceKey,
  );
  const validWorkerToken=await matchingWorkerSecrets(
    request.headers.get("x-stuora-cleanup-token") ?? "",workerToken,
  );
  if(!validServiceKey || !validWorkerToken)
    return reply(403,{error:"Forbidden"});

  try {
    const result=await processCleanup(dependencies(),4);
    // Counts only; never disclose group/user IDs, filenames or Storage paths.
    return reply(200,result);
  }catch {
    console.error("Private group-file cleanup requires operator attention");
    return reply(503,{error:"Cleanup unavailable"});
  }
});
