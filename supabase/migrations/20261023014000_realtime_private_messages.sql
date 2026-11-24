-- Gen-3 audit D-12: live delivery for listing messages and group discussions.
-- Supabase Realtime postgres_changes evaluates each change against the
-- subscriber's own RLS (messages_read_member / student_group_messages_read_member),
-- so only conversation members and group members receive events.
-- Guarded so that databases without the Supabase publication (local PGlite,
-- plain Postgres) apply this migration as a no-op.
begin;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'student_group_messages') then
      alter publication supabase_realtime add table public.student_group_messages;
    end if;
  end if;
end;
$$;
commit;
