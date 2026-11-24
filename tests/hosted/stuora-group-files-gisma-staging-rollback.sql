-- ROLLBACK-ONLY staging check: private group files still work for GISMA
-- students after 20261124100000 (GISMA-only access), and a non-GISMA account
-- that was already a member loses access. Never execute in production.
--
-- Replaces stuora-group-files-staging-rollback.sql for post-GISMA staging: that
-- script uses the first two real student profiles, and staging now has only one
-- GISMA student. Here every identity is created inside the transaction and
-- discarded (SIMULATED users against the real staging policies and functions).
-- The script ends by raising its results, so nothing can persist.
begin;
create temporary table _qa on commit drop as select
  gen_random_uuid() a, gen_random_uuid() b, gen_random_uuid() o,
  gen_random_uuid() grp, gen_random_uuid() img, gen_random_uuid() pdf,
  substr(md5(random()::text), 1, 8) tag;
create temporary table _r (n serial, step text, ok boolean, detail text) on commit drop;
grant select on _qa to authenticated;
grant select, insert on _r to authenticated;
grant usage on sequence _r_n_seq to authenticated;

insert into auth.users (id, email, email_confirmed_at, aud, role)
select a, 'qa-fa-'||tag||'@gisma-student.com', now(), 'authenticated', 'authenticated' from _qa union all
select b, 'qa-fb-'||tag||'@gisma-student.com', now(), 'authenticated', 'authenticated' from _qa union all
select o, 'qa-fo-'||tag||'@example.invalid',   now(), 'authenticated', 'authenticated' from _qa;
insert into public.profiles (id, display_name, city)
select a, 'QA File Owner', 'Berlin' from _qa union all
select b, 'QA File Peer',  'Berlin' from _qa union all
select o, 'QA File Outsider', 'Berlin' from _qa;
-- Trusted setup: a group whose members include the outsider (legacy membership).
insert into public.student_groups(id, owner_id, name, description, city, topic)
select grp, a, 'Stuora QA temporary group', 'Transactional authorization test', 'Berlin', 'Study' from _qa;
insert into public.student_group_members(group_id, user_id)
select grp, a from _qa union all select grp, b from _qa union all select grp, o from _qa;
insert into public.student_group_files(id, group_id, uploader_id, original_name, object_path, media_type, size_bytes,
  status, inspection_method, inspected_at)
select img, grp, a, 'qa-photo.webp', grp::text||'/'||img::text||'.webp', 'image/webp', 256,
  'approved', 'trusted-image-transcode', now() from _qa;
insert into public.student_group_files(id, group_id, uploader_id, original_name, object_path, media_type, size_bytes, status)
select pdf, grp, a, 'qa-pdf.pdf', grp::text||'/'||pdf::text||'.pdf', 'application/pdf', 256, 'pending_review' from _qa;
do $$ begin
  insert into _r(step, ok, detail) values ('PDF scan job enqueued',
    exists (select 1 from private.student_group_pdf_scan_jobs j join _qa on true where j.file_id = _qa.pdf), 'ok');
exception when undefined_column then
  insert into _r(step, ok, detail) values ('PDF scan job enqueued',
    (select count(*) from private.student_group_pdf_scan_jobs) >= 1, 'counted');
end $$;

-- B (GISMA member): approved photo visible; pending PDF private to the uploader.
select set_config('request.jwt.claim.sub', (select b::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.student_group_files where group_id = (select grp from _qa);
  insert into _r(step, ok, detail) values ('GISMA member sees only the approved file', n = 1, n::text);
  insert into _r(step, ok, detail) values ('GISMA member may download (gateway check)',
    public.can_read_student_group_files((select grp from _qa)), 'ok');
end $$;
reset role;

-- O (legacy non-GISMA member): no file metadata, no download, no group messages.
select set_config('request.jwt.claim.sub', (select o::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.student_group_files where group_id = (select grp from _qa);
  insert into _r(step, ok, detail) values ('Non-GISMA legacy member sees no group files', n = 0, n::text);
  insert into _r(step, ok, detail) values ('Non-GISMA legacy member cannot download',
    not public.can_read_student_group_files((select grp from _qa)), 'ok');
  select count(*) into n from public.student_group_members where group_id = (select grp from _qa);
  insert into _r(step, ok, detail) values ('Non-GISMA legacy member sees only own membership', n = 1, n::text);
  delete from public.student_group_members where group_id = (select grp from _qa) and user_id = (select o from _qa);
  insert into _r(step, ok, detail) values ('Non-GISMA legacy member can still leave the group', true, 'ok');
end $$;
reset role;

-- Ban hides files even with a membership row.
insert into public.student_group_bans(group_id, user_id, banned_by) select grp, b, a from _qa;
select set_config('request.jwt.claim.sub', (select b::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.student_group_files where group_id = (select grp from _qa);
  insert into _r(step, ok, detail) values ('Banned GISMA member sees no files', n = 0, n::text);
  insert into _r(step, ok, detail) values ('Banned GISMA member cannot download',
    not public.can_read_student_group_files((select grp from _qa)), 'ok');
end $$;
reset role;

-- Owner keeps both files.
select set_config('request.jwt.claim.sub', (select a::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.student_group_files where group_id = (select grp from _qa);
  insert into _r(step, ok, detail) values ('Uploader sees approved and pending files', n = 2, n::text);
end $$;
reset role;

-- An unscanned PDF cannot be approved.
do $$ begin
  begin
    update public.student_group_files set status = 'approved', inspection_method = 'antivirus', inspected_at = now()
     where id = (select pdf from _qa);
    insert into _r(step, ok, detail) values ('Unscanned PDF cannot be approved', false, 'allowed');
  exception when check_violation then insert into _r(step, ok, detail) values ('Unscanned PDF cannot be approved', true, 'check_violation'); end;
end $$;

-- Uploader deletion through the RPC queues private cleanup.
select set_config('request.jwt.claim.sub', (select a::text from _qa), true);
set local role authenticated;
do $$ begin
  insert into _r(step, ok, detail) values ('Uploader can delete through the RPC',
    public.delete_student_group_file((select img from _qa)), 'ok');
end $$;
reset role;
do $$ begin
  insert into _r(step, ok, detail) values ('Private object cleanup queued',
    exists (select 1 from private.student_group_file_cleanup q
            where q.object_path = (select grp::text||'/'||img::text||'.webp' from _qa)), 'ok');
end $$;

do $$ begin
  raise exception 'STUORA_QA_RESULT %', (select json_build_object(
    'passed', count(*) filter (where ok), 'failed', count(*) filter (where not ok),
    'failures', coalesce(json_agg(json_build_object('step', step, 'detail', detail) order by n) filter (where not ok), '[]'::json),
    'steps', json_agg(step order by n)) from _r);
end $$;
rollback;
