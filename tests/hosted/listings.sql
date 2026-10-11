-- Run against dedicated Stuora only. Fixtures and all writes are rolled back.
begin;
insert into auth.users(id) values('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
insert into public.profiles(id,display_name) values('10000000-0000-0000-0000-000000000001','Listing Test A'),('10000000-0000-0000-0000-000000000002','Listing Test B');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $$ declare x uuid; m uuid; begin
x := public.save_student_listing(null,'housing','Live test room','Test','Berlin',65000,'room',true,true,'good');
perform set_config('test.listing_id',x::text,true);
if not exists(select 1 from public.housing_details where listing_id=x and rent_cents=65000) then raise exception 'creation failed'; end if;
perform public.save_student_listing(x,'housing','Edited room','Test','Berlin',62000,'room',true,true,'good');
if not exists(select 1 from public.housing_details where listing_id=x and rent_cents=62000) then raise exception 'edit failed'; end if;
begin
perform public.save_student_listing(null,'housing','Orphan live sentinel','Test','Berlin',100,'invalid',true,true,'good');
raise exception 'invalid creation accepted';
exception when check_violation then null; end;
if exists(select 1 from public.listings where title='Orphan live sentinel') then raise exception 'orphan created'; end if;
begin
perform public.save_student_listing(x,'housing','Rollback sentinel','Test','Berlin',100,'invalid',true,true,'good');
raise exception 'invalid edit accepted';
exception when check_violation then null; end;
if not exists(select 1 from public.listings where id=x and title='Edited room' and price_cents=62000) then raise exception 'parent edit not rolled back'; end if;
m := public.save_student_listing(null,'marketplace','Free desk','Test','Berlin',0,'room',false,false,'fair');
if not exists(select 1 from public.marketplace_details where listing_id=m and item_condition='fair') then raise exception 'marketplace creation failed'; end if;
perform public.save_student_listing(m,'marketplace','Updated desk','Test','Berlin',3500,'room',false,false,'like_new');
if not exists(select 1 from public.marketplace_details where listing_id=m and item_condition='like_new') then raise exception 'marketplace edit failed'; end if;
perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
begin
perform public.save_student_listing(x,'housing','Hijacked room','Test','Berlin',1,'room',true,true,'good');
raise exception 'cross-user edit accepted';
exception when insufficient_privilege then null; end;
begin
perform public.save_student_listing(m,'marketplace','Hijacked desk','Test','Berlin',1,'room',false,false,'good');
raise exception 'cross-user marketplace edit accepted';
exception when insufficient_privilege then null; end;
update public.listings set status='closed' where id=x;
if found then raise exception 'cross-user archive accepted'; end if;
perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
update public.listings set status='closed' where id=x;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
if exists(select 1 from public.listings where id=current_setting('test.listing_id')::uuid) then raise exception 'archived listing leaked'; end if;
if exists(select 1 from public.housing_details where listing_id=current_setting('test.listing_id')::uuid) then raise exception 'archived details leaked'; end if;
if not exists(select 1 from public.listings where title='Updated desk' and price_cents=3500) then raise exception 'public marketplace missing'; end if;
if has_function_privilege('anon','public.save_student_listing(uuid,public.listing_kind,text,text,text,integer,text,boolean,boolean,public.marketplace_condition)','EXECUTE') then raise exception 'anon execute allowed'; end if;
end $$;
rollback;
