// Gen-3 audit remediation: authorization and abuse tests against the REAL
// migration files in PGlite. service_role is modelled with BYPASSRLS, as in
// hosted Supabase. No hosted database is contacted.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const A = id(1), B = id(2), C = id(3), D = id(4), E = id(5), M = id(9), LEGACY = id(10);
const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

async function harness({ stopBefore } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null,
      name text not null, unique (bucket_id, name));
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select case when array_length(string_to_array(name, '/'), 1) > 1
        then (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
        else array[]::text[] end $$;
    create function storage.filename(name text) returns text language sql immutable as $$
      select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
    grant usage on schema public, auth, storage to anon, authenticated;
    grant usage on schema public to service_role;
    grant execute on function auth.uid() to anon, authenticated;
    grant execute on function storage.foldername(text), storage.filename(text) to anon, authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
  `);
  const apply = async files => { for (const f of files) await db.exec(readFileSync(new URL(f, migrationsDir), 'utf8')); };
  const cut = stopBefore ? migrationFiles.findIndex(f => f >= stopBefore) : migrationFiles.length;
  await apply(migrationFiles.slice(0, cut));
  return { db, rest: () => apply(migrationFiles.slice(cut)) };
}

async function seed(db) {
  await db.exec(`
    insert into auth.users (id, email) values
      ('${A}','a@gisma-student.com'),('${B}','b@gisma-student.com'),('${C}','c@gisma-student.com'),
      ('${D}','d@gisma-student.com'),('${E}','e@gisma-student.com'),
      -- Staff moderator deliberately outside GISMA: moderation must not need a student address.
      ('${M}','m@example.test');
    insert into public.profiles (id, display_name, city) values
      ('${A}','Alice','Köln'),('${B}','Bob','Köln'),('${C}','Chloé','Łódź'),
      ('${D}','Dan','Köln'),('${E}','Eve','Köln'),('${M}','Mod','Köln');
  `);
}

function actors(db) {
  async function as(user, sql, role) {
    const r = role ?? (user ? 'authenticated' : 'anon');
    await db.exec(`set role ${r}; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
    try { return await db.query(sql); } finally { await db.exec('reset role'); }
  }
  const svc = sql => as(null, sql, 'service_role');
  const deny = (user, sql, code = '42501') =>
    assert.rejects(as(user, sql), e => e.code === code, `expected ${code}: ${sql.slice(0, 80)}`);
  const listing = async (user, kind = 'housing', title = 'Room', price = 50000) =>
    (await as(user, `select public.save_student_listing(null,'${kind}','${title}','', 'Köln', ${price},'room',false,false,'good') id`)).rows[0].id;
  return { as, svc, deny, listing };
}

test('N-01/N-02: photo admission is fair and owner-verified', async () => {
  const { db } = await harness(); await seed(db);
  const { svc, listing } = actors(db);
  const victimListing = await listing(A);
  // One student floods: only their own windows fill.
  let admitted = 0;
  for (let i = 0; i < 80; i++) if ((await svc(`select public.consume_listing_photo_attempt('${E}', null) ok`)).rows[0].ok) admitted++;
  assert.equal(admitted, 10);
  const { rows: g } = await db.query(`select used from private.listing_photo_attempt_windows where scope='global_minute'`);
  assert.equal(g[0].used, 10, 'global window counts only admitted requests');
  assert.equal((await svc(`select public.consume_listing_photo_attempt('${A}', '${victimListing}') ok`)).rows[0].ok, true,
    'another student is still admitted after the flood');
  // Naming a victim's listing never touches its window.
  const before = (await db.query(`select used from private.listing_photo_attempt_windows where scope='listing_hour' and scope_key='${victimListing}'`)).rows[0].used;
  for (let i = 0; i < 9; i++) assert.equal((await svc(`select public.consume_listing_photo_attempt('${B}', '${victimListing}') ok`)).rows[0].ok, false);
  const after = (await db.query(`select used from private.listing_photo_attempt_windows where scope='listing_hour' and scope_key='${victimListing}'`)).rows[0].used;
  assert.equal(after, before);
  await db.close();
});

test('D-07: archiving a listing closes its conversation; L2: 20 messages/minute', async () => {
  const { db } = await harness(); await seed(db);
  const { as, deny, listing } = actors(db);
  const l = await listing(A, 'marketplace', 'Lamp', 900);
  const conv = (await as(B, `select public.start_listing_conversation('${l}') id`)).rows[0].id;
  for (let i = 0; i < 20; i++) await as(B, `insert into public.messages(conversation_id,sender_id,body) values ('${conv}','${B}','m${i}')`);
  await deny(B, `insert into public.messages(conversation_id,sender_id,body) values ('${conv}','${B}','21st')`, 'P0001');
  // Fresh sender: closed thread is refused and does not consume quota.
  const conv2 = (await as(C, `select public.start_listing_conversation('${l}') id`)).rows[0].id;
  await as(A, `update public.listings set status='closed' where id='${l}'`);
  await deny(C, `insert into public.messages(conversation_id,sender_id,body) values ('${conv2}','${C}','after archive')`);
  await deny(A, `insert into public.messages(conversation_id,sender_id,body) values ('${conv2}','${A}','owner after archive')`);
  const { rows: used } = await db.query(`select coalesce(sum(used),0)::int n from private.action_limits where user_id='${C}' and action='message'`);
  assert.equal(used[0].n, 0, 'refused sends on a closed thread consume no quota');
  assert.equal((await as(C, `select body from public.messages where conversation_id='${conv2}'`)).rows.length, 0);
  await db.close();
});

test('R-04: directory needs recorded consent; legacy flags preserved but hidden', async () => {
  const { db, rest } = await harness({ stopBefore: '20261023013000' });
  await db.exec(`insert into auth.users (id, email) values ('${LEGACY}', 'legacy@gisma-student.com'), ('${A}', 'a@gisma-student.com');
    insert into public.profiles (id, display_name, city, is_discoverable) values
      ('${LEGACY}', 'Pre-ticked legacy', 'Köln', true), ('${A}', 'Alice', 'Köln', false);`);
  await rest();
  const { as, deny } = actors(db);
  const { rows: kept } = await db.query(`select is_discoverable, discoverable_consented_at from public.profiles where id='${LEGACY}'`);
  assert.equal(kept[0].is_discoverable, true, 'existing choice preserved');
  assert.equal(kept[0].discoverable_consented_at, null);
  assert.equal((await as(A, `select id from public.profiles where id='${LEGACY}'`)).rows.length, 0, 'legacy row hidden');
  assert.equal((await as(LEGACY, `select id from public.profiles where id='${LEGACY}'`)).rows.length, 1, 'owner still sees self');
  // Plain UPDATE can no longer manufacture or change discoverability.
  await deny(LEGACY, `update public.profiles set is_discoverable = true where id='${LEGACY}'`);
  await deny(LEGACY, `update public.profiles set discoverable_consented_at = now() where id='${LEGACY}'`);
  // Bio edits still work and do not create consent.
  await as(LEGACY, `update public.profiles set bio='hi' where id='${LEGACY}'`);
  assert.equal((await as(A, `select id from public.profiles where id='${LEGACY}'`)).rows.length, 0);
  // Explicit confirmation makes the profile visible; turning off clears consent.
  await as(LEGACY, `select public.set_profile_discovery(true)`);
  assert.equal((await as(A, `select id from public.profiles where id='${LEGACY}'`)).rows.length, 1);
  await as(LEGACY, `select public.set_profile_discovery(false)`);
  const { rows: off } = await db.query(`select discoverable_consented_at from public.profiles where id='${LEGACY}'`);
  assert.equal(off[0].discoverable_consented_at, null);
  assert.equal((await as(A, `select id from public.profiles where id='${LEGACY}'`)).rows.length, 0);
  await assert.rejects(as(null, `select public.set_profile_discovery(true)`), e => e.code === '42501');
  // A new profile created with the explicit toggle ON is stamped at insert.
  await db.exec(`insert into auth.users (id, email) values ('${B}', 'b@gisma-student.com')`);
  await as(B, `insert into public.profiles (id, display_name, city, is_discoverable) values ('${B}','Bob','Köln', true)`);
  assert.equal((await as(A, `select id from public.profiles where id='${B}'`)).rows.length, 1);
  await db.close();
});

test('D-11: reporting, moderator decisions, notices and suspension', async () => {
  const { db } = await harness(); await seed(db);
  const { as, deny, listing } = actors(db);
  await db.exec(`insert into public.moderators (user_id) values ('${M}')`);
  const spam = await listing(B, 'marketplace', 'Cheap phones DM me', 100);
  // Students cannot read or act on the queue, or make themselves moderators.
  await deny(A, `select * from public.moderation_queue('open', 10)`);
  await deny(A, `insert into public.moderators(user_id) values ('${A}')`);
  assert.equal((await as(A, `select public.am_i_moderator() m`)).rows[0].m, false);
  assert.equal((await as(M, `select public.am_i_moderator() m`)).rows[0].m, true);
  // Reports: listing (active), self-report refused, invisible content refused.
  const rid = (await as(A, `select public.report_content('listing', '${spam}', 'fraud', 'Asks for payment off-platform') id`)).rows[0].id;
  await deny(B, `select public.report_content('listing', '${spam}', 'spam', '')`, '22023');
  const g = (await as(C, "select public.create_student_group('Closed circle','', 'Łódź','Study') id")).rows[0].id;
  const gm = (await as(C, `select public.send_student_group_message('${g}','members only') id`)).rows[0].id;
  await deny(A, `select public.report_content('group_message', '${gm}', 'harassment', '')`, '22023');
  // Clients cannot write decision columns directly.
  await deny(A, `update public.reports set status='dismissed' where id='${rid}'`);
  // Queue shows evidence without the reporter's identity.
  const { rows: queue } = await as(M, `select * from public.moderation_queue('open', 10)`);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].target_kind, 'listing');
  assert.match(queue[0].content_snapshot, /Cheap phones/);
  assert.equal('reporter_id' in queue[0], false);
  // A reason is mandatory (statement of reasons).
  await deny(M, `select public.moderate_report('${rid}', 'suspend_user', 'short')`, '22023');
  await as(M, `select public.moderate_report('${rid}', 'suspend_user', 'Repeated off-platform payment scam listings.')`);
  await deny(M, `select public.moderate_report('${rid}', 'dismiss', 'Second decision attempt here.')`, '22023');
  const { rows: listingState } = await db.query(`select status from public.listings where id='${spam}'`);
  assert.equal(listingState[0].status, 'closed');
  // Notices: statement of reasons to B, outcome to A; each sees only their own.
  const { rows: bNotices } = await as(B, `select kind, message from public.moderation_notices`);
  assert.equal(bNotices.length, 1); assert.equal(bNotices[0].kind, 'account_suspended');
  assert.match(bNotices[0].message, /off-platform payment scam/);
  const { rows: aNotices } = await as(A, `select kind from public.moderation_notices`);
  assert.deepEqual(aNotices.map(n => n.kind), ['report_outcome']);
  // Reporters see status, never who decided or the sanction text.
  assert.equal((await as(A, `select status from public.reports where id='${rid}'`)).rows[0].status, 'actioned');
  await deny(A, `select decided_by from public.reports where id='${rid}'`);
  await deny(A, `select decision, decision_reason from public.reports`);
  // Suspended account cannot create anything and is hidden from People.
  await deny(B, `select public.save_student_listing(null,'housing','Again','', 'Köln', 100,'room',false,false,'good')`);
  await deny(B, "select public.create_student_group('New scam group','', 'Köln','Other')");
  const other = await listing(D, 'marketplace', 'Desk', 1500);
  await deny(B, `select public.start_listing_conversation('${other}')`);
  await deny(B, `select public.set_profile_discovery(true)`);
  assert.equal((await as(B, `select reason from public.account_suspensions`)).rows.length, 1, 'suspended user can read own suspension');
  assert.equal((await as(A, `select * from public.account_suspensions`)).rows.length, 0);
  // Moderators cannot decide reports they are party to; lifting needs a reason.
  const selfReport = (await as(D, `select public.report_content('user', '${M}', 'other', 'Moderator was rude') id`)).rows[0].id;
  await deny(M, `select public.moderate_report('${selfReport}', 'dismiss', 'Not a violation of rules.')`);
  // Deleting a suspended account does not reset the record: the same email cannot return.
  const B2 = '00000000-0000-4000-8000-0000000000b2';
  await db.exec(`insert into public.account_suspensions(user_id, reason) values ('${E}', 'Suspended before deleting account.')`);
  await db.exec(`delete from public.profiles where id='${E}'; delete from auth.users where id='${E}';
                 insert into auth.users(id, email) values ('${B2}', ' E@GISMA-Student.com ')`);
  await assert.rejects(db.query(`insert into public.profiles(id, display_name, city) values ('${B2}','Eve again','Köln')`), e => e.code === '42501');
  await as(M, `select public.lift_suspension('${B}', 'Appeal accepted after identity check.')`);
  assert.ok((await as(B, `select public.save_student_listing(null,'housing','Legit room','', 'Köln', 40000,'room',false,false,'good') id`)).rows[0].id);
  await db.close();
});

test('Erasure: a reported student can still delete their account; the report survives', async () => {
  const { db } = await harness();
  await seed(db);
  const { as, listing } = actors(db);
  const l = await listing(A, 'housing', 'Deposit first');
  const g = (await as(A, "select public.create_student_group('Essay help','', 'Köln','Study') id")).rows[0].id;
  const gm = (await as(A, `select public.send_student_group_message('${g}','buy answers') id`)).rows[0].id;
  await as(B, `insert into public.student_group_members(group_id,user_id) values ('${g}','${B}')`);
  const r1 = (await as(B, `select public.report_content('listing', '${l}', 'fraud', 'Deposit before viewing') id`)).rows[0].id;
  const r2 = (await as(B, `select public.report_content('group_message', '${gm}', 'prohibited', 'Selling answers') id`)).rows[0].id;
  await db.exec(`insert into public.moderators(user_id) values ('${M}')`);
  await as(M, `select public.moderate_report('${r2}', 'remove_content', 'Selling exam answers is prohibited.')`);
  // What the delete-account Edge Function does with the service role.
  await db.exec(`delete from auth.users where id='${A}'`);
  const { rows } = await db.query(`select id, listing_id, reported_user_id, content_snapshot from public.reports where id in ('${r1}','${r2}') order by id`);
  assert.equal(rows.length, 2, 'reports kept for abuse handling');
  assert.ok(rows.every(r => r.listing_id === null && r.reported_user_id === null && r.content_snapshot), 'targets detached, snapshot kept');
  // A target is still required when filing.
  // Privileged insert: clear the session claim the actor helper leaves behind.
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  await assert.rejects(db.query(`insert into public.reports(reporter_id, reason) values ('${B}', 'spam')`), e => e.code === '23514');
  await db.close();
});

test('Suspended students keep only the safety reporting path; avatar_path is not client-writable', async () => {
  const { db } = await harness();
  await seed(db);
  const { as, deny, listing } = actors(db);
  const l = await listing(C, 'marketplace', 'Lamp', 1500);
  await db.exec(`insert into public.account_suspensions(user_id, reason) values ('${B}', 'Suspended for scam listings.')`);
  await deny(B, `select public.report_content('listing', '${l}', 'spam', 'retaliation')`);
  await deny(B, `select public.report_content('user', '${C}', 'fraud', 'retaliation')`);
  assert.ok((await as(B, `select public.report_content('user', '${C}', 'harassment', 'Keeps messaging me') id`)).rows[0].id);
  assert.ok((await as(A, `select public.report_content('listing', '${l}', 'spam', 'Duplicate') id`)).rows[0].id, 'others unaffected');
  await deny(A, `update public.profiles set avatar_path='${A}/avatar' where id='${A}'`);
  await deny(D, `insert into public.profiles(id, display_name, city, avatar_path) values ('${D}', 'X', 'Köln', 'x')`);
  await db.close();
});

test('D-10: export returns only the caller\'s own data and is rate-limited', async () => {
  const { db } = await harness(); await seed(db);
  const { as, listing } = actors(db);
  const l = await listing(A);
  const conv = (await as(B, `select public.start_listing_conversation('${l}') id`)).rows[0].id;
  await as(B, `insert into public.messages(conversation_id,sender_id,body) values ('${conv}','${B}','from Bob')`);
  await as(A, `insert into public.messages(conversation_id,sender_id,body) values ('${conv}','${A}','from Alice')`);
  const { rows } = await as(A, `select public.export_my_data() d`);
  const d = rows[0].d;
  assert.equal(d.account.email, 'a@gisma-student.com');
  assert.equal(d.listings.length, 1);
  assert.deepEqual(d.messages_sent.map(m => m.body), ['from Alice'], 'only messages the caller sent');
  assert.equal(JSON.stringify(d).includes('from Bob'), false);
  for (let i = 0; i < 4; i++) await as(A, `select public.export_my_data()`);
  await assert.rejects(as(A, `select public.export_my_data()`), e => e.code === 'P0001');
  await assert.rejects(as(null, `select public.export_my_data()`), e => e.code === '42501');
  await db.close();
});

test('AI and external data quotas are service-only, fair and throttled', async () => {
  const { db } = await harness(); await seed(db);
  const { as, svc } = actors(db);
  for (const fn of ['consume_ai_request', 'consume_external_data_request']) {
    await assert.rejects(as(A, `select public.${fn}('${A}')`), e => e.code === '42501');
    await assert.rejects(as(null, `select public.${fn}('${A}')`), e => e.code === '42501');
  }
  await assert.rejects(as(A, `select public.acquire_nominatim_slot()`), e => e.code === '42501');
  await assert.rejects(as(A, `select public.external_cache_get('ticketmaster','k')`), e => e.code === '42501');
  // Per-student AI limit: 5/minute; a flood does not starve another student.
  let ok = 0;
  for (let i = 0; i < 30; i++) if ((await svc(`select public.consume_ai_request('${E}') ok`)).rows[0].ok) ok++;
  assert.equal(ok, 5);
  assert.equal((await svc(`select public.consume_ai_request('${A}') ok`)).rows[0].ok, true);
  const { rows: gw } = await db.query(`select used from private.service_request_windows where scope='ai_global_day'`);
  assert.equal(gw[0].used, 6, 'global AI window counts only admitted requests');
  // Throwaway accounts (unconfirmed email or no profile) cannot spend shared budget.
  await db.exec(`update auth.users set email_confirmed_at = null where id='${C}'`);
  assert.equal((await svc(`select public.consume_ai_request('${C}') ok`)).rows[0].ok, false);
  const ghost = '00000000-0000-4000-8000-0000000000aa';
  await db.exec(`insert into auth.users(id, email) values ('${ghost}', 'ghost@example.test')`);
  assert.equal((await svc(`select public.consume_external_data_request('${ghost}') ok`)).rows[0].ok, false);
  // Suspended students are refused.
  await db.exec(`insert into public.account_suspensions(user_id, reason) values ('${D}', 'Suspended for testing purposes.')`);
  assert.equal((await svc(`select public.consume_ai_request('${D}') ok`)).rows[0].ok, false);
  assert.equal((await svc(`select public.consume_external_data_request('${D}') ok`)).rows[0].ok, false);
  // Nominatim: at most one request per ~second application-wide.
  assert.equal((await svc(`select public.acquire_nominatim_slot() ok`)).rows[0].ok, true);
  assert.equal((await svc(`select public.acquire_nominatim_slot() ok`)).rows[0].ok, false);
  // Cache: TTL bounds, expiry and provider allow-list.
  await svc(`select public.external_cache_put('ticketmaster','koeln','{"items":[1]}'::jsonb, 1800)`);
  assert.deepEqual((await svc(`select public.external_cache_get('ticketmaster','koeln') p`)).rows[0].p, { items: [1] });
  await assert.rejects(svc(`select public.external_cache_put('ticketmaster','k','{}'::jsonb, 10)`), e => e.code === '22023');
  await assert.rejects(svc(`select public.external_cache_put('evil','k','{}'::jsonb, 600)`), e => e.code === '23514');
  await db.exec(`update private.external_cache set fetched_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'`);
  assert.equal((await svc(`select public.external_cache_get('ticketmaster','koeln') p`)).rows[0].p, null);
  await db.close();
});

test('D-07 UI: conversation safety state and blocking by conversation', async () => {
  const { db } = await harness(); await seed(db);
  const { as, deny, listing } = actors(db);
  const l = await listing(A, 'marketplace', 'Desk', 2500);
  const conv = (await as(B, `select public.start_listing_conversation('${l}') id`)).rows[0].id;
  const state = async u => (await as(u, `select public.conversation_safety_state('${conv}') s`)).rows[0].s;
  assert.deepEqual(await state(B), { closed: false, blocked_by_me: false, other_member_left: false });
  await deny(C, `select public.conversation_safety_state('${conv}')`);
  await deny(C, `select public.set_conversation_block('${conv}', true)`);
  await as(B, `select public.set_conversation_block('${conv}', true)`);
  await as(B, `select public.set_conversation_block('${conv}', true)`); // idempotent
  assert.equal((await state(B)).blocked_by_me, true);
  assert.equal((await state(A)).blocked_by_me, false, 'the blocked side only sees its own blocks');
  assert.equal((await as(B, `select blocked_id from public.user_blocks`)).rows[0].blocked_id, A);
  await as(B, `select public.set_conversation_block('${conv}', false)`);
  assert.equal((await state(B)).blocked_by_me, false);
  await as(A, `update public.listings set status='closed' where id='${l}'`);
  assert.equal((await state(B)).closed, true);
  await deny(null, `select public.conversation_safety_state('${conv}')`);
  await db.close();
});

test('GISMA-only: non-GISMA accounts cannot use core student features; protective paths remain', async () => {
  // Start just before the access migration so an existing outsider profile is in the directory.
  const { db, rest } = await harness({ stopBefore: '20261124100000' });
  await seed(db);
  const O = id(11), O2 = id(12), U = id(13);
  await db.exec(`insert into auth.users (id, email) values ('${O}', 'outsider@example.com');
    insert into public.profiles (id, display_name, city) values ('${O}', 'Outsider', 'Köln');`);
  const before = actors(db);
  await before.as(O, `select public.set_profile_discovery(true)`);
  await before.as(A, `select public.set_profile_discovery(true)`);
  // Before the migration the outsider joined a group and messaged a student.
  const l = await before.listing(A, 'housing', 'Room near campus');
  const g = (await before.as(A, "select public.create_student_group('Study circle','', 'Köln','Study') id")).rows[0].id;
  await before.as(O, `insert into public.student_group_members(group_id,user_id) values ('${g}','${O}')`);
  await before.as(B, `insert into public.student_group_members(group_id,user_id) values ('${g}','${B}')`);
  await before.as(O, `select public.send_student_group_message('${g}','outsider hello')`);
  await before.as(A, `select public.send_student_group_message('${g}','members only')`);
  const conv = (await before.as(O, `select public.start_listing_conversation('${l}') id`)).rows[0].id;
  await before.as(O, `insert into public.messages(conversation_id,sender_id,body) values ('${conv}','${O}','is it free?')`);
  await before.as(A, `insert into public.messages(conversation_id,sender_id,body) values ('${conv}','${A}','private reply')`);
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  await rest();
  const { as, svc, deny, listing } = actors(db);

  // Existing outsider is removed from the directory; students are unaffected.
  assert.equal((await as(B, `select id from public.profiles where id='${O}'`)).rows.length, 0, 'outsider hidden');
  assert.equal((await as(B, `select id from public.profiles where id='${A}'`)).rows.length, 1, 'student still listed');

  // Reads: the outsider keeps only its own rows from earlier memberships.
  const rows = async sql => (await as(O, sql)).rows;
  assert.deepEqual((await rows(`select id from public.profiles`)).map(r => r.id), [O], 'directory closed, own profile kept');
  assert.deepEqual((await rows(`select body from public.messages where conversation_id='${conv}'`)).map(r => r.body), ['is it free?']);
  assert.deepEqual((await rows(`select body from public.student_group_messages where group_id='${g}'`)).map(r => r.body), ['outsider hello']);
  assert.deepEqual((await rows(`select user_id from public.student_group_members where group_id='${g}'`)).map(r => r.user_id), [O]);
  assert.equal((await rows(`select public.can_read_student_group_files('${g}') ok`))[0].ok, false, 'private group files closed');
  assert.equal((await as(B, `select public.can_read_student_group_files('${g}') ok`)).rows[0].ok, true, 'members unaffected');
  assert.equal((await as(B, `select body from public.student_group_messages where group_id='${g}'`)).rows.length, 2);
  assert.equal((await as(A, `select body from public.messages where conversation_id='${conv}'`)).rows.length, 2,
    'the student still sees the whole thread');
  // The catalogue is student-only: neither the outsider nor a signed-out visitor sees it.
  assert.equal((await rows(`select id from public.listings where id='${l}'`)).length, 0);
  assert.equal((await rows(`select id from public.student_groups where id='${g}'`)).length, 0);
  assert.equal((await as(null, `select id from public.listings where id='${l}'`)).rows.length, 0);
  assert.equal((await as(C, `select id from public.listings where id='${l}'`)).rows.length, 1, 'students still browse');

  // Every student write path refuses the outsider.
  await deny(O, `select public.save_student_listing(null,'housing','Room','', 'Köln', 40000,'room',false,false,'good')`);
  await deny(O, `insert into public.listings(owner_id,kind,status,title,city,price_cents) values ('${O}','marketplace','draft','Lamp','Köln',100)`);
  const fresh = await listing(B, 'marketplace', 'Desk lamp', 1500);
  await deny(O, `select public.start_listing_conversation('${fresh}')`);
  await deny(O, `insert into public.messages(conversation_id,sender_id,body) values ('${conv}','${O}','still there?')`);
  await deny(O, `select public.create_student_group('Outsider group','', 'Köln','Study')`);
  await deny(O, `insert into public.student_group_members(group_id,user_id) values ('${g}','${O}')`);
  await deny(O, `select public.report_content('listing', '${l}', 'spam', 'Outsider report')`);
  await deny(O, `select public.set_profile_discovery(true)`);
  await deny(O, `select public.require_external_student()`);
  await deny(O, `select public.publish_student_activity('event','Party','Köln','x','{"venue_name":"Hall","starts_at":"2099-01-01T12:00Z","capacity":5}')`);
  assert.equal((await svc(`select public.consume_ai_request('${O}') ok`)).rows[0].ok, false);
  assert.equal((await svc(`select public.consume_external_data_request('${O}') ok`)).rows[0].ok, false);
  // A new outsider cannot even create a profile.
  await db.exec(`insert into auth.users (id, email) values ('${O2}', 'new@gmail.com')`);
  await deny(O2, `insert into public.profiles (id, display_name, city) values ('${O2}', 'New', 'Köln')`);

  // Protective, self-only paths still work for the outsider.
  await as(O, `select public.set_profile_discovery(false)`);
  await as(O, `update public.profiles set bio='leaving soon' where id='${O}'`);
  assert.ok((await as(O, `select public.export_my_data() d`)).rows[0].d.account);
  await as(O, `insert into public.user_blocks(blocker_id, blocked_id) values ('${O}', '${A}')`);
  await as(O, `delete from public.student_group_members where group_id='${g}' and user_id='${O}'`);

  // Unconfirmed GISMA address is not enough.
  await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${U}', 'u@gisma-student.com', null)`);
  await deny(U, `insert into public.profiles (id, display_name, city) values ('${U}', 'Unconfirmed', 'Köln')`);
  // Mixed case and surrounding spaces are normalised; the student keeps working.
  await db.exec(`update auth.users set email=' Bob@GISMA-Student.com ' where id='${B}'`);
  assert.ok((await as(B, `select public.start_listing_conversation('${l}') id`)).rows[0].id);

  // An owner who leaves GISMA can archive but not edit or publish.
  await db.exec(`update auth.users set email='alice@example.com' where id='${A}'`);
  await deny(A, `select public.save_student_listing('${l}','housing','Edited','', 'Köln', 1,'room',false,false,'good')`);
  // Archiving may change the status only, and only from a published state.
  await deny(A, `update public.listings set status='closed', title='Changed while closing' where id='${l}'`);
  await deny(A, `update public.listings set status='closed', price_cents=1 where id='${l}'`);
  await deny(A, `update public.listings set status='reserved' where id='${l}'`);
  await db.exec(`select set_config('request.jwt.claim.sub', '', false);
    insert into public.listings(id, owner_id, kind, status, title, city, price_cents)
    values ('00000000-0000-4000-8000-0000000000d1', '${A}', 'marketplace', 'draft', 'Old draft', 'Köln', 100)`);
  await deny(A, `update public.listings set status='closed' where id='00000000-0000-4000-8000-0000000000d1'`);
  await as(A, `update public.listings set status='closed' where id='${l}' and owner_id='${A}'`);
  const { rows: archived } = await db.query(`select title, price_cents from public.listings where id='${l}'`);
  assert.deepEqual(archived[0], { title: 'Room near campus', price_cents: 50000 }, 'nothing else changed');
  assert.equal((await db.query(`select status from public.listings where id='${l}'`)).rows[0].status, 'closed');

  // Suspension keeps its own error and the harassment-reporting path (checked by the suspension guard).
  await db.exec(`insert into public.account_suspensions(user_id, reason) values ('${D}', 'Suspended for testing purposes.')`);
  await assert.rejects(as(D, `select public.create_student_group('D group','', 'Köln','Study')`), e => /suspended/i.test(e.message));
  assert.ok((await as(D, `select public.report_content('user', '${C}', 'harassment', 'Keeps messaging me') id`)).rows[0].id);
  await db.close();
});

test('GISMA-only signup hook accepts only exact @gisma-student.com addresses and is Auth-only', async () => {
  const { db } = await harness();
  const verdict = async email => (await db.query(
    `select public.hook_require_gisma_signup($1::jsonb) r`, [JSON.stringify({ user: { email } })])).rows[0].r;
  for (const ok of ['s1@gisma-student.com', ' Name.Surname@GISMA-Student.com '])
    assert.deepEqual(await verdict(ok), {}, ok);
  for (const bad of ['s@gmail.com', 's@gisma-student.com.evil.io', 's@sub.gisma-student.com', 's@gisma-student.co',
                     's@gisma-studentxcom', 'gisma-student.com', '', null])
    assert.equal((await verdict(bad)).error?.http_code, 403, String(bad));
  const priv = role => db.query(`select has_function_privilege('${role}', 'public.hook_require_gisma_signup(jsonb)', 'execute') ok`)
    .then(r => r.rows[0].ok);
  assert.equal(await priv('supabase_auth_admin'), true);
  for (const role of ['anon', 'authenticated']) assert.equal(await priv(role), false, role);
  await db.close();
});

test('Activity review: Jobs, Trips and Events publish only after a Stuora moderator approves them', async () => {
  const { db } = await harness(); await seed(db);
  const { as, deny } = actors(db);
  await db.exec(`insert into public.moderators(user_id) values ('${M}')`);
  const publish = (user, kind, detail) => as(user,
    `select public.publish_student_activity('${kind}','Student ${kind}','Köln','Details','${JSON.stringify(detail)}') id`);
  const ev = (await publish(A, 'event', { venue_name: 'Campus Hall', starts_at: '2099-01-01T12:00Z', capacity: 5 })).rows[0].id;
  const job = (await publish(A, 'job', { company_name: 'Café Uni', compensation_text: '€14/hour', workplace_mode: 'onsite' })).rows[0].id;
  const visible = async (user, sql) => (await as(user, sql)).rows.length;

  // Pending: the author sees it with its status; other students and visitors do not.
  assert.equal((await as(A, `select review_status from public.listings where id='${ev}'`)).rows[0].review_status, 'pending');
  assert.equal(await visible(B, `select id from public.listings where id='${ev}'`), 0);
  assert.equal(await visible(null, `select id from public.listings where id='${ev}'`), 0);
  assert.equal(await visible(B, `select listing_id from public.event_details where listing_id='${ev}'`), 0, 'details follow the post');
  // Nobody can act on it yet, through the RPCs or directly.
  await assert.rejects(as(B, `select public.student_activity_response('${ev}','join')`), e => /awaiting Stuora review|unavailable/i.test(e.message));
  await deny(B, `select public.student_activity_response('${job}','apply','Hello')`);
  await assert.rejects(as(B, `select public.listing_participation('${ev}','join')`));
  await assert.rejects(db.query(`insert into public.event_participants(event_listing_id, user_id) values ('${ev}', '${B}')`),
    e => /awaiting Stuora review/.test(e.message), 'even trusted inserts need approval');
  await assert.rejects(as(B, `select public.start_listing_conversation('${job}')`));

  // Students cannot approve anything, including by writing the column.
  await deny(A, `update public.listings set review_status='approved' where id='${ev}'`);
  await deny(A, `select public.review_student_activity('${ev}','approve','I promise it is real.')`);
  await deny(B, `select public.list_pending_student_activities()`);
  // Moderators review: the queue includes details; reasons are required; own posts are excluded.
  const queue = (await as(M, `select id, kind, details from public.list_pending_student_activities()`)).rows;
  assert.deepEqual(queue.map(r => r.id).sort(), [ev, job].sort());
  assert.equal(queue.find(r => r.id === job).details.company_name, 'Café Uni');
  await deny(M, `select public.review_student_activity('${ev}','approve','ok')`, '22023');
  await as(M, `select public.review_student_activity('${ev}','approve','Venue and date checked.')`);
  await as(M, `select public.review_student_activity('${job}','reject','Cannot confirm the employer.')`);
  await deny(M, `select public.review_student_activity('${ev}','approve','Approving a second time.')`, '22023');
  const notices = (await as(A, `select kind, message from public.moderation_notices where kind='activity_review'`)).rows;
  assert.equal(notices.length, 2);
  assert.ok(notices.some(n => /not approved. Reason: Cannot confirm the employer./.test(n.message)));

  // Approved: discoverable and actionable. Rejected: still hidden and closed to applications.
  assert.equal(await visible(B, `select id from public.listings where id='${ev}'`), 1);
  assert.equal(await visible(C, `select listing_id from public.event_details where listing_id='${ev}'`), 1);
  assert.equal(await visible(null, `select listing_id from public.event_details where listing_id='${ev}'`), 0, 'students only');
  assert.equal((await as(B, `select public.student_activity_response('${ev}','join') r`)).rows[0].r.joined, true);
  assert.equal(await visible(B, `select id from public.listings where id='${job}'`), 0);
  await deny(B, `select public.student_activity_response('${job}','apply','Hello')`);
  assert.equal((await as(A, `select review_status from public.listings where id='${job}'`)).rows[0].review_status, 'rejected');
  // Listings are readable table-wide, so the reviewer and note live only in the private audit table.
  await deny(null, `select reviewed_by from public.listings`, '42703');
  await deny(null, `select * from private.activity_reviews`);
  const audit = (await db.query(`select decision, reviewed_by from private.activity_reviews where listing_id='${job}'`)).rows;
  assert.deepEqual(audit, [{ decision: 'rejected', reviewed_by: M }]);

  // Editing an approved post (inside a server function, as the author) sends it back for review.
  await db.exec(`select set_config('request.jwt.claim.sub', '${A}', false)`);
  await db.query(`update public.event_details set venue_name='Different hall' where listing_id='${ev}'`);
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  assert.equal((await as(A, `select review_status from public.listings where id='${ev}'`)).rows[0].review_status, 'pending');
  assert.equal(await visible(C, `select id from public.listings where id='${ev}'`), 0);
  await assert.rejects(as(C, `select public.student_activity_response('${ev}','join')`));

  // Housing and Marketplace need no review and stay published immediately.
  const room = (await as(A, `select public.save_student_listing(null,'housing','Room','', 'Köln', 40000,'room',false,false,'good') id`)).rows[0].id;
  assert.equal((await as(B, `select review_status from public.listings where id='${room}'`)).rows[0].review_status, 'not_required');
  // A staff moderator without a GISMA address can still remove a student's listing.
  const r = (await as(B, `select public.report_content('listing', '${room}', 'fraud', 'Asks for a deposit first') id`)).rows[0].id;
  await as(M, `select public.moderate_report('${r}', 'remove_content', 'Deposit scams are not allowed.')`);
  assert.equal((await db.query(`select status from public.listings where id='${room}'`)).rows[0].status, 'closed');
  await db.close();
});

test('Student-only catalogue: listings, photos and group names need a signed-in GISMA student', async () => {
  const { db } = await harness(); await seed(db);
  const { as, listing } = actors(db);
  const O = id(11);
  await db.exec(`insert into auth.users (id, email) values ('${O}', 'legacy@example.com');
    insert into public.profiles (id, display_name, city) values ('${O}', 'Legacy outsider', 'Köln');`);
  const room = await listing(A, 'housing', 'Room near campus');
  const g = (await as(A, "select public.create_student_group('Study circle','', 'Köln','Study') id")).rows[0].id;
  const photo = `${A}/${room}/cover.webp`;
  await db.exec(`select set_config('request.jwt.claim.sub', '', false);
    insert into public.listing_media (listing_id, object_path, sort_order) values ('${room}', '${photo}', 0);
    insert into storage.objects (bucket_id, name) values ('listing-media', '${photo}');
    -- A legacy listing and group owned by the outsider, created before the rule.
    insert into public.listings (id, owner_id, kind, status, title, city, price_cents)
      values ('00000000-0000-4000-8000-0000000000e1', '${O}', 'marketplace', 'draft', 'Legacy draft', 'Köln', 100);
    insert into public.student_groups (id, owner_id, name, city, topic)
      values ('00000000-0000-4000-8000-0000000000e2', '${O}', 'Legacy group', 'Köln', 'Study');`);
  const n = async (user, sql) => (await as(user, sql)).rows.length;
  const catalogue = {
    listing: `select id from public.listings where id='${room}'`,
    details: `select listing_id from public.housing_details where listing_id='${room}'`,
    media: `select id from public.listing_media where listing_id='${room}'`,
    group: `select id from public.student_groups where id='${g}'`,
  };
  for (const [what, sql] of Object.entries(catalogue)) {
    assert.equal(await n(null, sql), 0, `signed-out visitor cannot read ${what}`);
    assert.equal(await n(O, sql), 0, `legacy non-GISMA account cannot read ${what}`);
    assert.equal(await n(B, sql), 1, `GISMA student reads ${what}`);
  }
  // Photo files: the bucket no longer serves public URLs, and object reads follow the listing.
  assert.equal((await db.query(`select public from storage.buckets where id='listing-media'`)).rows[0].public, false);
  const file = `select name from storage.objects where bucket_id='listing-media' and name='${photo}'`;
  assert.equal(await n(O, file), 0, 'legacy account cannot sign or download the photo');
  assert.equal(await n(B, file), 1, 'GISMA student can sign and load the photo');
  assert.equal(await n(A, file), 1, 'owner keeps access');
  await as(A, `update public.listings set status='closed' where id='${room}'`);
  assert.equal(await n(B, file), 0, 'an archived listing photo is no longer retrievable by others');
  assert.equal(await n(A, file), 1);
  // Owners keep their own rows; student browsing is otherwise unaffected.
  assert.equal(await n(O, `select id from public.listings where owner_id='${O}'`), 1);
  assert.equal(await n(O, `select id from public.student_groups where owner_id='${O}'`), 1);
  assert.equal(await n(B, `select id from public.student_groups`), 2, 'students see every group name');
  await db.close();
});

test('Audit hardening: ineligible owners cannot add photos or stay in the student catalogue', async () => {
  const { db } = await harness(); await seed(db);
  const { as, svc, listing } = actors(db);
  const O = id(11);
  // A legacy non-GISMA account with an active listing created before the rules.
  await db.exec(`insert into auth.users (id, email) values ('${O}', 'legacy@example.com');
    insert into public.profiles (id, display_name, city) values ('${O}', 'Legacy outsider', 'Köln');
    insert into public.listings (id, owner_id, kind, status, title, city, price_cents)
      values ('00000000-0000-4000-8000-0000000000f1', '${O}', 'marketplace', 'active', 'Legacy lamp', 'Köln', 900);
    insert into public.marketplace_details (listing_id) values ('00000000-0000-4000-8000-0000000000f1');`);
  const legacy = '00000000-0000-4000-8000-0000000000f1';
  const room = await listing(A, 'housing', 'Student room');

  // A-02: students see eligible owners' listings only; the owner still sees their own.
  assert.equal((await as(B, `select id from public.listings where id='${room}'`)).rows.length, 1);
  assert.equal((await as(B, `select id from public.listings where id='${legacy}'`)).rows.length, 0, 'ineligible owner hidden');
  assert.equal((await as(B, `select listing_id from public.marketplace_details where listing_id='${legacy}'`)).rows.length, 0);
  assert.equal((await as(O, `select id from public.listings where id='${legacy}'`)).rows.length, 1, 'owner keeps own row');
  // A student whose status becomes rejected disappears from the catalogue too.
  await db.exec(`update public.profiles set student_status='rejected' where id='${A}'`);
  assert.equal((await as(B, `select id from public.listings where id='${room}'`)).rows.length, 0);
  await db.exec(`update public.profiles set student_status='unverified' where id='${A}'`);

  // A-01: photo admission refuses ineligible or suspended owners without charging shared budgets.
  assert.equal((await svc(`select public.consume_listing_photo_attempt('${O}', '${legacy}') ok`)).rows[0].ok, false);
  const { rows: g0 } = await db.query(`select count(*)::int n from private.listing_photo_attempt_windows where scope='global_minute'`);
  assert.equal(g0[0].n, 0, 'refused outsider consumed no shared window');
  await db.exec(`insert into public.account_suspensions(user_id, reason) values ('${D}', 'Suspended for testing purposes.')`);
  assert.equal((await svc(`select public.consume_listing_photo_attempt('${D}', null) ok`)).rows[0].ok, false);
  assert.equal((await svc(`select public.consume_listing_photo_attempt('${A}', '${room}') ok`)).rows[0].ok, true);

  // A-03: participants have no UPDATE privilege that could move them onto another trip.
  const { rows: grant } = await db.query(`select has_column_privilege('authenticated', 'public.trip_participants', 'trip_listing_id', 'UPDATE') ok`);
  assert.equal(grant[0].ok, false);
  await db.close();
});

test('Jobs audit J-DB-1/J-DB-2: withdrawal is final for every client write; job rejections give a truthful next step', async () => {
  const { db } = await harness(); await seed(db);
  const { as, deny } = actors(db);
  await db.exec(`insert into public.moderators(user_id) values ('${M}')`);
  const post = async title => (await as(A, `select public.publish_student_activity('job','${title}','Berlin','Details',
    '{"company_name":"Muster GmbH","compensation_text":"EUR 15/hour","workplace_mode":"hybrid"}') id`)).rows[0].id;
  const job = await post('Werkstudent Data Science'), bad = await post('Praktikum unpaid');
  await as(M, `select public.review_student_activity('${job}','approve','Employer and pay checked.')`);
  await as(M, `select public.review_student_activity('${bad}','reject','Pay below the legal minimum.')`);

  // Apply once (duplicate presses keep one row), withdraw, and stay withdrawn.
  await as(B, `select public.student_activity_response('${job}','apply','I study Data Science.')`);
  await as(B, `select public.student_activity_response('${job}','apply','Duplicate press.')`);
  assert.equal((await db.query(`select count(*)::int n from public.job_applications where job_listing_id='${job}'`)).rows[0].n, 1);
  const withdrawn = (await as(B, `select public.student_activity_response('${job}','withdraw','') r`)).rows[0].r;
  assert.equal(withdrawn.withdrawn, true);
  assert.equal((await as(B, `select public.student_activity_response('${job}','withdraw','') r`)).rows[0].r.withdrawn, true, 'idempotent');
  await deny(B, `update public.job_applications set withdrawn_at = null where job_listing_id='${job}'`);
  await deny(B, `select public.student_activity_response('${job}','apply','Again')`, '22023');
  assert.equal((await as(B, `select public.student_activity_response('${job}','state','') r`)).rows[0].r.withdrawn, true);
  // Other students never see applications; the author does.
  assert.equal((await as(C, `select id from public.job_applications`)).rows.length, 0);
  assert.equal((await as(A, `select id from public.job_applications where job_listing_id='${job}'`)).rows.length, 1);

  // Jobs cannot be edited by clients, so the rejection must not promise an edit.
  await deny(A, `update public.listings set title='Edited' where id='${bad}'`);
  const notice = (await as(A, `select message from public.moderation_notices where message like '%not approved%'`)).rows[0].message;
  assert.match(notice, /post a corrected job/);
  assert.doesNotMatch(notice, /You can edit it/);
  await as(A, `select public.close_student_activity('${bad}')`);
  await deny(C, `select public.student_activity_response('${bad}','apply','Hi')`);
  await db.close();
});
