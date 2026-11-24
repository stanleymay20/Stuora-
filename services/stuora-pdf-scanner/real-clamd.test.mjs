import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { scanWithClamd } from './clamd.mjs';

// Genuine ClamAV acceptance test. This is NOT a unit mock. It runs only in
// the explicit scanner workflow against a real clamd Docker container.
const host=process.env.CLAMD_HOST ?? '127.0.0.1';
const port=Number(process.env.CLAMD_PORT ?? 3310);
function ping() {
  return new Promise((resolve,reject)=>{
    const socket=createConnection({host,port});
    let finished=false;
    const done=(error)=>{
      if(finished)return;
      finished=true; socket.destroy();
      if(error)reject(error);else resolve();
    };
    socket.setTimeout(1500,()=>done(Error('ClamAV not ready')));
    socket.once('connect',()=>socket.write(Buffer.from('zPING\0')));
    socket.on('data',data=>{
      if(data.includes(Buffer.from('PONG'))) done();
      else done(Error('ClamAV ping mismatch'));
    });
    socket.on('error',()=>done(Error('ClamAV unavailable')));
    socket.on('close',()=>done(Error('ClamAV closed before ready')));
  });
}
async function ready() {
  for(let count=0;count<120;count++) {
    try {await ping();return} catch {await delay(2500);}
  }
  throw Error('Genuine ClamAV daemon was not ready');
}
test('genuine ClamAV recognizes a harmless PDF and EICAR standard antivirus test string', {timeout:330_000}, async()=>{
  await ready();
  const pdf=Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
  assert.equal(await scanWithClamd(pdf,{host,port,timeoutMs:15000}),'clean');
  // The EICAR string is a harmless industry-standard antivirus test fixture.
  // Never include a real malicious document or a private student upload here.
  const eicar=Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*','ascii');
  assert.equal(eicar.length,68,'EICAR fixture must be the exact 68-byte standard');
  assert.equal(await scanWithClamd(eicar,{host,port,timeoutMs:15000}),'malicious');
});
