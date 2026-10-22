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
