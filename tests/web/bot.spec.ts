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
  // The floating launcher is hidden behind the open modal; only the Bot header mascot remains.
  await expect(page.locator('img[src*="stuora-bot"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Open Stuora Bot' })).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Working-student jobs' }).click();
  await expect(page.getByText(/No matching jobs were returned/)).toBeVisible();
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

test('Stuora Bot interprets German and international thousands separators as euros, not cents', async ({ page }) => {
  await backend(page);
  const filtered: string[] = [];
  await page.route('**/rest/v1/listings?*', async route => {
    const p = new URL(route.request().url()).searchParams;
    if (p.get('select') === 'id,kind,title,city,price_cents,currency' && p.get('kind') === 'eq.housing') {
      filtered.push(p.get('price_cents') || '');
    }
    await route.fulfill({ json: [] });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Stuora Bot' }).click();
  for (const [request, expected] of [
    ['Find housing in Berlin under €1.200,50', 'lte.120050'],
    ['Find housing in Berlin under €1,200', 'lte.120000'],
    ['Find housing in Berlin under €650,50', 'lte.65050'],
  ] as const) {
    await page.getByRole('textbox', { name: 'Ask Stuora Bot' }).fill(request);
    await page.getByRole('button', { name: 'Ask Stuora Bot' }).click();
    await expect.poll(() => filtered.filter(price => price === expected).length).toBe(1);
  }
});

test('floating Stuora Bot launcher stays above navigation, opens read-only search, and clears form space', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  const launcher = page.getByRole('button', { name: 'Open Stuora Bot' });
  await expect(launcher).toHaveCount(1);
  await expect(launcher).toBeVisible();
  await expect(page.getByText('SEARCH BETA', { exact: true })).toBeVisible();

  const bounds = await launcher.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  // A fixed viewport launcher must not push content sideways or cover bottom navigation.
  expect(bounds!.x).toBeGreaterThan(viewport!.width / 2);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width);
  expect(bounds!.y).toBeGreaterThan(viewport!.height / 2);
  expect(bounds!.y + bounds!.height).toBeLessThan(viewport!.height);
  if (test.info().project.name === 'mobile-web') {
    const nav = await page.getByRole('button', { name: 'Messages', exact: true }).boundingBox();
    expect(nav).not.toBeNull();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(nav!.y);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await launcher.click();
  await expect(page.getByText('Connected search beta · Read-only')).toBeVisible();
  await expect(launcher).toHaveCount(0);
  await page.getByRole('button', { name: 'Close Stuora Bot' }).click();
  await expect(launcher).toBeVisible();

  // Do not overlay compose controls, publish actions or private account inputs.
  await page.goto('/?stuora=create-housing');
  await expect(launcher).toHaveCount(0);
  await page.goto('/?stuora=messages');
  await expect(launcher).toHaveCount(0);
  await page.goto('/?stuora=profile');
  await expect(launcher).toHaveCount(0);
  await page.goto('/?stuora=groups');
  await expect(launcher).toBeVisible();
});


test('Stuora Bot 2.0 renders a full transparent vector character without a cropped photo', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  const launcher = page.getByRole('button', { name: 'Open Stuora Bot' });
  const rig = page.getByTestId('stuora-mascot-rig');
  await expect(launcher).toBeVisible();
  await expect(rig).toBeVisible();
  await expect(page.getByTestId('stuora-mascot-body')).toBeVisible();
  await expect(page.getByTestId('stuora-mascot-eyes')).toBeVisible();
  await expect(page.getByTestId('stuora-mascot-arm')).toBeVisible();
  await expect(page.getByTestId('stuora-mascot-shadow')).toBeVisible();
  expect(await launcher.locator('svg').count()).toBeGreaterThanOrEqual(3);
  await expect(launcher.locator('img')).toHaveCount(0);
  const l = await launcher.boundingBox();
  const c = await rig.boundingBox();
  expect(l).not.toBeNull(); expect(c).not.toBeNull();
  expect(c!.x).toBeGreaterThanOrEqual(l!.x - 1);
  expect(c!.x + c!.width).toBeLessThanOrEqual(l!.x + l!.width + 1);
  expect(c!.y).toBeGreaterThanOrEqual(l!.y - 1);
  expect(c!.y + c!.height).toBeLessThanOrEqual(l!.y + l!.height + 1);
  // The animated mascot is a child of the unchanged accessible press target.
  await launcher.click();
  await expect(page.getByText('Connected search beta · Read-only')).toBeVisible();
});

test('Stuora Bot 2.0 blinks independently of hover motion when animations are enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await backend(page);
  await page.goto('/');
  await expect(page.getByTestId('stuora-mascot-eyes')).toBeVisible();
  // Distinct from a bouncing bitmap: the two vector eyes physically narrow
  // while the complete body remains separately mounted and interactive.
  await page.waitForFunction(() => {
    const eyes = document.querySelector('[data-testid="stuora-mascot-eyes"]');
    if (!eyes) return false;
    const transform = getComputedStyle(eyes).transform;
    if (transform === 'none') return false;
    return new DOMMatrixReadOnly(transform).m22 < 0.6;
  }, undefined, { timeout: 10000, polling: 'raf' });
  await expect(page.getByRole('button', { name: 'Open Stuora Bot' })).toBeVisible();
});


test('desktop assistant is a bounded side panel; mobile remains a full-screen modal', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Stuora Bot' }).click();
  const panel = page.getByTestId('stuora-bot-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByText('Connected search beta · Read-only')).toBeVisible();
  const bounds = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull(); expect(viewport).not.toBeNull();
  if (test.info().project.name === 'desktop') {
    expect(bounds!.width).toBeLessThanOrEqual(500);
    expect(bounds!.x + bounds!.width).toBeGreaterThan(viewport!.width - 45);
    await expect(page.getByRole('button', { name: 'Close Stuora Bot backdrop' })).toBeVisible();
    await page.getByRole('button', { name: 'Close Stuora Bot backdrop' }).click({ position: { x: 12, y: 12 } });
  } else {
    expect(bounds!.width).toBeGreaterThanOrEqual(viewport!.width - 2);
    await expect(page.getByRole('button', { name: 'Close Stuora Bot backdrop' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Close Stuora Bot' }).click();
  }
  await expect(page.getByRole('button', { name: 'Open Stuora Bot' })).toBeVisible();
});

test('selected student city drives grounded Bot results and no Berlin fallback', async ({ page }) => {
  await backend(page);
  const botCities: string[] = [];
  await page.route('**/rest/v1/student_groups?*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('select') === 'id,name,city,topic,description') {
      botCities.push(url.searchParams.get('city') ?? '');
    }
    await route.fulfill({ json: [] });
  });
  await page.goto('/');
  const location = page.getByRole('button', { name: 'Choose student city' });
  await expect(location).toBeVisible();
  await expect(location).toContainText('All cities');
  await location.click();
  await page.getByRole('textbox', { name: 'Student city name' }).fill('Aachen');
  await page.getByRole('button', { name: 'Save student city' }).click();
  await expect(location).toContainText('Aachen');
  await page.getByRole('button', { name: 'Open Stuora Bot' }).click();
  await page.getByRole('button', { name: 'Study groups in Aachen' }).click();
  await expect.poll(() => botCities).toContain('ilike.%Aachen%');
  await page.getByRole('button', { name: 'Close Stuora Bot' }).click();
  await page.reload();
  await expect(location).toContainText('Aachen');
  await location.click();
  await page.getByRole('button', { name: 'Show all cities' }).click();
  await expect(location).toContainText('All cities');
  await page.getByRole('button', { name: 'Open Stuora Bot' }).click();
  await page.getByRole('button', { name: 'Study groups' }).click();
  await expect.poll(() => botCities).toContain('');
});

test('small full-body Stuora mascot keeps blinking and click affordance', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  const launcher = page.getByRole('button', { name: 'Open Stuora Bot' });
  const box = await launcher.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(110);
  expect(box!.height).toBeLessThanOrEqual(150);
  await expect(page.getByTestId('stuora-mascot-eyes')).toBeVisible();
  await launcher.click();
  await expect(page.getByText('Connected search beta · Read-only')).toBeVisible();
});
