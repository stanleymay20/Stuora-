-- ROLLBACK-ONLY staging acceptance for the 0.1.7 release candidate's student
-- journeys. Never execute in production.
--
-- Identities are created INSIDE this transaction and discarded: GISMA students
-- A (seller), B (buyer) and C (unrelated), and a non-GISMA account O with a
-- profile. These are SIMULATED users exercising the real staging policies,
-- triggers and functions as `authenticated` / `anon` with a JWT subject; they
-- are backend evidence, not app or device acceptance.
--
-- Journey: A posts a free desk; B finds it with the free-items filter, saves it
-- and contacts A; A replies; C and O cannot read or join the conversation; O and
-- signed-out visitors cannot see the listing; A blocks B; C reports the listing.
--
-- The script always ends by raising an exception carrying every result, so the
-- transaction is rolled back even if the final ROLLBACK is skipped.
begin;
create temporary table _qa on commit drop as select
  gen_random_uuid() a, gen_random_uuid() b, gen_random_uuid() c, gen_random_uuid() o,
  null::uuid desk, null::uuid conv, substr(md5(random()::text), 1, 8) tag;
create temporary table _r (n serial, step text, ok boolean, detail text) on commit drop;
grant select, update on _qa to authenticated, anon;
grant select, insert on _r to authenticated, anon;
grant usage on sequence _r_n_seq to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, aud, role)
select a, 'qa-a-'||tag||'@gisma-student.com', now(), 'authenticated', 'authenticated' from _qa union all
select b, 'qa-b-'||tag||'@gisma-student.com', now(), 'authenticated', 'authenticated' from _qa union all
select c, 'qa-c-'||tag||'@gisma-student.com', now(), 'authenticated', 'authenticated' from _qa union all
select o, 'qa-o-'||tag||'@example.invalid',   now(), 'authenticated', 'authenticated' from _qa;
insert into public.profiles (id, display_name, city)
select a, 'QA Seller A', 'Potsdam' from _qa union all
select b, 'QA Buyer B', 'Berlin' from _qa union all
select c, 'QA Unrelated C', 'Berlin' from _qa union all
select o, 'QA Outsider O', 'Berlin' from _qa;

-- A posts a free desk (price 0).
select set_config('request.jwt.claim.sub', (select a::text from _qa), true);
set local role authenticated;
do $$ declare v uuid; st text; begin
  v := public.save_student_listing(null,'marketplace','QA free desk '||(select tag from _qa),'Rollback-only. Collect in Potsdam.','Potsdam',0,null,null,null,'good');
  update _qa set desk = v;
  select status::text into st from public.listings where id = v;
  insert into _r(step, ok, detail) values ('A posts a free desk; it is active', st = 'active', st);
end $$;
reset role;

-- B finds it with the free-items filter (price_cents <= 0), saves it, contacts A.
select set_config('request.jwt.claim.sub', (select b::text from _qa), true);
set local role authenticated;
do $$ declare n int; v uuid; again uuid; begin
  select count(*) into n from public.listings
   where kind = 'marketplace' and status = 'active' and price_cents <= 0 and id = (select desk from _qa);
  insert into _r(step, ok, detail) values ('B finds the desk with the free-items filter', n = 1, n::text);
  insert into public.saved_listings (user_id, listing_id) select b, desk from _qa;
  insert into _r(step, ok, detail) values ('B saves the desk', true, 'saved');
  v := public.start_listing_conversation((select desk from _qa));
  update _qa set conv = v;
  again := public.start_listing_conversation((select desk from _qa));
  insert into _r(step, ok, detail) values ('B contacts A; asking again reuses the conversation', v is not null and again = v, coalesce(v::text,'null'));
  insert into public.messages (conversation_id, sender_id, body) select conv, b, 'Is the desk still free?' from _qa;
  insert into _r(step, ok, detail) values ('B sends a message', true, 'sent');
end $$;
reset role;

-- A sees the conversation, reads B's message, replies; cannot see B's saved list.
select set_config('request.jwt.claim.sub', (select a::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.conversations where id = (select conv from _qa);
  insert into _r(step, ok, detail) values ('A sees the conversation', n = 1, n::text);
  select count(*) into n from public.messages where conversation_id = (select conv from _qa);
  insert into _r(step, ok, detail) values ('A reads B''s message', n = 1, n::text);
  insert into public.messages (conversation_id, sender_id, body) select conv, a, 'Yes, collect it tomorrow.' from _qa;
  insert into _r(step, ok, detail) values ('A replies', true, 'sent');
  select count(*) into n from public.saved_listings where user_id = (select b from _qa);
  insert into _r(step, ok, detail) values ('A cannot see B''s saved listings', n = 0, n::text);
end $$;
reset role;

-- C (GISMA, unrelated): cannot read, list or post into the conversation.
select set_config('request.jwt.claim.sub', (select b::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.messages where conversation_id = (select conv from _qa);
  insert into _r(step, ok, detail) values ('B reads both messages', n = 2, n::text);
end $$;
reset role;

select set_config('request.jwt.claim.sub', (select c::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.conversations where id = (select conv from _qa);
  insert into _r(step, ok, detail) values ('C cannot see the A-B conversation', n = 0, n::text);
  select count(*) into n from public.messages where conversation_id = (select conv from _qa);
  insert into _r(step, ok, detail) values ('C cannot read A-B messages', n = 0, n::text);
  select count(*) into n from public.conversation_members where conversation_id = (select conv from _qa);
  insert into _r(step, ok, detail) values ('C cannot list A-B members', n = 0, n::text);
  begin
    insert into public.messages (conversation_id, sender_id, body) select conv, c, 'Intruding' from _qa;
    insert into _r(step, ok, detail) values ('C cannot post into A-B conversation', false, 'insert allowed');
  exception when others then insert into _r(step, ok, detail) values ('C cannot post into A-B conversation', sqlstate in ('42501','23514','P0001'), sqlstate); end;
  begin
    insert into public.conversation_members (conversation_id, user_id) select conv, c from _qa;
    insert into _r(step, ok, detail) values ('C cannot add itself to A-B conversation', false, 'insert allowed');
  exception when others then insert into _r(step, ok, detail) values ('C cannot add itself to A-B conversation', sqlstate in ('42501','23514','P0001'), sqlstate); end;
  select count(*) into n from public.listings where id = (select desk from _qa);
  insert into _r(step, ok, detail) values ('C (student) can see the public desk listing', n = 1, n::text);
  perform public.report_content('listing', (select desk from _qa), 'spam', 'Rollback-only QA report.');
  insert into _r(step, ok, detail) values ('C reports the listing', true, 'reported');
end $$;
reset role;

-- O (not GISMA, has a profile): no catalogue, no contact, no conversation.
select set_config('request.jwt.claim.sub', (select o::text from _qa), true);
set local role authenticated;
do $$ declare n int; v uuid; begin
  select count(*) into n from public.listings where id = (select desk from _qa);
  insert into _r(step, ok, detail) values ('O (not GISMA) cannot see the desk', n = 0, n::text);
  select count(*) into n from public.profiles where id in ((select a from _qa), (select b from _qa));
  insert into _r(step, ok, detail) values ('O cannot read student profiles', n = 0, n::text);
  begin
    v := public.start_listing_conversation((select desk from _qa));
    insert into _r(step, ok, detail) values ('O cannot contact A via the listing id', false, 'conversation '||v::text);
  exception when others then insert into _r(step, ok, detail) values ('O cannot contact A via the listing id', sqlstate in ('42501','22023'), sqlstate||' '||sqlerrm); end;
  select count(*) into n from public.messages where conversation_id = (select conv from _qa);
  insert into _r(step, ok, detail) values ('O cannot read A-B messages', n = 0, n::text);
end $$;
reset role;

-- Signed out.
set local role anon;
do $$ declare n int; t text; begin
  -- Signed out: an empty result or "permission denied" (42501) both pass.
  foreach t in array array['listings','messages','profiles','conversations'] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      insert into _r(step, ok, detail) values ('Signed out: no '||t||' visible', n = 0, n::text||' rows');
    exception when insufficient_privilege then
      insert into _r(step, ok, detail) values ('Signed out: no '||t||' visible', true, 'permission denied');
    end;
  end loop;
end $$;
reset role;

-- A blocks B in the conversation; B can no longer send.
select set_config('request.jwt.claim.sub', (select a::text from _qa), true);
set local role authenticated;
do $$ begin
  perform public.set_conversation_block((select conv from _qa), true);
  insert into _r(step, ok, detail) values ('A blocks B', true, 'blocked');
end $$;
reset role;
select set_config('request.jwt.claim.sub', (select b::text from _qa), true);
set local role authenticated;
do $$ begin
  begin
    insert into public.messages (conversation_id, sender_id, body) select conv, b, 'After block' from _qa;
    insert into _r(step, ok, detail) values ('B cannot message A after the block', false, 'insert allowed');
  exception when others then insert into _r(step, ok, detail) values ('B cannot message A after the block', true, sqlstate); end;
end $$;
reset role;

do $$ begin
  raise exception 'STUORA_QA_RESULT %', (select json_build_object(
    'passed', count(*) filter (where ok), 'failed', count(*) filter (where not ok),
    'failures', coalesce(json_agg(json_build_object('step', step, 'detail', detail) order by n) filter (where not ok), '[]'::json),
    'steps', json_agg(step order by n)) from _r);
end $$;
rollback;
