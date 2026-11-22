-- ROLLBACK-ONLY staging authorization smoke test.
-- Uses two existing STAGING student identities without reading their names,
-- sending notifications, downloading files, or persisting any data.
-- Never execute in production. Entire transaction rolls back by design.
begin;
create temporary table _stuora_file_qa on commit drop as
select
  (select id from public.profiles where account_kind='student' order by id offset 0 limit 1) as owner_id,
  (select id from public.profiles where account_kind='student' order by id offset 1 limit 1) as peer_id,
  gen_random_uuid() as group_id,
  gen_random_uuid() as image_id,
  gen_random_uuid() as pdf_id;

do $$
begin
 if (select owner_id is null or peer_id is null from _stuora_file_qa)
 then raise exception 'Two staging student profiles are required'; end if;
end $$;

insert into public.student_groups(id,owner_id,name,description,city,topic)
select group_id,owner_id,'Stuora QA temporary group','Transactional authorization test','Berlin','Study'
  from _stuora_file_qa;

insert into public.student_group_members(group_id,user_id)
select group_id,owner_id from _stuora_file_qa
union all
select group_id,peer_id from _stuora_file_qa;

insert into public.student_group_files(
 id,group_id,uploader_id,original_name,object_path,media_type,size_bytes,
 status,inspection_method,inspected_at
)
select image_id,group_id,owner_id,'qa-photo.webp',
       group_id::text||'/'||image_id::text||'.webp',
       'image/webp', 256,'approved','trusted-image-transcode',now()
from _stuora_file_qa;

insert into public.student_group_files(
 id,group_id,uploader_id,original_name,object_path,media_type,size_bytes,status
)
select pdf_id,group_id,owner_id,'qa-pdf.pdf',
       group_id::text||'/'||pdf_id::text||'.pdf',
       'application/pdf',256,'pending_review'
from _stuora_file_qa;

do $$
begin
  if (select count(*) from private.student_group_pdf_scan_jobs) <> 1
  then raise exception 'PDF scan job was not enqueued'; end if;
end $$;

-- Member peer: approved photo visible, pending PDF private to uploader.
select set_config('request.jwt.claim.sub',(select peer_id::text from _stuora_file_qa),true);
set local role authenticated;
do $$
begin
 if (select count(*) from public.student_group_files) <> 1
 then raise exception 'Joined peer must see only approved image'; end if;
end $$;
reset role;

-- Ban must hide files even when the peer still has a membership row.
insert into public.student_group_bans(group_id,user_id,banned_by)
select group_id,peer_id,owner_id from _stuora_file_qa;
select set_config('request.jwt.claim.sub',(select peer_id::text from _stuora_file_qa),true);
set local role authenticated;
do $$
begin
 if (select count(*) from public.student_group_files) <> 0
 then raise exception 'Banned peer can still see private metadata'; end if;
end $$;
reset role;

-- Uploader can see their pending file; cannot use an unscanned PDF.
select set_config('request.jwt.claim.sub',(select owner_id::text from _stuora_file_qa),true);
set local role authenticated;
do $$
begin
 if (select count(*) from public.student_group_files) <> 2
 then raise exception 'Owner lost authorized file access'; end if;
end $$;
reset role;

-- Verify a missing scan hash cannot approve an unscanned PDF.
do $$
declare v_rejected boolean := false;
begin
 begin
  update public.student_group_files
     set status='approved',inspection_method='antivirus',inspected_at=now()
   where id=(select pdf_id from _stuora_file_qa);
 exception when check_violation then v_rejected := true;
 end;
 if not v_rejected then raise exception 'Unscanned PDF was approved'; end if;
end $$;

-- Uploaded material can be deleted through the user RPC, which queues cleanup.
select set_config('request.jwt.claim.sub',(select owner_id::text from _stuora_file_qa),true);
set local role authenticated;
do $$
begin
 if not public.delete_student_group_file((select image_id from _stuora_file_qa))
 then raise exception 'Uploader removal denied unexpectedly'; end if;
end $$;
reset role;
do $$
begin
 if not exists(select 1 from private.student_group_file_cleanup q
  where q.object_path=(select group_id::text||'/'||image_id::text||'.webp' from _stuora_file_qa))
 then raise exception 'Private object cleanup was not queued'; end if;
end $$;

-- No committed test group, file, ban, queue record or storage object remains.
rollback;
