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
    create role anon; create role authenticated; create role service_role;
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
    grant usage on schema public to service_role;
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
    insert into public.profiles (id, display_name, city, is_discoverable)
      values ('${a}', 'Alice', 'Aachen', true), ('${b}', 'Bob', 'Aachen', true), ('${c}', 'Private Charlie', 'Aachen', false);
    insert into public.listings (id, owner_id, kind, status, title, city, price_cents) values
      ('${house}', '${a}', 'housing', 'active', 'Room for students', 'Aachen', 62000),
      ('${draft}', '${a}', 'marketplace', 'draft', 'Private draft', 'Aachen', null),
      ('${job}', '${a}', 'job', 'active', 'Student job', 'Aachen', null),
      ('${trip}', '${a}', 'trip', 'active', 'Prague trip', 'Aachen', null);
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
      await deny(a, `update public.housing_details set rent_cents = 60000 where listing_id = '${house}'`, '23514');
      await count('authenticated', a, `select * from public.housing_details where listing_id = '${house}' and rent_cents = 62000`, 1);
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
      // Existing bookmark table RLS: saved rows belong exclusively to their user.
      await count('authenticated', b, "insert into public.saved_listings (user_id,listing_id) values ('" + b + "','" + house + "') returning *", 1);
      await count('authenticated', b, "select * from public.saved_listings where listing_id='" + house + "'", 1);
      await count('authenticated', a, "select * from public.saved_listings where listing_id='" + house + "'", 0);
      await deny(a, "insert into public.saved_listings (user_id,listing_id) values ('" + b + "','" + house + "')");
      await count('authenticated', a, "delete from public.saved_listings where listing_id='" + house + "' returning *", 0);
      await count('authenticated', b, "delete from public.saved_listings where listing_id='" + house + "' returning *", 1);

      // Media metadata follows listing visibility and ownership.
      await count('authenticated', a, `insert into public.listing_media (listing_id, object_path, sort_order) values ('${house}', '${a}/${house}/room.jpg', 0) returning *`, 1);
      await count('anon', null, `select * from public.listing_media where listing_id = '${house}'`, 1);
      await deny(b, `insert into public.listing_media (listing_id, object_path) values ('${house}', '${b}/${house}/attack.jpg')`, '23514');
      await deny(a, `insert into public.listing_media (listing_id, object_path) values ('${house}', '${a}/${job}/wrong-listing.jpg')`, '23514');
      await count('authenticated', a, `insert into public.listing_media (listing_id, object_path) values ('${draft}', '${a}/${draft}/draft.jpg') returning *`, 1);
      await count('anon', null, `select * from public.listing_media where listing_id = '${draft}'`, 0);
      await count('authenticated', a, `select * from public.listing_media where listing_id = '${draft}'`, 1);
      await count('authenticated', b, `delete from public.listing_media where listing_id = '${house}' returning *`, 0);
      // Quota must be enforced inside Postgres, including direct REST writes
      // that bypass the app's displayed six-photo limit.
      for (let i = 1; i < 6; i++) {
        await count('authenticated', a,
          `insert into public.listing_media (listing_id,object_path,sort_order)
          values ('${house}','${a}/${house}/room-${i}.jpg',${i}) returning id`, 1);
      }
      await deny(a,
        `insert into public.listing_media (listing_id,object_path,sort_order)
         values ('${house}','${a}/${house}/seventh.jpg',6)`, '23514');
      // A privileged service writer must obey the exact path and quota too.
      await assert.rejects(db.query(
        `insert into public.listing_media(listing_id,object_path,sort_order)
         values ('${house}','${b}/${house}/privileged.jpg',6)`), e => e.code === '23514');
      assertions++;
      await assert.rejects(db.query(
        `insert into public.listing_media(listing_id,object_path,sort_order)
         values ('${house}','${a}/${house}/nested/escape.jpg',6)`), e => e.code === '23514');
      assertions++;
      await assert.rejects(db.query(
        `insert into public.listing_media(listing_id,object_path,sort_order)
         values ('${house}','${a}/${house}/seventh-admin.jpg',6)`), e => e.code === '23514');
      assertions++;
      await count('authenticated', a, `select * from public.listing_media where listing_id='${house}'`, 6);
      await count('authenticated', a,
        `delete from public.listing_media where listing_id='${house}' and sort_order=3 returning id`, 1);
      await count('authenticated', a,
        `insert into public.listing_media (listing_id,object_path,sort_order)
         values ('${house}','${a}/${house}/replacement.jpg',3) returning id`, 1);


      // Upload-attempt admission is service-only and durable across separate
      // RPC transactions even if no upload or metadata INSERT follows.
      const { rows: attemptGrants } = await db.query(`select
        has_function_privilege('anon','public.consume_listing_photo_attempt(uuid,uuid)','EXECUTE') as anon_allowed,
        has_function_privilege('authenticated','public.consume_listing_photo_attempt(uuid,uuid)','EXECUTE') as student_allowed,
        has_function_privilege('service_role','public.consume_listing_photo_attempt(uuid,uuid)','EXECUTE') as server_allowed`);
      assert.deepEqual(attemptGrants[0], { anon_allowed: false, student_allowed: false, server_allowed: true });
      assertions++;
      await deny(a, `select public.consume_listing_photo_attempt('${a}','${house}')`, '42501');
      for (let i=0; i<10; i++) {
        const { rows } = await as('service_role', a,
          `select public.consume_listing_photo_attempt('${a}','${house}') as allowed`);
        assert.equal(rows[0].allowed, true); assertions++;
      }
      const { rows: exhausted } = await as('service_role', a,
        `select public.consume_listing_photo_attempt('${a}','${house}') as allowed`);
      assert.equal(exhausted[0].allowed, false); assertions++;
      const { rows: differentListing } = await as('service_role', a,
        `select public.consume_listing_photo_attempt('${a}','${draft}') as allowed`);
      assert.equal(differentListing[0].allowed, false); assertions++;
      const { rows: anotherStudent } = await as('service_role', b,
        `select public.consume_listing_photo_attempt('${b}','${house}') as allowed`);
      assert.equal(anotherStudent[0].allowed, true); assertions++;
      const { rows: persistedAttempts } = await db.query(
        `select used from private.listing_photo_attempt_windows
         where scope='student_minute' and scope_key='${a}'`);
      assert.equal(persistedAttempts[0].used, 12); assertions++;

      // A separate committed service-role processing lease caps concurrent
      // WASM decoders. Public roles cannot acquire or release capacity.
      const { rows: leaseGrants } = await db.query(`select
        has_function_privilege('anon','public.acquire_listing_photo_processing_lease(uuid,uuid)','EXECUTE') as anon_allowed,
        has_function_privilege('authenticated','public.acquire_listing_photo_processing_lease(uuid,uuid)','EXECUTE') as user_allowed,
        has_function_privilege('service_role','public.acquire_listing_photo_processing_lease(uuid,uuid)','EXECUTE') as server_allowed`);
      assert.deepEqual(leaseGrants[0], { anon_allowed:false, user_allowed:false, server_allowed:true }); assertions++;
      await deny(a, `select public.acquire_listing_photo_processing_lease('${a}','11111111-1111-4111-8111-111111111101')`);
      const leaseIdentities = [a,b,c,id(84),id(85)];
      const leaseTokens = [id(91),id(92),id(93),id(94),id(95)];
      for (let i=0;i<4;i++) {
        const { rows }=await as('service_role',leaseIdentities[i],
          `select public.acquire_listing_photo_processing_lease('${leaseIdentities[i]}','${leaseTokens[i]}') as admitted`);
        assert.equal(rows[0].admitted,true); assertions++;
      }
      const { rows: duplicateUser }=await as('service_role',a,
        `select public.acquire_listing_photo_processing_lease('${a}','${id(96)}') as admitted`);
      assert.equal(duplicateUser[0].admitted,false); assertions++;
      const { rows: fullCapacity }=await as('service_role',leaseIdentities[4],
        `select public.acquire_listing_photo_processing_lease('${leaseIdentities[4]}','${leaseTokens[4]}') as admitted`);
      assert.equal(fullCapacity[0].admitted,false); assertions++;
      const { rows: wrongOwnerRelease }=await as('service_role',b,
        `select public.release_listing_photo_processing_lease('${a}','${leaseTokens[0]}') as released`);
      assert.equal(wrongOwnerRelease[0].released,false); assertions++;
      const { rows: correctRelease }=await as('service_role',a,
        `select public.release_listing_photo_processing_lease('${a}','${leaseTokens[0]}') as released`);
      assert.equal(correctRelease[0].released,true); assertions++;
      const { rows: refilled }=await as('service_role',leaseIdentities[4],
        `select public.acquire_listing_photo_processing_lease('${leaseIdentities[4]}','${leaseTokens[4]}') as admitted`);
      assert.equal(refilled[0].admitted,true); assertions++;


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
      await deny(a, `update public.listings set price_cents = 60000 where id = '${house}'`, '23514');
      await count('authenticated', a, save(house, 'housing', 'Updated rent atomically', 60000), 1);
      await count('authenticated', a, `select * from public.listings where id = '${house}' and price_cents = 60000`, 1);
      await count('authenticated', a, `select * from public.housing_details where listing_id = '${house}' and rent_cents = 60000`, 1);
      await assert.rejects(as('anon', null, save(null, 'marketplace', 'Anonymous listing')), e => e.code === '42501'); assertions++;
      const { rows: market } = await as('authenticated', a, save(null, 'marketplace', 'Free desk', 0));
      const liveMarket = market[0].id;
      await count('anon', null, `select * from public.marketplace_details where listing_id = '${liveMarket}' and item_condition = 'good'`, 1);
      await deny(a, save(liveMarket, 'marketplace', 'Invalid edit', 10, 'room', 'invalid'), '22P02');
      await count('anon', null, `select * from public.listings where id = '${liveMarket}' and title = 'Free desk'`, 1);
      await deny(a, `delete from public.marketplace_details where listing_id='${liveMarket}'`, '23514');
      await count('authenticated', a, `update public.listings set status = 'closed' where id = '${liveMarket}' returning id`, 1);
      await count('anon', null, `select * from public.listings where id = '${liveMarket}'`, 0);
      await count('anon', null, `select * from public.marketplace_details where listing_id = '${liveMarket}'`, 0);
      await count('authenticated', a, `select * from public.listings where id = '${liveMarket}'`, 1);
      await deny(a, save(liveMarket, 'marketplace', 'Reopen archived'));
      // The fresh-database baseline MUST contain staging's abuse controls;
      // PR18 introduced these triggers and they cannot be assumed present.
      const { rows: limiterTriggers } = await db.query(`select tgname from pg_trigger
        where not tgisinternal and tgname in
        ('listings_safety','messages_safety','reports_safety','job_applications_safety')`);
      assert.deepEqual(limiterTriggers.map(row => row.tgname).sort(),
        ['job_applications_safety','listings_safety','messages_safety','reports_safety']);
      assertions++;
      const { rows: fnGrants } = await db.query(`select
        has_function_privilege('authenticated','public.save_community_listing(uuid,public.listing_kind,text,text,text,integer,jsonb)','EXECUTE') as publish,
        has_function_privilege('authenticated','public.listing_participation(uuid,text,text)','EXECUTE') as participation,
        has_function_privilege('authenticated','public.review_job_application(uuid,public.application_status)','EXECUTE') as review,
        has_function_privilege('authenticated','private.save_community_listing_impl(uuid,public.listing_kind,text,text,text,integer,jsonb)','EXECUTE') as internal_publish`);
      for (const value of Object.values(fnGrants[0])) {
        assert.equal(value, false, 'unfinished community API must not be executable');
        assertions++;
      }
      await deny(a, `select public.save_community_listing(null,'event'::public.listing_kind,
        'Unauthorized event','', 'Aachen',0,'{}'::jsonb)`, '42501');
      await deny(a, `select public.listing_participation('${trip}','join')`, '42501');
      await deny(a, `insert into public.listings(owner_id,kind,status,title,city,price_cents)
        values ('${a}','event','active','Direct bypass event','Aachen',0)`, '42501');
      await deny(a, `insert into public.listings(owner_id,kind,status,title,city,price_cents)
        values ('${a}','trip','draft','Direct bypass trip','Aachen',0)`, '42501');

      // A caller with a valid JWT must not bypass the publishing RPC by
      // inserting a public housing/marketplace parent without detail rows.
      await deny(a, `insert into public.listings
        (owner_id, kind, status, title, city, price_cents)
        values ('${a}', 'housing', 'active', 'No house details', 'Aachen', 100)`, '23514');
      await deny(a, `insert into public.listings
        (owner_id, kind, status, title, city, price_cents)
        values ('${a}', 'marketplace', 'active', 'No item details', 'Aachen', 100)`, '23514');
      await deny(a, `insert into public.listings
        (owner_id, kind, status, title, city, price_cents, currency)
        values ('${a}', 'housing', 'active', 'Wrong currency', 'Aachen', 100, 'USD')`, '23514');
      await deny(a, `update public.listings set currency = 'USD'
        where id = '${house}'`, '23514');
      // The database owns created_at even if a direct request attempts 2099.
      const { rows: spoofedDate } = await as('authenticated', a,
        `insert into public.listings
          (owner_id, kind, status, title, city, created_at)
          values ('${a}', 'housing', 'draft', 'Future-pinned draft', 'Aachen', '2099-01-01')
          returning id, created_at`);
      assert.equal(spoofedDate.length, 1);
      assert.ok(new Date(spoofedDate[0].created_at).getUTCFullYear() < 2099); assertions += 2;
      await deny(a, `update public.listings set status = 'active'
        where id = '${spoofedDate[0].id}'`, '23514');

      // Database-level public listing integrity: no blank city, missing price,
      // detail deletion, diverging rent, or direct archived reactivation.
      await deny(a, `insert into public.listings(owner_id,kind,status,title,city,price_cents)
        values ('${a}','housing','draft','Whitespace city','     ',1200)`, '23514');
      await deny(a, `update public.listings set city='   ' where id='${house}'`, '23514');
      await deny(a, `update public.profiles set city='   ' where id='${a}'`, '23514');
      await deny(a, `insert into public.listings(owner_id,kind,status,title,city,price_cents)
        values ('${a}','housing','active','Null rent listing','Aachen',null)`, '23514');
      await deny(a, `update public.listings set price_cents=null where id='${house}'`, '23514');
      await deny(a, `delete from public.housing_details where listing_id='${house}'`, '23514');
      await count('authenticated', a,
        `select * from public.housing_details where listing_id='${house}'`, 1);
      await deny(a, `update public.listings set status='active' where id='${liveMarket}'`, '42501');
      // Draft child deletion and parent deletion must still work normally.
      await count('authenticated', a,
        `delete from public.marketplace_details where listing_id='${draft}' returning listing_id`, 1);
      await count('authenticated', a,
        `delete from public.listings where id='${draft}' returning id`, 1);

      // New profile defaults are private and neither profile nor listing can
      // be created with an invented city when callers omit that field.
      const { rows: defaults } = await db.query(`select table_name, column_name, column_default
        from information_schema.columns where table_schema='public'
        and (table_name='profiles' and column_name in ('city','is_discoverable')
             or table_name='listings' and column_name='city')`);
      assert.equal(defaults.length, 3);
      assert.equal(defaults.find(row => row.table_name === 'profiles' && row.column_name === 'is_discoverable')?.column_default, 'false');
      assert.equal(defaults.find(row => row.table_name === 'profiles' && row.column_name === 'city')?.column_default, null);
      assert.equal(defaults.find(row => row.table_name === 'listings' && row.column_name === 'city')?.column_default, null);
      assertions += 4;
      const newId = id(99);
      await db.exec(`insert into auth.users (id) values ('${newId}')`);
      const { rows: privateNew } = await as('authenticated', newId,
        `insert into public.profiles (id, display_name, city) values ('${newId}', 'Opt In Only', 'Köln') returning is_discoverable`);
      assert.equal(privateNew[0].is_discoverable, false); assertions++;
      const { rows: preservedOptIn } = await as('authenticated', b,
        `select is_discoverable from public.profiles where id='${b}'`);
      assert.equal(preservedOptIn[0].is_discoverable, true); assertions++;
      await deny(newId, `insert into public.listings (owner_id, kind, title) values ('${newId}', 'housing', 'No city')`, '23502');
      await deny(newId, `insert into public.listings (owner_id, kind, title, city) values ('${newId}', 'housing', 'Wrong city', null)`, '23502');
      const { rows: rls } = await db.query("select relname from pg_class join pg_namespace on pg_namespace.oid = relnamespace where nspname = 'public' and relkind = 'r' and not relrowsecurity");
      assert.deepEqual(rls, []); assertions++;
      t.diagnostic(`${assertions} authorization assertions passed against Postgres`);
    } finally { await db.close(); }
  });
}

for (const inheritedGrants of [false, true]) {
  test(`Student Groups enforce ownership, membership and member-only messaging (default grants: ${inheritedGrants})`, async t => {
    const db = await database(inheritedGrants);
    async function as(role, user, sql) {
      await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
      try { return await db.query(sql); } finally { await db.exec('reset role'); }
    }
    async function expectCount(role, user, query, count) {
      const { rows } = await as(role, user, query);
      assert.equal(rows.length, count); return rows;
    }
    try {
      assert.ok((await db.query("select relname from pg_class where relname in ('student_groups','student_group_members','student_group_messages') and relrowsecurity")).rows.length === 3);
      await assert.rejects(as('anon', null, "select public.create_student_group('Berlin Physics', '', 'Berlin', 'Study')"), e => e.code === '42501');
      const { rows: created } = await as('authenticated', a,
        "select public.create_student_group('Berlin Physics', 'Weekly study circle', 'Berlin', 'Study') id");
      const groupId = created[0].id;
      await expectCount('anon', null, `select * from public.student_groups where id = '${groupId}'`, 1);
      await expectCount('authenticated', a, `select * from public.student_group_members where group_id = '${groupId}'`, 1);
      await expectCount('authenticated', b, `select * from public.student_group_members where group_id = '${groupId}'`, 0);
      await assert.rejects(as('authenticated', b,
        `select public.send_student_group_message('${groupId}', 'Intruder message')`), e => e.code === '42501');
      await assert.rejects(as('authenticated', b,
        `insert into public.student_group_members (group_id,user_id) values ('${groupId}','${c}')`), e => e.code === '42501');
      await expectCount('authenticated', b,
        `insert into public.student_group_members (group_id,user_id) values ('${groupId}','${b}') returning group_id`, 1);
      await expectCount('authenticated', a, `select * from public.student_group_members where group_id = '${groupId}'`, 2);
      // Leaving voluntarily is reversible; an owner removal is NOT.
      await expectCount('authenticated', b,
        `delete from public.student_group_members where group_id='${groupId}' and user_id='${b}' returning user_id`, 1);
      await expectCount('authenticated', b,
        `insert into public.student_group_members(group_id,user_id) values ('${groupId}','${b}') returning group_id`, 1);
      const { rows: message } = await as('authenticated', b,
        `select public.send_student_group_message('${groupId}', 'Meeting on Tuesday') id`);
      const messageId = message[0].id;
      // Deleted messages must not reset the per-account discussion quota.
      for (let i = 0; i < 9; i++) {
        await as('authenticated', b, `select public.send_student_group_message('${groupId}', 'Another study message ${i}')`);
      }
      await assert.rejects(as('authenticated', b,
        `select public.send_student_group_message('${groupId}', 'Spam after ten')`), e => e.code === 'P0001');
      await expectCount('authenticated', b, `select * from public.student_group_messages where id = '${messageId}'`, 1);
      await expectCount('authenticated', a, `select * from public.student_group_messages where id = '${messageId}'`, 1);
      await expectCount('authenticated', c, `select * from public.student_group_messages where id = '${messageId}'`, 0);
      // Cross-tenant RLS regression: the reader belongs to a DIFFERENT group.
      // A policy using unqualified "m.group_id = group_id" silently binds both
      // sides to the membership row and previously leaked every discussion.
      const { rows: otherCreated } = await as('authenticated', c,
        "select public.create_student_group('Charlie Private Circle', '', 'Aachen', 'Hobbies') id");
      const otherGroupId = otherCreated[0].id;
      const { rows: otherSent } = await as('authenticated', c,
        `select public.send_student_group_message('${otherGroupId}', 'Charlie-only message') id`);
      const otherMessageId = otherSent[0].id;
      await expectCount('authenticated', c, `select * from public.student_group_messages where id = '${otherMessageId}'`, 1);
      await expectCount('authenticated', c, `select * from public.student_group_messages where id = '${messageId}'`, 0);
      await expectCount('authenticated', a, `select * from public.student_group_messages where id = '${otherMessageId}'`, 0);
      await expectCount('authenticated', c, 'select * from public.student_group_messages', 1);
      // Bob's membership elsewhere must NOT preserve access after owner removal.
      await expectCount('authenticated', b,
        `insert into public.student_group_members (group_id, user_id) values ('${otherGroupId}', '${b}') returning group_id`, 1);
      await expectCount('authenticated', b, `select * from public.student_group_messages where id = '${otherMessageId}'`, 1);
      await assert.rejects(as('authenticated', b,
        `insert into public.student_group_messages (group_id,author_id,body) values ('${groupId}','${b}','Bypass limits')`), e => e.code === '42501');
      await expectCount('authenticated', b,
        `update public.student_groups set name = 'Hijacked' where id = '${groupId}' returning id`, 0);
      await expectCount('authenticated', a,
        `update public.student_groups set name = 'Berlin Study Circle' where id = '${groupId}' returning id`, 1);
      // Owner may not silently leave their group, preserving its creator membership.
      await expectCount('authenticated', a,
        `delete from public.student_group_members where group_id = '${groupId}' and user_id = '${a}' returning user_id`, 0);
      // Direct owner deletion is disallowed: only the controlled removal RPC
      // can create a durable ban and revoke the member atomically.
      await expectCount('authenticated', a,
        `delete from public.student_group_members where group_id = '${groupId}' and user_id = '${b}' returning user_id`, 0);
      await assert.rejects(as('authenticated', b,
        `select public.remove_student_group_member('${groupId}','${a}')`), e => e.code === '42501');
      await assert.rejects(as('authenticated', a,
        `select public.remove_student_group_member('${groupId}','${a}')`), e => e.code === '42501');
      await assert.rejects(as('anon', null,
        `select public.remove_student_group_member('${groupId}','${b}')`), e => e.code === '42501');
      await expectCount('authenticated', a,
        `select public.remove_student_group_member('${groupId}','${b}')`, 1);
      await expectCount('authenticated', a,
        `select * from public.student_group_bans where group_id='${groupId}' and user_id='${b}'`, 1);
      await expectCount('authenticated', b,
        `select * from public.student_group_bans where group_id='${groupId}'`, 0);
      await assert.rejects(as('authenticated', b,
        `delete from public.student_group_bans where group_id='${groupId}'`), e => e.code === '42501');
      await assert.rejects(as('authenticated', b,
        `insert into public.student_group_members(group_id,user_id) values ('${groupId}','${b}')`), e => e.code === '42501');
      await assert.rejects(as('authenticated', b,
        `select public.send_student_group_message('${groupId}','Attempt after removal')`), e => e.code === '42501');
      await expectCount('authenticated', b, `select * from public.student_group_messages where id = '${messageId}'`, 0);
      await expectCount('authenticated', b, `select * from public.student_group_messages where id = '${otherMessageId}'`, 1);
      await expectCount('authenticated', b, 'select * from public.student_group_messages', 1);
      await expectCount('authenticated', a, `select * from public.student_group_messages where id = '${messageId}'`, 1);
      // Restoring eligibility does NOT silently re-enrol the student.
      await assert.rejects(as('authenticated', b,
        `select public.restore_student_group_member('${groupId}','${b}')`), e => e.code === '42501');
      await expectCount('authenticated', a,
        `select public.restore_student_group_member('${groupId}','${b}')`, 1);
      await expectCount('authenticated', b, `select * from public.student_group_messages where id = '${messageId}'`, 0);
      await expectCount('authenticated', b,
        `insert into public.student_group_members(group_id,user_id) values ('${groupId}','${b}') returning group_id`, 1);
      await expectCount('authenticated', b, `select * from public.student_group_messages where id = '${messageId}'`, 1);
      await expectCount('authenticated', b,
        `delete from public.student_groups where id = '${groupId}' returning id`, 0);
      await expectCount('authenticated', a,
        `delete from public.student_groups where id = '${groupId}' returning id`, 1);
      await expectCount('anon', null, `select * from public.student_groups where id = '${groupId}'`, 0);
      await expectCount('authenticated', a, `select * from public.student_group_messages where group_id = '${groupId}'`, 0);
      // First group was deleted. Creation limits must still count its event.
      for (const label of ['Second Study Circle', 'Third Study Circle']) {
        await expectCount('authenticated', a,
          `select public.create_student_group('${label}', '', 'Berlin', 'Study')`, 1);
      }
      await assert.rejects(as('authenticated', a,
        "select public.create_student_group('Fourth Study Circle', '', 'Berlin', 'Study')"), e => e.code === 'P0001');
      t.diagnostic('student groups: public discovery, atomic owner membership, restricted discussion, moderation, anti-hijack and deletion cascade verified');
    } finally { await db.close(); }
  });
}
