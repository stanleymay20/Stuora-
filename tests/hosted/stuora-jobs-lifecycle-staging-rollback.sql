-- ROLLBACK-ONLY staging acceptance for student-posted Jobs. Never execute in production.
--
-- Every identity below is created INSIDE this transaction and discarded:
-- GISMA students A (author), B and C (applicants), a non-GISMA account O,
-- a suspended GISMA student S and a non-GISMA staff moderator M. These are
-- SIMULATED users exercising the real staging policies, triggers and functions
-- through the `authenticated` / `anon` roles and a JWT subject. They are not
-- real-student acceptance and they do not exercise the app UI.
--
-- The script ends by raising an exception carrying every result, so the whole
-- transaction is rolled back even if the final ROLLBACK is skipped.
begin;
create temporary table _qa on commit drop as select
  gen_random_uuid() a, gen_random_uuid() b, gen_random_uuid() c, gen_random_uuid() o,
  gen_random_uuid() s, gen_random_uuid() m, null::uuid job, substr(md5(random()::text), 1, 8) tag;
create temporary table _r (n serial, step text, ok boolean, detail text) on commit drop;
grant select, update on _qa to authenticated, anon;
grant select, insert on _r to authenticated, anon;
grant usage on sequence _r_n_seq to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, aud, role)
select a, 'qa-ja-'||tag||'@gisma-student.com', now(), 'authenticated', 'authenticated' from _qa union all
select b, 'qa-jb-'||tag||'@gisma-student.com', now(), 'authenticated', 'authenticated' from _qa union all
select c, 'qa-jc-'||tag||'@gisma-student.com', now(), 'authenticated', 'authenticated' from _qa union all
select o, 'qa-jo-'||tag||'@example.invalid',   now(), 'authenticated', 'authenticated' from _qa union all
select s, 'qa-js-'||tag||'@gisma-student.com', now(), 'authenticated', 'authenticated' from _qa union all
select m, 'qa-jm-'||tag||'@example.invalid',   now(), 'authenticated', 'authenticated' from _qa;
insert into public.profiles (id, display_name, city)
select a, 'QA Author', 'Berlin' from _qa union all select b, 'QA Applicant B', 'Berlin' from _qa union all
select c, 'QA Applicant C', 'Berlin' from _qa union all select o, 'QA Outsider', 'Berlin' from _qa union all
select s, 'QA Suspended', 'Berlin' from _qa union all select m, 'QA Moderator', 'Berlin' from _qa;
insert into public.moderators (user_id) select m from _qa;
insert into public.account_suspensions (user_id, reason) select s, 'Rollback-only QA suspension check.' from _qa;

-- 1. Creation and validation (A).
select set_config('request.jwt.claim.sub', (select a::text from _qa), true);
set local role authenticated;
do $$ declare v uuid; bad jsonb; st text; begin
  foreach bad in array array[
    '{"compensation_text":"EUR 15/h","workplace_mode":"onsite"}'::jsonb,
    '{"company_name":"QA GmbH","workplace_mode":"onsite"}'::jsonb,
    '{"company_name":"QA GmbH","compensation_text":"EUR 15/h","workplace_mode":"moon"}'::jsonb,
    '{"company_name":"Q","compensation_text":"EUR 15/h","workplace_mode":"remote"}'::jsonb] loop
    begin
      perform public.publish_student_activity('job','QA Werkstudent Data','Berlin','Rollback-only', bad);
      insert into _r(step, ok, detail) values ('Invalid job details refused '||bad::text, false, 'accepted');
    exception when others then
      insert into _r(step, ok, detail) values ('Invalid job details refused '||bad::text, sqlstate = '22023', sqlstate);
    end;
  end loop;
  begin
    insert into public.listings(owner_id, kind, status, title, city, price_cents)
    values ((select a from _qa), 'job', 'active', 'QA direct job', 'Berlin', 0);
    insert into _r(step, ok, detail) values ('Direct job insert (old client) refused', false, 'accepted');
  exception when others then insert into _r(step, ok, detail) values ('Direct job insert (old client) refused', sqlstate = '42501', sqlstate); end;
  v := public.publish_student_activity('job','QA Werkstudent Data','Berlin','Rollback-only',
       '{"company_name":"QA Analytics GmbH","compensation_text":"EUR 15/hour","workplace_mode":"hybrid"}'::jsonb);
  update _qa set job = v;
  select review_status into st from public.listings where id = v;
  insert into _r(step, ok, detail) values ('Valid job enters review as pending', st = 'pending', st);
  begin
    update public.listings set review_status = 'approved' where id = v;
    insert into _r(step, ok, detail) values ('Author cannot self-approve', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('Author cannot self-approve', sqlstate = '42501', sqlstate); end;
end $$;
reset role;

-- 2. Pending job invisible and closed to other students (B).
select set_config('request.jwt.claim.sub', (select b::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.listings where id = (select job from _qa);
  insert into _r(step, ok, detail) values ('B cannot see pending job', n = 0, n::text);
  select count(*) into n from public.job_details where listing_id = (select job from _qa);
  insert into _r(step, ok, detail) values ('B cannot see pending job details', n = 0, n::text);
  begin perform public.student_activity_response((select job from _qa),'apply','Hello');
    insert into _r(step, ok, detail) values ('B cannot apply to pending job', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('B cannot apply to pending job', sqlstate = '42501', sqlstate); end;
end $$;
reset role;

-- 3. Ineligible publishers.
select set_config('request.jwt.claim.sub', (select o::text from _qa), true);
set local role authenticated;
do $$ begin
  begin perform public.publish_student_activity('job','QA outsider job','Berlin','x',
      '{"company_name":"QA Ltd","compensation_text":"EUR 1","workplace_mode":"onsite"}'::jsonb);
    insert into _r(step, ok, detail) values ('Non-GISMA account cannot post a job', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('Non-GISMA account cannot post a job', sqlstate = '42501', sqlstate); end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', (select s::text from _qa), true);
set local role authenticated;
do $$ begin
  begin perform public.publish_student_activity('job','QA suspended job','Berlin','x',
      '{"company_name":"QA Ltd","compensation_text":"EUR 1","workplace_mode":"onsite"}'::jsonb);
    insert into _r(step, ok, detail) values ('Suspended student cannot post a job', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('Suspended student cannot post a job', sqlstate = '42501', sqlstate); end;
end $$;
reset role;

-- 4. Moderator approves; a second (duplicate/concurrent) decision is refused.
select set_config('request.jwt.claim.sub', (select m::text from _qa), true);
set local role authenticated;
do $$ begin
  perform public.review_student_activity((select job from _qa),'approve','Employer and pay checked.');
  insert into _r(step, ok, detail) values ('Moderator approves job', true, 'ok');
  begin perform public.review_student_activity((select job from _qa),'reject','Second decision attempt.');
    insert into _r(step, ok, detail) values ('Second decision on the same job refused', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('Second decision on the same job refused', sqlstate = '22023', sqlstate); end;
end $$;
reset role;

-- 5. Approved job: visible, apply once, idempotent, withdraw, no resubmit.
select set_config('request.jwt.claim.sub', (select b::text from _qa), true);
set local role authenticated;
do $$ declare n int; r jsonb; begin
  select count(*) into n from public.listings l join public.job_details j on j.listing_id = l.id where l.id = (select job from _qa);
  insert into _r(step, ok, detail) values ('B sees approved job with company details', n = 1, n::text);
  r := public.student_activity_response((select job from _qa),'apply','I study Data Science at GISMA.');
  insert into _r(step, ok, detail) values ('B applies', (r->>'applied')::boolean and not (r->>'withdrawn')::boolean, r::text);
  r := public.student_activity_response((select job from _qa),'apply','Duplicate press.');
  select count(*) into n from public.job_applications where job_listing_id = (select job from _qa) and applicant_id = (select b from _qa);
  insert into _r(step, ok, detail) values ('Duplicate apply keeps one application', n = 1, n::text);
  begin
    insert into public.job_applications(job_listing_id, applicant_id, cover_note) values ((select job from _qa), (select b from _qa), 'direct');
    insert into _r(step, ok, detail) values ('Direct duplicate application insert refused', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('Direct duplicate application insert refused', sqlstate in ('23505','42501'), sqlstate); end;
  r := public.student_activity_response((select job from _qa),'withdraw','');
  insert into _r(step, ok, detail) values ('B withdraws', (r->>'withdrawn')::boolean, r::text);
  begin perform public.student_activity_response((select job from _qa),'apply','Again');
    insert into _r(step, ok, detail) values ('Withdrawn application cannot be resubmitted', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('Withdrawn application cannot be resubmitted', sqlstate = '22023', sqlstate); end;
end $$;
reset role;

-- 6. Privacy of applications: C cannot read B's; the author can.
select set_config('request.jwt.claim.sub', (select c::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.job_applications where job_listing_id = (select job from _qa);
  insert into _r(step, ok, detail) values ('Other student cannot read applications', n = 0, n::text);
end $$;
reset role;
select set_config('request.jwt.claim.sub', (select a::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.job_applications where job_listing_id = (select job from _qa);
  insert into _r(step, ok, detail) values ('Author reads applications to own job', n = 1, n::text);
  begin perform public.student_activity_response((select job from _qa),'apply','self');
    insert into _r(step, ok, detail) values ('Author cannot apply to own job', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('Author cannot apply to own job', sqlstate = '42501', sqlstate); end;
  -- Job details have no client edit path at all (no UPDATE privilege).
  begin update public.job_details set compensation_text = 'EUR 9/hour' where listing_id = (select job from _qa);
    insert into _r(step, ok, detail) values ('Direct job-details edit refused', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('Direct job-details edit refused', sqlstate = '42501', sqlstate); end;
  -- There is no client edit path for jobs: an approved job cannot be changed
  -- (and so cannot bypass review) by an old client writing the listing.
  begin update public.listings set title = 'QA Werkstudent Data (edited)' where id = (select job from _qa);
    insert into _r(step, ok, detail) values ('Direct edit of approved job refused', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('Direct edit of approved job refused', sqlstate = '42501', sqlstate); end;
end $$;
reset role;

-- 7. The author removes the job: closed jobs take no applications.
select set_config('request.jwt.claim.sub', (select a::text from _qa), true);
set local role authenticated;
do $$ begin perform public.close_student_activity((select job from _qa)); end $$;
reset role;
select set_config('request.jwt.claim.sub', (select c::text from _qa), true);
set local role authenticated;
do $$ begin
  begin perform public.student_activity_response((select job from _qa),'apply','Hi');
    insert into _r(step, ok, detail) values ('Cannot apply to removed job', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('Cannot apply to removed job', sqlstate = '42501', sqlstate); end;
end $$;
reset role;

-- 8. Outsider and signed-out visitor read nothing; service RPCs are not exposed.
select set_config('request.jwt.claim.sub', (select o::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select (select count(*) from public.listings where kind = 'job' and owner_id <> (select o from _qa))
       + (select count(*) from public.job_details) into n;
  insert into _r(step, ok, detail) values ('Non-GISMA account reads no jobs', n = 0, n::text);
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ declare n int; begin
  select (select count(*) from public.listings where kind = 'job') + (select count(*) from public.job_details) into n;
  insert into _r(step, ok, detail) values ('Signed-out visitor reads no jobs', n = 0, n::text);
end $$;
reset role;
do $$ begin
  insert into _r(step, ok, detail) values ('Clients cannot call external cache or quota RPCs',
    not has_function_privilege('authenticated', 'public.external_cache_get(text,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.external_cache_put(text,text,jsonb,integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.consume_external_data_request(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.consume_external_data_request(uuid)', 'execute'), 'ok');
  insert into _r(step, ok, detail) values ('Clients cannot read private.external_cache',
    not has_table_privilege('authenticated', 'private.external_cache', 'select')
    and not has_table_privilege('anon', 'private.external_cache', 'select'), 'ok');
end $$;

-- 9. External-data quota: 10 per student-minute, isolated per student.
do $$ declare i int; admitted int := 0; begin
  for i in 1..11 loop
    if public.consume_external_data_request((select b from _qa)) then admitted := admitted + 1; end if;
  end loop;
  insert into _r(step, ok, detail) values ('Quota admits 10/min then refuses', admitted = 10, admitted::text);
  insert into _r(step, ok, detail) values ('Another student keeps own quota', public.consume_external_data_request((select c from _qa)), 'ok');
  insert into _r(step, ok, detail) values ('Quota refuses non-GISMA and suspended',
    not public.consume_external_data_request((select o from _qa)) and not public.consume_external_data_request((select s from _qa)), 'ok');
end $$;

-- 10. Cache: provider/key isolation and expiry (rollback-only rows).
do $$ begin
  perform public.external_cache_put('adzuna', 'qa-berlin|qa-werkstudent', '[{"id":"adzuna:qa"}]'::jsonb, 60);
  insert into _r(step, ok, detail) values ('Cache hit for same provider and key',
    public.external_cache_get('adzuna', 'qa-berlin|qa-werkstudent') is not null, 'ok');
  insert into _r(step, ok, detail) values ('No cross-provider cache hit',
    public.external_cache_get('bundesagentur', 'qa-berlin|qa-werkstudent') is null, 'ok');
  insert into _r(step, ok, detail) values ('No cross-query cache hit',
    public.external_cache_get('adzuna', 'qa-berlin|qa-data science') is null, 'ok');
  update private.external_cache set fetched_at = now() - interval '2 seconds', expires_at = now() - interval '1 second'
   where provider = 'adzuna' and cache_key = 'qa-berlin|qa-werkstudent';
  insert into _r(step, ok, detail) values ('Expired entry is not served',
    public.external_cache_get('adzuna', 'qa-berlin|qa-werkstudent') is null, 'ok');
  begin perform public.external_cache_put('adzuna', 'qa', '[]'::jsonb, 5);
    insert into _r(step, ok, detail) values ('TTL under 60s refused', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('TTL under 60s refused', sqlstate = '22023', sqlstate); end;
end $$;

do $$ begin
  raise exception 'STUORA_QA_RESULT %', (select json_build_object(
    'passed', count(*) filter (where ok), 'failed', count(*) filter (where not ok),
    'failures', coalesce(json_agg(json_build_object('step', step, 'detail', detail) order by n) filter (where not ok), '[]'::json),
    'steps', count(*)) from _r);
end $$;
rollback;
