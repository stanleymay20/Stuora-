import { expect, test } from '@playwright/test';
import { account, backend, signin } from './account-fixtures';

test('account flow uses mock backend and never contacts production', async ({ page }) => {
  const backendRequests: string[] = [];
  const productionRequests: string[] = [];
  page.on('request', request => {
    const host = new URL(request.url()).hostname;
    if (host === 'stuora-test.invalid') backendRequests.push(request.url());
    if (host.endsWith('.supabase.co')) productionRequests.push(request.url());
  });
  await page.route('https://*.supabase.co/**', route => route.abort());
  await backend(page);
  await account(page);
  await signin(page);
  await expect(page.getByText('Your Stuora Passport', { exact: true })).toBeVisible();
  expect(backendRequests.some(url => new URL(url).pathname.endsWith('/token'))).toBe(true);
  expect(productionRequests).toEqual([]);
});
