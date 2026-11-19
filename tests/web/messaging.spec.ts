import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const alice = '00000000-0000-0000-0000-000000000001';
const bob = '00000000-0000-0000-0000-000000000002';
const listingId = '00000000-0000-0000-0000-000000000101';
const conversationId = '00000000-0000-0000-0000-000000000201';

function authSession() {
  const now = Math.floor(Date.now() / 1000);
  const user = { id: alice, email: 'alice@example.invalid', aud: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString() };
  const jwt = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: alice, exp: now + 3600, iat: now, role: 'authenticated' })).toString('base64url'), 'test-signature'].join('.');
  return { access_token: jwt, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user };
}

type Safety = { blocks: Array<Record<string, string>>; reports: Array<Record<string, unknown>>; rateLimited: boolean };
async function messagingBackend(page: Page, safety: Safety = { blocks: [], reports: [], rateLimited: false }) {
  let started = false;
  const messages: Array<Record<string, string>> = [];
  const profile = { id: alice, display_name: 'Alice', city: 'Berlin', bio: 'Student', is_discoverable: true, student_status: 'unverified', account_kind: 'student', avatar_path: null, created_at: '2026-10-11T10:00:00Z', updated_at: '2026-10-11T10:00:00Z' };
  const listing = {
    id: listingId,
    owner_id: bob,
    kind: 'housing',
    status: 'active',
    title: 'Room near campus',
    description: 'Quiet furnished room.',
    city: 'Berlin',
    price_cents: 62000,
    currency: 'EUR',
    created_at: '2026-10-11T10:00:00Z',
    updated_at: '2026-10-11T10:00:00Z',
    housing_details: { listing_id: listingId, housing_type: 'room', rent_cents: 62000, deposit_cents: null, available_from: null, available_until: null, furnished: true, bills_included: true, room_size_sqm: null },
    marketplace_details: null,
  };
  await page.route('https://stuora-test.invalid/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/token')) return route.fulfill({ json: authSession() });
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    if (url.pathname.endsWith('/profiles') && request.method() === 'GET') return route.fulfill({ json: profile, contentType: 'application/vnd.pgrst.object+json' });
    if (url.pathname.endsWith('/student_benefits') && request.method() === 'GET') return route.fulfill({ json: [] });
    if (url.pathname.endsWith('/listings') && request.method() === 'GET') return route.fulfill({ json: [listing] });
    if (url.pathname.endsWith('/rpc/start_listing_conversation') && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({ p_listing_id: listingId });
      started = true;
      return route.fulfill({ json: conversationId });
    }
    if (url.pathname.endsWith('/conversations') && request.method() === 'GET') {
      return route.fulfill({ json: started ? [{ id: conversationId, title: 'Listing: Room near campus', created_at: '2026-10-11T10:00:00Z' }] : [] });
    }
    if (url.pathname.endsWith('/messages') && request.method() === 'GET') return route.fulfill({ json: messages });
    if (url.pathname.endsWith('/conversation_members') && request.method() === 'GET') {
      expect(url.searchParams.get('conversation_id')).toBe(`eq.${conversationId}`);
      expect(url.searchParams.get('user_id')).toBe(`neq.${alice}`);
      return route.fulfill({ json: [{ user_id: bob }] });
    }
    if (url.pathname.endsWith('/user_blocks')) {
      if (request.method() === 'GET') return route.fulfill({ json: safety.blocks.filter(row => `eq.${row.blocked_id}` === url.searchParams.get('blocked_id')) });
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        expect(body).toEqual({ blocker_id: alice, blocked_id: bob });
        safety.blocks.push(body);
        return route.fulfill({ status: 201, json: [] });
      }
      if (request.method() === 'DELETE') {
        expect(url.searchParams.get('blocker_id')).toBe(`eq.${alice}`);
        safety.blocks.length = 0;
        return route.fulfill({ status: 204 });
      }
    }
    if (url.pathname.endsWith('/reports') && request.method() === 'POST') {
      safety.reports.push(request.postDataJSON());
      return route.fulfill({ status: 201, json: [] });
    }
    if (url.pathname.endsWith('/messages') && request.method() === 'POST') {
      if (safety.rateLimited) return route.fulfill({ status: 429, json: { code: 'PT429', message: 'You are sending messages too quickly. Please wait and retry.' } });
      const body = request.postDataJSON();
      expect(body.conversation_id).toBe(conversationId);
      expect(body.sender_id).toBe(alice);
      messages.push({ id: `00000000-0000-0000-0000-${String(messages.length + 301).padStart(12, '0')}`, conversation_id: conversationId, sender_id: alice, body: body.body, created_at: '2026-10-11T10:01:00Z' });
      return route.fulfill({ status: 201, json: [] });
    }
    return route.fulfill({ status: 404, json: { message: `Unexpected test endpoint: ${request.method()} ${url.pathname}` } });
  });
}

test('signed-in student can start and persist a listing conversation', async ({ page }) => {
  await messagingBackend(page);
  await page.goto('/');
  await page.getByText('You', { exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('alice@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('correct-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Your Stuora Passport', { exact: true })).toBeVisible();

  await page.getByText('Home', { exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'View Room near campus' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'View Room near campus' }).first().click();
  await expect(page.getByRole('button', { name: 'Message owner' })).toBeVisible();
  await page.getByRole('button', { name: 'Message owner' }).click();

  await expect(page.getByText('Listing: Room near campus', { exact: true }).first()).toBeVisible();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Hi, is this room still available?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Hi, is this room still available?', { exact: true })).toBeVisible();
  await messagesPersisted(page);
});

async function messagesPersisted(page: Page) {
  await page.getByRole('button', { name: 'Refresh messages', exact: true }).click();
  await expect(page.getByText('Hi, is this room still available?', { exact: true })).toBeVisible();
}

async function openConversation(page: Page) {
  await page.goto('/');
  await page.getByText('You', { exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('alice@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('correct-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Your Stuora Passport', { exact: true })).toBeVisible();
  await page.getByText('Home', { exact: true }).first().click();
  await page.getByRole('button', { name: 'View Room near campus' }).first().click();
  await page.getByRole('button', { name: 'Message owner' }).click();
  await expect(page.getByText('Listing: Room near campus', { exact: true }).first()).toBeVisible();
}

test('a student can block and unblock the other person in a conversation', async ({ page }) => {
  const safety: Safety = { blocks: [], reports: [], rateLimited: false };
  await messagingBackend(page, safety);
  await openConversation(page);
  await page.getByRole('button', { name: 'Block person', exact: true }).click();
  await expect(page.getByText('Blocked. Neither of you can send messages here or start new conversations with each other.')).toBeVisible();
  expect(safety.blocks).toEqual([{ blocker_id: alice, blocked_id: bob }]);
  await expect(page.getByText('You blocked this person. Unblock them to send messages.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveCount(0);

  // The block persists across a refresh.
  await page.getByRole('button', { name: 'Refresh messages', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unblock person', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Unblock person', exact: true }).click();
  await expect(page.getByText('Unblocked. You can message each other again.')).toBeVisible();
  expect(safety.blocks).toEqual([]);
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
});

test('a student can report a conversation with a reason', async ({ page }) => {
  const safety: Safety = { blocks: [], reports: [], rateLimited: false };
  await messagingBackend(page, safety);
  await openConversation(page);
  await page.getByRole('button', { name: 'Report conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Report reason Harassment', exact: true }).click();
  await expect(page.getByText('Report sent. Stuora reviews reported conversations. You can also block this person.')).toBeVisible();
  expect(safety.reports).toEqual([{ reporter_id: alice, conversation_id: conversationId, reported_user_id: bob, reason: 'harassment' }]);
});

test('rate-limited sends explain the limit and keep the draft', async ({ page }) => {
  const safety: Safety = { blocks: [], reports: [], rateLimited: true };
  await messagingBackend(page, safety);
  await openConversation(page);
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('One more message');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('You are sending messages too quickly. Wait a minute, then retry. Your text is preserved.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('One more message');
});
