begin;
create table public.event_participants (
  event_listing_id uuid not null references public.listings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(), primary key(event_listing_id,user_id)
);
create index event_participants_user_idx on public.event_participants(user_id);
alter table public.event_participants enable row level security;
revoke all on public.event_participants from public,anon,authenticated;
grant select on public.event_participants to authenticated;
create policy event_participants_self_or_organizer on public.event_participants for select to authenticated
using(user_id=(select auth.uid()) or exists(select 1 from public.listings l where l.id=event_listing_id and l.owner_id=(select auth.uid())));

create table public.publisher_requests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  company_name text not null check(char_length(btrim(company_name)) between 2 and 160),
  details text not null check(char_length(btrim(details)) between 10 and 2000),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(), reviewed_at timestamptz
);
alter table public.publisher_requests enable row level security;
revoke all on public.publisher_requests from public,anon,authenticated;
grant select on public.publisher_requests to authenticated;
grant insert(user_id,company_name,details) on public.publisher_requests to authenticated;
create policy publisher_requests_self_read on public.publisher_requests for select to authenticated using(user_id=(select auth.uid()));
create policy publisher_requests_self_create on public.publisher_requests for insert to authenticated with check(user_id=(select auth.uid()));

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),primary key(blocker_id,blocked_id),check(blocker_id<>blocked_id)
);
create index user_blocks_target_idx on public.user_blocks(blocked_id);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from public,anon,authenticated;
grant select,delete on public.user_blocks to authenticated;
grant insert(blocker_id,blocked_id) on public.user_blocks to authenticated;
create policy user_blocks_self_read on public.user_blocks for select to authenticated using(blocker_id=(select auth.uid()));
create policy user_blocks_self_insert on public.user_blocks for insert to authenticated with check(blocker_id=(select auth.uid()));
create policy user_blocks_self_delete on public.user_blocks for delete to authenticated using(blocker_id=(select auth.uid()));

create table private.action_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null, window_start timestamptz not null,used integer not null,primary key(user_id,action)
);
alter table private.action_limits enable row level security;
revoke all on private.action_limits from public,anon,authenticated;
create function private.consume_action(p_user uuid,p_action text,p_limit integer,p_window interval)
returns void language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=clock_timestamp();v_used integer;
begin
  insert into private.action_limits(user_id,action,window_start,used) values(p_user,p_action,v_now,1)
  on conflict(user_id,action) do update set
    window_start=case when private.action_limits.window_start+p_window<=v_now then v_now else private.action_limits.window_start end,
    used=case when private.action_limits.window_start+p_window<=v_now then 1 else private.action_limits.used+1 end
  where private.action_limits.window_start+p_window<=v_now or private.action_limits.used<p_limit returning used into v_used;
  if v_used is null then raise exception 'Too many actions. Try again later.' using errcode='P0001';end if;
end $$;
revoke all on function private.consume_action(uuid,text,integer,interval) from public,anon,authenticated;
create function private.contact_allowed(p_other uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and not exists(select 1 from public.user_blocks b
    where (b.blocker_id=auth.uid() and b.blocked_id=p_other) or (b.blocker_id=p_other and b.blocked_id=auth.uid()))
$$;
revoke all on function private.contact_allowed(uuid) from public,anon;
grant execute on function private.contact_allowed(uuid) to authenticated;

create function private.limit_student_actions() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  -- Trusted server writes have no student JWT; client grants and RLS still apply.
  if actor is null then return new;end if;
  if tg_table_name='messages' then
    if new.sender_id<>actor then raise exception 'Sender mismatch' using errcode='42501';end if;
    if exists(select 1 from public.conversation_members m where m.conversation_id=new.conversation_id and m.user_id<>actor and not private.contact_allowed(m.user_id)) then raise exception 'Contact unavailable' using errcode='42501';end if;
    perform private.consume_action(actor,'message',60,interval '1 minute');
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
create trigger messages_safety before insert on public.messages for each row execute function private.limit_student_actions();
create trigger listings_safety before insert on public.listings for each row execute function private.limit_student_actions();
create trigger reports_safety before insert on public.reports for each row execute function private.limit_student_actions();
create trigger job_applications_safety before insert on public.job_applications for each row execute function private.limit_student_actions();

-- Direct new-category creation remains denied. Only controlled RPCs write details.
revoke insert,update,delete on public.trip_details,public.job_details,public.event_details from authenticated;
revoke update(destination,starts_at,ends_at,capacity,estimated_cost_cents) on public.trip_details from authenticated;
revoke update(company_name,compensation_text,hours_per_week_min,hours_per_week_max,workplace_mode,application_url) on public.job_details from authenticated;
revoke update(starts_at,ends_at,capacity,venue_name) on public.event_details from authenticated;
revoke insert,delete on public.trip_participants from authenticated;

create function private.save_community_listing_impl(p_id uuid,p_kind public.listing_kind,p_title text,p_description text,p_city text,p_price_cents integer,p_details jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();result_id uuid;v_start timestamptz;v_end timestamptz;v_capacity integer;v_count integer;
begin
  if actor is null or not exists(select 1 from public.profiles where id=actor) then raise exception 'Complete your profile' using errcode='42501';end if;
  if p_kind is null or p_kind not in ('post','trip','job','event') then raise exception 'Unsupported category' using errcode='22023';end if;
  if p_kind='job' and not exists(select 1 from public.profiles where id=actor and account_kind in ('employer','partner')) then raise exception 'Approved publisher required' using errcode='42501';end if;
  if p_title is null or char_length(btrim(p_title)) not between 3 and 140 or p_city is null or char_length(btrim(p_city)) not between 2 and 120 or p_description is null or char_length(btrim(p_description))>4000 then raise exception 'Invalid listing text' using errcode='22023';end if;
  if p_price_cents is null or p_price_cents<0 then raise exception 'Invalid price' using errcode='22023';end if;
  if p_kind in ('post','job') and p_price_cents<>0 then raise exception 'Posting and applications are free' using errcode='22023';end if;
  if p_kind='post' and char_length(btrim(p_description))<1 then raise exception 'Post text required' using errcode='22023';end if;
  if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'Category details required' using errcode='22023';end if;
  if p_kind in ('trip','event') then
    v_start:=(p_details->>'starts_at')::timestamptz;v_end:=nullif(p_details->>'ends_at','')::timestamptz;v_capacity:=(p_details->>'capacity')::integer;
    if v_start is null or v_start<=clock_timestamp() or (v_end is not null and v_end<v_start) or v_capacity is null or v_capacity not between (case when p_kind='trip' then 2 else 1 end) and 100 then raise exception 'Invalid future dates or capacity' using errcode='22023';end if;
  end if;
  if p_id is null then
    insert into public.listings(owner_id,kind,status,title,description,city,price_cents) values(actor,p_kind,'active',btrim(p_title),btrim(p_description),btrim(p_city),p_price_cents) returning id into result_id;
  else
    select id into result_id from public.listings where id=p_id and owner_id=actor and kind=p_kind and status='active' for update;
    if result_id is null then raise exception 'Listing unavailable or not yours' using errcode='42501';end if;
    if p_kind='trip' then select count(*) into v_count from public.trip_participants where trip_listing_id=result_id;
    elsif p_kind='event' then select count(*) into v_count from public.event_participants where event_listing_id=result_id;end if;
    if v_count>v_capacity then raise exception 'Capacity below current participation' using errcode='22023';end if;
    update public.listings set title=btrim(p_title),description=btrim(p_description),city=btrim(p_city),price_cents=p_price_cents where id=result_id;
  end if;
  if p_kind='trip' then
    if char_length(btrim(coalesce(p_details->>'destination',''))) not between 2 and 160 then raise exception 'Destination required' using errcode='22023';end if;
    insert into public.trip_details(listing_id,destination,starts_at,ends_at,capacity,estimated_cost_cents) values(result_id,btrim(p_details->>'destination'),v_start,v_end,v_capacity,p_price_cents)
    on conflict(listing_id) do update set destination=excluded.destination,starts_at=excluded.starts_at,ends_at=excluded.ends_at,capacity=excluded.capacity,estimated_cost_cents=excluded.estimated_cost_cents;
  elsif p_kind='event' then
    if char_length(btrim(coalesce(p_details->>'venue_name',''))) not between 2 and 160 then raise exception 'Venue required' using errcode='22023';end if;
    insert into public.event_details(listing_id,starts_at,ends_at,capacity,venue_name) values(result_id,v_start,v_end,v_capacity,btrim(p_details->>'venue_name'))
    on conflict(listing_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,capacity=excluded.capacity,venue_name=excluded.venue_name;
  elsif p_kind='job' then
    if char_length(btrim(coalesce(p_details->>'company_name',''))) not between 2 and 160 or char_length(btrim(coalesce(p_details->>'compensation_text',''))) not between 1 and 160 or p_details->>'workplace_mode' is null then raise exception 'Company, compensation and workplace required' using errcode='22023';end if;
    insert into public.job_details(listing_id,company_name,compensation_text,workplace_mode) values(result_id,btrim(p_details->>'company_name'),btrim(p_details->>'compensation_text'),(p_details->>'workplace_mode')::public.workplace_mode)
    on conflict(listing_id) do update set company_name=excluded.company_name,compensation_text=excluded.compensation_text,workplace_mode=excluded.workplace_mode;
  end if;
  return result_id;
end $$;
revoke all on function private.save_community_listing_impl(uuid,public.listing_kind,text,text,text,integer,jsonb) from public,anon;
grant execute on function private.save_community_listing_impl(uuid,public.listing_kind,text,text,text,integer,jsonb) to authenticated;
create function public.save_community_listing(p_id uuid,p_kind public.listing_kind,p_title text,p_description text,p_city text,p_price_cents integer,p_details jsonb)
returns uuid language sql security invoker set search_path='' as $$select private.save_community_listing_impl(p_id,p_kind,p_title,p_description,p_city,p_price_cents,p_details)$$;
revoke all on function public.save_community_listing(uuid,public.listing_kind,text,text,text,integer,jsonb) from public,anon;
grant execute on function public.save_community_listing(uuid,public.listing_kind,text,text,text,integer,jsonb) to authenticated;

create function private.listing_participation_impl(p_listing_id uuid,p_action text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();l public.listings;v_capacity integer;v_count integer:=0;v_start timestamptz;v_joined boolean:=false;app public.job_applications;
begin
  select * into l from public.listings where id=p_listing_id and (status='active' or owner_id=actor
    or exists(select 1 from public.trip_participants t where t.trip_listing_id=public.listings.id and t.user_id=actor)
    or exists(select 1 from public.event_participants e where e.event_listing_id=public.listings.id and e.user_id=actor)
    or exists(select 1 from public.job_applications j where j.job_listing_id=public.listings.id and j.applicant_id=actor)) for update;
  if not found or l.kind not in ('trip','event','job') then raise exception 'Listing unavailable' using errcode='22023';end if;
  if p_action is null or p_action not in ('state','join','leave','apply','withdraw') then raise exception 'Unsupported action' using errcode='22023';end if;
  if p_action<>'state' and (actor is null or not exists(select 1 from public.profiles where id=actor)) then raise exception 'Complete your profile' using errcode='42501';end if;
  if p_action in ('join','apply') and (l.status<>'active' or l.owner_id=actor or not private.contact_allowed(l.owner_id)) then raise exception 'Participation unavailable' using errcode='42501';end if;
  if l.kind='job' then
    if p_action not in ('state','apply','withdraw') then raise exception 'Unsupported job action' using errcode='22023';end if;
    select * into app from public.job_applications where job_listing_id=l.id and applicant_id=actor;
    if p_action='apply' then
      if p_note is null or char_length(p_note)>2000 then raise exception 'Invalid cover note' using errcode='22023';end if;
      if app.id is null then
        insert into public.job_applications(job_listing_id,applicant_id,cover_note) values(l.id,actor,p_note) returning * into app;
      elsif app.withdrawn_at is not null then raise exception 'Withdrawn applications cannot be resubmitted' using errcode='22023';end if;
    elsif p_action='withdraw' then
      update public.job_applications set withdrawn_at=coalesce(withdrawn_at,clock_timestamp()) where id=app.id returning * into app;
    end if;
    return jsonb_build_object('count',null,'joined',false,'applied',app.id is not null,'withdrawn',app.withdrawn_at is not null,'application_status',app.status);
  end if;
  if p_action in ('apply','withdraw') then raise exception 'Unsupported participation action' using errcode='22023';end if;
  if l.kind='trip' then
    select capacity,starts_at into v_capacity,v_start from public.trip_details where listing_id=l.id;
    select count(*),coalesce(bool_or(user_id=actor),false) into v_count,v_joined from public.trip_participants where trip_listing_id=l.id;
  else
    select capacity,starts_at into v_capacity,v_start from public.event_details where listing_id=l.id;
    select count(*),coalesce(bool_or(user_id=actor),false) into v_count,v_joined from public.event_participants where event_listing_id=l.id;
  end if;
  if p_action='join' and not v_joined then
    if v_capacity is null or v_start is null or v_start<=clock_timestamp() or v_count>=v_capacity then raise exception 'Full or already started' using errcode='22023';end if;
    perform private.consume_action(actor,'join',30,interval '1 hour');
    if l.kind='trip' then insert into public.trip_participants(trip_listing_id,user_id) values(l.id,actor);else insert into public.event_participants(event_listing_id,user_id) values(l.id,actor);end if;
    v_count:=v_count+1;v_joined:=true;
  elsif p_action='leave' and v_joined then
    if l.kind='trip' then delete from public.trip_participants where trip_listing_id=l.id and user_id=actor;else delete from public.event_participants where event_listing_id=l.id and user_id=actor;end if;
    v_count:=v_count-1;v_joined:=false;
  end if;
  return jsonb_build_object('count',v_count,'joined',v_joined,'capacity',v_capacity,'applied',false,'withdrawn',false);
end $$;
revoke all on function private.listing_participation_impl(uuid,text,text) from public,anon;
grant execute on function private.listing_participation_impl(uuid,text,text) to authenticated;
create function public.listing_participation(p_listing_id uuid,p_action text,p_note text default '')
returns jsonb language sql security invoker set search_path='' as $$select private.listing_participation_impl(p_listing_id,p_action,p_note)$$;
revoke all on function public.listing_participation(uuid,text,text) from public,anon;
grant execute on function public.listing_participation(uuid,text,text) to authenticated;

create function private.review_job_application_impl(p_application_id uuid,p_status public.application_status)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();v_job uuid;
begin
  if actor is null or p_status is null or not exists(select 1 from public.profiles where id=actor and account_kind in ('employer','partner')) then raise exception 'Approved publisher required' using errcode='42501';end if;
  select job_listing_id into v_job from public.job_applications where id=p_application_id;
  if not exists(select 1 from public.listings where id=v_job and owner_id=actor and kind='job') then raise exception 'Application is not yours to review' using errcode='42501';end if;
  update public.job_applications set status=p_status where id=p_application_id and withdrawn_at is null;
  if not found then raise exception 'Application unavailable or withdrawn' using errcode='22023';end if;
end $$;
revoke all on function private.review_job_application_impl(uuid,public.application_status) from public,anon;
grant execute on function private.review_job_application_impl(uuid,public.application_status) to authenticated;
create function public.review_job_application(p_application_id uuid,p_status public.application_status)
returns void language sql security invoker set search_path='' as $$select private.review_job_application_impl(p_application_id,p_status)$$;
revoke all on function public.review_job_application(uuid,public.application_status) from public,anon;
grant execute on function public.review_job_application(uuid,public.application_status) to authenticated;

-- Extend eligibility while retaining the original owner and object-path boundary.
drop policy listing_media_owner_insert on storage.objects;
create policy listing_media_owner_insert on storage.objects for insert to authenticated with check(
  bucket_id='listing-media' and array_length(storage.foldername(name),1)=2 and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(select 1 from public.listings l where l.id::text=(storage.foldername(name))[2] and l.owner_id=(select auth.uid())
    and (l.kind<>'job' or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_kind in ('employer','partner')))));
drop policy listing_media_owner_update on storage.objects;
create policy listing_media_owner_update on storage.objects for update to authenticated
using(bucket_id='listing-media' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check(bucket_id='listing-media' and array_length(storage.foldername(name),1)=2 and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(select 1 from public.listings l where l.id::text=(storage.foldername(name))[2] and l.owner_id=(select auth.uid())
    and (l.kind<>'job' or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_kind in ('employer','partner')))));

create or replace function private.start_listing_conversation_impl(p_listing_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_owner uuid;v_title text;v_conversation uuid;
begin
  if v_user is null or not exists(select 1 from public.profiles where id=v_user) then raise exception 'Complete your profile before messaging' using errcode='42501';end if;
  select l.owner_id,l.title into v_owner,v_title from public.listings l where l.id=p_listing_id and l.status='active'
    and (l.kind<>'job' or exists(select 1 from public.profiles p where p.id=l.owner_id and p.account_kind in ('employer','partner')));
  if not found then raise exception 'Listing unavailable for messaging' using errcode='22023';end if;
  if v_owner=v_user then raise exception 'You cannot message yourself' using errcode='22023';end if;
  if not private.contact_allowed(v_owner) then raise exception 'Contact unavailable' using errcode='42501';end if;
  select id into v_conversation from public.conversations where listing_id=p_listing_id and creator_id=v_user;
  if found then return v_conversation;end if;
  perform private.consume_action(v_user,'conversation',10,interval '1 hour');
  insert into public.conversations(creator_id,title,listing_id) values(v_user,left('Listing: '||v_title,160),p_listing_id)
  on conflict(listing_id,creator_id) where listing_id is not null do update set title=excluded.title returning id into v_conversation;
  insert into public.conversation_members(conversation_id,user_id) values(v_conversation,v_user),(v_conversation,v_owner) on conflict do nothing;
  return v_conversation;
end $$;
-- Existing execution grants remain unchanged; all new privileged code is private.
commit;
