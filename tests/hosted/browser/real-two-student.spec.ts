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

// React Native Web's accessible Image may be a wrapper rather than an HTML <img>.
// Verify the rendered source URL, actual Storage response and browser decoding.
async function assertStagingPhotoLoads(page: Page, label: string) {
  const photo = page.getByLabel(label);
  await expect(photo).toBeVisible();
  const imageUrl = await photo.evaluate(node => {
    const candidates = [node, ...Array.from(node.querySelectorAll('*'))];
    for (const element of candidates) {
      if (element instanceof HTMLImageElement && element.currentSrc) return element.currentSrc;
      const background = window.getComputedStyle(element).backgroundImage;
      const match = background.match(/^url\((?:"|')?(.*?)(?:"|')?\)$/);
      if (match?.[1]) return new URL(match[1], window.location.href).href;
    }
    return '';
  });
  expect(imageUrl).toMatch(/^https:\/\/uptjcspizukpjcoayhtn\.supabase\.co\/storage\/v1\/object\/public\/listing-media\//);
  const response = await page.request.get(imageUrl);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^image\/png(?:;|$)/i);
  const bytes = await response.body();
  expect(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  const decoded = await page.evaluate(url => new Promise<boolean>(resolve => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth === 1 && image.naturalHeight === 1);
    image.onerror = () => resolve(false);
    image.src = url;
  }), imageUrl);
  expect(decoded).toBe(true);
}

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
  let photoAttached = false;
  let groupCreated = false;
  const cleanupIssues: string[] = [];

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

    // Exercise the real Storage upload and public image retrieval path; no mocks.
    const fileChooserPromise = owner.waitForEvent('filechooser');
    await owner.getByRole('button', { name: 'Add photo (0/6)' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'stuora-staging-acceptance.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zuz0AAAAASUVORK5CYII=', 'base64'),
    });
    await expect(owner.getByText('Photo uploaded and attached to this listing.')).toBeVisible();
    photoAttached = true;
    await assertStagingPhotoLoads(owner, listingTitle + ' photo 1');
    await owner.goto(STAGING + '/?stuora=housing');
    await owner.getByRole('button', { name: 'My listings', exact: true }).click();
    await owner.getByRole('button', { name: 'View ' + listingTitle }).click();
    await assertStagingPhotoLoads(owner, listingTitle + ' photo 1');

    await student.goto(STAGING + '/?stuora=housing');
    await student.getByRole('button', { name: 'View ' + listingTitle, exact: true }).click();
    await expect(student.getByText('STAGING TEST ONLY — verify with professor; not an actual available room.')).toBeVisible();
    await assertStagingPhotoLoads(student, listingTitle + ' photo 1');
    await expect(student.getByRole('button', { name: 'Remove photo 1' })).toHaveCount(0);
    await expect(student.getByRole('button', { name: 'Edit listing', exact: true })).toHaveCount(0);
    await student.reload();
    await student.getByRole('button', { name: 'View ' + listingTitle, exact: true }).click();
    await assertStagingPhotoLoads(student, listingTitle + ' photo 1');
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
        // Even an earlier assertion failure may happen after upload succeeds;
        // inspect persisted state rather than relying only on the in-memory flag.
        const removePhoto = owner.getByRole('button', { name: 'Remove photo 1' });
        if (photoAttached) await expect(removePhoto).toBeVisible();
        if (await removePhoto.isVisible().catch(() => false)) {
          await removePhoto.click();
          await expect(owner.getByText('Photo removed.', { exact: true })).toBeVisible();
          await expect(owner.getByLabel(listingTitle + ' photo 1')).toHaveCount(0);
        }
        await owner.getByRole('button', { name: 'Archive listing', exact: true }).click();
        await owner.getByRole('button', { name: 'Confirm archive', exact: true }).click();
        await student.goto(STAGING + '/?stuora=housing');
        await expect(student.getByRole('button', { name: 'View ' + listingTitle, exact: true })).toHaveCount(0);
      } catch { cleanupIssues.push('photo removal, listing archival, or public discoverability after archive'); }
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
