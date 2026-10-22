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
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
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
      ('${A}','a@example.test'),('${B}','b@example.test'),('${C}','c@example.test'),
      ('${D}','d@example.test'),('${E}','e@example.test'),('${M}','m@example.test');
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
  await db.exec(`insert into auth.users (id) values ('${LEGACY}'), ('${A}');
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
  await db.exec(`insert into auth.users (id) values ('${B}')`);
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
  await as(M, `select public.lift_suspension('${B}', 'Appeal accepted after identity check.')`);
  assert.ok((await as(B, `select public.save_student_listing(null,'housing','Legit room','', 'Köln', 40000,'room',false,false,'good') id`)).rows[0].id);
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
  assert.equal(d.account.email, 'a@example.test');
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

test('D-07 UI: conversation safety state and blocking without exposing ids', async () => {
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
