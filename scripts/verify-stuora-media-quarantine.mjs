import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const PROJECT='uptjcspizukpjcoayhtn';
const BASE='https://'+PROJECT+'.supabase.co';
const USER_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Valid, 1x1 transparent pixel: no EXIF, GPS, identity, student content.
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zuz0AAAAASUVORK5CYII=','base64');
const halt=message=>{throw Error(message);};
export function validateInputs(env){
 if(env.STUORA_STAGING_ACCEPTANCE!=='I_APPROVE_STAGING_TEST_WRITES'||
   env.STUORA_MEDIA_NEGATIVE_APPROVAL!=='I_APPROVE_DENIAL_PROBES')
   halt('Explicit approval for STAGING-ONLY media-denial probes is required');
 const emails=[env.STUORA_TEST_STUDENT_A_EMAIL,env.STUORA_TEST_STUDENT_B_EMAIL];
 const passwords=[env.STUORA_TEST_STUDENT_A_PASSWORD,env.STUORA_TEST_STUDENT_B_PASSWORD];
 if(!emails.every(e=>typeof e==='string'&&e.includes('@'))||
    emails[0].toLowerCase()===emails[1].toLowerCase()||
    !passwords.every(p=>typeof p==='string'&&p.length>=8))
    halt('Two distinct staging-only, email-confirmed student account credentials are required in a local secure environment');
 const key=env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.STUORA_STAGING_PUBLISHABLE_KEY;
 if(typeof key!=='string'||!key.startsWith('sb_publishable_')||key.length<20)
    halt('An explicit Stuora STAGING publishable key is required; no service-role/secret key is accepted');
 return {emails,passwords,key};
}
const readJson=async response=>{
 const body=await response.text();
 try{return JSON.parse(body.slice(0,8192));}catch{return {};}
};
export async function probeMediaQuarantine({env,fetchImpl=fetch,uuid=randomUUID}){
 const {emails,passwords,key}=validateInputs(env);
 const probe=uuid();
 if(!USER_ID.test(probe))halt('Invalid local test ID');
 // Never follow redirects: 307/308 can replay password or probe bodies off staging.
 const outcomes=[];
 for(let i=0;i<2;i++){
  const baseHeaders={apikey:key,'Content-Type':'application/json'};
  const login=await fetchImpl(BASE+'/auth/v1/token?grant_type=password',{
   method:'POST',redirect:'error',headers:baseHeaders,
   body:JSON.stringify({email:emails[i],password:passwords[i]}),
   signal:AbortSignal.timeout(20000),
  });
  if(!login.ok)halt('Dedicated staging test account '+(i+1)+' sign-in failed; no probes were sent for that account');
  const credentials=await readJson(login);
  const access=credentials.access_token;
  if(typeof access!=='string'||!access.startsWith('eyJ'))halt('Invalid staging access token response');
  const authHeaders={apikey:key,Authorization:'Bearer '+access};
  const user=await fetchImpl(BASE+'/auth/v1/user',{
   method:'GET',redirect:'error',headers:authHeaders,signal:AbortSignal.timeout(20000),
  });
  if(!user.ok)halt('Staging JWT validation failed');
  const owner=await readJson(user);
  if(!USER_ID.test(owner.id||'')||owner.is_anonymous===true)
    halt('Dedicated staging account is not a normal verified user');
  if(outcomes.some(o=>o.userId===owner.id))
    halt('Staging accounts must represent two different authenticated users');
  if(owner.email_confirmed_at===null||owner.email_confirmed_at===undefined)
    halt('Staging accounts must have confirmed email addresses');

  // Unique nonexistent listing gives the metadata endpoint no possible
  // legitimate insert target. The expected result is specifically 42501,
  // NOT a foreign-key 23503, 404, 5xx, or network failure.
  const listing=uuid(); if(!USER_ID.test(listing))halt('Invalid test listing ID');
  const path=owner.id+'/'+listing+'/stuora-denial-'+probe+'-'+i+'.png';
  const metadata=await fetchImpl(BASE+'/rest/v1/listing_media',{
   method:'POST',redirect:'error',
   headers:{...authHeaders,'Content-Type':'application/json',Prefer:'return=representation'},
   body:JSON.stringify({listing_id:listing,object_path:path,sort_order:0}),
   signal:AbortSignal.timeout(20000),
  });
  const metadataBody=await readJson(metadata);
  if(metadata.ok||metadata.status!==403||metadataBody.code!=='42501')
    halt('P0 FAIL: staging metadata INSERT was not rejected with the expected permission-denied result for account '+(i+1));

  // One tiny, constant safe pixel: no identifying data. A successful Storage
  // response is a stop-ship security failure; attempt prompt cleanup in that
  // exceptional case only, without hiding the primary failure.
  const storage=await fetchImpl(BASE+'/storage/v1/object/listing-media/'+path,{
   method:'POST',redirect:'error',
   headers:{...authHeaders,'Content-Type':'image/png','x-upsert':'false'},
   body:PIXEL,signal:AbortSignal.timeout(20000),
  });
  const storageBody=await readJson(storage);
  if(storage.ok){
   try{
    await fetchImpl(BASE+'/storage/v1/object/listing-media',{
     method:'DELETE',redirect:'error',headers:{...authHeaders,'Content-Type':'application/json'},
     body:JSON.stringify({prefixes:[path]}),signal:AbortSignal.timeout(10000),
    });
   }catch{}
   halt('P0 FAIL: direct listing-photo Storage upload unexpectedly succeeded. Check for orphaned object in staging.');
  }
  const reason=JSON.stringify(storageBody).slice(0,1500);
  if(![400,403].includes(storage.status) ||
     !/row.level|security policy|permission|not.authorized|unauthorized|access.denied/i.test(reason))
    halt('P0 FAIL: Storage rejection was not an RLS/authorization denial for account '+(i+1));

  const publicLookup=await fetchImpl(BASE+'/storage/v1/object/public/listing-media/'+path,{
   method:'GET',redirect:'error',headers:{apikey:key},signal:AbortSignal.timeout(20000),
  });
  if(publicLookup.ok||publicLookup.status!==404)
    halt('P0 FAIL: attempted upload is publicly retrievable or lookup result is inconclusive');
  outcomes.push({userId:owner.id,metadataDenied:true,storageDenied:true,publicObjectAbsent:true});
 }
 // No account IDs or tokens are returned/logged by the CLI. Keep this export
 // internal so mocked tests can assert independent account handling.
 return outcomes.map(o=>({metadataDenied:o.metadataDenied,storageDenied:o.storageDenied,publicObjectAbsent:o.publicObjectAbsent}));
}
async function main(){
 const result=await probeMediaQuarantine({env:process.env});
 console.log(JSON.stringify({project:PROJECT,scope:'staging only',accounts:result.length,
  ...result.reduce((x,y)=>({metadataDenied:x.metadataDenied&&y.metadataDenied,
     storageDenied:x.storageDenied&&y.storageDenied,
     noPublicTestObjects:x.noPublicTestObjects&&y.publicObjectAbsent}),
    {metadataDenied:true,storageDenied:true,noPublicTestObjects:true})},null,2));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
 main().catch(()=>{console.error('Stuora staging media-denial acceptance FAILED. Review the staging-only runbook; credentials and backend responses are never logged.');process.exitCode=1;});
