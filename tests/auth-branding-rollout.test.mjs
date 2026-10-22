import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CORE,OPTIONAL,STAGING_REF,preparePatch,report,applyStaging} from '../scripts/stuora-auth-branding.mjs';
test('Stuora hosted Auth dry-run includes only six core templates, not unrelated settings',()=>{
 assert.equal(STAGING_REF,'uptjcspizukpjcoayhtn');
 assert.equal(CORE.length,6);assert.equal(OPTIONAL.length,7);
 const p=preparePatch();
 assert.equal(Object.keys(p).length,12);
 assert.equal(Object.keys(preparePatch(true)).length,26);
 assert.equal(report(p).fields.length,12);
 assert.ok(!Object.keys(p).some(k=>k.includes('smtp')||k.includes('redirect')||k.includes('enabled')));
 for(const key of CORE){
   assert.match(p['mailer_subjects_'+key],/^Stuora \|/);
   assert.match(p['mailer_templates_'+key+'_content'],/>Stuora</);
 }
});
test('No management token or explicit approval means no API request',async()=>{
 const saved=process.env.STUORA_AUTH_BRANDING_APPROVAL;
 delete process.env.STUORA_AUTH_BRANDING_APPROVAL;
 let called=0;
 try{
  await assert.rejects(applyStaging({token:'fixture',fetchImpl:async()=>{called++;throw Error('Unexpected network');}}),/Explicit staging-only approval/);
  assert.equal(called,0);
 } finally {
  if(saved===undefined)delete process.env.STUORA_AUTH_BRANDING_APPROVAL;
  else process.env.STUORA_AUTH_BRANDING_APPROVAL=saved;
 }
});

test('Installer performs a tightly scoped staging PATCH after a complete backup and verifies every changed field',async()=>{
 const patch=preparePatch();
 const initial=Object.fromEntries(Object.keys(patch).map(k=>[k,'Previous '+k]));
 let getCalls=0,patchCalls=0;
 const sent=[];
 const fetchImpl=async(url,init)=>{
   assert.equal(url,'https://api.supabase.com/v1/projects/uptjcspizukpjcoayhtn/config/auth');
   assert.match(init.headers.Authorization,/^Bearer test-token$/);
   if(init.method==='PATCH'){
     patchCalls++;sent.push(JSON.parse(init.body));
     return {ok:true};
   }
   getCalls++;
   return {ok:true,json:async()=>getCalls===1?initial:{...initial,...patch}};
 };
 const old=process.env.STUORA_AUTH_BRANDING_APPROVAL;
 process.env.STUORA_AUTH_BRANDING_APPROVAL='STAGING_ONLY_APPROVED';
 try{
   const result=await applyStaging({token:'test-token',fetchImpl});
   assert.equal(getCalls,2);assert.equal(patchCalls,1);
   assert.equal(result.readback,'verified');assert.equal(result.write,true);
   assert.deepEqual(sent[0],patch);
   assert.ok(result.backupPath.endsWith('staging-before.json'));
   const {readFileSync}=await import('node:fs');
   const backup=JSON.parse(readFileSync(result.backupPath,'utf8'));
   assert.equal(backup.project,STAGING_REF);
   assert.deepEqual(backup.previous,initial);
 } finally {
   if(old===undefined)delete process.env.STUORA_AUTH_BRANDING_APPROVAL;
   else process.env.STUORA_AUTH_BRANDING_APPROVAL=old;
 }
});
test('Already-installed Stuora templates produce zero changes',async()=>{
 const patch=preparePatch();
 let calls=0,patches=0;
 const old=process.env.STUORA_AUTH_BRANDING_APPROVAL;
 process.env.STUORA_AUTH_BRANDING_APPROVAL='STAGING_ONLY_APPROVED';
 try{
   const result=await applyStaging({token:'test-token',fetchImpl:async(_url,init)=>{
     calls++;
     if(init.method==='PATCH')patches++;
     return {ok:true,json:async()=>patch};
   }});
   assert.equal(result.readback,'already-matching');
   assert.equal(result.write,false);
   assert.equal(calls,1);assert.equal(patches,0);
 }finally{
   if(old===undefined)delete process.env.STUORA_AUTH_BRANDING_APPROVAL;
   else process.env.STUORA_AUTH_BRANDING_APPROVAL=old;
 }
});
test('Missing restorable field aborts before first write',async()=>{
 const patch=preparePatch();
 const entries=Object.entries(patch).slice(1);
 let writes=0;
 const old=process.env.STUORA_AUTH_BRANDING_APPROVAL;
 process.env.STUORA_AUTH_BRANDING_APPROVAL='STAGING_ONLY_APPROVED';
 try{
   await assert.rejects(applyStaging({token:'test-token',fetchImpl:async(_url,init)=>{
     if(init.method==='PATCH')writes++;
     return {ok:true,json:async()=>Object.fromEntries(entries)};
   }}),/omitted restorable template field/);
   assert.equal(writes,0);
 }finally{
   if(old===undefined)delete process.env.STUORA_AUTH_BRANDING_APPROVAL;
   else process.env.STUORA_AUTH_BRANDING_APPROVAL=old;
 }
});
