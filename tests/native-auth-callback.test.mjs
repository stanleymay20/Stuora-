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
const access='eyJhbGciOiJIUzI1NiJ9.example.signature',refresh='refresh_token-valid123';
const valid='stuora://auth-callback#access_token='+access+'&refresh_token='+refresh+'&token_type=bearer';
test('Stuora implicit native confirmation and recovery callbacks use only own registered scheme',()=>{
 assert.equal(parse(valid).accessToken,access);
 assert.equal(parse(valid).refreshToken,refresh);
 assert.equal(parse(valid).recovery,false);
 assert.equal(parse(valid+'&type=recovery').recovery,true);
 assert.equal(parse(valid+'&type=signup').recovery,false);
 assert.equal(parse('stuora://auth-callback?access_token='+access+'&refresh_token='+refresh).accessToken,access);
});
test('native Auth parser rejects foreign routes and URLs even with apparently valid credentials',()=>{
 const other=[
  'https://phishing.example/sign-in#access_token='+access+'&refresh_token='+refresh,
  'https://uptjcspizukpjcoayhtn.supabase.co/auth/v1/verify#access_token='+access+'&refresh_token='+refresh,
  'other-app://auth-callback#access_token='+access+'&refresh_token='+refresh,
  'stuora://other-route#access_token='+access+'&refresh_token='+refresh,
  'stuora://auth-callback/other#access_token='+access+'&refresh_token='+refresh,
  'stuora://user:pass@auth-callback#access_token='+access+'&refresh_token='+refresh,
  'stuora://auth-callback:8000#access_token='+access+'&refresh_token='+refresh,
  'stuora://auth-callback?type=signup#access_token='+access+'&refresh_token='+refresh,
 ];
 for(const value of other)assert.equal(parse(value),null,value.slice(0,80));
});
test('ambiguous, invalid and incomplete callbacks never supply a session',()=>{
 const inputs=[
   null,undefined,'', 'stuora://auth-callback',
   'stuora://auth-callback?code=unhandled-pkce-code',
   'stuora://auth-callback#access_token=only',
   valid+'&access_token=another',
   valid+'&refresh_token=another',
   valid+'&type=recovery&type=signup',
   valid+'&token_type=mac',
   valid+'&error=access_denied',
   valid.replace('access_token='+access,'access_token='),
   valid.replace('refresh_token='+refresh,'refresh_token=a%20b'),
   ' '+valid, valid+' ',
   valid+'&access_token='+('a'.repeat(17000))
 ];
 for(const input of inputs)assert.equal(parse(input),null,String(input).slice(0,100));
});
test('AuthProvider uses audited parser; native callback cannot skip it',()=>{
 const provider=readFileSync('src/account/AuthProvider.tsx','utf8');
 assert.match(provider,/parseStuoraNativeAuthCallback\(raw\)/);
 assert.match(provider,/setSession\(\{\s*access_token: callback.accessToken/);
 assert.doesNotMatch(provider,/new URL\(raw\)/);
 assert.match(readFileSync('app.json','utf8'),/"scheme": "stuora"/);
});
