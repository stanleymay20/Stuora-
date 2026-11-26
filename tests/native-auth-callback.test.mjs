import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const source = readFileSync('src/account/nativeAuthCallback.ts','utf8');
const compiled = ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  reportDiagnostics:true
});
assert.ok(!(compiled.diagnostics??[]).some(x=>x.category===ts.DiagnosticCategory.Error),
  'TypeScript must transpile standalone native callback parser');
const module={exports:{}};
runInNewContext(compiled.outputText,{module,exports:module.exports,URL,URLSearchParams});
const parse=module.exports.parseStuoraNativeAuthCallback;
const code='5f8a2d0c-4b1e-4c9a-9a51-0e3f6c7d8b9a';
const valid='stuora://auth-callback?code='+code;
test('PKCE native callbacks yield only a one-time code from the registered scheme',()=>{
 assert.deepEqual({...parse(valid)},{code});
 assert.deepEqual({...parse('stuora://auth-callback/?code='+code)},{code});
});
test('implicit-flow tokens are refused even on the registered route (login CSRF)',()=>{
 const access='eyJhbGciOiJIUzI1NiJ9.example.signature',refresh='refresh_token-valid123';
 for(const v of [
  'stuora://auth-callback#access_token='+access+'&refresh_token='+refresh,
  'stuora://auth-callback?access_token='+access+'&refresh_token='+refresh,
  valid+'&access_token='+access,
  valid+'#access_token='+access,
 ]) assert.equal(parse(v),null,v.slice(0,80));
});
test('foreign, ambiguous and malformed callbacks never reach the exchange',()=>{
 for(const v of [
  null,undefined,'','stuora://auth-callback',
  'https://phishing.example/cb?code='+code,
  'other-app://auth-callback?code='+code,
  'stuora://other-route?code='+code,
  'stuora://auth-callback/other?code='+code,
  'stuora://user:pass@auth-callback?code='+code,
  'stuora://auth-callback:8000?code='+code,
  valid+'&code=another',
  valid+'&error=access_denied',
  'stuora://auth-callback?code=a%20b',
  'stuora://auth-callback?code=short',
  ' '+valid, valid+' ',
  'stuora://auth-callback?code='+'a'.repeat(5000),
 ]) assert.equal(parse(v),null,String(v).slice(0,100));
});
test('AuthProvider exchanges the code and the client is configured for PKCE',()=>{
 const provider=readFileSync('src/account/AuthProvider.tsx','utf8');
 assert.match(provider,/parseStuoraNativeAuthCallback\(raw\)/);
 assert.match(provider,/exchangeCodeForSession\(callback\.code\)/);
 assert.doesNotMatch(provider,/auth\.setSession\(/);
 assert.doesNotMatch(provider,/new URL\(raw\)/);
 assert.match(readFileSync('src/backend/supabase.ts','utf8'),/flowType: 'pkce'/);
 assert.match(readFileSync('app.json','utf8'),/"scheme": "stuora"/);
});
