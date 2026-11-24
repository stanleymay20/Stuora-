-- A student may erase their own private group upload, even after leaving
-- its group. A current group owner may remove members' content for moderation.
-- Bytes remain private while the deletion trigger queues Storage cleanup.
begin;

create function public.delete_student_group_file(p_file uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_deleted uuid;
begin
  if v_actor is null or p_file is null then
    return false;
  end if;
  delete from public.student_group_files f
   where f.id = p_file
     and (
       f.uploader_id = v_actor
       or exists (
         select 1 from public.student_groups g
          where g.id = f.group_id
            and g.owner_id = v_actor
       )
     )
  returning f.id into v_deleted;
  return v_deleted is not null;
end;
$$;

revoke all on function public.delete_student_group_file(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_student_group_file(uuid) to authenticated;

commit;
