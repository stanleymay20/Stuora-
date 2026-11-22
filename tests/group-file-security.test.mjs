// Source-backed authorization tests for group-file quarantine. No network,
// Supabase credentials, real user files or hosted project are touched.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const A=id(1), B=id(2), C=id(3), G=id(31), OTHER=id(32);
const FILE=id(100), PENDING=id(101), FOREIGN=id(102);
const path = (group, file, ext='pdf') => `${group}/${file}.${ext}`;

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema private;
    create schema storage;
    create table storage.buckets (
      id text primary key, name text not null,
      public boolean not null default false, file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text not null,
      name text not null
    );
    alter table storage.objects enable row level security;
    create table public.profiles (id uuid primary key);
    create table public.student_groups (
      id uuid primary key, owner_id uuid not null references public.profiles(id)
    );
    create table public.student_group_members (
      group_id uuid not null references public.student_groups(id) on delete cascade,
      user_id uuid not null references public.profiles(id),
      primary key (group_id, user_id)
    );
    grant usage on schema public, storage to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
    grant select on public.student_group_members to authenticated;
    insert into public.profiles values ('${A}'), ('${B}'), ('${C}');
    insert into public.student_groups values ('${G}', '${A}'), ('${OTHER}', '${C}');
    insert into public.student_group_members values ('${G}', '${A}'), ('${G}', '${B}'), ('${OTHER}', '${C}');
  `);
  const migration = readFileSync(new URL('../supabase/migrations/20261122190000_student_group_file_quarantine.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  return db;
}
async function as(db, user, sql, role='authenticated') {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${user??''}', false);`);
  try { return await db.query(sql); }
  finally { await db.exec('reset role'); }
}
const insertFile=(group, uid, file, name, status, verification='') => `
  insert into public.student_group_files
    (id,group_id,uploader_id,original_name,object_path,media_type,size_bytes,status${verification?',inspection_method,inspected_at':''})
  values ('${file}','${group}','${uid}','${name}','${path(group,file)}','application/pdf',1234,'${status}'${verification?",'antivirus',now()":''});
`;

test('new student file bucket stays private and user Storage access stays closed', async () => {
  const db=await setup();
  try {
    const {rows}=await db.query(`select public,file_size_limit,allowed_mime_types from storage.buckets where id='stuora-group-files'`);
    assert.equal(rows.length,1);
    assert.equal(rows[0].public,false);
    assert.equal(Number(rows[0].file_size_limit),5242880);
    assert.deepEqual(rows[0].allowed_mime_types,['application/pdf','image/webp']);
    await db.exec(`insert into storage.objects (bucket_id,name) values ('stuora-group-files','${path(G,FILE)}')`);
    const visible=await as(db,A,`select * from storage.objects where bucket_id='stuora-group-files'`);
    assert.equal(visible.rows.length,0,'no client Storage SELECT policy, including creators');
    await assert.rejects(as(db,A,`insert into storage.objects (bucket_id,name) values ('stuora-group-files','${path(G,id(222))}')`),
      error => error.code==='42501');
  } finally {await db.close();}
});

test('approved files are visible only to current group members; pending only to uploader', async () => {
  const db=await setup();
  try {
    await db.exec(insertFile(G,A,FILE,'lecture-notes.pdf','approved',true));
    await db.exec(insertFile(G,A,PENDING,'needs-review.pdf','pending_review'));
    await db.exec(insertFile(OTHER,C,FOREIGN,'other-group.pdf','approved',true));
    const select='select id from public.student_group_files order by id';
    assert.deepEqual((await as(db,A,select)).rows.map(x=>x.id),[FILE,PENDING]);
    assert.deepEqual((await as(db,B,select)).rows.map(x=>x.id),[FILE]);
    assert.deepEqual((await as(db,C,select)).rows.map(x=>x.id),[FOREIGN]);
    await assert.rejects(as(db,null,select,'anon'),error=>error.code==='42501');
    await assert.rejects(as(db,A,insertFile(G,A,id(103),'illegal-write.pdf','pending_review')),
      error=>error.code==='42501');
    await assert.rejects(as(db,B,`update public.student_group_files set status='approved' where id='${PENDING}'`),
      error=>error.code==='42501');
    await db.exec(`delete from public.student_group_members where group_id='${G}' and user_id='${B}'`);
    assert.equal((await as(db,B,select)).rows.length,0,'removal revokes file discovery');
  } finally {await db.close();}
});

test('quarantine cannot be approved without scanner evidence or with malicious paths', async () => {
  const db=await setup();
  try {
    await assert.rejects(db.exec(insertFile(G,A,FILE,'not-scanned.pdf','approved')),err=>err.code==='23514');
    await assert.rejects(db.exec(insertFile(G,A,FILE,'../escape.pdf','pending_review')),err=>err.code==='23514');
    await assert.rejects(db.exec(`insert into public.student_group_files
      (group_id,uploader_id,original_name,object_path,media_type,size_bytes)
      values ('${G}','${A}','notes.pdf','${path(OTHER,FILE)}','application/pdf',100)`),err=>err.code==='23514');
    await assert.rejects(db.exec(`insert into public.student_group_files
      (group_id,uploader_id,original_name,object_path,media_type,size_bytes)
      values ('${G}','${A}','notes.pdf','${path(G,FILE)}','application/zip',100)`),err=>err.code==='23514');
  } finally {await db.close();}
});

test('group deletion hides metadata and queues private object cleanup', async () => {
  const db=await setup();
  try {
    await db.exec(insertFile(G,A,FILE,'lecture-notes.pdf','approved',true));
    await db.exec(`delete from public.student_groups where id='${G}'`);
    assert.equal((await db.query('select * from public.student_group_files')).rows.length,0);
    const {rows}=await db.query('select object_path from private.student_group_file_cleanup');
    assert.deepEqual(rows.map(r=>r.object_path),[path(G,FILE)]);
    await assert.rejects(as(db,A,'select * from private.student_group_file_cleanup'),
      error=>error.code==='42501');
  } finally {await db.close();}
});
