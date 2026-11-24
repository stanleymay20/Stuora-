import { processCleanup, matchingWorkerSecrets, type CleanupDeps, type CleanupLease } from './core.ts';

const GROUP='00000000-0000-0000-0000-000000000031';
const FILE='00000000-0000-0000-0000-000000000100';
const LEASE='00000000-0000-0000-0000-000000000101';
function assert(ok:unknown,message='Assertion failed'): asserts ok {
  if(!ok)throw Error(message);
}
function fixture(items:CleanupLease[]) {
  const removed:string[]=[];
  const finalized:Array<{file:string;status:boolean}>=[];
  const deps:CleanupDeps={
    claim:async count=>items.slice(0,count),
    remove:async path=>{removed.push(path);return true},
    finish:async(item,ok)=>{finalized.push({file:item.object_path,status:ok});return true},
  };
  return {deps,removed,finalized};
}
Deno.test('cleanup only removes canonical UUID paths and acknowledges successful deletes',async()=>{
  const good=`${GROUP}/${FILE}.pdf`;
  const unsafe='../avatars/avatar.jpg';
  const f=fixture([
    {object_path:good,lease_id:LEASE},
    {object_path:unsafe,lease_id:LEASE},
  ]);
  const result=await processCleanup(f.deps,4);
  assert(result.claimed===2 && result.removed===1 && result.retrying===1);
  assert(f.removed.length===1 && f.removed[0]===good);
  assert(f.finalized[0].status===true && f.finalized[1].status===false);
});
Deno.test('failed Storage deletion never receives success acknowledgement',async()=>{
  const f=fixture([{object_path:`${GROUP}/${FILE}.webp`,lease_id:LEASE}]);
  f.deps.remove=async()=>false;
  const result=await processCleanup(f.deps);
  assert(result.removed===0 && result.retrying===1);
  assert(f.finalized.length===1 && f.finalized[0].status===false);
});
Deno.test('uncertain Storage result remains retryable',async()=>{
  const f=fixture([{object_path:`${GROUP}/${FILE}.pdf`,lease_id:LEASE}]);
  f.deps.remove=async()=>{throw Error('timeout')};
  const result=await processCleanup(f.deps);
  assert(result.removed===0 && result.retrying===1);
});
Deno.test('failed acknowledgement is not counted as confirmed cleanup',async()=>{
  const f=fixture([{object_path:`${GROUP}/${FILE}.pdf`,lease_id:LEASE}]);
  f.deps.finish=async()=>false;
  const result=await processCleanup(f.deps);
  assert(result.removed===0 && result.failures===1);
});
Deno.test('untrusted worker secret is always denied and cannot use empty secret',async()=>{
  const key='0123456789abcdef0123456789abcdef';
  assert(await matchingWorkerSecrets(key,key));
  assert(!(await matchingWorkerSecrets('wrong',key)));
  assert(!(await matchingWorkerSecrets(key,'')));
  assert(!(await matchingWorkerSecrets('',key)));
  assert(!(await matchingWorkerSecrets('test','short')));
});
Deno.test('worker processes no more than four leased objects',async()=>{
  const good=`${GROUP}/${FILE}.pdf`;
  const f=fixture(Array.from({length:6},()=>({object_path:good,lease_id:LEASE})));
  const result=await processCleanup(f.deps,50);
  assert(result.claimed===4);
});
