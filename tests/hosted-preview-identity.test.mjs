import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=readFileSync('tests/hosted/previewIdentity.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
assert.equal(compiled.diagnostics?.length??0,0);
const module={exports:{}};
runInNewContext(compiled.outputText,{
  module,exports:module.exports,URL,
  require:(name)=>{if(name==='node:child_process')return {execFileSync:()=> 'a'.repeat(40)};throw Error('Unexpected module '+name);}
});
const {validateApprovedPreview,approvedPreviewFromEnvironment}=module.exports;
const sha='a'.repeat(40),url='https://stuora-preview-frco0jbaw-stanleymay20s-projects.vercel.app';
const valid={previewUrl:url,deploymentSha:sha,checkedOutSha:sha};
test('only immutable Stuora Preview origin and exact matching checked-out commit qualify',()=>{
 assert.equal(validateApprovedPreview(valid),url);
 assert.equal(validateApprovedPreview({...valid,deploymentSha:'b'.repeat(40)}),null);
 assert.equal(validateApprovedPreview({...valid,deploymentSha:sha.slice(0,39)}),null);
 assert.equal(validateApprovedPreview({...valid,previewUrl:'http://'+url.slice(8)}),null);
 for(const bad of [
  'https://stuora-preview-frco0jbaw-stanleymay20s-projects.vercel.app/',
  'https://stuora-preview-frco0jbaw-stanleymay20s-projects.vercel.app/?s=1',
  'https://stuora-preview-frco0jbaw-stanleymay20s-projects.vercel.app.evil.com',
  'https://stuora-preview-git-old-stanleymay20s-projects.vercel.app',
  'https://stuora-preview-frco0jbaw-stanleymay20s-projects.vercel.app:443',
  'https://example.com','https://mljmifovcthvtuquvyzf.supabase.co',
  'https://user:pass@stuora-preview-frco0jbaw-stanleymay20s-projects.vercel.app'
 ])assert.equal(validateApprovedPreview({...valid,previewUrl:bad}),null,bad);
});
test('approval flag gates the hosted preview before any credentials or navigation',()=>{
 assert.equal(approvedPreviewFromEnvironment({}),null);
 assert.equal(approvedPreviewFromEnvironment({STUORA_STAGING_PREVIEW_URL:url,STUORA_VERIFIED_DEPLOYMENT_SHA:sha}),null);
 assert.equal(approvedPreviewFromEnvironment({STUORA_STAGING_ACCEPTANCE:'I_APPROVE_STAGING_TEST_WRITES',STUORA_STAGING_PREVIEW_URL:url,STUORA_VERIFIED_DEPLOYMENT_SHA:sha}),url);
 assert.equal(approvedPreviewFromEnvironment({STUORA_STAGING_ACCEPTANCE:'I_APPROVE_STAGING_TEST_WRITES',STUORA_STAGING_PREVIEW_URL:url,STUORA_VERIFIED_DEPLOYMENT_SHA:'b'.repeat(40)}),null);
});
test('two-student suite never targets an old pinned deployment or current public Storage upload',()=>{
 const spec=readFileSync('tests/hosted/browser/real-two-student.spec.ts','utf8');
 const config=readFileSync('playwright.hosted.config.ts','utf8');
 assert.match(spec,/approvedPreviewFromEnvironment\(\)/);
 assert.match(config,/approvedPreviewFromEnvironment\(\)/);
 assert.doesNotMatch(spec,/fileChooser|setFiles\(|assertStagingPhotoLoads|photoAttached|\/storage\/v1\/object\/public/);
 assert.doesNotMatch(spec,/git-fix-ga-recover/);
 assert.doesNotMatch(config,/git-fix-ga-recover/);
 assert.match(spec,/test\.skip\(!ready/);
});
