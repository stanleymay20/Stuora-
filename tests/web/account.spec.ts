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
  await expect(page.getByText('Check your email and confirm your account, then return here to sign in.')).toBeVisible();
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
