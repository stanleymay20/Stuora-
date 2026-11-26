import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { MAX_SCAN_BYTES, scanWithClamd } from './clamd.mjs';

const ENGINE='clamav-http-v1';
const SHA256=/^[0-9a-f]{64}$/;
const VALID_BEARER=/^Bearer (\S+)$/i;
const MAX_ACTIVE_SCANS=2;

function authorize(input, expected) {
  const match=VALID_BEARER.exec(input ?? '');
  if(!match || typeof expected!=='string' || expected.length<32 ||
     match[1].length>512) return false;
  const a=createHash('sha256').update(match[1]).digest();
  const b=createHash('sha256').update(expected).digest();
  return timingSafeEqual(a,b);
}
function send(res, status, data) {
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store, private',
    'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':'default-src \'none\'',
  });
  res.end(JSON.stringify(data));
}
class IntakeFailure extends Error {
  constructor(status,message){super(message);this.status=status}
}
async function readPdf(req) {
  if(req.headers['content-type']!=='application/pdf')
    throw new IntakeFailure(415,'PDF required');
  const announced=req.headers['content-length'];
  if(announced!==undefined && (!/^\d+$/.test(announced) ||
      Number(announced)>MAX_SCAN_BYTES))
    throw new IntakeFailure(413,'PDF exceeds scanner limit');
  const chunks=[];let count=0;
  for await (const chunk of req) {
    count += chunk.length;
    if(count>MAX_SCAN_BYTES)throw new IntakeFailure(413,'PDF exceeds scanner limit');
    chunks.push(chunk);
  }
  if(count<16)throw new IntakeFailure(422,'Invalid PDF');
  const bytes=Buffer.concat(chunks,count);
  if(bytes.subarray(0,5).toString()!=='%PDF-')
    throw new IntakeFailure(422,'Invalid PDF');
  return bytes;
}
export function makeScannerServer({
  token,
  scan=scanWithClamd,
  clamdHost='127.0.0.1',
  clamdPort=3310,
}={}) {
  if(typeof token!=='string' || token.length<32)
    throw new Error('SCANNER_AUTH_TOKEN must be a strong operator secret');
  let inFlight=0;
  const server=createServer(async (req,res)=>{
    if(req.url!=='/v1/scan-pdf' || req.method!=='POST')
      return send(res,404,{error:'Unavailable'});
    if(!authorize(req.headers.authorization,token))
      return send(res,403,{error:'Forbidden'});
    if(inFlight>=MAX_ACTIVE_SCANS)
      return send(res,429,{error:'Scanner capacity reached'});
    const hash=req.headers['x-stuora-content-sha256'];
    if(typeof hash!=='string' || !SHA256.test(hash))
      return send(res,422,{error:'Invalid content fingerprint'});
    inFlight++;
    try {
      const bytes=await readPdf(req);
      const actual=createHash('sha256').update(bytes).digest('hex');
      if(actual!==hash)
        throw new IntakeFailure(422,'Content fingerprint mismatch');
      // A real clamd daemon must complete a scan. Unknown/failed responses
      // never count as clean.
      const verdict=await scan(bytes,{host:clamdHost,port:clamdPort,timeoutMs:12_000});
      if(verdict!=='clean' && verdict!=='malicious')
        throw new Error('Unverifiable ClamAV verdict');
      return send(res,200,{verdict,sha256:actual,engine:ENGINE});
    } catch(error) {
      if(error instanceof IntakeFailure)
        return send(res,error.status,{error:error.message});
      return send(res,503,{error:'Scanner unavailable'});
    } finally { inFlight--; }
  });
  server.requestTimeout=15_000;
  server.headersTimeout=5_000;
  server.keepAliveTimeout=5_000;
  server.maxRequestsPerSocket=20;
  return server;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const token=process.env.SCANNER_AUTH_TOKEN;
  const port=Number(process.env.PORT??8787);
  const clamdHost=process.env.CLAMD_HOST??'127.0.0.1';
  const clamdPort=Number(process.env.CLAMD_PORT??3310);
  if(!Number.isInteger(port) || port<1 || port>65535)
    throw new Error('Invalid PORT');
  const server=makeScannerServer({token,clamdHost,clamdPort});
  // Deliberately loopback by default. A private reverse proxy must provide
  // HTTPS and never expose the ClamAV TCP daemon to the Internet.
  server.listen(port,process.env.BIND_HOST??'127.0.0.1');
}
