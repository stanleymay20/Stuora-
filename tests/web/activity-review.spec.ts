import { expect, test } from '@playwright/test';
import { asStudent, backend } from './account-fixtures';

// Stuora moderators approve or reject student Jobs, Trips and Events before
// publication. The server enforces it; this checks the moderator screen sends
// exactly one reviewed decision with a reason, and students never see it.
const pending = [{
  id: 'job-1', kind: 'job', title: 'Barista shifts', description: 'Weekend shifts near campus', city: 'Berlin',
  owner_id: 'student-a', created_at: '2026-11-24T09:00:00Z',
  details: { company_name: 'Campus Café', compensation_text: '€14/hour', workplace_mode: 'onsite' },
}, {
  id: 'trip-1', kind: 'trip', title: 'Potsdam day trip', description: '', city: 'Berlin',
  owner_id: 'student-b', created_at: '2026-11-24T10:00:00Z',
  details: { destination: 'Potsdam', starts_at: '2099-01-01T12:00:00Z', capacity: 8 },
}];

test('a staff moderator reviews pending Jobs, Trips and Events with a required reason', async ({ page }) => {
  await asStudent(page, 'moderator@stuora-staff.example');
  await backend(page);
  const decisions: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/am_i_moderator', route => route.fulfill({ json: true }));
  await page.route('**/rest/v1/rpc/moderation_queue', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/list_pending_student_activities', route => route.fulfill({ json: pending }));
  await page.route('**/rest/v1/rpc/review_student_activity', route => {
    decisions.push(route.request().postDataJSON());
    return route.fulfill({ status: 204, body: '' });
  });
  await page.goto('/');
  await page.getByText('You', { exact: true }).click();
  const queue = page.getByTestId('activity-review-queue');
  await expect(queue).toBeVisible();
  await expect(queue.getByText('Barista shifts')).toBeVisible();
  await expect(queue.getByText('Company: Campus Café')).toBeVisible();
  await expect(queue.getByText('Destination: Potsdam')).toBeVisible();

  // No reason, no decision.
  await page.getByRole('button', { name: 'Approve Barista shifts' }).click();
  await expect(queue.getByText('Write a reason of at least 10 characters. The student will see it.')).toBeVisible();
  expect(decisions).toEqual([]);

  await page.getByLabel('Reason for decision on Barista shifts').fill('Cannot confirm the employer.');
  await page.getByRole('button', { name: 'Reject Barista shifts' }).click();
  await expect(queue.getByText('Rejected. The student has been told why.')).toBeVisible();
  await expect(queue.getByText('Barista shifts')).toHaveCount(0);
  await page.getByLabel('Reason for decision on Potsdam day trip').fill('Organiser and dates checked.');
  await page.getByRole('button', { name: 'Approve Potsdam day trip' }).click();
  await expect(queue.getByText('Approved. It is now visible to students.')).toBeVisible();
  expect(decisions).toEqual([
    { p_listing: 'job-1', p_decision: 'reject', p_reason: 'Cannot confirm the employer.' },
    { p_listing: 'trip-1', p_decision: 'approve', p_reason: 'Organiser and dates checked.' },
  ]);
  await expect(queue.getByText('Nothing is awaiting review.')).toBeVisible();
});

test('students never see the activity review queue or load pending submissions', async ({ page }) => {
  await asStudent(page);
  await backend(page);
  let queueReads = 0;
  await page.route('**/rest/v1/rpc/list_pending_student_activities', route => { queueReads++; return route.fulfill({ json: [] }); });
  await page.goto('/');
  await page.getByText('You', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByTestId('activity-review-queue')).toHaveCount(0);
  expect(queueReads).toBe(0);
});

test('a double tap sends one moderator decision, not two', async ({ page }) => {
  await asStudent(page, 'moderator@stuora-staff.example');
  await backend(page);
  let calls = 0;
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rest/v1/rpc/am_i_moderator', route => route.fulfill({ json: true }));
  await page.route('**/rest/v1/rpc/moderation_queue', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/list_pending_student_activities', route => route.fulfill({ json: [pending[0]] }));
  await page.route('**/rest/v1/rpc/review_student_activity', async route => {
    calls++;
    await held;
    return route.fulfill({ status: 204, body: '' });
  });
  await page.goto('/');
  await page.getByText('You', { exact: true }).click();
  await page.getByLabel('Reason for decision on Barista shifts').fill('Employer details confirmed.');
  const approve = page.getByRole('button', { name: 'Approve Barista shifts' });
  await approve.click();
  await approve.click({ force: true });
  await page.getByRole('button', { name: 'Reject Barista shifts' }).click({ force: true });
  release();
  await expect(page.getByText('Approved. It is now visible to students.')).toBeVisible();
  expect(calls).toBe(1);
});
