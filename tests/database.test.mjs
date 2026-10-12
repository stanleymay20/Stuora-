import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const a = id(1), b = id(2), c = id(3);
const house = id(11), draft = id(12), job = id(13), trip = id(14);
const ab = id(21), bc = id(22);

async function database(inheritedGrants) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    -- Supabase Storage is platform-managed in hosted projects. Model only the
    -- contract our migrations depend on so PGlite exercises the real policies.
    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null,
      name text not null,
      unique (bucket_id, name)
    );
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select case
        when array_length(string_to_array(name, '/'), 1) > 1
          then (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
        else array[]::text[]
      end
    $$;
    create function storage.filename(name text) returns text language sql immutable as $$
      select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
    $$;

    grant usage on schema public, auth, storage to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant execute on function storage.foldername(text), storage.filename(text) to anon, authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
    ${inheritedGrants ? 'alter default privileges in schema public grant all on tables to anon, authenticated;' : ''}
  `);
  const files = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort();
  assert.ok(files.length > 0, 'At least one controlled migration is required');
  for (const f of files) await db.exec(readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'));
  await db.exec(`
    insert into auth.users values ('${a}'), ('${b}'), ('${c}');
    insert into public.profiles (id, display_name, is_discoverable)
      values ('${a}', 'Alice', true), ('${b}', 'Bob', true), ('${c}', 'Private Charlie', false);
    insert into public.listings (id, owner_id, kind, status, title) values
      ('${house}', '${a}', 'housing', 'active', 'Room in Berlin'),
      ('${draft}', '${a}', 'marketplace', 'draft', 'Private draft'),
      ('${job}', '${a}', 'job', 'active', 'Student job'),
      ('${trip}', '${a}', 'trip', 'active', 'Prague trip');
    insert into public.housing_details (listing_id, housing_type, rent_cents) values ('${house}', 'room', 62000);
    insert into public.marketplace_details (listing_id) values ('${draft}');
    insert into public.trip_details (listing_id, destination, starts_at, capacity) values ('${trip}', 'Prague', now(), 2);
    insert into public.conversations (id, creator_id) values ('${ab}', '${a}'), ('${bc}', '${b}');
    insert into public.conversation_members (conversation_id, user_id) values
      ('${ab}', '${a}'), ('${ab}', '${b}'), ('${bc}', '${b}'), ('${bc}', '${c}');
    insert into public.messages (conversation_id, sender_id, body) values
      ('${ab}', '${a}', 'Private Alice/Bob'), ('${bc}', '${c}', 'Private Bob/Charlie');
    insert into public.student_benefits (title, benefit_type, sponsor_name, verified_at) values
      ('Verified offer', 'discount', 'Sponsor', now()),
      ('Unverified offer', 'discount', 'Sponsor', null);
  `);
  return db;
}

for (const inheritedGrants of [false, true]) {
  test(`migration + role isolation (inherited grants: ${inheritedGrants})`, async t => {
    const db = await database(inheritedGrants);
    let assertions = 0;
    async function as(role, user, sql) {
      await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
      try { return await db.query(sql); } finally { await db.exec('reset role'); }
    }
    async function count(role, user, sql, expected) {
      const { rows } = await as(role, user, sql);
      assert.equal(rows.length, expected); assertions++;
    }
    async function deny(user, sql, code = '42501') {
      await assert.rejects(as('authenticated', user, sql), e => e.code === code); assertions++;
    }
    try {
      await count('anon', null, 'select * from public.listings', 3);
      await count('anon', null, 'select * from public.marketplace_details', 0);
      await count('authenticated', a, 'select * from public.listings', 4);
      await count('authenticated', b, `select * from public.listings where id = '${draft}'`, 0);
      await count('authenticated', a, 'select * from public.profiles', 2);
      await count('authenticated', c, 'select * from public.profiles', 3);
      await deny(b, `insert into public.profiles (id, display_name) values ('${id(99)}', 'Impersonated')`);
      await deny(a, `update public.profiles set student_status = 'verified' where id = '${a}'`);
      await deny(a, `update public.profiles set account_kind = 'employer' where id = '${a}'`);
      await count('authenticated', b, `update public.profiles set bio = 'Tampered' where id = '${a}' returning *`, 0);
      await count('authenticated', a, `update public.profiles set bio = 'Hello Berlin' where id = '${a}' returning *`, 1);
      await deny(b, `insert into public.listings (owner_id, kind, title) values ('${a}', 'housing', 'Impersonated listing')`);
      await deny(a, `insert into public.listings (owner_id, kind, title) values ('${a}', 'job', 'Unverified employer post')`);
      await deny(a, `update public.listings set owner_id = '${b}' where id = '${house}'`);
      await deny(a, `update public.listings set kind = 'job' where id = '${house}'`);
      await count('authenticated', b, `update public.listings set title = 'Tampered' where id = '${house}' returning *`, 0);
      await count('authenticated', a, `update public.listings set title = 'Updated room' where id = '${house}' returning *`, 1);
      await deny(a, `insert into public.housing_details (listing_id, housing_type, rent_cents) values ('${job}', 'room', 10)`);
      await deny(b, `update public.housing_details set listing_id = '${job}' where listing_id = '${house}'`);
      await count('authenticated', b, `update public.housing_details set rent_cents = 1 where listing_id = '${house}' returning *`, 0);
      await count('authenticated', a, `update public.housing_details set rent_cents = 60000 where listing_id = '${house}' returning *`, 1);
      await deny(b, `insert into public.job_applications (job_listing_id, applicant_id, status) values ('${job}', '${b}', 'accepted')`);
      await deny(b, `insert into public.job_applications (job_listing_id, applicant_id) values ('${job}', '${a}')`);
      await count('authenticated', b, `insert into public.job_applications (job_listing_id, applicant_id, cover_note) values ('${job}', '${b}', 'My application') returning *`, 1);
      await count('authenticated', a, 'select * from public.job_applications', 1);
      await count('authenticated', c, 'select * from public.job_applications', 0);
      await deny(b, `update public.job_applications set status = 'accepted'`);
      await count('authenticated', b, 'update public.job_applications set withdrawn_at = now() returning *', 1);
      await deny(b, `insert into public.trip_participants (trip_listing_id, user_id) values ('${trip}', '${b}')`);
      await count('authenticated', a, 'select * from public.messages', 1);
      await count('authenticated', b, 'select * from public.messages', 2);
      await count('authenticated', c, 'select * from public.messages', 1);
      await deny(a, `insert into public.messages (conversation_id, sender_id, body) values ('${bc}', '${a}', 'Cross-conversation attack')`);
      await deny(a, `insert into public.messages (conversation_id, sender_id, body) values ('${ab}', '${b}', 'Spoofed sender')`);
      await count('authenticated', a, `insert into public.messages (conversation_id, sender_id, body) values ('${ab}', '${a}', 'Legitimate message') returning *`, 1);
      await deny(a, `insert into public.messages (conversation_id, sender_id, body) values ('${ab}', '${a}', '   ')`, '23514');
      await deny(a, `update public.messages set body = 'Rewritten history'`);
      await deny(a, `insert into public.messages (conversation_id, sender_id, body, created_at) values ('${ab}', '${a}', 'Backdated', '2000-01-01')`);
      await deny(a, `insert into public.conversations (creator_id, title) values ('${a}', 'Arbitrary conversation')`);
      await deny(a, `insert into public.conversation_members (conversation_id, user_id) values ('${ab}', '${c}')`);

      const { rows: started } = await as('authenticated', b, `select public.start_listing_conversation('${house}') as id`);
      const listingConversation = started[0].id;
      assert.ok(listingConversation); assertions++;
      await count('authenticated', a, `select * from public.conversations where id = '${listingConversation}' and listing_id = '${house}'`, 1);
      await count('authenticated', b, `select * from public.conversations where id = '${listingConversation}' and listing_id = '${house}'`, 1);
      await count('authenticated', c, `select * from public.conversations where id = '${listingConversation}'`, 0);
      const { rows: reused } = await as('authenticated', b, `select public.start_listing_conversation('${house}') as id`);
      assert.equal(reused[0].id, listingConversation); assertions++;
      await count('authenticated', b, `insert into public.messages (conversation_id, sender_id, body) values ('${listingConversation}', '${b}', 'Is this still available?') returning *`, 1);
      await count('authenticated', a, `select * from public.messages where conversation_id = '${listingConversation}'`, 1);
      await deny(a, `select public.start_listing_conversation('${house}')`, '22023');
      await deny(b, `select public.start_listing_conversation('${draft}')`, '22023');
      await deny(b, `select public.start_listing_conversation('${job}')`, '22023');

      await count('anon', null, 'select * from public.student_benefits', 1);
      await deny(a, `insert into public.student_benefits (title, benefit_type, sponsor_name, verified_at) values ('Fake verified offer', 'discount', 'Me', now())`);
      await deny(a, 'update public.student_benefits set verified_at = now()');
      await deny(a, `insert into public.benefit_redemptions (benefit_id, user_id, savings_cents) select id, '${a}', 999999 from public.student_benefits`);
      await deny(a, `insert into public.reports (reporter_id, reported_user_id, reason) values ('${b}', '${c}', 'spam')`);
      await count('authenticated', a, `insert into public.reports (reporter_id, reported_user_id, reason) values ('${a}', '${c}', 'spam') returning *`, 1);
      await count('authenticated', b, 'select * from public.reports', 0);

      // Media metadata follows listing visibility and ownership.
      await count('authenticated', a, `insert into public.listing_media (listing_id, object_path, sort_order) values ('${house}', '${a}/${house}/room.jpg', 0) returning *`, 1);
      await count('anon', null, `select * from public.listing_media where listing_id = '${house}'`, 1);
      await deny(b, `insert into public.listing_media (listing_id, object_path) values ('${house}', '${b}/${house}/attack.jpg')`);
      await deny(a, `insert into public.listing_media (listing_id, object_path) values ('${house}', '${a}/${job}/wrong-listing.jpg')`);
      await count('authenticated', a, `insert into public.listing_media (listing_id, object_path) values ('${draft}', '${a}/${draft}/draft.jpg') returning *`, 1);
      await count('anon', null, `select * from public.listing_media where listing_id = '${draft}'`, 0);
      await count('authenticated', a, `select * from public.listing_media where listing_id = '${draft}'`, 1);
      await count('authenticated', b, `delete from public.listing_media where listing_id = '${house}' returning *`, 0);

      // Hosted Supabase owns these tables; the harness grants authenticated CRUD
      // so the same storage.objects policies can be exercised locally.
      await count('authenticated', a, `insert into storage.objects (bucket_id, name) values ('listing-media', '${a}/${house}/room.jpg') returning *`, 1);
      await deny(b, `insert into storage.objects (bucket_id, name) values ('listing-media', '${b}/${house}/attack.jpg')`);
      await deny(a, `insert into storage.objects (bucket_id, name) values ('listing-media', '${a}/${job}/job.jpg')`);
      await count('authenticated', a, `insert into storage.objects (bucket_id, name) values ('avatars', '${a}/avatar') returning *`, 1);
      await deny(b, `insert into storage.objects (bucket_id, name) values ('avatars', '${a}/avatar-2')`);
      await count('authenticated', b, `select * from storage.objects where bucket_id = 'avatars'`, 0);
      await count('authenticated', a, `select * from storage.objects where bucket_id = 'avatars'`, 1);

      const save = (listingId, kind, title, price = 3500, housingType = 'room', condition = 'good') => `select public.save_student_listing(${listingId ? `'${listingId}'` : 'null'}, '${kind}', '${title}', 'Student listing', 'Berlin', ${price}, '${housingType}', true, true, '${condition}') as id`;
      const { rows: created } = await as('authenticated', a, save(null, 'housing', 'Persistent room', 65000));
      const liveHouse = created[0].id;
      await count('anon', null, `select * from public.housing_details where listing_id = '${liveHouse}' and rent_cents = 65000`, 1);
      await count('authenticated', a, save(liveHouse, 'housing', 'Edited room', 60000), 1);
      await count('anon', null, `select * from public.housing_details where listing_id = '${liveHouse}' and rent_cents = 60000`, 1);
      await deny(a, save(liveHouse, 'housing', 'Rollback edited room', 100, 'invalid_type'), '23514');
      await count('anon', null, `select * from public.listings where id = '${liveHouse}' and title = 'Edited room' and price_cents = 60000`, 1);
      await deny(b, save(liveHouse, 'housing', 'Hijacked room'));
      await deny(a, save(liveHouse, 'marketplace', 'Changed kind'));
      await deny(a, save(null, 'trip', 'Unsupported trip'), '22023');
      await deny(a, save(null, 'housing', 'Orphan sentinel', 500, 'invalid_type'), '23514');
      await count('authenticated', a, "select * from public.listings where title = 'Orphan sentinel'", 0);
      await deny(a, save(null, 'marketplace', 'Negative price', -1), '22023');
      await assert.rejects(as('anon', null, save(null, 'marketplace', 'Anonymous listing')), e => e.code === '42501'); assertions++;
      const { rows: market } = await as('authenticated', a, save(null, 'marketplace', 'Free desk', 0));
      const liveMarket = market[0].id;
      await count('anon', null, `select * from public.marketplace_details where listing_id = '${liveMarket}' and item_condition = 'good'`, 1);
      await deny(a, save(liveMarket, 'marketplace', 'Invalid edit', 10, 'room', 'invalid'), '22P02');
      await count('anon', null, `select * from public.listings where id = '${liveMarket}' and title = 'Free desk'`, 1);
      await count('authenticated', a, `update public.listings set status = 'closed' where id = '${liveMarket}' returning id`, 1);
      await count('anon', null, `select * from public.listings where id = '${liveMarket}'`, 0);
      await count('anon', null, `select * from public.marketplace_details where listing_id = '${liveMarket}'`, 0);
      await count('authenticated', a, `select * from public.listings where id = '${liveMarket}'`, 1);
      await deny(a, save(liveMarket, 'marketplace', 'Reopen archived'));
      // Newly enabled categories use controlled atomic publishing, not local data.
      const publish = (kind, title, details = {}, listingId = null, price = 0) => `select public.save_community_listing(${listingId ? `'${listingId}'` : 'null'}, '${kind}', '${title}', 'Persisted community content', 'Berlin', ${price}, '${JSON.stringify(details)}'::jsonb) as id`;
      const future = new Date(Date.now() + 86400000).toISOString();
      const tripDetails = { destination: 'Potsdam', starts_at: future, capacity: 2 };
      const eventDetails = { venue_name: 'Student hall', starts_at: future, capacity: 1 };
      const jobDetails = { company_name: 'Reviewed employer', compensation_text: 'EUR 20 per hour', workplace_mode: 'hybrid' };
      await deny(a, publish('job','Unapproved job',jobDetails));
      await deny(a, `insert into public.listings(owner_id,kind,title) values('${a}','post','Direct bypass')`);
      await assert.rejects(as('anon', null, publish('post','Anonymous post')), e => e.code === '42501'); assertions++;
      await deny(a, publish('trip','Rollback trip',{...tripDetails,destination:''}), '22023');
      await count('authenticated',a, "select * from public.listings where title='Rollback trip'",0);
      const community = (await as('authenticated',a,publish('post','Community hello'))).rows[0].id;
      const outing = (await as('authenticated',a,publish('trip','Potsdam outing',tripDetails))).rows[0].id;
      const gathering = (await as('authenticated',a,publish('event','Student gathering',eventDetails))).rows[0].id;
      await count('anon',null,`select * from public.listings where id='${community}'`,1);
      await deny(b,publish('post','Hijacked community',{},community));
      await count('authenticated',a,publish('post','Community edited',{},community),1);
      await deny(a,`update public.trip_details set capacity=1 where listing_id='${outing}'`);
      await deny(b,`insert into public.event_participants(event_listing_id,user_id) values('${gathering}','${b}')`);
      const participate = (listingId, action, note='') => `select public.listing_participation('${listingId}','${action}','${note}') as state`;
      await deny(a,participate(outing,'join'));
      const joinB = (await as('authenticated',b,participate(outing,'join'))).rows[0].state;
      assert.equal(joinB.count,1); assert.equal(joinB.joined,true); assertions+=2;
      const joinAgain = (await as('authenticated',b,participate(outing,'join'))).rows[0].state;
      assert.equal(joinAgain.count,1); assertions++;
      await count('authenticated',c,participate(outing,'join'),1);
      // Capacity cannot be lowered below existing bookings.
      await deny(a,publish('trip','Shrink capacity',{...tripDetails,capacity:1},outing), '22023');
      await count('authenticated',b,participate(outing,'leave'),1);
      await count('authenticated',b,participate(gathering,'join'),1);
      await deny(c,participate(gathering,'join'),'22023');
      await count('authenticated',c,`select * from public.event_participants where event_listing_id='${gathering}'`,0);
      await count('authenticated',a,`select * from public.event_participants where event_listing_id='${gathering}'`,1);
      await count('authenticated',b,participate(gathering,'leave'),1);
      await count('authenticated',c,participate(gathering,'join'),1);
      await count('authenticated',a,`update public.listings set status='closed' where id='${gathering}' returning *`,1);
      await deny(b,participate(gathering,'state'),'22023');
      await count('authenticated',c,participate(gathering,'leave'),1);
      // Publisher requests persist, but do not grant roles or permit self-approval.
      await count('authenticated',b,`insert into public.publisher_requests(user_id,company_name,details) values('${b}','Student business','Request for human business review') returning *`,1);
      await deny(b, "update public.publisher_requests set status='approved'");
      await count('authenticated',c,'select * from public.publisher_requests',0);
      await deny(b,`update public.profiles set account_kind='employer' where id='${b}'`);
      await db.exec(`update public.profiles set account_kind='employer' where id='${a}'`);
      const opportunity = (await as('authenticated',a,publish('job','Reviewed student job',jobDetails))).rows[0].id;
      await deny(a,participate(opportunity,'apply'));
      await count('authenticated',b,participate(opportunity,'apply','My cover note'),1);
      await count('authenticated',b,participate(opportunity,'apply','Duplicate submission'),1);
      await count('authenticated',b,`select * from public.job_applications where job_listing_id='${opportunity}'`,1);
      const applicationId = (await as('authenticated',b,`select id from public.job_applications where job_listing_id='${opportunity}'`)).rows[0].id;
      await deny(b,`select public.review_job_application('${applicationId}','accepted')`);
      await count('authenticated',a,`select public.review_job_application('${applicationId}','reviewing')`,1);
      await count('authenticated',b,`select * from public.job_applications where id='${applicationId}' and status='reviewing'`,1);
      await count('authenticated',b,participate(opportunity,'withdraw'),1);
      await deny(a,`select public.review_job_application('${applicationId}','accepted')`,'22023');
      // Blocking is persistent and enforced for new and existing contact.
      await count('authenticated',b,`insert into public.user_blocks(blocker_id,blocked_id) values('${b}','${a}') returning *`,1);
      await count('authenticated',a,'select * from public.user_blocks',0);
      await deny(c,`insert into public.user_blocks(blocker_id,blocked_id) values('${b}','${a}')`);
      await deny(b,`select public.start_listing_conversation('${community}')`);
      await deny(b,`insert into public.messages(conversation_id,sender_id,body) values('${listingConversation}','${b}','Blocked contact')`);
      await deny(a,`insert into public.messages(conversation_id,sender_id,body) values('${listingConversation}','${a}','Reverse blocked contact')`);
      await deny(b,participate(outing,'join'));
      await count('authenticated',b,`delete from public.user_blocks where blocked_id='${a}' returning *`,1);
      await count('authenticated',b,`select public.start_listing_conversation('${community}')`,1);
      // Atomic server quota cannot be changed by clients; window recovery is real.
      await deny(a, "update private.action_limits set used=0");
      await db.exec(`delete from private.action_limits where user_id='${a}'`);
      for(let n=0;n<20;n++) await count('authenticated',a,publish('post',`Quota post ${n}`),1);
      await deny(a,publish('post','Rate overflow'),'P0001');
      await count('authenticated',a,"select * from public.listings where title='Rate overflow'",0);
      await db.exec(`update private.action_limits set window_start=now()-interval '2 hours' where user_id='${a}'`);
      await count('authenticated',a,publish('post','Quota recovered'),1);
      for(let n=0;n<60;n++) await count('authenticated',a,`insert into public.messages(conversation_id,sender_id,body) values('${ab}','${a}','Rate check ${n}') returning id`,1);
      await deny(a,`insert into public.messages(conversation_id,sender_id,body) values('${ab}','${a}','Message overflow')`,'P0001');
      const quotaListings=(await db.query("select id from public.listings where title like 'Quota post %' order by title")).rows;
      await db.exec(`delete from private.action_limits where user_id='${b}' and action='conversation'`);
      for(let n=0;n<10;n++) await count('authenticated',b,`select public.start_listing_conversation('${quotaListings[n].id}')`,1);
      await deny(b,`select public.start_listing_conversation('${quotaListings[10].id}')`,'P0001');
      await count('authenticated',b,`select public.start_listing_conversation('${quotaListings[0].id}')`,1);
      const { rows: rls } = await db.query("select relname from pg_class join pg_namespace on pg_namespace.oid = relnamespace where nspname = 'public' and relkind = 'r' and not relrowsecurity");
      assert.deepEqual(rls, []); assertions++;
      t.diagnostic(`${assertions} authorization assertions passed against Postgres`);
    } finally { await db.close(); }
  });
}
