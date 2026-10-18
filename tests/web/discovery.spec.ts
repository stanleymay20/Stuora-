import { expect, test } from '@playwright/test';
import { account, backend, signin } from './account-fixtures';
test('People requires login and reads opted-in profile fields with retry and reload', async ({ page }) => {
  await backend(page); await page.goto('/');
  await page.getByRole('button', { name: 'Browse People', exact: true }).click();
  await expect(page.getByText('Sign in to discover students who have opted to share their profile.')).toBeVisible();
  await account(page); await signin(page);
  let fail = true;
  await page.route('**/rest/v1/profiles?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('is_discoverable') !== 'eq.true') return route.fallback();
    expect(params.get('select')).toBe('id,display_name,city,bio');
    if (fail) { fail = false; return route.fulfill({ status: 403, json: { message: 'temporary' } }); }
    return route.fulfill({ json: [{ id: 'person-test', display_name: 'Database student', city: 'Potsdam', bio: 'Public bio from the database' }] });
  });
  if (await page.getByText('Explore', { exact: true }).count()) await page.getByText('Explore', { exact: true }).click();
  else await page.getByText('People', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Browse People', exact: true }).click();
  await expect(page.getByText(/Could not load people/)).toBeVisible();
  await page.getByRole('button', { name: 'Retry people' }).click();
  await expect(page.getByText('Database student', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Browse People', exact: true }).click();
  await expect(page.getByText('Public bio from the database')).toBeVisible();
});
test('Savings uses verified backend prices with errors, refresh and no invented account total', async ({ page }) => {
  await backend(page); let rows: unknown[] = []; let fail = true;
  await page.route('**/rest/v1/student_benefits?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('verified_at')).toBe('not.is.null');
    if (fail) { fail = false; return route.fulfill({ status: 403, json: { message: 'temporary' } }); }
    return route.fulfill({ json: rows });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Open Student Savings' }).click();
  await expect(page.getByText(/Could not load benefits/)).toBeVisible();
  await page.getByRole('button', { name: 'Retry benefits' }).click();
  await expect(page.getByText('No verified benefits available yet.')).toBeVisible();
  rows = [{ id: 'test-benefit', title: 'Database offer', sponsor_name: 'Real partner record', original_price_cents: 1250, student_price_cents: 850, currency: 'EUR', description: 'From the backend', eligibility_text: 'Student ID', starts_at: null, ends_at: null, terms_url: 'https://example.invalid/terms', verified_at: '2026-10-01T00:00:00Z' }];
  await page.getByRole('button', { name: 'Refresh benefits' }).click();
  await expect(page.getByText('Database offer', { exact: true })).toBeVisible();
  await expect(page.getByText('Funded by Real partner record')).toBeVisible();
  await expect(page.getByText('12,50 €', { exact: true })).toBeVisible();
  await expect(page.getByText('8,50 €', { exact: true })).toBeVisible();
  await expect(page.getByText('4,00 € (32%)', { exact: true })).toBeVisible();
  await expect(page.getByText(/42,80|Savings this month|Demo Partner/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close Student Savings' }).click();
});

test('People lets members view opt-in public profiles and filter by city without exposing secrets', async ({ page }) => {
  await backend(page);
  await account(page); await signin(page);
  await page.route('**/rest/v1/profiles?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('is_discoverable') !== 'eq.true') return route.fallback();
    expect(params.get('select')).toBe('id,display_name,city,bio');
    expect(params.get('email')).toBeNull();
    const city = params.get('city');
    const people = city ? [{ id:'member-1', display_name:'Public member', city:'Potsdam', bio:'Sharing a public academic bio' }]
      : [{ id:'member-1', display_name:'Public member', city:'Potsdam', bio:'Sharing a public academic bio' }];
    return route.fulfill({ json:people });
  });
  await page.getByRole('button', { name:'Browse People', exact:true }).click();
  await expect(page.getByRole('button',{name:'View Public member profile'})).toBeVisible();
  await page.getByRole('textbox',{name:'Filter people by city'}).fill('Potsdam');
  await expect(page.getByRole('button',{name:'Clear city filter'})).toBeVisible();
  await page.getByRole('button',{name:'View Public member profile'}).click();
  await expect(page.getByText('Sharing a public academic bio',{exact:true})).toBeVisible();
  await expect(page.getByText('Shared publicly with signed-in Stuora members')).toBeVisible();
  await expect(page.getByText('Private conversations currently begin from real marketplace or housing listings.')).toBeVisible();
  await expect(page.getByText(/@example|phone number|date of birth/i)).toHaveCount(0);
  await page.getByRole('button',{name:'Back to people'}).click();
  await expect(page.getByRole('button',{name:'View Public member profile'})).toBeVisible();
  await page.getByRole('button',{name:'Clear city filter'}).click();
  await expect(page.getByRole('textbox',{name:'Filter people by city'})).toHaveValue('');
});
