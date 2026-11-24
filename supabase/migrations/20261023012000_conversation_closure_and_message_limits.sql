-- Gen-3 audit D-07 and L2.
--  * A listing conversation closes when its listing is archived: nobody can
--    send further messages into it (history stays readable to members).
--  * Direct messages drop from 60/minute (a spam allowance) to 20/minute and
--    300/day per account. Every other branch of private.limit_student_actions
--    is reproduced unchanged from 20261012182717.
begin;

create function private.guard_conversation_open()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.listing_status;
begin
  select l.status into v_status
    from public.conversations c
    join public.listings l on l.id = c.listing_id
   where c.id = new.conversation_id;
  if found and v_status = 'closed'::public.listing_status then
    raise exception 'This listing was archived, so its conversation is closed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_conversation_open() from public, anon, authenticated;
-- "a_conversation_open_guard" sorts before "messages_safety", so a refused
-- send never consumes the sender's message quota.
create trigger a_conversation_open_guard before insert on public.messages
  for each row execute function private.guard_conversation_open();

create or replace function private.limit_student_actions() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  -- Trusted server writes have no student JWT; client grants and RLS still apply.
  if actor is null then return new;end if;
  if tg_table_name='messages' then
    if new.sender_id<>actor then raise exception 'Sender mismatch' using errcode='42501';end if;
    if exists(select 1 from public.conversation_members m where m.conversation_id=new.conversation_id and m.user_id<>actor and not private.contact_allowed(m.user_id)) then raise exception 'Contact unavailable' using errcode='42501';end if;
    perform private.consume_action(actor,'message',20,interval '1 minute');
    perform private.consume_action(actor,'message_day',300,interval '1 day');
  elsif tg_table_name='listings' then
    if new.owner_id<>actor then raise exception 'Owner mismatch' using errcode='42501';end if;
    perform private.consume_action(actor,'publish',20,interval '1 hour');
  elsif tg_table_name='job_applications' then
    if new.applicant_id<>actor or not exists(select 1 from public.listings l where l.id=new.job_listing_id and l.kind='job' and l.status='active' and l.owner_id<>actor and private.contact_allowed(l.owner_id)) then raise exception 'Application unavailable' using errcode='42501';end if;
    perform private.consume_action(actor,'apply',20,interval '1 hour');
  elsif tg_table_name='reports' then
    if new.reporter_id<>actor then raise exception 'Reporter mismatch' using errcode='42501';end if;
    perform private.consume_action(actor,'report',10,interval '1 hour');
  end if;
  return new;
end $$;
revoke all on function private.limit_student_actions() from public,anon,authenticated;

commit;
