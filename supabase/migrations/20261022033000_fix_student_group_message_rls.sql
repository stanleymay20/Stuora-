-- Stuora P0: stop cross-group disclosure of member-only discussions.
-- Forward-only corrective migration; do not edit the already-applied original.
-- Reviewed against the actual staging pg_policies definition (2026-10-22).
-- The former predicate "m.group_id = group_id" resolved as m.group_id = m.group_id.
-- This is a read-policy tightening only; no message/member rows are modified.
begin;

drop policy if exists student_group_messages_read_member on public.student_group_messages;

create policy student_group_messages_read_member
  on public.student_group_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_group_members as m
      where m.group_id = public.student_group_messages.group_id
        and m.user_id = (select auth.uid())
    )
  );

commit;
