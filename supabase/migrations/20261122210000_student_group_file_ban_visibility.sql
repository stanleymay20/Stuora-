-- Private group-file visibility must bypass owner-only ban RLS for the
-- CALLER'S OWN ban status. Returning a simple own-access boolean does not
-- disclose which other students are banned or the group membership roster.
begin;

create function public.can_read_student_group_files(p_group uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.student_group_members m
      where m.group_id = p_group and m.user_id = (select auth.uid())
    )
    and not exists (
      select 1 from public.student_group_bans b
      where b.group_id = p_group and b.user_id = (select auth.uid())
    )
$$;
revoke all on function public.can_read_student_group_files(uuid)
  from public, anon, authenticated;
grant execute on function public.can_read_student_group_files(uuid) to authenticated;

drop policy if exists student_group_files_visible_to_current_members
  on public.student_group_files;

create policy student_group_files_visible_to_current_members
  on public.student_group_files
  for select to authenticated
  using (
    (select public.can_read_student_group_files(public.student_group_files.group_id))
    and (
      public.student_group_files.status = 'approved'
      or (
        public.student_group_files.status = 'pending_review'
        and public.student_group_files.uploader_id = (select auth.uid())
      )
    )
  );
commit;
