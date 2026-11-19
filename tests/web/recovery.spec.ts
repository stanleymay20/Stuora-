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

test('injected token links never create a session (login CSRF)', async ({ page }) => {
  const api = await backend(page);
  const attacker = session('attacker@example.invalid');
  const hash = new URLSearchParams({
    access_token: attacker.access_token,
    refresh_token: attacker.refresh_token,
    expires_in: String(attacker.expires_in),
    token_type: attacker.token_type,
    type: 'recovery',
  });
  await page.goto(`/#${hash.toString()}`);
  await page.getByText('You', { exact: true }).click();
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
  await expect(page.getByText('Choose a new password', { exact: true })).toHaveCount(0);
  const stored = await page.evaluate(() => Object.keys(localStorage).filter(key => key.endsWith('-auth-token')));
  expect(stored).toEqual([]);
  expect(api.codeExchanges()).toBe(0);
});

test('a recovery code from another device is rejected', async ({ page }) => {
  const api = await backend(page);
  await page.goto('/?code=valid-recovery-code');
  await page.getByText('You', { exact: true }).click();
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
  await expect(page.getByText('Choose a new password', { exact: true })).toHaveCount(0);
  expect(api.codeExchanges()).toBe(0);
});

test('web recovery callback creates a recovery session and updates password', async ({ page }) => {
  const api = await backend(page);
  await account(page);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email', { exact: true }).fill('alice@example.invalid');
  await page.getByRole('button', { name: 'Send password reset link' }).click();
  await expect(page.getByText('If an account exists for that email, a password reset link has been sent.')).toBeVisible();
  await page.goto('/?code=valid-recovery-code');
  await expect.poll(() => api.codeExchanges()).toBe(1);
  await expect.poll(() => page.evaluate(() => location.search)).toBe('');
  await page.getByText('You', { exact: true }).click();
  await expect(page.getByText('Choose a new password', { exact: true })).toBeVisible();

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
  await expect(page.getByText('Password updated successfully. Your Stuora account is ready.')).toBeVisible();
  expect(api.passwordUpdates()).toBe(1);
  await expect(page.getByText('Your Stuora Passport', { exact: true })).toBeVisible();
});
