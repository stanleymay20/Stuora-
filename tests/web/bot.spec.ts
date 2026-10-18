import { expect, test } from '@playwright/test';
import { backend } from './account-fixtures';

test('Stuora Bot finds real affordable rooms with backend filters and opens Housing', async ({ page }) => {
  await backend(page);
  const calls: { kind: string | null; city: string | null; price: string | null; select: string | null }[] = [];
  await page.route('**/rest/v1/listings?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    calls.push({
      kind: params.get('kind'), city: params.get('city'),
      price: params.get('price_cents'), select: params.get('select'),
    });
    await route.fulfill({ json: [{
      id: '00000000-0000-0000-0000-000000000101', kind: 'housing', status: 'active',
      title: 'Student room near campus', city: 'Berlin', price_cents: 59000, currency: 'EUR',
    }] });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Stuora Bot' }).click();
  await expect(page.getByText('Connected search beta · Read-only')).toBeVisible();
  await expect(page.locator('img[src*="stuora-bot"]')).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Ask Stuora Bot' }).fill('Find rooms in Berlin under €650');
  await page.getByRole('button', { name: 'Ask Stuora Bot' }).click();
  await expect(page.getByRole('dialog').getByText('Student room near campus', { exact: true })).toBeVisible();
  await expect(page.getByText('Berlin · 590,00', { exact: false })).toBeVisible();
  expect(calls.some(x => x.kind === 'eq.housing' && x.city === 'ilike.%Berlin%' && x.price === 'lte.65000')).toBe(true);
  // The Home screen also fetches listings using a different projection.
  // Assert Bot-scoped requests only, without treating Home requests as data leaks.
  const botHousing = calls.filter(x => x.kind === 'eq.housing' && x.city === 'ilike.%Berlin%' && x.price === 'lte.65000');
  expect(botHousing.length).toBeGreaterThan(0);
  expect(botHousing.every(x => x.select === 'id,kind,title,city,price_cents,currency')).toBe(true);
  await page.getByRole('button', { name: 'Explore Housing' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('stuora')).toBe('housing');
});

test('Stuora Bot never fabricates jobs or implies a real generative model is active', async ({ page }) => {
  await backend(page);
  await page.route('**/rest/v1/listings?*', async route => route.fulfill({ json: [] }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Stuora Bot' }).click();
  await page.getByRole('button', { name: 'Working-student jobs in Berlin' }).click();
  await expect(page.getByText(/No matching jobs were returned in Berlin/)).toBeVisible();
  await expect(page.getByText(/It does not use generative AI yet/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore Jobs' })).toBeVisible();
  await page.getByRole('button', { name: 'Close Stuora Bot' }).click();
  await expect(page.getByRole('button', { name: 'Open Stuora Bot' })).toBeVisible();
});

test('Stuora Bot searches only public group metadata, not member messages', async ({ page }) => {
  await backend(page);
  const searched: string[] = [];
  await page.route('**/rest/v1/student_groups?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('select') !== 'id,name,city,topic,description') {
      return route.fulfill({ json: [] }); // Underlying Groups directory, not the Bot request.
    }
    searched.push(route.request().url());
    expect(params.get('city')).toBe('ilike.%Potsdam%');
    await route.fulfill({ json: [{ id: 'g-1', name: 'Potsdam Study Circle', city: 'Potsdam', topic: 'Study', description: 'Weekly sessions' }] });
  });
  await page.goto('/?stuora=groups');
  await page.getByRole('button', { name: 'Open Stuora Bot' }).click();
  await page.getByRole('textbox', { name: 'Ask Stuora Bot' }).fill('Study groups in Potsdam');
  await page.getByRole('button', { name: 'Ask Stuora Bot' }).click();
  await expect(page.getByText('Potsdam Study Circle', { exact: true })).toBeVisible();
  expect(searched.length).toBeGreaterThan(0);
  await expect(page.getByText('Study · Potsdam · Weekly sessions')).toBeVisible();
  await page.getByRole('button', { name: 'Explore Groups' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('stuora')).toBe('groups');
});
