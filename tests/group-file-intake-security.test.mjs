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
