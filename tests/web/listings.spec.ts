import { expect, test, type Page } from '@playwright/test';
import { account, session, signin } from './account-fixtures';
const userId = session().user.id;
type Media = { id: string; listing_id: string; object_path: string; sort_order: number; created_at: string };
type Stored = { id: string; owner_id: string; kind: string; status: string; title: string; description: string; city: string; price_cents: number; housing_details: Record<string, unknown> | null; marketplace_details: Record<string, unknown> | null; listing_media: Media[] };
const pixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zuz0AAAAASUVORK5CYII=', 'base64');
function api() {
  const rows: Stored[] = [];
  let failure = '';
  let sequence = 10;
  let mediaSequence = 1;
  return {
    rows, fail: (endpoint: string) => { failure = endpoint; },
    install: async (page: Page) => {
      await page.route('https://stuora-test.invalid/**', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.pathname.endsWith('/token')) return route.fulfill({ json: session() });
        if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
        if (url.pathname.endsWith('/profiles')) return route.fulfill({ json: { id: userId, display_name: 'Alice Student', city: 'Berlin', bio: '', student_status: 'unverified', is_discoverable: true }, contentType: 'application/vnd.pgrst.object+json' });
        if (url.pathname.includes('/storage/v1/object/public/listing-media/')) return route.fulfill({ body: pixelPng, contentType: 'image/png' });
        if (url.pathname.startsWith('/storage/v1/object/listing-media/') && req.method() === 'POST') {
          const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/listing-media/'.length));
          return route.fulfill({ status: 200, json: { Key: `listing-media/${path}` } });
        }
        if (url.pathname === '/storage/v1/object/listing-media' && req.method() === 'DELETE') return route.fulfill({ status: 200, json: [] });
        const endpoint = url.pathname.split('/').at(-1)!;
        if (failure === endpoint) { failure = ''; return route.fulfill({ status: 403, json: { message: 'Controlled test error', code: '42501' } }); }
        if (endpoint === 'save_student_listing') {
          const args = req.postDataJSON();
          expect(args).not.toHaveProperty('owner_id'); expect(args).not.toHaveProperty('status');
          expect(args.p_price_cents).toBeGreaterThanOrEqual(0);
          const id = args.p_id ?? `00000000-0000-0000-0000-${String(sequence++).padStart(12, '0')}`;
          const previous = rows.find(r => r.id === id);
          const item: Stored = { id, owner_id: userId, kind: args.p_kind, status: 'active', title: args.p_title, description: args.p_description, city: args.p_city, price_cents: args.p_price_cents, housing_details: args.p_kind === 'housing' ? { listing_id: id, housing_type: args.p_housing_type, rent_cents: args.p_price_cents, furnished: args.p_furnished, bills_included: args.p_bills_included } : null, marketplace_details: args.p_kind === 'marketplace' ? { listing_id: id, item_condition: args.p_condition, pickup_only: true, quantity: 1 } : null, listing_media: previous?.listing_media ?? [] };
          const index = rows.findIndex(r => r.id === id); if (index < 0) rows.push(item); else rows[index] = item;
          return route.fulfill({ json: id });
        }
        if (endpoint === 'listing_media') {
          if (req.method() === 'POST') {
            const input = req.postDataJSON();
            const media: Media = { id: `media-${mediaSequence++}`, listing_id: input.listing_id, object_path: input.object_path, sort_order: input.sort_order, created_at: new Date().toISOString() };
            const row = rows.find(item => item.id === input.listing_id); if (row) row.listing_media.push(media);
            return route.fulfill({ json: media, contentType: 'application/vnd.pgrst.object+json' });
          }
          if (req.method() === 'DELETE') {
            const mediaId = url.searchParams.get('id')?.replace('eq.', '');
            for (const row of rows) row.listing_media = row.listing_media.filter(media => media.id !== mediaId);
            return route.fulfill({ status: 204 });
          }
        }
        if (endpoint === 'listings') {
          if (req.method() === 'PATCH') {
            expect(url.searchParams.get('owner_id')).toBe(`eq.${userId}`);
            expect(req.postDataJSON()).toEqual({ status: 'closed' });
            const item = rows.find(r => `eq.${r.id}` === url.searchParams.get('id'))!; item.status = 'closed';
            return route.fulfill({ json: { id: item.id }, contentType: 'application/vnd.pgrst.object+json' });
          }
          const idFilter = url.searchParams.get('id');
          if (idFilter) {
            const item = rows.find(r => `eq.${r.id}` === idFilter);
            return item ? route.fulfill({ json: item, contentType: 'application/vnd.pgrst.object+json' }) : route.fulfill({ status: 406, json: { message: 'Not found' } });
          }
          const filtered = rows.filter(r => `eq.${r.kind}` === url.searchParams.get('kind') && (!url.searchParams.has('status') || `eq.${r.status}` === url.searchParams.get('status')) && (!url.searchParams.has('owner_id') || `eq.${r.owner_id}` === url.searchParams.get('owner_id')) && (!url.searchParams.has('title') || r.title.toLowerCase().includes(url.searchParams.get('title')!.slice(7, -1).toLowerCase())));
          return route.fulfill({ json: filtered.slice(Number(url.searchParams.get('offset') ?? 0), Number(url.searchParams.get('offset') ?? 0) + Number(url.searchParams.get('limit') ?? 1000)) });
        }
        return route.fulfill({ status: 404, json: { message: `Unexpected endpoint ${endpoint}` } });
      });
    },
  };
}
async function explore(page: Page, category: string) {
  if (await page.getByText('Explore', { exact: true }).count()) await page.getByText('Explore', { exact: true }).click();
  else await page.getByText(category, { exact: true }).first().click();
  await page.getByRole('button', { name: `Browse ${category}`, exact: true }).click();
}
for (const category of ['Housing', 'Marketplace']) {
  test(`${category}: publish, second-client read, reload, edit and archive`, async ({ page, browser }) => {
    const data = api(); await data.install(page); await account(page); await signin(page);
    await expect(page.getByLabel('Display name')).toHaveValue('Alice Student');
    await page.getByRole('button', { name: 'Create listing', exact: true }).click();
    await page.getByRole('button', { name: `Post ${category}`, exact: true }).click();
    await page.getByLabel('Listing title').fill(`${category} from Alice`);
    await page.getByLabel('Listing description').fill('A real persistent student listing');
    await page.getByLabel(category === 'Housing' ? 'Monthly rent (EUR)' : 'Price (EUR)').fill(category === 'Housing' ? '650.25' : '0');
    await page.getByRole('button', { name: 'Publish listing', exact: true }).click();
    await expect(page.getByText('Listing saved. Add up to six real photos below.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add photo (0/6)' })).toBeVisible();
    expect(data.rows[0].price_cents).toBe(category === 'Housing' ? 65025 : 0);
    const secondContext = await browser.newContext(); const second = await secondContext.newPage(); await data.install(second); await second.goto('/'); await explore(second, category);
    await second.getByRole('button', { name: `View ${category} from Alice` }).click();
    await expect(second.getByText('A real persistent student listing')).toBeVisible();
    await expect(second.getByRole('button', { name: 'Edit listing', exact: true })).toHaveCount(0);
    await page.reload(); await explore(page, category);
    await page.getByRole('button', { name: `View ${category} from Alice` }).click();
    if (test.info().project.name === 'mobile-web') {
      const savings = await page.getByRole('button', { name: 'Open Student Savings' }).boundingBox();
      const nav = await page.getByRole('button', { name: 'Create listing', exact: true }).boundingBox();
      expect(savings!.y + savings!.height).toBeLessThanOrEqual(nav!.y);
    }
    await page.screenshot({ path: test.info().outputPath('listing-detail.png') });
    await page.getByRole('button', { name: 'Edit listing', exact: true }).click();
    await page.getByLabel('Listing title').fill(`${category} edited`);
    await page.getByRole('button', { name: 'Save listing changes' }).click();
    await expect(page.getByText('Listing saved. Add up to six real photos below.')).toBeVisible();
    await expect(page.getByText(`${category} edited`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Archive listing', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm archive', exact: true }).click();
    await expect(page.getByText('Listing archived. It is no longer publicly discoverable.')).toBeVisible();
    await second.reload(); await explore(second, category);
    await expect(second.getByText(`No ${category.toLowerCase()} listings found.`)).toBeVisible();
    await page.getByRole('button', { name: 'My listings', exact: true }).click();
    await page.getByRole('button', { name: `View ${category} edited` }).click();
    await expect(page.getByText('Berlin · closed')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit listing', exact: true })).toHaveCount(0);
    await secondContext.close();
  });
}

test('owner uploads and removes a real listing photo while public discovery renders it', async ({ page, browser }) => {
  const data = api(); await data.install(page); await account(page); await signin(page);
  await page.getByRole('button', { name: 'Create listing', exact: true }).click();
  await page.getByRole('button', { name: 'Post Marketplace', exact: true }).click();
  await page.getByLabel('Listing title').fill('Media desk');
  await page.getByLabel('Price (EUR)').fill('25');
  await page.getByRole('button', { name: 'Publish listing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add photo (0/6)' })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add photo (0/6)' }).click();
  const fileChooser = await chooser;
  await fileChooser.setFiles({ name: 'desk.png', mimeType: 'image/png', buffer: pixelPng });
  await expect(page.getByText('Photo uploaded and attached to this listing.')).toBeVisible();
  await expect(page.getByLabel('Media desk photo 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add photo (1/6)' })).toBeVisible();

  const publicContext = await browser.newContext(); const publicPage = await publicContext.newPage(); await data.install(publicPage); await publicPage.goto('/'); await explore(publicPage, 'Marketplace');
  await expect(publicPage.getByLabel('Media desk cover photo')).toBeVisible();
  await publicPage.getByRole('button', { name: 'View Media desk' }).click();
  await expect(publicPage.getByLabel('Media desk photo 1')).toBeVisible();
  await expect(publicPage.getByRole('button', { name: 'Remove photo 1' })).toHaveCount(0);
  await publicContext.close();

  await page.getByRole('button', { name: 'Remove photo 1' }).click();
  await expect(page.getByText('Photo removed.')).toBeVisible();
  await expect(page.getByLabel('Media desk photo 1')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add photo (0/6)' })).toBeVisible();
});

test('anonymous posting gate, listing read failure, validation and save retry preserve input', async ({ page }) => {
  const data = api(); await data.install(page); await page.goto('/');
  await page.getByRole('button', { name: 'Create listing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open account' })).toBeVisible();
  await expect(page.getByLabel('Listing title')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open account' }).click(); await signin(page);
  await expect(page.getByLabel('Display name')).toHaveValue('Alice Student');
  await page.getByRole('button', { name: 'Create listing', exact: true }).click();
  await page.getByRole('button', { name: 'Publish listing', exact: true }).click();
  await expect(page.getByText('Title must be between 3 and 140 characters.')).toBeVisible();
  await page.getByLabel('Listing title').fill('Desk from Alice'); await page.getByLabel('Price (EUR)').fill('-1');
  await page.getByRole('button', { name: 'Publish listing', exact: true }).click();
  await expect(page.getByText(/Enter a EUR price/)).toBeVisible(); expect(data.rows).toHaveLength(0);
  await page.getByLabel('Price (EUR)').fill('35.50'); data.fail('save_student_listing');
  await page.getByRole('button', { name: 'Publish listing', exact: true }).click();
  await expect(page.getByText(/Could not save. Your input is preserved./)).toBeVisible();
  await expect(page.getByLabel('Listing title')).toHaveValue('Desk from Alice');
  await page.getByRole('button', { name: 'Publish listing', exact: true }).click();
  await expect(page.getByText('Listing saved. Add up to six real photos below.')).toBeVisible();
  await explore(page, 'Marketplace');
  await expect(page.getByRole('button', { name: 'Refresh listings' })).toBeEnabled();
  data.fail('listings'); await page.getByRole('button', { name: 'Refresh listings' }).click();
  await expect(page.getByText(/Could not load listings/)).toBeVisible();
  await page.getByRole('button', { name: 'Retry listings' }).click();
  await expect(page.getByRole('button', { name: 'View Desk from Alice' })).toBeVisible();
  await page.getByPlaceholder('Search marketplace…').fill('No match');
  await expect(page.getByText('No marketplace listings found.')).toBeVisible();
  await page.getByPlaceholder('Search marketplace…').fill('Desk');
  await expect(page.getByRole('button', { name: 'View Desk from Alice' })).toBeVisible();
});

test('public pagination loads beyond the first page', async ({ page }) => {
  const data = api();
  for (let n = 0; n < 25; n++) data.rows.push({ id: `page-${n}`, owner_id: userId, kind: 'marketplace', status: 'active', title: `Desk ${n}`, description: '', city: 'Berlin', price_cents: 100, housing_details: null, marketplace_details: { item_condition: 'good' }, listing_media: [] });
  await data.install(page); await page.goto('/'); await explore(page, 'Marketplace');
  await expect(page.getByRole('button', { name: /^View Desk / })).toHaveCount(24);
  await page.getByRole('button', { name: 'Load more listings' }).click();
  await expect(page.getByRole('button', { name: /^View Desk / })).toHaveCount(25);
  await expect(page.getByRole('button', { name: 'Load more listings' })).toHaveCount(0);
});

test('unsupported categories cannot publish session-only data', async ({ page }) => {
  await api().install(page); await page.goto('/');
  await page.getByRole('button', { name: 'Create listing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Post Trips', exact: true })).toHaveCount(0);
  await expect(page.getByText('Publish local demo listing', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Post Housing', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post Marketplace', exact: true })).toBeVisible();
});

test('stalled listing read times out and retry recovers without stale results', async ({ page }) => {
  const data = api(); await data.install(page); await page.clock.install();
  await page.goto('/'); await explore(page, 'Marketplace');
  await expect(page.getByRole('button', { name: 'Refresh listings' })).toBeEnabled();
  let held = false;
  let settled = false;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rest/v1/listings?**', async route => {
    if (held) return route.fallback();
    held = true; await waiting;
    await route.fulfill({ json: [{ id: 'late', title: 'Late desk', price_cents: 100, city: 'Berlin', status: 'active', listing_media: [] }] }).catch(() => {});
    settled = true;
  });
  await page.getByRole('button', { name: 'Refresh listings' }).click();
  await expect.poll(() => held).toBe(true);
  await expect(page.getByLabel('Loading listings')).toBeVisible();
  await page.clock.fastForward(15001);
  await expect(page.getByText('Could not load listings. Check your connection and retry.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry listings' }).click();
  await expect(page.getByText('No marketplace listings found.')).toBeVisible();
  release();
  await expect.poll(() => settled).toBe(true);
  await page.clock.runFor(100);
  await expect(page.getByRole('button', { name: 'View Late desk' })).toHaveCount(0);
});

test('search changes cancel old listing requests and their timers', async ({ page }) => {
  const data = api(); await data.install(page); await page.clock.install();
  await page.goto('/'); await explore(page, 'Marketplace');
  await expect(page.getByRole('button', { name: 'Refresh listings' })).toBeEnabled();
  let held = false;
  let settled = false;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rest/v1/listings?**', async route => {
    const title = new URL(route.request().url()).searchParams.get('title');
    if (title !== 'ilike.%Old%') return route.fallback();
    held = true; await waiting;
    await route.fulfill({ json: [{ id: 'old', title: 'Old desk', price_cents: 100, city: 'Berlin', status: 'active', listing_media: [] }] }).catch(() => {});
    settled = true;
  });
  await page.getByPlaceholder('Search marketplace…').fill('Old');
  await expect.poll(() => held).toBe(true);
  await page.getByPlaceholder('Search marketplace…').fill('New');
  await expect(page.getByText('No marketplace listings found.')).toBeVisible();
  release(); await expect.poll(() => settled).toBe(true);
  await page.clock.fastForward(15001);
  await expect(page.getByText(/Could not load listings/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View Old desk' })).toHaveCount(0);
});

for (const category of ['Housing', 'Marketplace'] as const) {
  test(`${category}: city and maximum-price filters are sent to Supabase and clear correctly`, async ({ page }) => {
    const data = api(); await data.install(page);
    const requests: { kind: string | null; city: string | null; maximum: string | null }[] = [];
    await page.route('**/rest/v1/listings?*', async route => {
      const params = new URL(route.request().url()).searchParams;
      requests.push({ kind: params.get('kind'), city: params.get('city'), maximum: params.get('price_cents') });
      await route.fulfill({ json: [] });
    });
    await page.goto('/');
    await page.getByRole('button', { name: `Browse ${category}`, exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Filter listings by city' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Maximum listing price (EUR)' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Filter listings by city' }).fill('Potsdam');
    await page.getByRole('textbox', { name: 'Maximum listing price (EUR)' }).fill('650.25');
    await expect.poll(() => requests.some(r => r.kind === `eq.${category.toLowerCase()}` &&
      r.city === 'ilike.%Potsdam%' && r.maximum === 'lte.65025')).toBe(true);
    await expect(page.getByText('No real listings match these filters. Clear the filters or adjust the city and maximum price.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear listing filters' }).click();
    await expect(page.getByRole('textbox', { name: 'Filter listings by city' })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: 'Maximum listing price (EUR)' })).toHaveValue('');
    await expect.poll(() => requests.some(r => r.kind === `eq.${category.toLowerCase()}` && r.city === null && r.maximum === null)).toBe(true);
  });
}
