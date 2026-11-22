-- Defense in depth: if a ban record and stale membership ever coexist,
-- neither approved nor pending group-file metadata is visible.
-- The private Storage bucket still has no client object SELECT policy.
begin;
drop policy if exists student_group_files_visible_to_current_members
  on public.student_group_files;

create policy student_group_files_visible_to_current_members
  on public.student_group_files
  for select to authenticated
  using (
    exists (
      select 1 from public.student_group_members as m
      where m.group_id = public.student_group_files.group_id
        and m.user_id = (select auth.uid())
    )
    and not exists (
      select 1 from public.student_group_bans as b
      where b.group_id = public.student_group_files.group_id
        and b.user_id = (select auth.uid())
    )
    and (
      public.student_group_files.status = 'approved'
      or (
        public.student_group_files.status = 'pending_review'
        and public.student_group_files.uploader_id = (select auth.uid())
      )
    )
  );
commit;
