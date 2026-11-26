import { expect, test, type Page } from '@playwright/test';
import { asStudent, backend } from './account-fixtures';

// These two tests intentionally fire two clicks in ONE JavaScript task.
// Sequential Playwright click() calls wait for React to rerender and cannot
// catch the same-tick double-submit race caused by a state-only busy flag.
const item = {
  id: 'event-double-click', kind: 'event', title: 'Career Q&A',
  description: 'On campus', city: 'Berlin', owner_id: 'student-owner',
  created_at: '2026-11-24T10:00:00Z',
  details: { venue_name: 'Student centre' },
};
const report = {
  id: 'report-double-click', created_at: '2026-11-24T10:00:00Z',
  reason: 'spam', details: 'Duplicated posting',
  status: 'open', target_kind: 'listing', listing_id: 'listing-1',
  group_message_id: null, message_id: null, reported_user_id: null,
  content_snapshot: 'Spam listing', prior_reports: 0,
  decision: null, decision_reason: null, decided_at: null,
};

async function startModerator(page: Page) {
  await asStudent(page, 'moderator@stuora-staff.example');
  await backend(page);
  await page.route('**/rest/v1/rpc/am_i_moderator', route => route.fulfill({ json: true }));
}

test('activity review: two synchronous presses submit only one decision', async ({ page }) => {
  await startModerator(page);
  await page.route('**/rest/v1/rpc/moderation_queue', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/list_pending_student_activities', route => route.fulfill({ json: [item] }));
  let calls = 0;
  let unblock = () => {};
  const held = new Promise<void>(resolve => { unblock = resolve; });
  await page.route('**/rest/v1/rpc/review_student_activity', async route => {
    calls++;
    await held;
    return route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/');
  await page.getByText('You', { exact: true }).click();
  await expect(page.getByTestId('activity-review-queue')).toBeVisible();
  await page.getByLabel('Reason for decision on Career Q&A').fill('Organiser and venue independently confirmed.');
  await page.getByRole('button', { name: 'Approve Career Q&A' }).evaluate(element => {
    (element as HTMLElement).click();
    (element as HTMLElement).click();
  });
  await expect.poll(() => calls).toBe(1);
  unblock();
  await expect(page.getByText('Approved. It is now visible to students.')).toBeVisible();
  expect(calls).toBe(1);
});

test('report moderation: synchronous double-click is atomic and a failed request unlocks retry', async ({ page }) => {
  await startModerator(page);
  await page.route('**/rest/v1/rpc/list_pending_student_activities', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/moderation_queue', route => route.fulfill({ json: [report] }));
  let calls = 0;
  let unblock = () => {};
  const held = new Promise<void>(resolve => { unblock = resolve; });
  await page.route('**/rest/v1/rpc/moderate_report', async route => {
    calls++;
    if (calls === 1) {
      await held;
      return route.fulfill({ status: 400, json: { message: 'Temporary moderation error', code: '400' } });
    }
    return route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/');
  await page.getByText('You', { exact: true }).click();
  const queue = page.getByTestId('moderation-queue');
  await expect(queue).toBeVisible();
  await queue.getByLabel('Reason for decision').fill('Reviewed evidence and confirmed no policy violation.');
  const dismiss = queue.getByRole('button', { name: 'Dismiss' });
  await dismiss.evaluate(element => {
    (element as HTMLElement).click();
    (element as HTMLElement).click();
  });
  await expect.poll(() => calls).toBe(1);
  unblock();
  await expect(queue.getByText('Temporary moderation error')).toBeVisible();
  await dismiss.click();
  await expect(queue.getByText('Dismiss recorded.')).toBeVisible();
  expect(calls).toBe(2);
});
