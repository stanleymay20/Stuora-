-- Hosted staging-only acceptance fixture. Run on dedicated Stuora staging DB;
-- auth users, profiles, groups, memberships and messages are ALL rolled back.
begin;
insert into auth.users(id) values
  ('10000000-0000-0000-0000-000000000101'),
  ('10000000-0000-0000-0000-000000000102'),
  ('10000000-0000-0000-0000-000000000103');
insert into public.profiles(id,display_name,account_kind) values
  ('10000000-0000-0000-0000-000000000101','Test Group Founder','student'),
  ('10000000-0000-0000-0000-000000000102','Test Group Member','student'),
  ('10000000-0000-0000-0000-000000000103','Test Group Outsider','student');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000101',true);
do $$
declare gid uuid; message_id uuid; begin
  gid := public.create_student_group('Staging Test Study Circle','Rollback test','Berlin','Study');
  perform set_config('test.group_id',gid::text,true);
  if not exists(select 1 from public.student_groups where id=gid and owner_id=auth.uid())
    then raise exception 'group creation ownership failure'; end if;
  if not exists(select 1 from public.student_group_members where group_id=gid and user_id=auth.uid())
    then raise exception 'group creator membership missing'; end if;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000102',true);
  if exists(select 1 from public.student_group_members where group_id=gid)
    then raise exception 'unauthorized membership metadata leaked'; end if;
  begin
    perform public.send_student_group_message(gid,'Unauthorized message');
    raise exception 'nonmember message accepted';
  exception when insufficient_privilege then null; end;
  update public.student_groups set name='Hijacked name' where id=gid;
  if found then raise exception 'group nonowner update accepted'; end if;
  insert into public.student_group_members(group_id,user_id) values(gid,auth.uid());
  message_id := public.send_student_group_message(gid,'Staging real member message');
  perform set_config('test.group_message_id',message_id::text,true);
  if not exists(select 1 from public.student_group_messages where id=message_id) then raise exception 'member cannot read discussion'; end if;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000103',true);
  if exists(select 1 from public.student_group_messages where id=message_id) then raise exception 'private discussion leaked to outsider'; end if;
  begin
    insert into public.student_group_messages(group_id,author_id,body) values(gid,auth.uid(),'Bypass');
    raise exception 'direct non-RPC message insert succeeded';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000101',true);
  delete from public.student_group_messages where id=message_id;
  if not found then raise exception 'group founder moderation failed'; end if;
  delete from public.student_groups where id=gid;
  if not found then raise exception 'group founder delete failed'; end if;
end $$;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if has_function_privilege('anon','public.create_student_group(text,text,text,text)','EXECUTE')
    then raise exception 'anonymous group creator RPC privilege exists'; end if;
  if has_function_privilege('anon','public.send_student_group_message(uuid,text)','EXECUTE')
    then raise exception 'anonymous discussion send privilege exists'; end if;
  if exists(select 1 from public.student_groups where id=current_setting('test.group_id')::uuid)
    then raise exception 'deleted group visible'; end if;
end $$;
rollback;
