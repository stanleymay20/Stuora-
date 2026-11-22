import { authorizedGroupDownload, DownloadDenied, type DownloadDeps, type FileRecord } from "./core.ts";

const G="00000000-0000-0000-0000-000000000031";
const A="00000000-0000-0000-0000-000000000001";
const F="00000000-0000-0000-0000-000000000100";

function assert(condition: unknown,message="Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}
async function rejects(action:()=>Promise<unknown>, status:number) {
  try { await action(); throw new Error("Unexpectedly granted file download"); }
  catch(e) {
    assert(e instanceof DownloadDenied, "Expected download denial");
    assert(e.status === status, `Expected ${status}, got ${e.status}`);
  }
}
const approved:FileRecord = {
  id:F,group_id:G,uploader_id:A,object_path:`${G}/${F}.pdf`,
  original_name:"Lecture notes.pdf",media_type:"application/pdf",
  size_bytes:4,status:"approved",inspection_method:"antivirus",
  inspected_at:"2026-11-22T18:00:00Z",
};
function fixture(changes:Partial<FileRecord>={}) {
  let reads=0,memberships=0,lookups=0;
  let member=true,banned=false;
  let current:FileRecord|null={...approved,...changes};
  const deps:DownloadDeps={
    async lookupFile(){lookups++;return current;},
    async activeMembership(){memberships++;return member;},
    async isBanned(){return banned;},
    async readBytes(){reads++;return new Blob([new Uint8Array([1,2,3,4])]);}
  };
  return {
    deps,reads:()=>reads,memberships:()=>memberships,lookups:()=>lookups,
    member:(v:boolean)=>{member=v;},banned:(v:boolean)=>{banned=v;},
    changeFile:(v:FileRecord|null)=>{current=v;},
  };
}

Deno.test("approved group member can download file after two checks",async()=>{
  const f=fixture();
  const result=await authorizedGroupDownload(f.deps,A,F);
  assert(result.name==="Lecture notes.pdf");
  assert(result.bytes.size===4);
  assert(f.reads()===1&&f.memberships()===2&&f.lookups()===2);
});
Deno.test("anonymous, invalid and unknown files are not disclosed",async()=>{
  const f=fixture();
  await rejects(()=>authorizedGroupDownload(f.deps,null,F),401);
  await rejects(()=>authorizedGroupDownload(f.deps,A,"../weird"),404);
  f.changeFile(null);
  await rejects(()=>authorizedGroupDownload(f.deps,A,F),404);
  assert(f.reads()===0);
});
Deno.test("nonmember and banned member can never receive bytes",async()=>{
  const f=fixture();f.member(false);
  await rejects(()=>authorizedGroupDownload(f.deps,A,F),404);
  f.member(true);f.banned(true);
  await rejects(()=>authorizedGroupDownload(f.deps,A,F),404);
  assert(f.reads()===0);
});
Deno.test("unscanned, blocked, oversized and foreign object paths are refused",async()=>{
  for(const changes of [
    {status:"pending_review"},
    {status:"blocked"},
    {inspection_method:null},
    {inspected_at:null},
    {size_bytes:5242881},
    {object_path:"public-files/a.pdf"},
  ]) {
    const f=fixture(changes);
    await rejects(()=>authorizedGroupDownload(f.deps,A,F),404);
    assert(f.reads()===0);
  }
});
Deno.test("storage mismatch and membership revoked during read both deny",async()=>{
  const bad=fixture({size_bytes:3});
  await rejects(()=>authorizedGroupDownload(bad.deps,A,F),503);
  const f=fixture();
  let calls=0;
  f.deps.activeMembership=async()=>++calls===1;
  await rejects(()=>authorizedGroupDownload(f.deps,A,F),404);
  assert(f.reads()===1);
});
Deno.test("approval revoked during object read is rechecked",async()=>{
  const f=fixture();
  let calls=0;
  f.deps.lookupFile=async()=>{
    calls++;
    return calls===1?{...approved}:{...approved,status:"blocked"};
  };
  await rejects(()=>authorizedGroupDownload(f.deps,A,F),404);
});
Deno.test("unsafe names cannot inject response headers",async()=>{
  const f=fixture({original_name:"../../evil\r\nX-Header: 1.pdf"});
  const file=await authorizedGroupDownload(f.deps,A,F);
  assert(!/[\\/\r\n]/.test(file.name));
});
