import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
const module={exports:{}};
runInNewContext(ts.transpileModule(readFileSync('src/account/nativePkceCrypto.ts','utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{module,exports:module.exports});
const install=module.exports.installNativePkceCrypto;
test('native crypto bridge produces real SHA-256 and secure values, preserving existing crypto',async()=>{
 const runtime={TextEncoder,btoa};
 install(runtime,webcrypto.getRandomValues.bind(webcrypto),data=>webcrypto.subtle.digest('SHA-256',data));
 const result=await runtime.crypto.subtle.digest('SHA-256',new TextEncoder().encode('abc'));
 assert.equal(Buffer.from(result).toString('hex'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.ok(runtime.crypto.getRandomValues(new Uint32Array(56)).some(n=>n!==0));
 await assert.rejects(runtime.crypto.subtle.digest('SHA-1',new Uint8Array()),/Unsupported/);
 const original=runtime.crypto.subtle.digest;
 install(runtime,()=>{throw Error('must not replace')},()=>{throw Error('must not replace')});
 assert.equal(runtime.crypto.subtle.digest,original);
 assert.throws(()=>install({},()=>{},()=>{}),/unavailable/);
});
function clientFixture(successExchange=false){
 const store=new Map(),requests=[];
 const client=createClient('https://pkce-test.invalid','sb_publishable_fixture',{
  auth:{flowType:'pkce',autoRefreshToken:false,persistSession:true,detectSessionInUrl:false,
   storage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}},
  global:{fetch:async(url,opts)=>{
   const body=JSON.parse(opts.body);requests.push({url:String(url),body});
   if(String(url).includes('/signup'))return new Response(JSON.stringify({id:'fixture-user',identities:[]}),{status:200});
   if(String(url).includes('/recover'))return new Response('{}',{status:200});
   if(successExchange){
    const token=[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({sub:'fixture-user',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture-signature'].join('.');
    return new Response(JSON.stringify({access_token:token,refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer',user:{id:'fixture-user',aud:'authenticated',email:'fixture@example.invalid'}}),{status:200});
   }
   return new Response(JSON.stringify({error:'invalid_grant',error_description:'Fixture rejects exchange'}),{status:400});
  }},
 });
 return {client,store,requests};
}
test('installed SDK generates S256 signup and recovery challenges; missing verifier cannot exchange',async()=>{
 const missing=clientFixture();
 const denied=await missing.client.auth.exchangeCodeForSession('unbound-code',{flowId:'unknown123'});
 assert.ok(denied.error);assert.equal(missing.requests.length,0);
 for(const recovery of [false,true]){
  const f=clientFixture();
  if(recovery)await f.client.auth.resetPasswordForEmail('fixture@example.invalid',{redirectTo:'stuora://auth-callback'});
  else await f.client.auth.signUp({email:'fixture@example.invalid',password:'fixture-only-password',options:{emailRedirectTo:'stuora://auth-callback'}});
  const request=f.requests[0];assert.equal(request.body.code_challenge_method,'s256');
  assert.match(request.body.code_challenge,/^[A-Za-z0-9_-]{43}$/);
  const redirect=new URL(request.url).searchParams.get('redirect_to');
  assert.ok(redirect);const flowId=new URL(redirect).searchParams.get('sb_flow_id');
  assert.equal(flowId,null); // SDK defaults to its persisted current-flow verifier slot.
  const bad=await f.client.auth.exchangeCodeForSession('wrong-code',flowId?{flowId}:undefined);
  assert.ok(bad.error);assert.equal(f.requests.length,2);
  assert.ok(f.requests[1].body.code_verifier);
  assert.notEqual(f.requests[1].body.code_verifier,request.body.code_challenge);
  assert.ok(!f.requests[1].body.code_verifier.includes('/recovery'));
  const replay=await f.client.auth.exchangeCodeForSession('wrong-code',flowId?{flowId}:undefined);
  assert.ok(replay.error);assert.equal(f.requests.length,2);
 }
});

test('SDK derives recovery event from stored recovery flow after successful code exchange',async()=>{
 const f=clientFixture(true),events=[];
 const {data:{subscription}}=f.client.auth.onAuthStateChange(event=>events.push(event));
 try{
  await f.client.auth.resetPasswordForEmail('fixture@example.invalid',{redirectTo:'stuora://auth-callback'});
  const result=await f.client.auth.exchangeCodeForSession('fixture-code');
  assert.equal(result.error,null);assert.ok(events.includes('PASSWORD_RECOVERY'));
  assert.equal(result.data.redirectType,'recovery');
 }finally{subscription.unsubscribe();}
});
