/** PDF scanning is NOT active until a vetted scanner is connected.
 * A recognizable PDF header is not malware scanning. All bytes remain private.
 */
import { plausiblePdfHeader } from "../group-file-intake/preflight.ts";

export type PdfJob = { file_id: string; lease_id: string; object_path: string; size_bytes: number };
export type PdfVerdict = { verdict: 'clean' | 'malicious'; sha256: string; engine: 'clamav-http-v1' };
export type PdfScanCounts = { claimed: number; approved: number; blocked: number; retrying: number; failed: number };
export interface PdfWorkerDeps {
  claim(max: number): Promise<PdfJob[]>;
  load(path: string): Promise<Uint8Array>;
  scan(bytes: Uint8Array, sha256: string): Promise<PdfVerdict>;
  finish(job: PdfJob, verdict: 'clean'|'malicious'|'error', sha256?: string, engine?: string): Promise<boolean>;
}
export const PDF_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_PDF_BYTES = 5_242_880;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',bytes as BufferSource);
  return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
export function isValidPdfJob(job: PdfJob): boolean {
  return UUID.test(job.file_id) && UUID.test(job.lease_id) &&
    PDF_PATH.test(job.object_path) &&
    job.object_path.split('/')[1] === job.file_id+'.pdf' &&
    Number.isSafeInteger(job.size_bytes) && job.size_bytes >= 16 &&
    job.size_bytes <= MAX_PDF_BYTES;
}
/** Never call this with a student-controlled scanner URL. This address is
 * trusted operator configuration and must be reviewed for GDPR compliance.
 */
export function scannerUrl(url: string, allowedHost: string): string {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:' || !allowedHost || parsed.hostname!==allowedHost ||
    !/^[a-z0-9.-]+$/.test(allowedHost) ||
    parsed.port || parsed.username || parsed.password ||
    parsed.pathname!=='/v1/scan-pdf' || parsed.search || parsed.hash ||
    allowedHost==='localhost' || allowedHost.endsWith('.local'))
    throw new Error('Scanner endpoint not approved');
  return parsed.href;
}
async function readScannerBody(response: Response): Promise<string> {
  if (!response.body) throw Error('Empty scanner response');
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];
  let total=0;
  try {
    while(true) {
      const {value,done}=await reader.read();
      if(done) break;
      total+=value.byteLength;
      if(total>2048) throw Error('Scanner response too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  const bytes=new Uint8Array(total);let offset=0;
  for(const c of chunks) {bytes.set(c,offset);offset+=c.length;}
  return new TextDecoder().decode(bytes);
}
export async function scanWithService(
  bytes: Uint8Array, hash: string, url: string, allowedHost: string,
  bearer: string, httpFetch: typeof fetch = fetch,
): Promise<PdfVerdict> {
  const address=scannerUrl(url,allowedHost);
  if(!bearer || bearer.length<32 || !/^[0-9a-f]{64}$/.test(hash) ||
    bytes.byteLength<16 || bytes.byteLength>MAX_PDF_BYTES)
    throw new Error('Scanner is not configured');
  const response=await httpFetch(address,{
    method:'POST',
    headers:{
      Authorization:'Bearer '+bearer,
      'Content-Type':'application/pdf',
      'X-Stuora-Content-SHA256':hash,
      'Accept':'application/json',
    },
    body:bytes as BodyInit,
    redirect:'error',
    signal:AbortSignal.timeout(12_000),
  });
  if(!response.ok) throw Error('Scanner unavailable');
  const result:unknown=JSON.parse(await readScannerBody(response));
  if(!result || typeof result!=='object' ||
    !('verdict' in result) || !('sha256' in result) || !('engine' in result) ||
    (result.verdict!=='clean' && result.verdict!=='malicious') ||
    result.sha256!==hash || result.engine!=='clamav-http-v1')
    throw Error('Unverifiable scan result');
  return result as PdfVerdict;
}

/** Scanner failures and mismatches NEVER approve a PDF. They remain pending
 * for bounded retries and operator investigation after the retry limit.
 */
export async function processPdfScanJobs(deps:PdfWorkerDeps, max=2): Promise<PdfScanCounts> {
  const jobs=await deps.claim(Math.min(2,Math.max(1,Math.trunc(max)||1)));
  if(jobs.length>2) throw Error('Scanner batch exceeds cap');
  const counts:PdfScanCounts={claimed:jobs.length,approved:0,blocked:0,retrying:0,failed:0};
  for(const job of jobs) {
    let verdict:'clean'|'malicious'|'error'='error';
    let scanHash:string|undefined;
    let engine:string|undefined;
    if(isValidPdfJob(job)) {
      try {
        const bytes=await deps.load(job.object_path);
        if(bytes.byteLength!==job.size_bytes || !plausiblePdfHeader(bytes))
          throw Error('Invalid or mutated PDF');
        const hash=await sha256Hex(bytes);
        const scanned=await deps.scan(bytes,hash);
        if(scanned.sha256!==hash || scanned.engine!=='clamav-http-v1' ||
          !['clean','malicious'].includes(scanned.verdict))
          throw Error('Unverified scanner response');
        // Detect a file replacement during scanning; unauthorized direct Storage
        // writes are blocked, but defensive verification is still needed.
        const verified=await deps.load(job.object_path);
        if(verified.byteLength!==bytes.byteLength ||
          (await sha256Hex(verified))!==hash) throw Error('PDF changed during scan');
        verdict=scanned.verdict;
        scanHash=hash;
        engine=scanned.engine;
      }catch { /* Scanning failed closed. No bytes or file names in logs. */ }
    }
    try {
      const done=await deps.finish(job,verdict,scanHash,engine);
      if(!done){counts.failed++;continue;}
      if(verdict==='clean')counts.approved++;
      else if(verdict==='malicious')counts.blocked++;
      else counts.retrying++;
    } catch {counts.failed++;}
  }
  return counts;
}
