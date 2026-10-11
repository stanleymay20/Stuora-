import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';
const userId = '00000000-0000-0000-0000-000000000001';
function session(email = 'alice@example.invalid') {
  const now = Math.floor(Date.now() / 1000);
  const user = { id: userId, email, aud: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString() };
  const jwt = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: userId, exp: now + 3600, iat: now, role: 'authenticated' })).toString('base64url'), 'test-signature'].join('.');
  return { access_token: jwt, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user };
}
async function backend(page: Page, failProfile = false) {
  let profile: Record<string, unknown> | null = null;
  let writes = 0;
  let reads = 0;
  await page.route('https://mljmifovcthvtuquvyzf.supabase.co/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith('/signup')) return route.fulfill({ json: { user: session().user, session: null } });
    if (url.pathname.endsWith('/token')) {
      if (req.postDataJSON()?.password === 'bad-password') return route.fulfill({ status: 400, json: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' } });
      return route.fulfill({ json: session() });
    }
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    if (url.pathname.endsWith('/profiles')) {
      if (req.method() === 'GET') {
        reads++;
        if (failProfile && reads === 1) return route.fulfill({ status: 403, json: { message: 'Profile unavailable', code: '42501' } });
        return route.fulfill({ json: profile, contentType: 'application/vnd.pgrst.object+json' });
      }
      writes++;
      const values = req.postDataJSON();
      // Contract: callers may never send trust or authorization flags.
      expect(values).not.toHaveProperty('student_status');
      expect(values).not.toHaveProperty('account_kind');
      if (req.method() === 'PATCH') expect(url.searchParams.get('id')).toBe(`eq.${userId}`);
      profile = { ...profile, id: userId, ...values, student_status: 'unverified', account_kind: 'student', avatar_path: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      return route.fulfill({ json: profile, contentType: 'application/vnd.pgrst.object+json' });
    }
    return route.fulfill({ status: 404, json: { message: 'Unexpected endpoint in test' } });
  });
  return { writes: () => writes };
}
async function account(page: Page) {
  await page.goto('/');
  await page.getByText('You', { exact: true }).click();
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
}
async function signin(page: Page, password = 'correct-password') {
  await page.getByLabel('Email', { exact: true }).fill('alice@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

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
