import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer as netServer} from 'node:net';
import {scanWithClamd} from './clamd.mjs';
import {makeScannerServer} from './index.mjs';

const token='secure-operator-token-'.repeat(3);
const pdf=Buffer.from('%PDF-1.7\n1 0 obj\n%%EOF\n');
const sha=createHash('sha256').update(pdf).digest('hex');

async function listen(server) {
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  return server.address().port;
}
async function close(server) {
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
}
async function mockClamd(reply='stream: OK\0') {
  const sessions=[];
  const server=netServer(socket=>{
    let received=Buffer.alloc(0);
    socket.on('data',part=>{
      received=Buffer.concat([received,part]);
      if(received.length<10)return;
      if(received.subarray(0,10).toString()!=='zINSTREAM\0')
        return socket.destroy();
      let offset=10;
      const uploaded=[];
      while(offset+4<=received.length){
        const length=received.readUInt32BE(offset);
        if(length===0){
          sessions.push(Buffer.concat(uploaded));
          socket.write(Buffer.from(reply));
          return;
        }
        if(offset+4+length>received.length)return;
        uploaded.push(received.subarray(offset+4,offset+4+length));
        offset+=4+length;
      }
    });
  });
  const port=await listen(server);
  return {server,port,sessions};
}

test('ClamAV adapter uses 4-byte network chunks and accepts only actual OK',async()=>{
  const fake=await mockClamd();
  try{
    const verdict=await scanWithClamd(pdf,{host:'127.0.0.1',port:fake.port});
    assert.equal(verdict,'clean');
    assert.equal(fake.sessions.length,1);
    assert.deepEqual(fake.sessions[0],pdf);
  }finally{await close(fake.server)}
});
test('ClamAV FOUND is malicious; ERROR never means clean',async()=>{
  const infected=await mockClamd('stream: Eicar-Test-Signature FOUND\0');
  try{assert.equal(await scanWithClamd(pdf,{port:infected.port}),'malicious')}
  finally{await close(infected.server)}
  const error=await mockClamd('stream: INSTREAM size limit exceeded ERROR\0');
  try{await assert.rejects(()=>scanWithClamd(pdf,{port:error.port}),/verifiable verdict/)}
  finally{await close(error.server)}
});
test('scanner HTTPS bridge only trusts strong tokens and hash-verified PDF bytes',async()=>{
  let scans=0;
  const server=makeScannerServer({token,scan:async()=>{scans++;return 'clean'}});
  const port=await listen(server);
  const url=`http://127.0.0.1:${port}/v1/scan-pdf`;
  try{
    const badToken=await fetch(url,{method:'POST',headers:{
      authorization:'Bearer wrong','content-type':'application/pdf',
      'x-stuora-content-sha256':sha,
    },body:pdf});
    assert.equal(badToken.status,403);
    const invalidHash=await fetch(url,{method:'POST',headers:{
      authorization:'Bearer '+token,'content-type':'application/pdf',
      'x-stuora-content-sha256':'0'.repeat(64),
    },body:pdf});
    assert.equal(invalidHash.status,422);
    const missingPdf=await fetch(url,{method:'POST',headers:{
      authorization:'Bearer '+token,'content-type':'text/plain',
      'x-stuora-content-sha256':sha,
    },body:pdf});
    assert.equal(missingPdf.status,415);
    assert.equal(scans,0,'no unverified document reaches clamd');
    const good=await fetch(url,{method:'POST',headers:{
      authorization:'Bearer '+token,'content-type':'application/pdf',
      'x-stuora-content-sha256':sha,
    },body:pdf});
    assert.equal(good.status,200);
    assert.deepEqual(await good.json(),{verdict:'clean',sha256:sha,engine:'clamav-http-v1'});
    assert.equal(scans,1);
  }finally{await close(server)}
});
test('scanner outages fail with 503 and never claim clean',async()=>{
  const server=makeScannerServer({token,scan:async()=>{throw Error('offline')}});
  const port=await listen(server);
  try{
    const r=await fetch(`http://127.0.0.1:${port}/v1/scan-pdf`,{
      method:'POST',headers:{
        authorization:'Bearer '+token,'content-type':'application/pdf',
        'x-stuora-content-sha256':sha,
      },body:pdf,
    });
    assert.equal(r.status,503);
    assert.equal((await r.json()).error,'Scanner unavailable');
  }finally{await close(server)}
});
