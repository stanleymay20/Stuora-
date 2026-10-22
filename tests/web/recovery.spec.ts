import { expect, test } from '@playwright/test';
import { account, backend, session } from './account-fixtures';

test('forgot-password request validates email and returns a privacy-safe response', async ({ page }) => {
  const api = await backend(page);
  await account(page);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByText('Reset your password', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Send password reset link' }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  expect(api.recoveries()).toBe(0);

  await page.getByLabel('Email', { exact: true }).fill('alice@example.invalid');
  await page.getByRole('button', { name: 'Send password reset link' }).click();
  await expect(page.getByText('If an account exists for that email, a password reset link has been sent.')).toBeVisible();
  expect(api.recoveries()).toBe(1);
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
});

test('web recovery callback creates a recovery session and updates password', async ({ page }) => {
  const api = await backend(page);
  const recovered = session();
  const hash = new URLSearchParams({
    access_token: recovered.access_token,
    refresh_token: recovered.refresh_token,
    expires_in: String(recovered.expires_in),
    token_type: recovered.token_type,
    type: 'recovery',
  });
  await page.goto(`/#${hash.toString()}`);
  // Recovery is now full-screen and hides normal app navigation.
  await expect(page.getByText('Choose a new password', { exact: true })).toBeVisible();
  await expect(page.getByText('You', { exact: true })).toHaveCount(0);

  await page.getByLabel('New password', { exact: true }).fill('short');
  await page.getByLabel('Confirm new password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Use at least 8 characters for your new password.')).toBeVisible();
  expect(api.passwordUpdates()).toBe(0);

  await page.getByLabel('New password', { exact: true }).fill('new-password-123');
  await page.getByLabel('Confirm new password', { exact: true }).fill('different-password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Passwords do not match.')).toBeVisible();
  expect(api.passwordUpdates()).toBe(0);

  await page.getByLabel('Confirm new password', { exact: true }).fill('new-password-123');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Password updated successfully. Sign in again with your new password.')).toBeVisible();
  expect(api.passwordUpdates()).toBe(1);
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
  await expect(page.getByText('Your Stuora Passport', { exact: true })).toHaveCount(0);
});
