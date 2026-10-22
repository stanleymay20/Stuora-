import {createServer} from 'node:http';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeMediaQuarantine,validateInputs} from '../scripts/verify-stuora-media-quarantine.mjs';

const A='student-a@example.invalid',B='student-b@example.invalid';
const key='sb_publishable_local_test_fixture_abc1234';
const okEnv={
 STUORA_STAGING_ACCEPTANCE:'I_APPROVE_STAGING_TEST_WRITES',
 STUORA_MEDIA_NEGATIVE_APPROVAL:'I_APPROVE_DENIAL_PROBES',
 STUORA_TEST_STUDENT_A_EMAIL:A,STUORA_TEST_STUDENT_B_EMAIL:B,
 STUORA_TEST_STUDENT_A_PASSWORD:'fixture-password-a',
 STUORA_TEST_STUDENT_B_PASSWORD:'fixture-password-b',
 STUORA_STAGING_PUBLISHABLE_KEY:key,
};
const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'];
const listingId='10000000-0000-4000-8000-000000000099';
const sampleId='10000000-0000-4000-8000-000000000088';
const tkn=['eyJ.owned-fixture-one.sig','eyJ.owned-fixture-two.sig'];
function fixture({metaCode=42501,storageStatus=403,storageMessage='new row violates row-level security policy',duplicate=false,successUpload=false}={}){
 const hits=[];
 const respond=(status,obj)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(obj)});
 const impl=async (url,opts)=>{
  assert.equal(opts.redirect,'error','Every request, including exceptional cleanup, must reject redirects');
  const u=new URL(url);hits.push({url:u.href,method:opts.method||'GET',headers:opts.headers,body:opts.body});
  assert.equal(u.host,'uptjcspizukpjcoayhtn.supabase.co');
  const signIns=hits.filter(h=>h.url.includes('grant_type=password')).length;
  const idx=Math.max(0,signIns-1);
  if(u.pathname==='/auth/v1/token')return respond(200,{access_token:tkn[idx]});
  if(u.pathname==='/auth/v1/user')return respond(200,{id:ids[duplicate?0:idx],email_confirmed_at:'2026-10-01T10:00:00Z'});
  if(u.pathname==='/rest/v1/listing_media')return respond(metaCode===42501?403:409,{code:String(metaCode),message:'forbidden'});
  if(u.pathname.startsWith('/storage/v1/object/public/'))return respond(404,{error:'not_found'});
  if(u.pathname==='/storage/v1/object/listing-media')return respond(200,{message:'removed'});
  if(u.pathname.startsWith('/storage/v1/object/listing-media/'))
    return respond(successUpload?200:storageStatus,{message:storageMessage});
  throw Error('Unexpected path '+u.pathname);
 };
 return {hits,impl};
}
test('refuses missing approval, credentials and secret/admin keys before any network',async()=>{
 const input=Object.assign({},okEnv);delete input.STUORA_MEDIA_NEGATIVE_APPROVAL;
 assert.throws(()=>validateInputs(input),/approval/);
 assert.throws(()=>validateInputs({...okEnv,STUORA_STAGING_PUBLISHABLE_KEY:'sb_secret_do_not_use'}),/publishable/);
 assert.throws(()=>validateInputs({...okEnv,STUORA_TEST_STUDENT_B_EMAIL:A}),/distinct/);
 let requests=0;
 await assert.rejects(probeMediaQuarantine({env:input,fetchImpl:()=>{requests++;throw Error('Should never fetch')}}),/approval/);
 assert.equal(requests,0);
});
test('two confirmed distinct staging JWTs get metadata 42501, Storage RLS denial, and no public object',async()=>{
 const m=fixture();const res=await probeMediaQuarantine({env:okEnv,fetchImpl:m.impl,uuid:()=>listingId});
 assert.equal(res.length,2);
 assert.ok(res.every(x=>x.metadataDenied&&x.storageDenied&&x.publicObjectAbsent));
 assert.equal(m.hits.filter(x=>x.url.endsWith('/rest/v1/listing_media')).length,2);
 assert.equal(m.hits.filter(x=>x.method==='POST'&&x.url.includes('/storage/v1/object/listing-media/')).length,2);
 assert.equal(m.hits.filter(x=>x.method==='GET'&&x.url.includes('/storage/v1/object/public/')).length,2);
 assert.ok(!JSON.stringify(res).includes(ids[0])&&!JSON.stringify(res).includes(tkn[0]));
});
test('inconclusive FK/rejected cross-account fixtures and successful uploads fail closed',async()=>{
 await assert.rejects(probeMediaQuarantine({env:okEnv,fetchImpl:fixture({metaCode:23503}).impl,uuid:()=>listingId}),/metadata INSERT was not rejected/);
 await assert.rejects(probeMediaQuarantine({env:okEnv,fetchImpl:fixture({duplicate:true}).impl,uuid:()=>listingId}),/two different/);
 await assert.rejects(probeMediaQuarantine({env:okEnv,fetchImpl:fixture({storageStatus:500}).impl,uuid:()=>listingId}),/RLS\/authorization/);
 const insecure=fixture({successUpload:true});
 await assert.rejects(probeMediaQuarantine({env:okEnv,fetchImpl:insecure.impl,uuid:()=>listingId}),/unexpectedly succeeded/);
 assert.equal(insecure.hits.filter(x=>x.method==='DELETE').length,1);
});

test('redirect failure stops before subsequent login or probe requests',async()=>{
 for(const stopAt of [1,2,3,4,5]){
  const m=fixture();let calls=0;
  await assert.rejects(probeMediaQuarantine({env:okEnv,uuid:()=>listingId,
   fetchImpl:async(url,opts)=>{
    calls++;
    assert.equal(opts.redirect,'error');
    if(calls===stopAt)throw new TypeError('fetch failed');
    return m.impl(url,opts);
   }}),/fetch failed/);
  assert.equal(calls,stopAt);
 }
});

test('native fetch rejects 307/308 without replaying the fixture password body',async()=>{
 for(const status of [307,308]){
  let redirected=0;
  const server=createServer((req,res)=>{
   if(req.url==='/destination'){redirected++;res.writeHead(200);res.end('{}');return;}
   res.writeHead(status,{Location:'/destination'});res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
   await assert.rejects(probeMediaQuarantine({env:okEnv,uuid:()=>listingId,
    fetchImpl:(_url,opts)=>fetch('http://127.0.0.1:'+server.address().port+'/redirect',opts)
   }),/fetch failed/);
   assert.equal(redirected,0);
  }finally{
   server.closeAllConnections();
   await new Promise(resolve=>server.close(resolve));
  }
 }
});
