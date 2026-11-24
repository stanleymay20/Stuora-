-- Gen-3 audit R-04: appearing in the People directory requires recorded,
-- affirmative consent.
--
-- Existing is_discoverable values are PRESERVED (nothing is rewritten), but
-- profiles created before this migration have no consent timestamp, because
-- they were created with a pre-ticked toggle. They stay out of the directory
-- until the student confirms through set_profile_discovery().
--
-- From now on discoverability changes only through set_profile_discovery()
-- (or the creation form's explicit toggle on INSERT), so a partial profile
-- update that merely re-sends is_discoverable can never manufacture consent.
begin;

alter table public.profiles add column discoverable_consented_at timestamptz;

create function private.stamp_discovery_consent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- The creation form's default is OFF; an explicit ON is affirmative.
    new.discoverable_consented_at := case when new.is_discoverable then now() else null end;
  elsif not new.is_discoverable then
    new.discoverable_consented_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_discovery_consent() from public, anon, authenticated;
create trigger profiles_discovery_consent before insert or update on public.profiles
  for each row execute function private.stamp_discovery_consent();

-- Clients may no longer flip discoverability with a plain UPDATE.
revoke update (is_discoverable) on public.profiles from authenticated;

create function public.set_profile_discovery(p_discoverable boolean)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); v_consent timestamptz;
begin
  if actor is null or p_discoverable is null then
    raise exception 'Sign in to change profile discovery' using errcode = '42501';
  end if;
  if p_discoverable and private.is_suspended(actor) then
    raise exception 'Suspended accounts cannot appear in the student directory' using errcode = '42501';
  end if;
  update public.profiles
     set is_discoverable = p_discoverable,
         discoverable_consented_at = case when p_discoverable then now() else null end
   where id = actor
   returning discoverable_consented_at into v_consent;
  if not found then
    raise exception 'Create your profile first' using errcode = '42501';
  end if;
  return v_consent;
end;
$$;
revoke all on function public.set_profile_discovery(boolean) from public, anon;
grant execute on function public.set_profile_discovery(boolean) to authenticated;

drop policy if exists "profiles_read_discoverable_or_self" on public.profiles;
create policy "profiles_read_consented_or_self"
on public.profiles for select
to authenticated
using (
  id = (select auth.uid())
  or (is_discoverable
      and discoverable_consented_at is not null
      and not private.is_suspended(id))
);

commit;
