import { expect, test } from '@playwright/test';
import { account, backend, signin } from './account-fixtures';
test('profile creation, editing, privacy, reload persistence and logout', async ({ page }) => {
  const api = await backend(page);
  await account(page);
  await signin(page);
  await expect(page.getByLabel('Display name')).toBeVisible();
  await page.getByLabel('Display name').fill('Alice Student');
  await page.getByLabel('Bio', { exact: true }).fill('New to Berlin');
  await page.getByRole('button', { name: 'Create profile', exact: true }).click();
  await expect(page.getByText('Your profile has been saved.')).toBeVisible();
  await expect(page.getByText(/Student status: unverified/)).toBeVisible();
  await page.getByLabel('Bio', { exact: true }).fill('Looking for flatmates');
  await page.getByRole('switch', { name: 'Profile discoverable' }).click();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect.poll(api.writes).toBe(2);
  await page.reload();
  await page.getByText('You', { exact: true }).click();
  await expect(page.getByLabel('Display name')).toHaveValue('Alice Student');
  await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('Looking for flatmates');
  await expect(page.getByRole('switch', { name: 'Profile discoverable' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByText('You', { exact: true }).click();
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
});

test('confirmation-required signup never shows a signed-in account', async ({ page }) => {
  await backend(page); await account(page);
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Email', { exact: true }).fill('new@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('signup-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Check your email and confirm your account, then return to Stuora.')).toBeVisible();
  await expect(page.getByLabel('Display name')).toHaveCount(0);
});

test('validation and auth errors preserve retryable state', async ({ page }) => {
  const api = await backend(page); await account(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await signin(page, 'bad-password');
  await expect(page.getByText('Invalid login credentials')).toBeVisible();
  await signin(page);
  await page.getByRole('button', { name: 'Create profile', exact: true }).click();
  await expect(page.getByText('Your name must be between 2 and 80 characters.')).toBeVisible();
  expect(api.writes()).toBe(0);
});

test('profile fetch errors offer retry, never an accidental create form', async ({ page }) => {
  await backend(page, true); await account(page); await signin(page);
  await expect(page.getByText('Could not load your profile. Please retry.')).toBeVisible();
  await expect(page.getByLabel('Display name')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry profile' }).click();
  await expect(page.getByLabel('Display name')).toBeVisible();
});

test('stalled profile read times out, retries and ignores its late response', async ({ page }) => {
  await backend(page);
  await page.clock.install();
  let held = false;
  let settled = false;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rest/v1/profiles?**', async route => {
    if (held) return route.fallback();
    held = true;
    await waiting;
    await route.fulfill({ json: { id: '00000000-0000-0000-0000-000000000001', display_name: 'Late profile', city: 'Berlin' } }).catch(() => {});
    settled = true;
  });
  await account(page); await signin(page);
  await expect.poll(() => held).toBe(true);
  await expect(page.getByLabel('Display name')).toHaveCount(0);
  await page.clock.fastForward(15001);
  await expect(page.getByText('Could not load your profile. Check your connection and retry.')).toBeVisible();
  await expect(page.getByLabel('Display name')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry profile' }).click();
  await expect(page.getByLabel('Display name')).toHaveValue('');
  release();
  await expect.poll(() => settled).toBe(true);
  await page.clock.runFor(100);
  await expect(page.getByRole('button', { name: 'Create profile', exact: true })).toBeVisible();
  await expect(page.getByLabel('Display name')).toHaveValue('');
});

test('signing out cancels a stalled profile read and its timeout', async ({ page }) => {
  await backend(page); await page.clock.install();
  let held = false;
  let settled = false;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rest/v1/profiles?**', async route => {
    held = true; await waiting;
    await route.fulfill({ json: { id: '00000000-0000-0000-0000-000000000001', display_name: 'Old account', city: 'Berlin' } }).catch(() => {});
    settled = true;
  });
  await account(page); await signin(page);
  await expect.poll(() => held).toBe(true);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
  release(); await expect.poll(() => settled).toBe(true);
  await page.clock.fastForward(15001);
  await expect(page.getByText(/Could not load your profile/)).toHaveCount(0);
  await expect(page.getByLabel('Display name')).toHaveCount(0);
});
