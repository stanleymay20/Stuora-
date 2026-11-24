import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const uuid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const A=uuid(1),B=uuid(2),G=uuid(31),F=uuid(100),P=uuid(101);

async function setup() {
  const db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create schema storage;create schema private;
    create table storage.buckets (
      id text primary key,name text not null,public boolean not null default false,
      file_size_limit bigint,allowed_mime_types text[]
    );
    create table public.profiles (id uuid primary key,account_kind text not null default 'student');
    create table public.student_groups (
      id uuid primary key,owner_id uuid not null references public.profiles(id)
    );
    create table public.student_group_members (
      group_id uuid references public.student_groups(id) on delete cascade,
      user_id uuid references public.profiles(id),primary key(group_id,user_id)
    );
    create table public.student_group_bans (
      group_id uuid not null references public.student_groups(id),
      user_id uuid not null references public.profiles(id),
      primary key(group_id,user_id)
    );
    alter table public.student_group_bans enable row level security;
    create policy student_group_bans_owner_read on public.student_group_bans
      for select to authenticated using (
        exists (select 1 from public.student_groups g
          where g.id = student_group_bans.group_id
            and g.owner_id = (select auth.uid()))
      );
    grant usage on schema public to authenticated,service_role,anon;
    grant select on public.student_group_members,public.student_group_bans to authenticated;
    insert into public.profiles(id)values('${A}'),('${B}');
    insert into public.student_groups(id,owner_id)values('${G}','${A}');
    insert into public.student_group_members(group_id,user_id)values('${G}','${A}');
  `);
  for(const name of [
    '20261122190000_student_group_file_quarantine.sql',
    '20261122203000_student_group_file_intake_rpc.sql',
    '20261122210000_student_group_file_ban_visibility.sql',
    '20261122220000_student_group_file_cleanup_leases.sql',
    '20261122221500_student_group_file_delete_rpc.sql',
    '20261122230000_student_group_pdf_scan_jobs.sql',
  ]) {
    const sql=readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
    assert.equal(sql.toLowerCase().split('commit;').length-1,1,'one atomic migration');
    await db.exec(sql);
  }
  return db;
}
async function as(db, role, sql, actor=null) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub','${actor??''}',false)`);
  try {return await db.query(sql);}
  finally{await db.exec('reset role');}
}
const admission=(actor=A,group=G)=>`select public.claim_student_group_file_upload('${actor}','${group}') as admitted`;
const commit=(actor=A,group=G,file=F,mime='image/webp',status='approved',ext='webp')=>
  `select public.commit_student_group_file_upload('${actor}','${group}','${file}',
     'Class notes.${ext}',4,'${mime}','${group}/${file}.${ext}','${status}') as file_id`;

test('anonymous and authenticated clients cannot invoke privileged upload admission or commit',async()=>{
  const db=await setup();try{
    for(const role of ['anon','authenticated']){
      await assert.rejects(as(db,role,admission()),e=>e.code==='42501');
      await assert.rejects(as(db,role,commit()),e=>e.code==='42501');
    }
  }finally{await db.close();}
});
test('service-only upload requires live group membership and the per-student hourly quota',async()=>{
  const db=await setup();try{
    assert.equal((await as(db,'service_role',admission(B))).rows[0].admitted,false);
    for(let n=0;n<12;n++)assert.equal((await as(db,'service_role',admission())).rows[0].admitted,true);
    assert.equal((await as(db,'service_role',admission())).rows[0].admitted,false);
    assert.equal((await db.query(`select used from private.student_group_file_upload_limits where actor_id='${A}'`)).rows[0].used,13);
  }finally{await db.close();}
});
test('approved image commit is constrained to trusted transcode evidence and group membership',async()=>{
  const db=await setup();try{
    assert.equal((await as(db,'service_role',admission())).rows[0].admitted,true);
    assert.equal((await as(db,'service_role',commit())).rows[0].file_id,F);
    const {rows}=await db.query(`select status,inspection_method,inspected_at from public.student_group_files where id='${F}'`);
    assert.equal(rows[0].status,'approved');
    assert.equal(rows[0].inspection_method,'trusted-image-transcode');
    assert.ok(rows[0].inspected_at);
    await assert.rejects(as(db,'service_role',commit(A,G,P,'application/pdf','approved','pdf')),e=>e.code==='22023');
    await assert.rejects(as(db,'service_role',commit(A,G,P,'image/webp','approved','pdf')),e=>e.code==='22023');
  }finally{await db.close();}
});
test('PDF intake remains quarantined even when header preflight passes',async()=>{
  const db=await setup();try{
    const result=await as(db,'service_role',commit(A,G,P,'application/pdf','pending_review','pdf'));
    assert.equal(result.rows[0].file_id,P);
    const {rows}=await db.query(`select status,inspection_method,inspected_at from public.student_group_files where id='${P}'`);
    assert.equal(rows[0].status,'pending_review');
    assert.equal(rows[0].inspection_method,null);
    assert.equal(rows[0].inspected_at,null);
  }finally{await db.close();}
});
test('membership removal and ban deny commit even after admission',async()=>{
  const db=await setup();try{
    await as(db,'service_role',admission());
    await db.exec(`delete from public.student_group_members where group_id='${G}' and user_id='${A}'`);
    await assert.rejects(as(db,'service_role',commit()),e=>e.code==='42501');
    await db.exec(`insert into public.student_group_members(group_id,user_id)values('${G}','${A}')`);
    await db.exec(`insert into public.student_group_bans(group_id,user_id)values('${G}','${A}')`);
    await assert.rejects(as(db,'service_role',commit()),e=>e.code==='42501');
    assert.equal((await as(db,'service_role',admission())).rows[0].admitted,false);
    assert.equal((await db.query('select count(*) n from public.student_group_files')).rows[0].n,0);
  }finally{await db.close();}
});

test('ban removes file metadata visibility even when a stale member row remains',async()=>{
  const db=await setup();try{
    await as(db,'service_role',commit());
    const query=`select id from public.student_group_files where group_id='${G}'`;
    assert.equal((await as(db,'authenticated',query,A)).rows.length,1);
    await db.exec(`insert into public.student_group_bans(group_id,user_id) values ('${G}','${A}')`);
    assert.equal((await as(db,'authenticated',query,A)).rows.length,0);
    await assert.rejects(
      as(db,'anon',`select public.can_read_student_group_files('${G}')`),
      err => err.code === '42501',
    );
  }finally{await db.close();}
});

test('only uploader or group owner can erase private group files and queue Storage deletion',async()=>{
  const db=await setup();
  try {
    const first=await as(db,'service_role',commit(A,G,F,'application/pdf','pending_review','pdf'));
    assert.equal(first.rows[0].file_id,F);
    const del=file=>`select public.delete_student_group_file('${file}') removed`;
    await assert.rejects(as(db,'anon',del(F)),e=>e.code==='42501');
    assert.equal((await as(db,'authenticated',del(F),B)).rows[0].removed,false);
    assert.equal((await as(db,'authenticated',del(F),A)).rows[0].removed,true);
    assert.equal((await as(db,'authenticated',del(F),A)).rows[0].removed,false);
    const queued=await db.query(`select object_path from private.student_group_file_cleanup where object_path='${G}/${F}.pdf'`);
    assert.equal(queued.rows.length,1,'authenticated deletion queues private object removal');
  }finally{await db.close();}
});

test('uploader may erase their own file after leaving; group owner may moderate other uploads',async()=>{
  const db=await setup();
  try {
    await db.exec(`insert into public.student_group_members (group_id,user_id) values ('${G}','${B}')`);
    await db.exec(`insert into public.student_group_files (id,group_id,uploader_id,original_name,object_path,media_type,size_bytes)
      values ('${P}','${G}','${B}','meeting.pdf','${G}/${P}.pdf','application/pdf',50)`);
    const del=`select public.delete_student_group_file('${P}') removed`;
    await db.exec(`delete from public.student_group_members where group_id='${G}' and user_id='${B}'`);
    assert.equal((await as(db,'authenticated',del,B)).rows[0].removed,true,
      'privacy deletion remains available to former group members');
    assert.equal((await db.query('select count(*)::int n from private.student_group_file_cleanup')).rows[0].n,1);
    // Group owner is permitted to remove a member's new file as moderation.
    await db.exec(`insert into public.student_group_files (id,group_id,uploader_id,original_name,object_path,media_type,size_bytes)
      values ('${P}','${G}','${B}','meeting.pdf','${G}/${P}.pdf','application/pdf',50)`);
    assert.equal((await as(db,'authenticated',del,A)).rows[0].removed,true);
  }finally{await db.close();}
});

test('PDF approval requires a live service scan lease, matching engine and SHA256 evidence',async()=>{
  const db=await setup();
  try{
    await as(db,'service_role',commit(A,G,P,'application/pdf','pending_review','pdf'));
    const claim=`select * from public.claim_student_group_pdf_scan_jobs(2)`;
    await assert.rejects(as(db,'authenticated',claim,A),e=>e.code==='42501');
    await assert.rejects(as(db,'anon',claim),e=>e.code==='42501');
    const first=(await as(db,'service_role',claim)).rows;
    assert.equal(first.length,1);
    assert.equal(first[0].file_id,P);
    assert.equal((await as(db,'service_role',claim)).rows.length,0,'live lease prevents repeated claim');
    const done=(lease,verdict,sha='a'.repeat(64),engine='clamav-http-v1')=>
      `select public.finish_student_group_pdf_scan('${P}','${lease}','${verdict}','${sha}','${engine}') result`;
    await assert.rejects(as(db,'authenticated',done(first[0].lease_id,'clean'),A),e=>e.code==='42501');
    assert.equal((await as(db,'service_role',done(F,'clean'))).rows[0].result,false,'wrong lease denied');
    assert.equal((await as(db,'service_role',done(first[0].lease_id,'clean','wrong'))).rows[0].result,false,'invalid SHA denied');
    assert.equal((await as(db,'service_role',done(first[0].lease_id,'clean','a'.repeat(64),'pdf-header-only'))).rows[0].result,false);
    assert.equal((await as(db,'service_role',done(first[0].lease_id,'clean'))).rows[0].result,true);
    const {rows}=await db.query(`select status,inspection_method,scan_sha256,scan_engine,inspected_at
       from public.student_group_files where id='${P}'`);
    assert.equal(rows[0].status,'approved');
    assert.equal(rows[0].inspection_method,'antivirus');
    assert.equal(rows[0].scan_sha256,'a'.repeat(64));
    assert.equal(rows[0].scan_engine,'clamav-http-v1');
    assert.ok(rows[0].inspected_at);
    assert.equal((await as(db,'service_role',done(first[0].lease_id,'clean'))).rows[0].result,false,'cannot replay scan approval');
  }finally{await db.close();}
});

test('pending PDFs cannot be approved directly without scan evidence',async()=>{
  const db=await setup();
  try{
    await as(db,'service_role',commit(A,G,P,'application/pdf','pending_review','pdf'));
    await assert.rejects(db.exec(`update public.student_group_files
      set status='approved',inspection_method='antivirus',inspected_at=now()
      where id='${P}'`),e=>e.code==='23514');
    assert.equal((await db.query(`select status from public.student_group_files where id='${P}'`)).rows[0].status,'pending_review');
  }finally{await db.close();}
});

test('malicious scan blocks PDF and scanner failure keeps quarantine with backoff',async()=>{
  const db=await setup();
  try{
    await as(db,'service_role',commit(A,G,P,'application/pdf','pending_review','pdf'));
    const scan=()=>as(db,'service_role','select * from public.claim_student_group_pdf_scan_jobs(2)');
    const first=(await scan()).rows[0];
    const done=(lease,verdict)=>
      `select public.finish_student_group_pdf_scan('${P}','${lease}','${verdict}',
        'b'.repeat(64),'clamav-http-v1') result`;
    const scannerError=`select public.finish_student_group_pdf_scan('${P}','${first.lease_id}','error') result`;
    assert.equal((await as(db,'service_role',scannerError)).rows[0].result,true);
    assert.equal((await scan()).rows.length,0,'failed scan waits for retry window');
    await db.exec(`update private.student_group_pdf_scan_jobs set next_attempt_at=now()-interval '1 minute'`);
    const next=(await scan()).rows[0];
    const block=`select public.finish_student_group_pdf_scan('${P}','${next.lease_id}',
      'malicious','${'b'.repeat(64)}','clamav-http-v1') result`;
    assert.equal((await as(db,'service_role',block)).rows[0].result,true);
    assert.equal((await db.query(`select status from public.student_group_files where id='${P}'`)).rows[0].status,'blocked');
    assert.equal((await scan()).rows.length,0);
    assert.equal((await as(db,'authenticated',`select id from public.student_group_files where id='${P}'`,A)).rows.length,0);
  }finally{await db.close();}
});
