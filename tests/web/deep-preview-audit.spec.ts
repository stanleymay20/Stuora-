import { expect, test, type Page } from '@playwright/test';
import { account, backend, signin, session } from './account-fixtures';
const a='00000000-0000-0000-0000-000000000001';
const b='00000000-0000-0000-0000-000000000002';
const x='00000000-0000-0000-0000-000000000201';
const y='00000000-0000-0000-0000-000000000202';
const chats=[{id:x,title:'Listing: First recipient',created_at:'2026-11-01T10:00:00Z'},{id:y,title:'Listing: Second recipient',created_at:'2026-11-01T09:00:00Z'}];
async function setup(page:Page){
 await backend(page);
 await page.route('**/rest/v1/profiles?**',r=>r.fulfill({json:{id:a,display_name:'QA student',city:'Berlin',bio:'',is_discoverable:false,student_status:'unverified',account_kind:'student'}}));
 await page.route('**/rest/v1/conversations?**',r=>r.fulfill({json:chats}));
}
async function inbox(page:Page){await account(page);await signin(page);await expect(page.getByText('Your Stuora Passport',{exact:true})).toBeVisible();await page.getByText('Messages',{exact:true}).first().click();await expect(page.getByRole('button',{name:'Open conversation Listing: First recipient'})).toBeVisible();}
const msg=(n:number,conversation=x,body=`QA history ${n}`)=>({id:`00000000-0000-0000-0000-${String(n+1000).padStart(12,'0')}`,conversation_id:conversation,sender_id:b,body,created_at:new Date(Date.UTC(2026,10,1,10,0,n)).toISOString()});

test('DEEP: switching recipient clears private unsent text',async({page})=>{
 await setup(page);await page.route('**/rest/v1/messages?**',r=>r.fulfill({json:[]}));await inbox(page);
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Private draft intended only for first recipient');
 await page.getByRole('button',{name:'Open conversation Listing: Second recipient'}).click();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('');
});

test('DEEP: failed second-thread read never displays first-thread messages',async({page})=>{
 await setup(page);await page.route('**/rest/v1/messages?**',r=>new URL(r.request().url()).searchParams.get('conversation_id')===`eq.${x}`?r.fulfill({json:[msg(1,x,'First recipient confidential history')]}):r.fulfill({status:403,json:{code:'42501',message:'Read denied'}}));await inbox(page);
 await expect(page.getByText('First recipient confidential history',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open conversation Listing: Second recipient'}).click();
 await expect(page.getByText('Could not load messages. Check your connection and retry.',{exact:true})).toBeVisible();
 await expect(page.getByText('First recipient confidential history',{exact:true})).toHaveCount(0);
});

test('DEEP: late first-thread send cannot erase second-thread draft',async({page})=>{
 await setup(page);let release!:()=>void;const hold=new Promise<void>(r=>release=r);let started!:()=>void;const requestStarted=new Promise<void>(r=>started=r);
 await page.route('**/rest/v1/messages**',async r=>{if(r.request().method()==='GET')return r.fulfill({json:[]});started();await hold;return r.fulfill({status:201,json:[]});});
 await inbox(page);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Send to first recipient');await page.getByRole('button',{name:'Send message',exact:true}).click();await requestStarted;
 await page.getByRole('button',{name:'Open conversation Listing: Second recipient'}).click();await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep this second-recipient draft');
 const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/rest/v1/messages'));release();await response;await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep this second-recipient draft');
});

test('DEEP: latest message remains reachable after 200-message history',async({page})=>{
 await setup(page);const history=Array.from({length:201},(_,i)=>msg(i+1));await page.route('**/rest/v1/messages?**',r=>{const u=new URL(r.request().url());let rows=[...history];if(u.searchParams.get('order')?.includes('created_at.desc'))rows.reverse();return r.fulfill({json:rows.slice(Number(u.searchParams.get('offset')||0),Number(u.searchParams.get('offset')||0)+Number(u.searchParams.get('limit')||100))});});await inbox(page);
 await expect(page.getByText('QA history 201',{exact:true})).toBeVisible();
});

test('DEEP: Message owner opens requested listing conversation, not an older one',async({page})=>{
 await setup(page);const listing='00000000-0000-0000-0000-000000000301';let fetched:string|null=null;
 await page.route('**/rest/v1/listings?**',r=>r.fulfill({json:[{id:listing,owner_id:b,kind:'housing',status:'active',title:'Requested QA room',description:'QA',city:'Berlin',price_cents:10000,currency:'EUR',created_at:'2026-11-01T10:00:00Z',housing_details:{listing_id:listing,housing_type:'room',rent_cents:10000,furnished:false,bills_included:false},marketplace_details:null,listing_media:[]}]}));
 await page.route('**/rest/v1/rpc/start_listing_conversation',r=>r.fulfill({json:y}));
 await page.route('**/rest/v1/messages?**',r=>{fetched=new URL(r.request().url()).searchParams.get('conversation_id');return r.fulfill({json:[]});});
 await account(page);await signin(page);await expect(page.getByText('Your Stuora Passport',{exact:true})).toBeVisible();await page.getByText('Home',{exact:true}).first().click();await page.getByRole('button',{name:'View Requested QA room'}).first().click();await page.getByRole('button',{name:'Message owner',exact:true}).click();
 await expect.poll(()=>fetched).toBe(`eq.${y}`);
});


test('DEEP: recovery callback immediately shows new-password screen',async({page})=>{
 await backend(page);const recovered=session();const hash=new URLSearchParams({access_token:recovered.access_token,refresh_token:recovered.refresh_token,expires_in:String(recovered.expires_in),token_type:recovered.token_type,type:'recovery'});
 await page.goto('/#'+hash.toString());
 await expect(page.getByText('Choose a new password',{exact:true})).toBeVisible();
 await expect(page.getByText('Home',{exact:true})).toHaveCount(0);
});
