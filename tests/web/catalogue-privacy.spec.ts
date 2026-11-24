import { expect, test, type Page } from '@playwright/test';
import { asStudent, backend } from './account-fixtures';

// Student-posted listings, photos and groups are for signed-in GISMA students.
// The server enforces it (RLS and a private listing-media bucket); these tests
// check every client asks for nothing it may not have and loads photos only
// through short-lived signed URLs.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function watchStudentContent(page: Page) {
  const seen: string[] = [];
  page.on('request', req => {
    const path = new URL(req.url()).pathname;
    if (/\/rest\/v1\/(listings|listing_media|student_groups|housing_details|marketplace_details)\b/.test(path)
        || path.includes('/storage/v1/object/')) seen.push(`${req.method()} ${path}`);
  });
  return seen;
}

for (const [who, setup, title, button] of [
  ['signed-out visitor', async (_: Page) => {}, 'For GISMA students', 'Sign in to browse'],
  ['legacy non-GISMA account', (p: Page) => asStudent(p, 'legacy@example.com'), 'Stuora is only for GISMA students', 'Open Profile'],
] as const) {
  test(`a ${who} sees the student-only gate and requests no student listings, groups or photos`, async ({ page }) => {
    await setup(page);
    await backend(page);
    const seen = watchStudentContent(page);
    await page.goto('/');
    await expect(page.getByTestId('student-catalogue-gate')).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    for (const category of ['Housing', 'Marketplace', 'Groups', 'Trips']) {
      await page.goto(`/?stuora=${category.toLowerCase()}`);
      await expect(page.getByTestId('student-catalogue-gate')).toBeVisible();
    }
    // Sign-in, recovery, legal, privacy and safety stay reachable.
    await page.goto('/');
    await page.getByRole('button', { name: button }).click();
    await expect(page.getByTestId('student-catalogue-gate')).toHaveCount(0);
    expect(seen).toEqual([]);
  });
}

test('a GISMA student loads listing photos through signed URLs, never the public bucket path', async ({ page }) => {
  await asStudent(page);
  await backend(page);
  const path = 'owner-id/listing-1/cover.webp';
  const signRequests: unknown[] = [];
  const objectRequests: string[] = [];
  await page.route('**/rest/v1/listings?*', async route => {
    const kind = new URL(route.request().url()).searchParams.get('kind');
    if (kind !== 'eq.housing') return route.fulfill({ json: [] });
    return route.fulfill({ json: [{
      id: 'listing-1', owner_id: 'owner-id', kind: 'housing', status: 'active', title: 'Bright room', description: 'Near campus',
      city: 'Berlin', price_cents: 50000, currency: 'EUR', created_at: '2026-11-01T09:00:00Z', updated_at: '2026-11-01T09:00:00Z',
      review_status: 'not_required', reviewed_at: null,
      housing_details: { listing_id: 'listing-1', housing_type: 'room', rent_cents: 50000, furnished: true, bills_included: false },
      marketplace_details: null,
      listing_media: [{ id: 'media-1', listing_id: 'listing-1', object_path: path, sort_order: 0, created_at: '2026-11-01T09:00:00Z' }],
    }] });
  });
  await page.route('**/storage/v1/object/sign/listing-media', async route => {
    signRequests.push(route.request().postDataJSON());
    return route.fulfill({ json: [{ path, signedURL: `/object/sign/listing-media/${path}?token=student-token`, error: null }] });
  });
  await page.route('**/storage/v1/object/**', async route => {
    // Routes registered later are tried first: let the signing request reach its handler.
    if (route.request().method() === 'POST') return route.fallback();
    objectRequests.push(new URL(route.request().url()).pathname);
    return route.fulfill({ contentType: 'image/png', body: PNG });
  });
  await page.goto('/?stuora=housing');
  const cover = page.getByRole('img', { name: 'Bright room cover photo' });
  await expect(cover).toBeVisible();
  await expect.poll(() => cover.evaluate(node => (node as HTMLElement).outerHTML)).toContain('token=student-token');
  expect(signRequests.length).toBeGreaterThanOrEqual(1);
  expect((signRequests[0] as { paths: string[] }).paths).toEqual([path]);
  expect(objectRequests.every(p => p.includes('/object/sign/listing-media/'))).toBe(true);
  expect(objectRequests.some(p => p.includes('/object/public/'))).toBe(false);
});
