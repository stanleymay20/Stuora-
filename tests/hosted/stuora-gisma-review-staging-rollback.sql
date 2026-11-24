-- ROLLBACK-ONLY staging acceptance for GISMA-only access, moderator review and
-- the student-only catalogue. Never execute in production.
--
-- Every identity below is created INSIDE this transaction and discarded: two
-- GISMA students (A, B), a non-GISMA account (O), a non-GISMA staff moderator
-- (M), a suspended GISMA student (S) and an unconfirmed GISMA address (U).
-- No real account is read or changed and no moderator role is ever committed.
-- These are SIMULATED users exercising the real staging policies, triggers and
-- functions with the `authenticated` / `anon` roles and a JWT subject; they are
-- not real-user acceptance.
--
-- The script always ends by raising an exception carrying every check result,
-- so the whole transaction is rolled back even if the final ROLLBACK is skipped.
begin;
create temporary table _qa on commit drop as select
  gen_random_uuid() a, gen_random_uuid() b, gen_random_uuid() o, gen_random_uuid() m,
  gen_random_uuid() s, gen_random_uuid() u,
  null::uuid house, null::uuid ev, null::uuid job, null::uuid grp,
  substr(md5(random()::text), 1, 8) tag;
create temporary table _r (n serial, step text, ok boolean, detail text) on commit drop;
grant select, update on _qa to authenticated, anon;
grant select, insert on _r to authenticated, anon;
grant usage on sequence _r_n_seq to authenticated, anon;

-- Trusted setup (no JWT, so the guards do not apply).
insert into auth.users (id, email, email_confirmed_at, aud, role)
select a, 'qa-a-'||tag||'@gisma-student.com', now(), 'authenticated', 'authenticated' from _qa union all
select b, 'qa-b-'||tag||'@gisma-student.com', now(), 'authenticated', 'authenticated' from _qa union all
select o, 'qa-o-'||tag||'@example.invalid',   now(), 'authenticated', 'authenticated' from _qa union all
select m, 'qa-m-'||tag||'@example.invalid',   now(), 'authenticated', 'authenticated' from _qa union all
select s, 'qa-s-'||tag||'@gisma-student.com', now(), 'authenticated', 'authenticated' from _qa union all
select u, 'qa-u-'||tag||'@gisma-student.com', null,  'authenticated', 'authenticated' from _qa;
insert into public.profiles (id, display_name, city)
select a, 'QA Student A', 'Berlin' from _qa union all
select b, 'QA Student B', 'Berlin' from _qa union all
select o, 'QA Outsider',  'Berlin' from _qa union all
select m, 'QA Moderator', 'Berlin' from _qa union all
select s, 'QA Suspended', 'Berlin' from _qa;
insert into public.moderators (user_id) select m from _qa;
insert into public.account_suspensions (user_id, reason) select s, 'Rollback-only QA suspension check.' from _qa;

-- Signup hook verdicts (called the way Supabase Auth would).
do $$ declare v jsonb; e text; begin
  foreach e in array array['qa@gisma-student.com', ' QA@GISMA-Student.com '] loop
    v := public.hook_require_gisma_signup(jsonb_build_object('user', jsonb_build_object('email', e)));
    insert into _r(step, ok, detail) values ('hook accepts '||btrim(e), v = '{}'::jsonb, v::text);
  end loop;
  foreach e in array array['qa@gmail.com', 'qa@gisma-student.com.evil.io', 'qa@sub.gisma-student.com', 'qa@gisma-student.co', ''] loop
    v := public.hook_require_gisma_signup(jsonb_build_object('user', jsonb_build_object('email', e)));
    insert into _r(step, ok, detail) values ('hook rejects '||coalesce(nullif(e,''),'(empty)'), (v->'error'->>'http_code') = '403', v::text);
  end loop;
end $$;

-- A (GISMA): publishes Housing, an Event and a Job, and creates a group.
select set_config('request.jwt.claim.sub', (select a::text from _qa), true);
set local role authenticated;
do $$ declare v uuid; st text; begin
  v := public.save_student_listing(null,'housing','QA room','Rollback-only','Berlin',40000,'room',false,false,'good');
  update _qa set house = v;
  v := public.publish_student_activity('event','QA event','Berlin','Rollback-only',
         '{"venue_name":"QA Hall","starts_at":"2099-01-01T12:00:00Z","capacity":5}'::jsonb);
  update _qa set ev = v;
  v := public.publish_student_activity('job','QA job','Berlin','Rollback-only',
         '{"company_name":"QA Cafe","compensation_text":"EUR 14/hour","workplace_mode":"onsite"}'::jsonb);
  update _qa set job = v;
  v := public.create_student_group('QA circle','', 'Berlin','Study');
  update _qa set grp = v;
  select review_status into st from public.listings where id = (select ev from _qa);
  insert into _r(step, ok, detail) values ('A event submitted as pending, visible to author', st = 'pending', st);
  begin
    update public.listings set review_status = 'approved' where id = (select ev from _qa);
    insert into _r(step, ok, detail) values ('A cannot self-approve by writing review_status', false, 'update allowed');
  exception when others then insert into _r(step, ok, detail) values ('A cannot self-approve by writing review_status', sqlstate = '42501', sqlstate||' '||sqlerrm); end;
  begin
    perform public.review_student_activity((select ev from _qa),'approve','I approve my own post.');
    insert into _r(step, ok, detail) values ('A cannot call moderator review', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('A cannot call moderator review', sqlstate = '42501', sqlstate); end;
end $$;
reset role;

-- B (GISMA): catalogue visible, pending posts hidden and closed to action.
select set_config('request.jwt.claim.sub', (select b::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.listings where id = (select house from _qa);
  insert into _r(step, ok, detail) values ('B (GISMA) sees Housing listing', n = 1, n::text);
  select count(*) into n from public.housing_details where listing_id = (select house from _qa);
  insert into _r(step, ok, detail) values ('B sees Housing details', n = 1, n::text);
  select count(*) into n from public.student_groups where id = (select grp from _qa);
  insert into _r(step, ok, detail) values ('B sees group name', n = 1, n::text);
  select count(*) into n from public.listings where id in ((select ev from _qa), (select job from _qa));
  insert into _r(step, ok, detail) values ('B cannot see pending Event or Job', n = 0, n::text);
  select count(*) into n from public.event_details where listing_id = (select ev from _qa);
  insert into _r(step, ok, detail) values ('B cannot see pending Event details', n = 0, n::text);
  begin
    perform public.student_activity_response((select ev from _qa),'join','');
    insert into _r(step, ok, detail) values ('B cannot RSVP to pending Event (RPC)', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('B cannot RSVP to pending Event (RPC)', sqlstate = '42501', sqlstate||' '||sqlerrm); end;
  begin
    perform public.listing_participation((select ev from _qa),'join','');
    insert into _r(step, ok, detail) values ('B cannot RSVP via old 0.1.x RPC', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('B cannot RSVP via old 0.1.x RPC', true, sqlstate); end;
  begin
    insert into public.event_participants(event_listing_id, user_id) values ((select ev from _qa), (select b from _qa));
    insert into _r(step, ok, detail) values ('B cannot RSVP by direct insert', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('B cannot RSVP by direct insert', true, sqlstate); end;
  begin
    perform public.list_pending_student_activities();
    insert into _r(step, ok, detail) values ('B cannot read the moderation queue', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('B cannot read the moderation queue', sqlstate = '42501', sqlstate); end;
end $$;
reset role;

-- M (staff moderator, not a GISMA address): reviews.
select set_config('request.jwt.claim.sub', (select m::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.list_pending_student_activities() q where q.id in ((select ev from _qa), (select job from _qa));
  insert into _r(step, ok, detail) values ('M sees both pending posts in the queue', n = 2, n::text);
  begin
    perform public.review_student_activity((select ev from _qa),'approve','ok');
    insert into _r(step, ok, detail) values ('M must give a 10+ character reason', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('M must give a 10+ character reason', sqlstate = '22023', sqlstate); end;
  perform public.review_student_activity((select ev from _qa),'approve','Venue and date checked.');
  perform public.review_student_activity((select job from _qa),'reject','Cannot confirm the employer.');
  insert into _r(step, ok, detail) values ('M approved Event and rejected Job', true, 'done');
end $$;
reset role;

-- A: notified; B: approved Event visible and joinable, rejected Job still closed.
select set_config('request.jwt.claim.sub', (select a::text from _qa), true);
set local role authenticated;
do $$ declare n int; st text; begin
  select count(*) into n from public.moderation_notices where kind = 'activity_review' and user_id = (select a from _qa);
  insert into _r(step, ok, detail) values ('A received two review notices', n = 2, n::text);
  select review_status into st from public.listings where id = (select job from _qa);
  insert into _r(step, ok, detail) values ('A sees Job as rejected', st = 'rejected', st);
end $$;
reset role;
select set_config('request.jwt.claim.sub', (select b::text from _qa), true);
set local role authenticated;
do $$ declare n int; r jsonb; begin
  select count(*) into n from public.listings where id = (select ev from _qa);
  insert into _r(step, ok, detail) values ('B sees approved Event', n = 1, n::text);
  r := public.student_activity_response((select ev from _qa),'join','');
  insert into _r(step, ok, detail) values ('B RSVPs to approved Event', (r->>'joined')::boolean, r::text);
  select count(*) into n from public.listings where id = (select job from _qa);
  insert into _r(step, ok, detail) values ('B cannot see rejected Job', n = 0, n::text);
  begin
    perform public.student_activity_response((select job from _qa),'apply','Hello');
    insert into _r(step, ok, detail) values ('B cannot apply to rejected Job', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('B cannot apply to rejected Job', sqlstate = '42501', sqlstate); end;
  begin
    perform 1 from private.activity_reviews limit 1;
    insert into _r(step, ok, detail) values ('Students cannot read reviewer audit', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('Students cannot read reviewer audit', sqlstate = '42501', sqlstate); end;
end $$;
reset role;

-- Editing an approved Event (as the author, inside a server function) sends it back.
select set_config('request.jwt.claim.sub', (select a::text from _qa), true);
update public.event_details set venue_name = 'QA Other Hall' where listing_id = (select ev from _qa);
select set_config('request.jwt.claim.sub', (select b::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.listings where id = (select ev from _qa);
  insert into _r(step, ok, detail) values ('Edited Event hidden again until re-review', n = 0, n::text);
end $$;
reset role;

-- O (confirmed, non-GISMA): no student content, no student writes; own controls kept.
select set_config('request.jwt.claim.sub', (select o::text from _qa), true);
set local role authenticated;
do $$ declare n int; d jsonb; begin
  select count(*) into n from public.listings where owner_id <> (select o from _qa);
  insert into _r(step, ok, detail) values ('O cannot read others'' listings', n = 0, n::text);
  select count(*) into n from public.student_groups where owner_id <> (select o from _qa);
  insert into _r(step, ok, detail) values ('O cannot read group names', n = 0, n::text);
  select count(*) into n from public.profiles where id <> (select o from _qa);
  insert into _r(step, ok, detail) values ('O cannot read other profiles', n = 0, n::text);
  select count(*) into n from public.profiles where id = (select o from _qa);
  insert into _r(step, ok, detail) values ('O can read own profile', n = 1, n::text);
  begin perform public.save_student_listing(null,'marketplace','QA lamp','', 'Berlin',100,'room',false,false,'good');
    insert into _r(step, ok, detail) values ('O cannot create a listing', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('O cannot create a listing', sqlstate = '42501', sqlstate); end;
  begin insert into public.student_group_members(group_id, user_id) values ((select grp from _qa), (select o from _qa));
    insert into _r(step, ok, detail) values ('O cannot join a group', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('O cannot join a group', true, sqlstate); end;
  begin perform public.create_student_group('QA outsider','', 'Berlin','Study');
    insert into _r(step, ok, detail) values ('O cannot create a group', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('O cannot create a group', sqlstate = '42501', sqlstate); end;
  begin perform public.report_content('user', (select a from _qa), 'spam', 'Rollback-only check');
    insert into _r(step, ok, detail) values ('O cannot file reports', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('O cannot file reports', sqlstate = '42501', sqlstate); end;
  begin perform public.set_profile_discovery(true);
    insert into _r(step, ok, detail) values ('O cannot join the directory', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('O cannot join the directory', sqlstate = '42501', sqlstate); end;
  begin perform public.require_external_student();
    insert into _r(step, ok, detail) values ('O refused Events/Jobs external data', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('O refused Events/Jobs external data', sqlstate = '42501', sqlstate); end;
  perform public.set_profile_discovery(false);
  insert into _r(step, ok, detail) values ('O can keep profile hidden', true, 'ok');
  d := public.export_my_data();
  insert into _r(step, ok, detail) values ('O can export own data', d ? 'account', 'keys '||(select count(*) from jsonb_object_keys(d)));
  insert into public.user_blocks(blocker_id, blocked_id) values ((select o from _qa), (select a from _qa));
  insert into _r(step, ok, detail) values ('O can block another account', true, 'ok');
end $$;
reset role;

-- Signed-out visitor: no student content.
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ declare n int; begin
  select (select count(*) from public.listings) + (select count(*) from public.housing_details)
       + (select count(*) from public.listing_media) + (select count(*) from public.student_groups)
       + (select count(*) from public.event_details) into n;
  insert into _r(step, ok, detail) values ('Signed-out visitor reads no listings, details, photos or groups', n = 0, n::text);
end $$;
reset role;

-- S (suspended GISMA): cannot publish; keeps the harassment-report path.
select set_config('request.jwt.claim.sub', (select s::text from _qa), true);
set local role authenticated;
do $$ begin
  begin perform public.save_student_listing(null,'housing','QA suspended','', 'Berlin',100,'room',false,false,'good');
    insert into _r(step, ok, detail) values ('Suspended student cannot publish', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('Suspended student cannot publish', sqlerrm ilike '%suspended%', sqlerrm); end;
  begin perform public.create_student_group('QA suspended','', 'Berlin','Study');
    insert into _r(step, ok, detail) values ('Suspended student cannot create a group', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('Suspended student cannot create a group', true, sqlerrm); end;
  perform public.report_content('user', (select a from _qa), 'harassment', 'Rollback-only check');
  insert into _r(step, ok, detail) values ('Suspended student can still report harassment', true, 'ok');
end $$;
reset role;

-- U (GISMA address, unconfirmed): cannot create a profile.
select set_config('request.jwt.claim.sub', (select u::text from _qa), true);
set local role authenticated;
do $$ begin
  begin insert into public.profiles (id, display_name, city) values ((select u from _qa), 'QA Unconfirmed', 'Berlin');
    insert into _r(step, ok, detail) values ('Unconfirmed GISMA address cannot create a profile', false, 'allowed');
  exception when others then insert into _r(step, ok, detail) values ('Unconfirmed GISMA address cannot create a profile', sqlstate = '42501', sqlstate); end;
end $$;
reset role;

-- Quotas (service view): outsider and suspended refused, student admitted.
do $$ begin
  insert into _r(step, ok, detail) values ('External-data quota refuses O', not public.consume_external_data_request((select o from _qa)), 'ok');
  insert into _r(step, ok, detail) values ('External-data quota refuses S', not public.consume_external_data_request((select s from _qa)), 'ok');
  insert into _r(step, ok, detail) values ('External-data quota admits B', public.consume_external_data_request((select b from _qa)), 'ok');
end $$;

-- Report and discard everything.
do $$ begin
  raise exception 'STUORA_QA_RESULT %', (select json_build_object(
    'passed', count(*) filter (where ok), 'failed', count(*) filter (where not ok),
    'failures', coalesce(json_agg(json_build_object('step', step, 'detail', detail) order by n) filter (where not ok), '[]'::json),
    'steps', json_agg(step order by n)) from _r);
end $$;
rollback;
