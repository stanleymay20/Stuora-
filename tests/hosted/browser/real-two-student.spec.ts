import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { approvedPreviewFromEnvironment } from '../previewIdentity';

/**
 * Never run automatically. Requires two separately owned/verified staging accounts,
 * supplied via environment variables. No service-role credentials, no mocks, no production.
 * Nothing here signs students up or creates fake verified student identities.
 */
const approved = process.env.STUORA_STAGING_ACCEPTANCE === 'I_APPROVE_STAGING_TEST_WRITES';
const reviewedPreview = approvedPreviewFromEnvironment();
if (approved && !reviewedPreview) throw new Error('Stuora staging preview must be independently verified against checked-out exact Git SHA. No writes attempted.');
const STAGING = reviewedPreview ?? 'https://staging-approval-required.invalid';
const aEmail = process.env.STUORA_TEST_STUDENT_A_EMAIL || '';
const bEmail = process.env.STUORA_TEST_STUDENT_B_EMAIL || '';
const aPassword = process.env.STUORA_TEST_STUDENT_A_PASSWORD || '';
const bPassword = process.env.STUORA_TEST_STUDENT_B_PASSWORD || '';
const ready = approved && !!reviewedPreview && aEmail.includes('@') && bEmail.includes('@') &&
  aEmail.toLowerCase() !== bEmail.toLowerCase() && aPassword.length >= 8 && bPassword.length >= 8;
const stamp = Date.now().toString(36);
const STAGING_BACKEND_HOST = 'uptjcspizukpjcoayhtn.supabase.co';

/**
 * Fail closed if an incorrectly configured preview ever contacts a different
 * Supabase project. The guard runs BEFORE login or fixture creation and never
 * logs requests, headers, tokens, passwords, or email addresses.
 *
 * No mocked responses: allowed requests continue to the real staging backend.
 * This is a security boundary check, not a replacement for RLS tests.
 */
async function restrictToStagingBackend(context: BrowserContext) {
  let stagingRequests = 0;
  const rejectedHosts = new Set<string>();
  await context.route('**/*', async route => {
    const hostname = new URL(route.request().url()).hostname.toLowerCase();
    if (hostname.endsWith('.supabase.co')) {
      if (hostname !== STAGING_BACKEND_HOST) {
        rejectedHosts.add(hostname);
        await route.abort('blockedbyclient');
        return;
      }
      stagingRequests += 1;
    }
    await route.continue();
  });
  return () => {
    expect([...rejectedHosts], 'All Supabase browser requests must target dedicated Stuora staging').toEqual([]);
    expect(stagingRequests, 'No dedicated staging backend requests observed').toBeGreaterThan(0);
  };
}

// Image/Storage qualification is intentionally separate from the core two-student
// test while the hardened media Edge Function remains compiled write-disabled.

async function signIn(page: Page, email: string, password: string, displayName: string) {
  await page.goto(STAGING + '/?stuora=profile');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Your Stuora Passport', { exact: true })).toBeVisible();
  const name = page.getByLabel('Display name');
  if (await page.getByRole('button', { name: 'Create profile', exact: true }).isVisible().catch(() => false)) {
    await name.fill(displayName);
    // Dedicated staging fixture uses an explicit city; application never
    // supplies a fictional geographic default on behalf of real students.
    await page.getByLabel('City', { exact: true }).fill('Aachen');
    await page.getByRole('button', { name: 'Create profile', exact: true }).click();
    await expect(page.getByText('Your profile has been saved.')).toBeVisible();
  }
  // Actual authenticated persistence, not just an in-memory profile or mock.
  await expect(page.getByRole('button', { name: 'Save profile', exact: true })).toBeVisible();
  const persistedName = await name.inputValue();
  expect(persistedName.trim().length).toBeGreaterThan(1);
  await page.reload();
  await expect(page.getByText('Your Stuora Passport', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Display name')).toHaveValue(persistedName);
  await expect(page.getByRole('button', { name: 'Save profile', exact: true })).toBeVisible();
}

test('two independent staging accounts complete actual listing, messaging and group interactions', async ({ browser }) => {
  test.skip(!ready, 'Requires explicit staging-write approval and two verified staging account credentials in local environment.');
  const ownerContext = await browser.newContext();
  const studentContext = await browser.newContext();
  // Set guards on both independent browser contexts BEFORE any authenticated activity.
  const assertOwnerStaging = await restrictToStagingBackend(ownerContext);
  const assertStudentStaging = await restrictToStagingBackend(studentContext);
  const owner = await ownerContext.newPage();
  const student = await studentContext.newPage();
  const listingTitle = 'STAGING TEST Housing ' + stamp;
  const groupName = 'STAGING TEST Study Circle ' + stamp;
  const messageText = 'STAGING TEST Is the room still available? ' + stamp;
  const groupText = 'STAGING TEST Study meetup ' + stamp;
  let listingCreated = false;
  let groupCreated = false;
  const cleanupIssues: string[] = [];

  try {
    // No route interception: all HTTP calls go to the real dedicated staging backend.
    await signIn(owner, aEmail, aPassword, 'Staging Test Student A');
    await signIn(student, bEmail, bPassword, 'Staging Test Student B');
    assertOwnerStaging();
    assertStudentStaging();

    await owner.goto(STAGING + '/?stuora=create-housing');
    await owner.getByRole('button', { name: 'Post Housing', exact: true }).click();
    await owner.getByLabel('Listing title').fill(listingTitle);
    await owner.getByLabel('Listing description').fill('STAGING TEST ONLY — verify with professor; not an actual available room.');
    await owner.getByLabel('Monthly rent (EUR)').fill('615');
    await owner.getByRole('button', { name: 'Publish listing', exact: true }).click();
    await expect(owner.getByText('Listing saved. Add up to six real photos below.')).toBeVisible();
    listingCreated = true;

    // Do not exercise the current direct-to-public Storage upload path.
    // Media security requires a separate future trusted-intake cutover gate.
    await owner.goto(STAGING + '/?stuora=housing');
    await owner.getByRole('button', { name: 'My listings', exact: true }).click();
    await owner.getByRole('button', { name: 'View ' + listingTitle }).click();

    await student.goto(STAGING + '/?stuora=housing');
    await student.getByRole('button', { name: 'View ' + listingTitle, exact: true }).click();
    await expect(student.getByText('STAGING TEST ONLY — verify with professor; not an actual available room.')).toBeVisible();
    await expect(student.getByRole('button', { name: 'Remove photo 1' })).toHaveCount(0);
    await expect(student.getByRole('button', { name: 'Edit listing', exact: true })).toHaveCount(0);
    await student.reload();
    await student.getByRole('button', { name: 'View ' + listingTitle, exact: true }).click();
    await student.getByRole('button', { name: 'Message owner', exact: true }).click();
    await student.getByRole('textbox', { name: 'Message', exact: true }).fill(messageText);
    await student.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(student.getByText(messageText, { exact: true })).toBeVisible();

    await owner.goto(STAGING + '/?stuora=messages');
    await expect(owner.getByRole('button', { name: 'Refresh messages' })).toBeVisible();
    await owner.getByRole('button', { name: 'Refresh messages' }).click();
    await expect(owner.getByText(messageText, { exact: true })).toBeVisible();
    await owner.reload();
    await expect(owner.getByText(messageText, { exact: true })).toBeVisible();

    await owner.goto(STAGING + '/?stuora=groups');
    await owner.getByRole('button', { name: 'Create a group' }).click();
    await owner.getByLabel('Group name').fill(groupName);
    await owner.getByLabel('Group description').fill('STAGING TEST ONLY — real database membership exercise');
    await owner.getByLabel('Group city').fill('Berlin');
    await owner.getByRole('button', { name: 'Publish group' }).click();
    await expect(owner.getByText(groupName, { exact: true })).toBeVisible();
    groupCreated = true;

    await student.goto(STAGING + '/?stuora=groups');
    await student.getByRole('button', { name: 'Open group ' + groupName }).click();
    await expect(student.getByText('Join this group to read and post messages.')).toBeVisible();
    await expect(student.getByLabel('Message to group')).toHaveCount(0);
    await student.getByRole('button', { name: 'Join group', exact: true }).click();
    await expect(student.getByText('You joined the group.')).toBeVisible();
    await student.getByLabel('Message to group').fill(groupText);
    await student.getByRole('button', { name: 'Send group message' }).click();
    await expect(student.getByTestId('student-group-message').getByText(groupText, { exact: true })).toBeVisible();
    await student.reload();
    await expect(student.getByRole('button', { name: 'Open group ' + groupName })).toBeVisible();
    await student.getByRole('button', { name: 'Open group ' + groupName }).click();
    await expect(student.getByTestId('student-group-message').getByText(groupText, { exact: true })).toBeVisible();

    await owner.getByRole('button', { name: 'Refresh group discussion' }).click();
    await expect(owner.getByTestId('student-group-message').getByText(groupText, { exact: true })).toBeVisible();
    // Real hosted membership-moderation acceptance: owner removal revokes
    // history after reload and prevents a direct rejoin; restoration does not
    // re-enrol B. All requests use the actual staging Supabase backend.
    await owner.getByRole('button', { name: 'Refresh group members' }).click();
    const remove = owner.getByRole('button', { name: /^Remove member [0-9a-f-]{36}$/ });
    await expect(remove).toHaveCount(1);
    const buttonName = await remove.getAttribute('aria-label');
    expect(buttonName).toMatch(/^Remove member [0-9a-f-]{36}$/);
    const memberId = buttonName!.slice('Remove member '.length);
    await remove.click();
    await owner.getByRole('button', { name: 'Confirm remove member ' + memberId }).click();
    await expect(owner.getByRole('button', { name: 'Restore group access ' + memberId })).toBeVisible();

    await student.reload();
    await student.getByRole('button', { name: 'Open group ' + groupName }).click();
    await expect(student.getByText('Join this group to read and post messages.')).toBeVisible();
    await expect(student.getByTestId('student-group-message')).toHaveCount(0);
    await student.getByRole('button', { name: 'Join group', exact: true }).click();
    await expect(student.getByText('Could not join this group.')).toBeVisible();
    await expect(student.getByLabel('Message to group')).toHaveCount(0);

    await owner.getByRole('button', { name: 'Restore group access ' + memberId }).click();
    await expect(owner.getByText('Access restored. The student must choose to join again.')).toBeVisible();
    await student.reload();
    await student.getByRole('button', { name: 'Open group ' + groupName }).click();
    await expect(student.getByLabel('Message to group')).toHaveCount(0);
    await student.getByRole('button', { name: 'Join group', exact: true }).click();
    await expect(student.getByText('You joined the group.')).toBeVisible();
    await expect(student.getByTestId('student-group-message').getByText(groupText, { exact: true })).toBeVisible();

    await student.getByRole('button', { name: 'Leave group' }).click();
    await expect(student.getByLabel('Message to group')).toHaveCount(0);
    // Confirm leave is persisted server-side, not just optimistic local UI.
    // A departed member must not recover the private discussion on reload.
    await student.reload();
    await student.getByRole('button', { name: 'Open group ' + groupName }).click();
    await expect(student.getByText('Join this group to read and post messages.')).toBeVisible();
    await expect(student.getByLabel('Message to group')).toHaveCount(0);
    await expect(student.getByTestId('student-group-message')).toHaveCount(0);
    assertOwnerStaging();
    assertStudentStaging();
  } finally {
    // Best-effort cleanup. All records are clearly marked staging-only; failures
    // remain visible for investigation rather than falsely claiming deletion.
    if (groupCreated) {
      try {
        await owner.goto(STAGING + '/?stuora=groups');
        await owner.getByRole('button', { name: 'Open group ' + groupName }).click();
        await owner.getByRole('button', { name: 'Delete group', exact: true }).click();
        await owner.getByRole('button', { name: 'Confirm delete group' }).click();
        await expect(owner.getByRole('button', { name: 'Open group ' + groupName })).toHaveCount(0);
        await student.goto(STAGING + '/?stuora=groups');
        await expect(student.getByRole('button', { name: 'Open group ' + groupName })).toHaveCount(0);
      } catch { cleanupIssues.push('group deletion or outsider visibility'); }
    }
    if (listingCreated) {
      try {
        await owner.goto(STAGING + '/?stuora=housing');
        await owner.getByRole('button', { name: 'My listings', exact: true }).click();
        await owner.getByRole('button', { name: 'View ' + listingTitle }).click();
        // No photo is uploaded in the core acceptance run; the trusted-media
        // service stays compiled-off until isolated hosted media qualification.
        await owner.getByRole('button', { name: 'Archive listing', exact: true }).click();
        await owner.getByRole('button', { name: 'Confirm archive', exact: true }).click();
        await student.goto(STAGING + '/?stuora=housing');
        await expect(student.getByRole('button', { name: 'View ' + listingTitle, exact: true })).toHaveCount(0);
      } catch { cleanupIssues.push('listing archival or public discoverability after archive'); }
    }
    await ownerContext.close();
    await studentContext.close();
    // A cleanup problem is an acceptance failure, not a silent green run.
    // Retain fixture labels in the error so operators can investigate manually.
    if (cleanupIssues.length) {
      throw new Error('Staging cleanup incomplete (' + cleanupIssues.join(', ') + '). Inspect ' + listingTitle + ' and ' + groupName + ' in dedicated staging.');
    }
  }
});
