-- DRAFT FOR STAGING REVIEW. Do not apply to production (mljmifovcthvtuquvyzf)
-- without explicit approval. Requires 20261124110000_student_activity_review.sql.
--
-- Jobs API audit, 25 Nov 2026 (see docs/STUORA_JOBS_API_AUDIT_2026-11-25.md):
--
-- J-DB-1  A withdrawn application could be revived. student_activity_response
--         refuses to resubmit a withdrawn application, but `authenticated`
--         holds UPDATE(withdrawn_at), so an old or modified client could set
--         withdrawn_at back to NULL and the employer would see the application
--         as live again. Withdrawal is now one-way for every client write.
--         Deleting one's own application stays allowed (data erasure).
--
-- J-DB-2  Rejected Jobs told the author "You can edit it and it will be
--         reviewed again", but Jobs have no edit path (job_details carries no
--         client UPDATE privilege and enforce_listing_integrity refuses client
--         writes to job listings). The notice for Jobs now says what the
--         student can actually do. Trips and Events keep the existing text.
begin;

create function private.job_withdrawal_is_final() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null
     and old.withdrawn_at is not null
     and new.withdrawn_at is distinct from old.withdrawn_at then
    raise exception 'Withdrawn applications cannot be resubmitted' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.job_withdrawal_is_final() from public, anon, authenticated;

create trigger b_job_withdrawal_is_final before update on public.job_applications
  for each row execute function private.job_withdrawal_is_final();

create or replace function public.review_student_activity(p_listing uuid, p_decision text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  l public.listings;
begin
  if not private.is_moderator(actor) then
    raise exception 'Moderator access required' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject')
     or char_length(v_reason) not between 10 and 1000 then
    raise exception 'A decision and a reason of 10 to 1000 characters are required' using errcode = '22023';
  end if;
  select * into l from public.listings where id = p_listing for update;
  if not found or l.kind not in ('job', 'trip', 'event') or l.review_status <> 'pending'
     or l.status = 'closed'::public.listing_status then
    raise exception 'Activity is missing or not awaiting review' using errcode = '22023';
  end if;
  if l.owner_id = actor then
    raise exception 'Moderators cannot review their own activities' using errcode = '42501';
  end if;
  update public.listings
     set review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
         reviewed_at = now()
   where id = l.id;
  insert into private.activity_reviews (listing_id, decision, reason, reviewed_by)
  values (l.id, case when p_decision = 'approve' then 'approved' else 'rejected' end, v_reason, actor);
  insert into public.moderation_notices (user_id, kind, message)
  values (l.owner_id, 'activity_review', left(case when p_decision = 'approve'
    then 'Your Stuora ' || l.kind || ' "' || l.title || '" was approved and is now visible to students.'
    else 'Your Stuora ' || l.kind || ' "' || l.title || '" was not approved. Reason: ' || v_reason
         || case when l.kind = 'job'
              then ' Jobs cannot be edited after submission: close it and post a corrected job to have it reviewed again.'
              else ' You can edit it and it will be reviewed again.' end
    end, 1500));
end $$;

revoke all on function public.review_student_activity(uuid, text, text) from public, anon;
grant execute on function public.review_student_activity(uuid, text, text) to authenticated;

commit;
