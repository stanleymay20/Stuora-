// The GISMA-only, activity-review and student-only catalogue migrations each
// have a tested rollback (supabase/rollback/*.down.sql). Applying all four
// migrations and then the rollbacks in reverse order must restore the exact
// schema, policies, grants and function bodies that existed before. PGlite only;
// no hosted database is contacted.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const rollbackDir = new URL('../supabase/rollback/', import.meta.url);
const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
const STAGED = ['20261124100000_require_gisma_student_access', '20261124110000_student_activity_review',
  '20261124120000_student_only_catalogue', '20261124121000_private_listing_media_bucket',
  '20261124130000_student_access_audit_hardening', '20261125090000_job_application_integrity', '20261126090000_gismate_location_engine',
  '20261126120000_geo_city_search_exact',
  '20261127090000_student_partner_offers'];

async function database() {
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
  return db;
}

// Everything the staged migrations touch, normalised for comparison.
async function snapshot(db) {
  const q = async sql => (await db.query(sql)).rows;
  return {
    policies: await q(`select schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check
      from pg_policies where schemaname in ('public','storage') order by 1,2,3`),
    functions: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args,
        md5(pg_get_functiondef(p.oid)) body, coalesce(p.proacl::text, '') acl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public','private') and p.prokind = 'f' order by 1,2,3`),
    triggers: await q(`select c.relname, t.tgname, pg_get_triggerdef(t.oid) def from pg_trigger t
      join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal order by 1,2`),
    constraints: await q(`select conrelid::regclass::text tbl, conname, pg_get_constraintdef(oid) def
      from pg_constraint where connamespace in ('public'::regnamespace, 'private'::regnamespace) order by 1,2`),
    columns: await q(`select table_schema, table_name, column_name, data_type from information_schema.columns
      where table_schema in ('public','private') order by 1,2,3`),
    tableGrants: await q(`select table_schema, table_name, grantee, privilege_type from information_schema.role_table_grants
      where table_schema in ('public','private') and grantee in ('anon','authenticated','service_role') order by 1,2,3,4`),
    buckets: await q(`select id, public from storage.buckets order by id`),
  };
}

test('each staged migration has a rollback, and applying then rolling back restores the exact schema', async () => {
  for (const name of STAGED) assert.ok(files.includes(`${name}.sql`), `${name}.sql exists`);
  const db = await database();
  const before = files.filter(f => f < STAGED[0]);
  for (const f of before) await db.exec(readFileSync(new URL(f, migrationsDir), 'utf8'));
  const original = await snapshot(db);

  for (const name of STAGED) await db.exec(readFileSync(new URL(`${name}.sql`, migrationsDir), 'utf8'));
  const applied = await snapshot(db);
  assert.notDeepEqual(applied.policies, original.policies, 'the migrations change policies');
  assert.equal(applied.buckets.find(b => b.id === 'listing-media').public, false);

  for (const name of [...STAGED].reverse())
    await db.exec(readFileSync(new URL(`${name}.down.sql`, rollbackDir), 'utf8'));
  const restored = await snapshot(db);
  for (const key of Object.keys(original)) assert.deepEqual(restored[key], original[key], `${key} restored`);
  await db.close();
});

test('rolling back only the private bucket keeps the student-only catalogue intact', async () => {
  const db = await database();
  for (const f of files) await db.exec(readFileSync(new URL(f, migrationsDir), 'utf8'));
  // The private bucket is applied last, after the hardening migration that follows it in file order.
  await db.exec(readFileSync(new URL(`${STAGED[3]}.down.sql`, rollbackDir), 'utf8'));
  const { rows: bucket } = await db.query(`select public from storage.buckets where id='listing-media'`);
  assert.equal(bucket[0].public, true);
  const { rows: policy } = await db.query(`select roles::text from pg_policies where policyname='listings_read_student_catalogue_or_owned'`);
  assert.equal(policy[0].roles, '{authenticated}');
  await db.close();
});
