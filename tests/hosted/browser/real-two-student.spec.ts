import { expect, test, type Page } from '@playwright/test';

/**
 * Never run automatically. Requires two separately owned/verified staging accounts,
 * supplied via environment variables. No service-role credentials, no mocks, no production.
 * Nothing here signs students up or creates fake verified student identities.
 */
const STAGING = 'https://stuora-preview-git-fix-ga-recover-ca508b-stanleymay20s-projects.vercel.app';
const approved = process.env.STUORA_STAGING_ACCEPTANCE === 'I_APPROVE_STAGING_TEST_WRITES';
const aEmail = process.env.STUORA_TEST_STUDENT_A_EMAIL || '';
const bEmail = process.env.STUORA_TEST_STUDENT_B_EMAIL || '';
const aPassword = process.env.STUORA_TEST_STUDENT_A_PASSWORD || '';
const bPassword = process.env.STUORA_TEST_STUDENT_B_PASSWORD || '';
const ready = approved && aEmail.includes('@') && bEmail.includes('@') &&
  aEmail.toLowerCase() !== bEmail.toLowerCase() && aPassword.length >= 8 && bPassword.length >= 8;
const stamp = Date.now().toString(36);

async function signIn(page: Page, email: string, password: string, displayName: string) {
  await page.goto(STAGING + '/?stuora=profile');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Your Stuora Passport', { exact: true })).toBeVisible();
  const name = page.getByLabel('Display name');
  if (await page.getByRole('button', { name: 'Create profile', exact: true }).isVisible().catch(() => false)) {
    await name.fill(displayName);
    await page.getByRole('button', { name: 'Create profile', exact: true }).click();
    await expect(page.getByText('Your profile has been saved.')).toBeVisible();
  }
}

test('two independent staging accounts complete actual listing, messaging and group interactions', async ({ browser }) => {
  test.skip(!ready, 'Requires explicit staging-write approval and two verified staging account credentials in local environment.');
  const ownerContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const student = await studentContext.newPage();
  const listingTitle = 'STAGING TEST Housing ' + stamp;
  const groupName = 'STAGING TEST Study Circle ' + stamp;
  const messageText = 'STAGING TEST Is the room still available? ' + stamp;
  const groupText = 'STAGING TEST Study meetup ' + stamp;
  let listingCreated = false;
  let groupCreated = false;

  try {
    // No route interception: all HTTP calls go to the real dedicated staging backend.
    await signIn(owner, aEmail, aPassword, 'Staging Test Student A');
    await signIn(student, bEmail, bPassword, 'Staging Test Student B');

    await owner.goto(STAGING + '/?stuora=create-housing');
    await owner.getByRole('button', { name: 'Post Housing', exact: true }).click();
    await owner.getByLabel('Listing title').fill(listingTitle);
    await owner.getByLabel('Listing description').fill('STAGING TEST ONLY — verify with professor; not an actual available room.');
    await owner.getByLabel('Monthly rent (EUR)').fill('615');
    await owner.getByRole('button', { name: 'Publish listing', exact: true }).click();
    await expect(owner.getByText('Listing saved. Add up to six real photos below.')).toBeVisible();
    listingCreated = true;

    await student.goto(STAGING + '/?stuora=housing');
    await student.getByRole('button', { name: 'View ' + listingTitle, exact: true }).click();
    await expect(student.getByText('STAGING TEST ONLY — verify with professor; not an actual available room.')).toBeVisible();
    await expect(student.getByRole('button', { name: 'Edit listing', exact: true })).toHaveCount(0);
    await student.getByRole('button', { name: 'Message owner', exact: true }).click();
    await student.getByRole('textbox', { name: 'Message', exact: true }).fill(messageText);
    await student.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(student.getByText(messageText, { exact: true })).toBeVisible();

    await owner.goto(STAGING + '/?stuora=messages');
    await expect(owner.getByRole('button', { name: 'Refresh messages' })).toBeVisible();
    await owner.getByRole('button', { name: 'Refresh messages' }).click();
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

    await owner.getByRole('button', { name: 'Refresh group discussion' }).click();
    await expect(owner.getByTestId('student-group-message').getByText(groupText, { exact: true })).toBeVisible();
    await student.getByRole('button', { name: 'Leave group' }).click();
    await expect(student.getByLabel('Message to group')).toHaveCount(0);
  } finally {
    // Best-effort cleanup. All records are clearly marked staging-only; failures
    // remain visible for investigation rather than falsely claiming deletion.
    if (groupCreated) {
      try {
        await owner.goto(STAGING + '/?stuora=groups');
        await owner.getByRole('button', { name: 'Open group ' + groupName }).click();
        await owner.getByRole('button', { name: 'Delete group', exact: true }).click();
        await owner.getByRole('button', { name: 'Confirm delete group' }).click();
        await expect(owner.getByText('No student groups found.')).toBeVisible({ timeout: 5000 });
      } catch { /* Leave explicitly labeled staging fixture for manual cleanup. */ }
    }
    if (listingCreated) {
      try {
        await owner.goto(STAGING + '/?stuora=housing');
        await owner.getByRole('button', { name: 'My listings', exact: true }).click();
        await owner.getByRole('button', { name: 'View ' + listingTitle }).click();
        await owner.getByRole('button', { name: 'Archive listing', exact: true }).click();
        await owner.getByRole('button', { name: 'Confirm archive', exact: true }).click();
      } catch { /* Leave explicitly labeled staging fixture for manual cleanup. */ }
    }
    await ownerContext.close();
    await studentContext.close();
  }
});
