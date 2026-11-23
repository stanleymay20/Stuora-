begin;
create function private.require_community_student() returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_quota_eligible(auth.uid()) or not exists (
    select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=auth.uid() and p.account_kind='student' and p.student_status <> 'rejected'
      and lower(to_jsonb(u)->>'email') ~ '^[^@[:space:]]+@gisma-student[.]com$'
  ) then raise exception 'A confirmed GISMA student account is required' using errcode='42501'; end if;
end $$;
revoke all on function private.require_community_student() from public,anon,authenticated;

create or replace function private.enforce_listing_integrity()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.currency is distinct from 'EUR' then
    raise exception 'Only EUR listings are supported' using errcode = '23514';
  end if;
  if (select auth.uid()) is not null
     and current_user <> pg_catalog.pg_get_userbyid((select relowner from pg_catalog.pg_class where oid = tg_relid))
     and new.kind not in ('housing'::public.listing_kind,'marketplace'::public.listing_kind) then
    raise exception 'This category is not yet accepting student submissions' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  elsif tg_op = 'UPDATE' then
    -- Students cannot unarchive a closed listing by updating status directly.
    if (select auth.uid()) is not null
       and old.status = 'closed'::public.listing_status
       and new.status <> 'closed'::public.listing_status then
      raise exception 'Archived listing cannot be reopened'
        using errcode = '42501';
    end if;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;


create function public.publish_student_activity(p_kind public.listing_kind, p_title text, p_city text,
  p_description text, p_details jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  perform private.require_community_student();
  if p_kind in ('trip','event') then
    return private.save_community_listing_impl(null,p_kind,p_title,p_description,p_city,0,p_details);
  end if;
  if p_kind is distinct from 'job' or length(trim(coalesce(p_title,''))) not between 3 and 140
     or length(trim(coalesce(p_city,''))) not between 2 and 120 or p_description is null or length(p_description)>4000
     or length(trim(coalesce(p_details->>'company_name',''))) not between 2 and 160
     or length(trim(coalesce(p_details->>'compensation_text',''))) not between 1 and 160
     or coalesce(p_details->>'workplace_mode','') not in ('onsite','remote','hybrid') then
    raise exception 'Invalid opportunity details' using errcode='22023';
  end if;
  insert into public.listings(owner_id,kind,status,title,city,description,price_cents)
    values(auth.uid(),'job','active',trim(p_title),trim(p_city),trim(p_description),0) returning id into result;
  insert into public.job_details(listing_id,company_name,compensation_text,workplace_mode)
    values(result,trim(p_details->>'company_name'),trim(p_details->>'compensation_text'),(p_details->>'workplace_mode')::public.workplace_mode);
  return result;
end $$;

create function public.student_activity_response(p_id uuid,p_action text,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.require_community_student();
  if p_action in ('join','apply','state') and not exists (
    select 1 from public.listings l where l.id=p_id and l.status='active'
    and not private.is_suspended(l.owner_id) and private.contact_allowed(l.owner_id)
  ) then raise exception 'Activity unavailable' using errcode='42501'; end if;
  return private.listing_participation_impl(p_id,p_action,p_note);
end $$;

create function public.close_student_activity(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.require_community_student();
  update public.listings set status='closed' where id=p_id and owner_id=auth.uid()
    and kind in ('trip','job','event') and status in ('active','closed');
  if not found then raise exception 'Activity unavailable' using errcode='42501'; end if;
end $$;
revoke all on function public.publish_student_activity(public.listing_kind,text,text,text,jsonb),
 public.student_activity_response(uuid,text,text), public.close_student_activity(uuid) from public,anon;
grant execute on function public.publish_student_activity(public.listing_kind,text,text,text,jsonb),
 public.student_activity_response(uuid,text,text), public.close_student_activity(uuid) to authenticated;
commit;
