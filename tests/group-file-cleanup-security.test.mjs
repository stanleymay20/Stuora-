import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const A=id(1), B=id(2), GROUP=id(31), FILE=id(100), FILE2=id(101);
const path = id => `${GROUP}/${id}.pdf`;

async function setup() {
  const db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
       $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create schema storage; create schema private;
    create table storage.buckets (id text primary key, name text not null,
      public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table public.profiles (id uuid primary key);
    create table public.student_groups (id uuid primary key,
      owner_id uuid not null references public.profiles(id));
    create table public.student_group_members (
      group_id uuid references public.student_groups(id) on delete cascade,
      user_id uuid references public.profiles(id),
      primary key(group_id,user_id));
    create table public.student_group_bans (
      group_id uuid references public.student_groups(id) on delete cascade,
      user_id uuid references public.profiles(id),
      primary key(group_id,user_id));
    grant usage on schema public to anon,authenticated,service_role;
    insert into public.profiles (id) values ('${A}'),('${B}');
    insert into public.student_groups (id,owner_id) values ('${GROUP}','${A}');
    insert into public.student_group_members (group_id,user_id) values ('${GROUP}','${A}');
  `);
  for (const file of [
    '20261122190000_student_group_file_quarantine.sql',
    '20261122220000_student_group_file_cleanup_leases.sql',
  ]) {
    const migration=readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');
    assert.equal(migration.trimEnd().endsWith('commit;'),true);
    await db.exec(migration);
  }
  return db;
}
async function as(db,role,sql) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub','',false)`);
  try{return await db.query(sql)}finally{await db.exec('reset role')}
}
const claim = () => 'select * from public.claim_student_group_file_cleanup(4)';
const finish=(item,ok,code='STORAGE_REMOVE_FAILED')=>
  `select public.finish_student_group_file_cleanup('${item.object_path}','${item.lease_id}',${ok},'${code}') finished`;
async function enqueue(db,file=FILE) {
  return (await as(db,'service_role',`select public.enqueue_student_group_file_orphan('${path(file)}') queued`)).rows[0].queued;
}

test('cleanup queue rejects anonymous and ordinary authenticated callers',async()=>{
  const db=await setup();
  try {
    for(const role of ['anon','authenticated']){
      await assert.rejects(as(db,role,claim()),e=>e.code==='42501');
      await assert.rejects(as(db,role,`select public.enqueue_student_group_file_orphan('${path(FILE)}')`),e=>e.code==='42501');
      await assert.rejects(as(db,role,`select * from private.student_group_file_cleanup`),e=>e.code==='42501');
    }
  }finally{await db.close()}
});

test('orphan admission requires canonical path and absence of current file metadata',async()=>{
  const db=await setup();
  try{
    assert.equal((await as(db,'service_role',`select public.enqueue_student_group_file_orphan('../evil.pdf') queued`)).rows[0].queued,false);
    assert.equal(await enqueue(db),true);
    assert.equal(await enqueue(db),true,'duplicate enqueue remains idempotent');
    await db.exec(`
      insert into public.student_group_files (id,group_id,uploader_id,original_name,object_path,media_type,size_bytes)
      values ('${FILE2}','${GROUP}','${A}','preview.pdf','${path(FILE2)}','application/pdf',50);
    `);
    assert.equal(await enqueue(db,FILE2),false,'metadata-owned objects never enter orphan queue');
  }finally{await db.close()}
});

test('group deletion queues object once and lease ownership controls acknowledgement',async()=>{
  const db=await setup();
  try{
    await db.exec(`
      insert into public.student_group_files (id,group_id,uploader_id,original_name,object_path,media_type,size_bytes)
      values ('${FILE}','${GROUP}','${A}','lecture.pdf','${path(FILE)}','application/pdf',50);
      delete from public.student_groups where id='${GROUP}';
    `);
    const claimed=(await as(db,'service_role',claim())).rows;
    assert.equal(claimed.length,1);
    assert.equal(claimed[0].object_path,path(FILE));
    assert.equal((await as(db,'service_role',claim())).rows.length,0,'lease prevents duplicate claims');
    assert.equal((await as(db,'service_role',finish({...claimed[0],lease_id:id(900)},true))).rows[0].finished,false);
    assert.equal((await as(db,'service_role',finish(claimed[0],true))).rows[0].finished,true);
    assert.equal((await db.query('select count(*)::integer n from private.student_group_file_cleanup')).rows[0].n,0);
  }finally{await db.close()}
});

test('Storage failure is retained with capped exponential retry, then removed only on confirmed success',async()=>{
  const db=await setup();
  try{
    await enqueue(db);
    const first=(await as(db,'service_role',claim())).rows[0];
    assert.equal((await as(db,'service_role',finish(first,false))).rows[0].finished,true);
    const {rows} = await db.query('select attempts,last_error_code,next_attempt_at from private.student_group_file_cleanup');
    assert.equal(rows[0].attempts,1);
    assert.equal(rows[0].last_error_code,'STORAGE_REMOVE_FAILED');
    assert.ok(new Date(rows[0].next_attempt_at)>new Date());
    assert.equal((await as(db,'service_role',claim())).rows.length,0,'backoff not bypassable');
    await db.exec('update private.student_group_file_cleanup set next_attempt_at=now()-interval \'1 minute\'');
    const second=(await as(db,'service_role',claim())).rows[0];
    assert.notEqual(second.lease_id,first.lease_id);
    assert.equal((await as(db,'service_role',finish(second,true))).rows[0].finished,true);
  }finally{await db.close()}
});

test('worker caps at eight leases and preserves dead-letter work for review',async()=>{
  const db=await setup();
  try {
    await enqueue(db);
    for(let i=0;i<8;i++){
      const item=(await as(db,'service_role',claim())).rows[0];
      assert.ok(item,'expected retry lease '+i);
      assert.equal((await as(db,'service_role',finish(item,false,'STORAGE_REMOVE_FAILED'))).rows[0].finished,true);
      await db.exec('update private.student_group_file_cleanup set next_attempt_at=now()-interval \'1 minute\'');
    }
    assert.equal((await as(db,'service_role',claim())).rows.length,0);
    const {rows}=await db.query('select attempts,last_error_code from private.student_group_file_cleanup');
    assert.equal(rows[0].attempts,8);
    assert.equal(rows[0].last_error_code,'STORAGE_REMOVE_FAILED');
  }finally{await db.close()}
});
