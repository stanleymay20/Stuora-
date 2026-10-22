import { expect, test, type Page } from '@playwright/test';
import { account, backend, session, signin } from './account-fixtures';

const alice = '00000000-0000-0000-0000-000000000001';
const bob = '00000000-0000-0000-0000-000000000002';
const conversationId = '00000000-0000-0000-0000-000000000201';
const bobMessage = '00000000-0000-0000-0000-000000000301';

async function safetyBackend(page: Page, closed: boolean) {
  const calls: { path: string; body: unknown }[] = [];
  const profile = { id: alice, display_name: 'Alice', city: 'Berlin', bio: '', is_discoverable: false, discoverable_consented_at: null, student_status: 'unverified', account_kind: 'student', avatar_path: null, created_at: '2026-10-11T10:00:00Z', updated_at: '2026-10-11T10:00:00Z' };
  let blocked = false;
  await page.route('https://stuora-test.invalid/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (path.endsWith('/token')) return route.fulfill({ json: session() });
    if (path.endsWith('/profiles')) return route.fulfill({ json: profile, contentType: 'application/vnd.pgrst.object+json' });
    if (path.endsWith('/listings') || path.endsWith('/student_benefits') || path.endsWith('/moderation_notices')) return route.fulfill({ json: [] });
    if (path.endsWith('/rpc/am_i_moderator')) return route.fulfill({ json: false });
    if (path.endsWith('/conversations')) return route.fulfill({ json: [{ id: conversationId, title: 'Listing: Lamp', created_at: '2026-10-11T10:00:00Z' }] });
    if (path.endsWith('/messages') && req.method() === 'GET') {
      return route.fulfill({ json: [{ id: bobMessage, conversation_id: conversationId, sender_id: bob, body: 'Pay the deposit by gift card', created_at: '2026-10-11T10:01:00Z' }] });
    }
    if (path.endsWith('/rpc/conversation_safety_state')) {
      expect(req.postDataJSON()).toEqual({ p_conversation: conversationId });
      return route.fulfill({ json: { closed, blocked_by_me: blocked, other_member_left: false } });
    }
    if (path.endsWith('/rpc/set_conversation_block') || path.endsWith('/rpc/report_content')) {
      calls.push({ path: path.split('/').pop()!, body: req.postDataJSON() });
      if (path.endsWith('/rpc/set_conversation_block')) { blocked = req.postDataJSON().p_block; return route.fulfill({ status: 204 }); }
      return route.fulfill({ json: '00000000-0000-0000-0000-000000000901' });
    }
    return route.fulfill({ status: 404, json: { message: `Unexpected endpoint in test: ${req.method()} ${path}` } });
  });
  return { calls: () => calls };
}

async function openMessages(page: Page) {
  await account(page);
  await signin(page);
  await expect(page.getByText('Your Stuora Passport', { exact: true })).toBeVisible();
  await page.goto('/?stuora=messages');
  await expect(page.getByText('Pay the deposit by gift card')).toBeVisible();
}

test('a student can report a message and block the other person without seeing their id', async ({ page }) => {
  const api = await safetyBackend(page, false);
  await openMessages(page);
  await page.getByRole('button', { name: 'Report this message' }).click();
  await page.getByRole('radio', { name: 'Scam or fraud' }).click();
  await page.getByLabel('Optional details for moderators').fill('Asked for a gift card deposit');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText(/A Stuora moderator will review this/)).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Block this person' }).click();
  await expect(page.getByText(/You blocked this person/)).toBeVisible();
  expect(api.calls()).toEqual([
    { path: 'report_content', body: { p_target_kind: 'message', p_target_id: bobMessage, p_reason: 'fraud', p_details: 'Asked for a gift card deposit' } },
    { path: 'set_conversation_block', body: { p_conversation: conversationId, p_block: true } },
  ]);
  expect(JSON.stringify(api.calls())).not.toContain(bob);
});

test('an archived listing shows its conversation as closed and disables sending', async ({ page }) => {
  await safetyBackend(page, true);
  await openMessages(page);
  await expect(page.getByTestId('conversation-closed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
});

test('legal pages are routable, linked from the app and flag missing operator details', async ({ page }) => {
  await backend(page);
  for (const [route, title] of [['privacy', 'Privacy notice'], ['terms', 'Terms of use'], ['imprint', 'Imprint'], ['safety', 'Safety and reporting']] as const) {
    await page.goto(`/?stuora=${route}`);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText(/Draft for review: operator details are not complete/)).toBeVisible();
  }
  await page.getByRole('link', { name: 'Privacy notice' }).click();
  await expect(page).toHaveURL(/stuora=privacy/);
  await expect(page.getByText(/Photos are re-encoded on our server/)).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Imprint' }).first()).toBeVisible();
});

test('inherited object keys in the route parameter do not crash the app', async ({ page }) => {
  await backend(page);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const route of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    await page.goto(`/?stuora=${route}`);
    await expect(page.getByText('Browse by category', { exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('the city picker rejects phrases that are not cities', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose student city' }).first().click();
  await page.getByLabel('Student city name').fill('near campus');
  await page.getByRole('button', { name: 'Save student city' }).click();
  await expect(page.getByText(/Enter a real city name/)).toBeVisible();
  await page.getByLabel('Student city name').fill('Halle (Saale)');
  await page.getByRole('button', { name: 'Save student city' }).click();
  await expect(page.getByRole('button', { name: 'Choose student city' }).first()).toContainText('Halle (Saale)');
});
