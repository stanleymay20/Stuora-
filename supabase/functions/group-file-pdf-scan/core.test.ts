import {
  sha256Hex, scannerUrl, scanWithService, processPdfScanJobs, isValidPdfJob, PDF_PATH, UUID,
  type PdfJob, type PdfVerdict, type PdfWorkerDeps,
} from "./core.ts";

function assert(value:unknown,message="Assertion failed"):asserts value {
  if(!value)throw Error(message);
}
async function denies(action:()=>Promise<unknown>) {
  let caught=false;try{await action()}catch{caught=true}assert(caught,"Expected fail-closed rejection");
}
const GROUP="00000000-0000-0000-0000-000000000031";
const FILE="00000000-0000-0000-0000-000000000100";
const LEASE="00000000-0000-0000-0000-000000000101";
const job:PdfJob={file_id:FILE,lease_id:LEASE,object_path:`${GROUP}/${FILE}.pdf`,size_bytes:24};
const pdf=new TextEncoder().encode("%PDF-1.7\n1 0 obj\n%%EOF\n\n"); // actual length set per fixture
const engine="clamav-http-v1" as const;
const SCANNER="https://scanner.stuora.example/v1/scan-pdf";
const HOST="scanner.stuora.example";
const KEY="a".repeat(48);
function fixture(
  outcome:"clean"|"malicious"|"scanner-down"|"changed"="clean",
) {
  const entry={...job,size_bytes:pdf.length};
  let downloads=0;
  const settled:Array<{verdict:string,hash?:string,engine?:string}>=[];
  const deps:PdfWorkerDeps={
    claim:async limit=>limit===2?[entry]:[entry],
    load:async()=> {
      downloads++;
      if(outcome==="changed" && downloads===2) {
        const altered=new Uint8Array(pdf);
        altered[9]=altered[9]===49?50:49;
        return altered;
      }
      return pdf;
    },
    scan:async(_bytes,hash)=> {
      if(outcome==="scanner-down")throw Error("No scanner");
      return {verdict:outcome==="malicious"?"malicious":"clean",sha256:hash,engine};
    },
    finish:async(_entry,verdict,hash,s)=>{settled.push({verdict,hash,engine:s});return true},
  };
  return {deps,settled,downloads:()=>downloads};
}
Deno.test("UUID paths and PDF scan leases pass canonical validation",()=>{
  const entry={...job,size_bytes:pdf.length};
  assert(isValidPdfJob(entry), JSON.stringify({
    file:UUID.test(entry.file_id),lease:UUID.test(entry.lease_id),
    path:PDF_PATH.test(entry.object_path),
    identity:entry.object_path.split('/')[1]===entry.file_id+'.pdf',
    bytes:entry.size_bytes,
  }));
});

Deno.test("PDF scanner accepts only an approved HTTPS operator endpoint",()=>{
  assert(scannerUrl(SCANNER,HOST)===SCANNER);
  for(const invalid of ["http://scanner.stuora.example/v1/scan-pdf",
    "https://127.0.0.1/v1/scan-pdf","https://evil.example/v1/scan-pdf",
    "https://scanner.stuora.example@evil.example/v1/scan-pdf",
    "https://scanner.stuora.example/v1/scan-pdf?file=1"]) {
    let denied=false;try{scannerUrl(invalid,HOST)}catch{denied=true}assert(denied,invalid);
  }
});
Deno.test("scanner must return matching SHA256 and exact engine before trust",async()=>{
  const hash=await sha256Hex(pdf);
  let sentBytes=0;
  const mocked=async (_url:string|URL|Request,init?:RequestInit):Promise<Response>=>{
    const body=init?.body as Uint8Array;
    sentBytes=body.byteLength;
    assert(init?.headers && (init.headers as Record<string,string>).Authorization==="Bearer "+KEY);
    return Response.json({verdict:"clean",sha256:hash,engine});
  };
  const result=await scanWithService(pdf,hash,SCANNER,HOST,KEY,mocked as typeof fetch);
  assert(result.sha256===hash && result.verdict==="clean" && sentBytes===pdf.length);
  const forged=async()=>Response.json({verdict:"clean",sha256:"0".repeat(64),engine});
  await denies(()=>scanWithService(pdf,hash,SCANNER,HOST,KEY,forged as typeof fetch));
  const unknown=async()=>Response.json({verdict:"clean",sha256:hash,engine:"header-only"});
  await denies(()=>scanWithService(pdf,hash,SCANNER,HOST,KEY,unknown as typeof fetch));
  const failed=async()=>new Response("unavailable",{status:503});
  await denies(()=>scanWithService(pdf,hash,SCANNER,HOST,KEY,failed as typeof fetch));
});
Deno.test("clean trusted scan is associated with exact bytes on two downloads",async()=>{
  const f=fixture();
  const result=await processPdfScanJobs(f.deps);
  assert(result.approved===1 && result.failed===0 && f.downloads()===2, JSON.stringify({result,downloads:f.downloads(),settled:f.settled}));
  assert(f.settled.length===1 && f.settled[0].verdict==="clean");
  assert(f.settled[0].hash===await sha256Hex(pdf));
});
Deno.test("malicious verdict blocks the file rather than approving",async()=>{
  const f=fixture("malicious");
  const result=await processPdfScanJobs(f.deps);
  assert(result.blocked===1 && result.approved===0,JSON.stringify({result,settled:f.settled,downloads:f.downloads()}));
  assert(f.settled[0].verdict==="malicious");
});
Deno.test("scanner failures and changing stored bytes remain quarantined",async()=>{
  for(const mode of ["scanner-down","changed"] as const) {
    const f=fixture(mode);
    const result=await processPdfScanJobs(f.deps);
    assert(result.approved===0 && result.retrying===1);
    assert(f.settled[0].verdict==="error" && !f.settled[0].hash);
  }
});
Deno.test("invalid file paths cannot trigger a Storage read or scanner",async()=>{
  const f=fixture();
  let reads=0;
  f.deps.claim=async()=>[{...job,object_path:"../public/secret.pdf"}];
  f.deps.load=async()=>{reads++;return pdf};
  const result=await processPdfScanJobs(f.deps);
  assert(result.retrying===1 && reads===0 && f.settled[0].verdict==="error");
});
Deno.test("missing finalization acknowledgement never counts as approval",async()=>{
  const f=fixture();
  f.deps.finish=async()=>false;
  const result=await processPdfScanJobs(f.deps);
  assert(result.failed===1 && result.approved===0);
});
