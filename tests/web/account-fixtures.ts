import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';
const userId = '00000000-0000-0000-0000-000000000001';
export function session(email = 'alice@example.invalid') {
  const now = Math.floor(Date.now() / 1000);
  const user = { id: userId, email, aud: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString() };
  const jwt = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: userId, exp: now + 3600, iat: now, role: 'authenticated' })).toString('base64url'), 'test-signature'].join('.');
  return { access_token: jwt, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user };
}
export async function backend(page: Page, failProfile = false) {
  let profile: Record<string, unknown> | null = null;
  let writes = 0;
  let reads = 0;
  await page.route('https://mljmifovcthvtuquvyzf.supabase.co/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith('/listings') && req.method() === 'GET') return route.fulfill({ json: [] });
    if (url.pathname.endsWith('/student_benefits') && req.method() === 'GET') return route.fulfill({ json: [] });
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
export async function account(page: Page) {
  await page.goto('/');
  await page.getByText('You', { exact: true }).click();
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
}
export async function signin(page: Page, password = 'correct-password') {
  await page.getByLabel('Email', { exact: true }).fill('alice@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

