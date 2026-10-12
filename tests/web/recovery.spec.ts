import { expect, test, type Page } from '@playwright/test';
import { session } from './account-fixtures';

async function baseRoutes(page: Page) {
  await page.route('https://mljmifovcthvtuquvyzf.supabase.co/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith('/listings') || url.pathname.endsWith('/student_benefits')) return route.fulfill({ json: [] });
    if (url.pathname.endsWith('/profiles')) return route.fulfill({ json: null, contentType: 'application/vnd.pgrst.object+json' });
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404, json: { message: `Unexpected endpoint ${url.pathname}` } });
  });
}

test('forgot-password request is privacy-preserving and uses the current web origin', async ({ page }) => {
  let recoveryRequest: { url: string; body: Record<string, unknown> } | null = null;
  await baseRoutes(page);
  await page.route('**/auth/v1/recover**', async route => {
    recoveryRequest = { url: route.request().url(), body: route.request().postDataJSON() };
    await route.fulfill({ json: {} });
  });
  await page.goto('/');
  await page.getByText('You', { exact: true }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('alice@example.invalid');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/If an account exists for that email/)).toBeVisible();
  expect(recoveryRequest).not.toBeNull();
  const request = recoveryRequest!;
  expect(request.body.email).toBe('alice@example.invalid');
  const redirect = new URL(request.url).searchParams.get('redirect_to');
  expect(redirect).toBe(`${new URL(page.url()).origin}/?recovery=1`);
});

test('recovery URL establishes the temporary session, updates password, signs out and clears tokens', async ({ page }) => {
  const auth = session();
  let updatedPassword = '';
  await page.route('https://mljmifovcthvtuquvyzf.supabase.co/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith('/user') && req.method() === 'GET') return route.fulfill({ json: auth.user });
    if (url.pathname.endsWith('/user') && req.method() === 'PUT') {
      updatedPassword = String(req.postDataJSON()?.password ?? '');
      return route.fulfill({ json: { ...auth.user, updated_at: new Date().toISOString() } });
    }
    if (url.pathname.endsWith('/token')) return route.fulfill({ json: auth });
    if (url.pathname.endsWith('/profiles')) return route.fulfill({ json: null, contentType: 'application/vnd.pgrst.object+json' });
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404, json: { message: `Unexpected endpoint ${url.pathname}` } });
  });
  const link = `/?recovery=1#access_token=${encodeURIComponent(auth.access_token)}&refresh_token=${encodeURIComponent(auth.refresh_token)}&type=recovery`;
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save new password' })).toBeEnabled();
  expect(page.url()).not.toContain('access_token=');
  expect(page.url()).toContain('recovery=1');
  await page.getByLabel('New password').fill('new-password-123');
  await page.getByLabel('Confirm new password').fill('different-password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('The two password entries do not match.')).toBeVisible();
  expect(updatedPassword).toBe('');
  await page.getByLabel('Confirm new password').fill('new-password-123');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
  expect(updatedPassword).toBe('new-password-123');
  expect(page.url()).not.toContain('access_token=');
  expect(page.url()).not.toContain('recovery=1');
  await page.getByRole('button', { name: 'Return to sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Password updated' })).toHaveCount(0);
});

test('recovery marker without a valid session never enables password update', async ({ page }) => {
  await baseRoutes(page);
  await page.goto('/?recovery=1');
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expect(page.getByText(/recovery session is missing or expired/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save new password' })).toBeDisabled();
});
