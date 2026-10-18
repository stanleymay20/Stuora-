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
      const { rows: message } = await as('authenticated', b,
        `select public.send_student_group_message('${groupId}', 'Meeting on Tuesday') id`);
      const messageId = message[0].id;
      await expectCount('authenticated', b, `select * from public.student_group_messages where id = '${messageId}'`, 1);
      await expectCount('authenticated', a, `select * from public.student_group_messages where id = '${messageId}'`, 1);
      await expectCount('authenticated', c, `select * from public.student_group_messages where id = '${messageId}'`, 0);
      await assert.rejects(as('authenticated', b,
        `insert into public.student_group_messages (group_id,author_id,body) values ('${groupId}','${b}','Bypass limits')`), e => e.code === '42501');
      await assert.rejects(as('authenticated', b,
        `update public.student_groups set name = 'Hijacked' where id = '${groupId}'`), e => e.code === '42501');
      await expectCount('authenticated', a,
        `update public.student_groups set name = 'Berlin Study Circle' where id = '${groupId}' returning id`, 1);
      // Owner may not silently leave their group, preserving its creator membership.
      await expectCount('authenticated', a,
        `delete from public.student_group_members where group_id = '${groupId}' and user_id = '${a}' returning user_id`, 0);
      await expectCount('authenticated', a,
        `delete from public.student_group_members where group_id = '${groupId}' and user_id = '${b}' returning user_id`, 1);
      await expectCount('authenticated', b, `select * from public.student_group_messages where id = '${messageId}'`, 0);
      await expectCount('authenticated', a, `select * from public.student_group_messages where id = '${messageId}'`, 1);
      await expectCount('authenticated', b,
        `delete from public.student_groups where id = '${groupId}' returning id`, 0);
      await expectCount('authenticated', a,
        `delete from public.student_groups where id = '${groupId}' returning id`, 1);
      await expectCount('anon', null, `select * from public.student_groups where id = '${groupId}'`, 0);
      await expectCount('authenticated', a, `select * from public.student_group_messages where group_id = '${groupId}'`, 0);
      t.diagnostic('student groups: public discovery, atomic owner membership, restricted discussion, moderation, anti-hijack and deletion cascade verified');
    } finally { await db.close(); }
  });
}
