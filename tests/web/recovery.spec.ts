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

test('web recovery callback exchanges a PKCE code bound to this browser and updates password', async ({ page }) => {
  const api = await backend(page);
  const exchanges: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.endsWith('/token')) exchanges.push(url.searchParams.get('grant_type') ?? '');
  });
  // The verifier is what resetPasswordForEmail stores in this browser under PKCE.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('stuora-test-verifier-seeded')) {
      localStorage.setItem('sb-stuora-test-auth-token-code-verifier', JSON.stringify('test-verifier/recovery'));
      sessionStorage.setItem('stuora-test-verifier-seeded', '1');
    }
  });
  await page.goto('/?code=5f8a2d0c-4b1e-4c9a-9a51-0e3f6c7d8b9a');
  // Recovery is now full-screen and hides normal app navigation.
  await expect(page.getByText('Choose a new password', { exact: true })).toBeVisible();
  await expect(page.getByText('You', { exact: true })).toHaveCount(0);
  expect(exchanges).toEqual(['pkce']);
  await expect(page).not.toHaveURL(/code=/);

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

test('an implicit-flow token link from someone else never signs this browser in (login CSRF)', async ({ page }) => {
  const api = await backend(page);
  const forged = session('attacker@example.invalid');
  const hash = new URLSearchParams({
    access_token: forged.access_token, refresh_token: forged.refresh_token,
    expires_in: String(forged.expires_in), token_type: forged.token_type, type: 'recovery',
  });
  await page.goto(`/?stuora=profile#${hash.toString()}`);
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
  await expect(page.getByText('Choose a new password', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Your Stuora Passport', { exact: true })).toHaveCount(0);
  expect(api.passwordUpdates()).toBe(0);
});

test('an email link opened in another browser explains what to do and is removed from the URL', async ({ page }) => {
  await backend(page);
  await page.goto('/?code=5f8a2d0c-4b1e-4c9a-9a51-0e3f6c7d8b9a');
  await expect(page.getByTestId('auth-link-notice')).toContainText('opened in a different browser');
  await expect(page).not.toHaveURL(/code=/);
  await page.getByRole('button', { name: 'Dismiss link message' }).click();
  await expect(page.getByTestId('auth-link-notice')).toHaveCount(0);
});

test('an expired or reused email link says so instead of failing silently', async ({ page }) => {
  await backend(page);
  await page.goto('/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await expect(page.getByTestId('auth-link-notice')).toContainText('expired or was already used');
  await expect(page).not.toHaveURL(/error_code/);
  await expect(page.getByText('Email link is invalid')).toHaveCount(0);
});
