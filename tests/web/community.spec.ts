import { expect, test, type Page } from '@playwright/test';
import { account, session, signin } from './account-fixtures';
const alice = session().user.id, bob = '00000000-0000-0000-0000-000000000002';
type RecordRow = Record<string, any>;
function communityApi() {
  const rows: RecordRow[] = [], memberships = new Map<string, Set<string>>(), applications: RecordRow[] = [], requests = new Map<string, RecordRow>(), blocks = new Set<string>(), reports: RecordRow[] = [];
  let sequence=1, fail='';
  return {rows,applications,requests,blocks,reports, failure:(endpoint:string)=>{fail=endpoint;},
    install: async(page:Page, user=alice, employer=false) => {
      await page.route('https://stuora-test.invalid/**',async route=>{
        const req=route.request(), url=new URL(req.url()), endpoint=url.pathname.split('/').at(-1)!;
        if(fail===endpoint) { fail=''; return route.fulfill({status:403,json:{message:'Controlled test failure',code:'42501'}}); }
        if(endpoint==='token') { const value=session();value.user.id=user;return route.fulfill({json:value}); }
        if(endpoint==='logout') return route.fulfill({status:204});
        if(endpoint==='profiles') return route.fulfill({json:{id:user,display_name:'Test student',city:'Berlin',bio:'',student_status:'unverified',account_kind:employer?'employer':'student',is_discoverable:true},contentType:'application/vnd.pgrst.object+json'});
        if(endpoint==='publisher_requests') {
          if(req.method()==='POST') { const value=req.postDataJSON();expect(value).not.toHaveProperty('status');requests.set(user,{...value,status:'pending'});return route.fulfill({status:201}); }
          return route.fulfill({json:requests.get(user)??null,contentType:'application/vnd.pgrst.object+json'});
        }
        if(endpoint==='user_blocks') {
          const other=url.searchParams.get('blocked_id')?.replace('eq.','')??req.postDataJSON()?.blocked_id;
          if(req.method()==='POST') {expect(req.postDataJSON().blocker_id).toBe(user);blocks.add(`${user}:${other}`);return route.fulfill({json:[{blocked_id:other}]});}
          if(req.method()==='DELETE') {blocks.delete(`${user}:${other}`);return route.fulfill({json:[{blocked_id:other}]});}
          return route.fulfill({json:blocks.has(`${user}:${other}`)?{blocked_id:other}:null,contentType:'application/vnd.pgrst.object+json'});
        }
        if(endpoint==='reports') { reports.push(req.postDataJSON());return route.fulfill({status:201}); }
        if(endpoint==='save_community_listing') {
          const p=req.postDataJSON(); expect(p).not.toHaveProperty('owner_id');expect(p).not.toHaveProperty('account_kind');
          if(p.p_kind==='job' && !employer) return route.fulfill({status:403,json:{code:'42501',message:'Approved publisher required'}});
          const id=p.p_id??`00000000-0000-0000-0001-${String(sequence++).padStart(12,'0')}`;
          const previous=rows.find(r=>r.id===id);
          const value={id,owner_id:user,kind:p.p_kind,status:'active',title:p.p_title,description:p.p_description,city:p.p_city,price_cents:p.p_price_cents,created_at:'2026-10-12T10:00:00Z',listing_media:previous?.listing_media??[],housing_details:null,marketplace_details:null,trip_details:p.p_kind==='trip'?p.p_details:null,event_details:p.p_kind==='event'?p.p_details:null,job_details:p.p_kind==='job'?p.p_details:null};
          if(previous) Object.assign(previous,value);else rows.push(value);return route.fulfill({json:id});
        }
        if(endpoint==='listings') {
          const id=url.searchParams.get('id')?.replace('eq.','');
          if(req.method()==='PATCH') {expect(url.searchParams.get('owner_id')).toBe(`eq.${user}`);const row=rows.find(r=>r.id===id)!;row.status='closed';return route.fulfill({json:{id},contentType:'application/vnd.pgrst.object+json'});}
          if(id) return route.fulfill({json:rows.find(r=>r.id===id),contentType:'application/vnd.pgrst.object+json'});
          return route.fulfill({json:rows.filter(r=>`eq.${r.kind}`===url.searchParams.get('kind') && (!url.searchParams.has('status')||r.status==='active') && (!url.searchParams.has('owner_id')||r.owner_id===user))});
        }
        if(endpoint==='listing_participation') {
          const p=req.postDataJSON(), row=rows.find(r=>r.id===p.p_listing_id)!;
          let members=memberships.get(row.id);if(!members) {members=new Set();memberships.set(row.id,members);}
          if(p.p_action==='join') members.add(user);if(p.p_action==='leave') members.delete(user);
          let app=applications.find(a=>a.job_listing_id===row.id&&a.applicant_id===user);
          if(p.p_action==='apply'&&!app) { app={id:'application-1',job_listing_id:row.id,applicant_id:user,cover_note:p.p_note,status:'submitted',withdrawn_at:null,created_at:'2026-10-12T12:00:00Z'};applications.push(app); }
          if(p.p_action==='withdraw'&&app) app.withdrawn_at='2026-10-12T12:01:00Z';
          const detail=row.trip_details??row.event_details;
          return route.fulfill({json:{count:row.kind==='job'?null:members.size,capacity:detail?.capacity,joined:members.has(user),applied:!!app,withdrawn:!!app?.withdrawn_at,application_status:app?.status??null}});
        }
        if(endpoint==='job_applications') return route.fulfill({json:applications.filter(a=>`eq.${a.job_listing_id}`===url.searchParams.get('job_listing_id'))});
        if(endpoint==='review_job_application') {const p=req.postDataJSON();applications.find(a=>a.id===p.p_application_id)!.status=p.p_status;return route.fulfill({json:null});}
        return route.fulfill({status:404,json:{message:`Unexpected endpoint ${endpoint}`}});
      });
    }
  };
}
async function browse(page:Page,category:string) {
  if(await page.getByText('Explore',{exact:true}).count()) await page.getByText('Explore',{exact:true}).click();
  else await page.getByText(category,{exact:true}).first().click();
  await page.getByRole('button',{name:`Browse ${category}`,exact:true}).click();
}
async function create(page:Page, category:string) {
  await page.getByRole('button',{name:'Create listing',exact:true}).click();await page.getByRole('button',{name:`Post ${category}`,exact:true}).click();
  await page.getByLabel('Listing title').fill(`${category} persisted`);await page.getByLabel('Listing description').fill('A community record saved and reloadable');
  if(category==='Trips'||category==='Events') {await page.getByLabel('Price (EUR)').fill('0');await page.getByLabel(category==='Trips'?'Destination':'Venue',{exact:true}).fill('Potsdam student hall');await page.getByLabel('Start date and time',{exact:true}).fill('2027-11-20 18:00');await page.getByLabel('Capacity',{exact:true}).fill('10');}
  if(category==='Jobs') {await page.getByLabel('Company name',{exact:true}).fill('Reviewed employer');await page.getByLabel('Compensation',{exact:true}).fill('EUR 20 per hour');}
}
for(const category of ['Posts','Trips','Events','Jobs']) test(`${category}: publish, discover in another client, reload, edit and archive`,async({page,browser})=>{
  const api=communityApi();await api.install(page,alice,category==='Jobs');await account(page);await signin(page);await expect(page.getByText('Your Stuora Passport',{exact:true})).toBeVisible();
  await create(page,category);api.failure('save_community_listing');await page.getByRole('button',{name:'Publish listing',exact:true}).click();await expect(page.getByText('Could not save. Your input is preserved. Check your connection and account, then retry.')).toBeVisible();await expect(page.getByLabel('Listing title')).toHaveValue(`${category} persisted`);
  await page.getByRole('button',{name:'Publish listing',exact:true}).click();await expect(page.getByText('Listing saved. Add up to six real photos below.')).toBeVisible();expect(api.rows).toHaveLength(1);
  const ctx=await browser.newContext();const other=await ctx.newPage();await api.install(other,bob);await account(other);await signin(other);await browse(other,category);await other.getByRole('button',{name:`View ${category} persisted`,exact:true}).click();await expect(other.getByText('A community record saved and reloadable')).toBeVisible();await expect(other.getByRole('button',{name:'Edit listing',exact:true})).toHaveCount(0);
  if(category==='Trips'||category==='Events') {const action=category==='Trips'?'Join trip':'Attend event';api.failure('listing_participation');await other.getByRole('button',{name:action,exact:true}).click();await expect(other.getByText(/Could not complete this action/)).toBeVisible();await other.getByRole('button',{name:action,exact:true}).click();await expect(other.getByText('Participation confirmed. No payment has been taken.')).toBeVisible();await other.reload();await browse(other,category);await other.getByRole('button',{name:`View ${category} persisted`,exact:true}).click();await expect(other.getByRole('button',{name:'Leave participation',exact:true})).toBeVisible();await other.getByRole('button',{name:'Leave participation',exact:true}).click();await expect(other.getByText('Participation cancelled.')).toBeVisible();}
  if(category==='Jobs') {await other.getByLabel('Cover note (optional)').fill('Student application');await other.getByRole('button',{name:'Apply for job',exact:true}).click();await expect(other.getByText('Application submitted to the publisher.')).toBeVisible();expect(api.applications).toHaveLength(1);await page.getByRole('button',{name:'Create another listing',exact:true}).click();await browse(page,'Jobs');await page.getByRole('button',{name:'View Jobs persisted',exact:true}).click();await page.getByRole('button',{name:'Mark reviewing',exact:true}).click();await expect(page.getByText('Application status saved.')).toBeVisible();await other.reload();await browse(other,'Jobs');await other.getByRole('button',{name:'View Jobs persisted',exact:true}).click();await expect(other.getByText('Application: reviewing')).toBeVisible();await other.getByRole('button',{name:'Withdraw application',exact:true}).click();await expect(other.getByText('Application withdrawn.')).toBeVisible();}
  if(category==='Posts') {await other.getByRole('button',{name:'Block author',exact:true}).click();await expect(other.getByRole('button',{name:'Unblock author',exact:true})).toBeVisible();await expect(other.getByRole('button',{name:'Message owner',exact:true})).toBeDisabled();await other.getByRole('button',{name:'Unblock author',exact:true}).click();await other.getByRole('button',{name:'Report listing',exact:true}).click();await other.getByRole('button',{name:'Report reason harassment',exact:true}).click();await other.getByLabel('Report details').fill('Please review this post');await other.getByRole('button',{name:'Submit report',exact:true}).click();await expect(other.getByText('Report submitted for review. This does not automatically remove the listing.')).toBeVisible();expect(api.reports[0].reason).toBe('harassment');}
  await page.reload();await browse(page,category);await page.getByRole('button',{name:`View ${category} persisted`,exact:true}).click();await page.getByRole('button',{name:'Edit listing',exact:true}).click();await page.getByLabel('Listing title').fill(`${category} edited`);await page.getByRole('button',{name:'Save listing changes',exact:true}).click();await expect(page.getByText(`${category} edited`,{exact:true})).toBeVisible();await page.getByRole('button',{name:'Archive listing',exact:true}).click();await page.getByRole('button',{name:'Confirm archive',exact:true}).click();await expect(page.getByText('Listing archived. It is no longer publicly discoverable.')).toBeVisible();await other.reload();await browse(other,category);await expect(other.getByText(`No ${category.toLowerCase()} listings found.`)).toBeVisible();await ctx.close();
});
test('student requests publisher access without self-approving or publishing jobs',async({page})=>{
 const api=communityApi();await api.install(page);await account(page);await signin(page);await page.getByRole('button',{name:'Create listing',exact:true}).click();await page.getByRole('button',{name:'Post Jobs',exact:true}).click();await expect(page.getByRole('button',{name:'Publish listing',exact:true})).toHaveCount(0);await page.getByLabel('Company name').fill('Student organization');await page.getByLabel('About your organization').fill('We request business publishing access');await page.getByRole('button',{name:'Request publisher access',exact:true}).click();await expect(page.getByText('Publisher request submitted. Publishing requires a human review.')).toBeVisible();await page.reload();await page.getByRole('button',{name:'Create listing',exact:true}).click();await page.getByRole('button',{name:'Post Jobs',exact:true}).click();await expect(page.getByText(/Publisher request: pending/)).toBeVisible();expect(api.rows).toHaveLength(0);
});
