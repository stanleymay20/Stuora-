import { expect, test } from '@playwright/test';
import { account, backend, signin } from './account-fixtures';

test.skip(process.env.EXPO_PUBLIC_STUORA_EXTERNAL_FEEDS !== 'enabled', 'Build the isolated test bundle with external feeds enabled.');
const provider = { id: 'ticketmaster', label: 'Ticketmaster', url: 'https://www.ticketmaster.de/', status: 'ok' };

test('external events remain usable when Stuora listings fail, report outages and allow retry', async ({ page }) => {
  await backend(page);
  let requests = 0;
  await page.route('**/rest/v1/listings?*', async route => {
    if (new URL(route.request().url()).searchParams.get('kind') !== 'eq.event') return route.fallback();
    return route.fulfill({ status: 403, json: { message: 'fixture database request denied' } });
  });
  await page.route('**/functions/v1/external-data', async route => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({ action: 'feed', kind: 'events', city: 'Berlin' });
    const sources = [{ ...provider, status: requests === 1 ? 'error' : 'ok' }];
    return route.fulfill({ json: { items: [], sources } });
  });
  await account(page);
  await signin(page);
  await page.getByText('Home', { exact: true }).click();
  await page.getByRole('button', { name: 'Browse Events', exact: true }).first().click();
  await page.getByLabel('Filter listings by city').fill('Berlin');
  await expect(page.getByText('Could not load events from Stuora.', { exact: false })).toBeVisible();
  await expect(page.getByText('External events couldn’t be checked.', { exact: false })).toBeVisible();
  await expect(page.getByText('No external events found for Berlin.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry external events' }).click();
  await expect(page.getByText('No external events found for Berlin.')).toBeVisible();
  expect(requests).toBe(2);
});

// Jobs API audit (25 Nov 2026). The external-data responses below are MOCKS; this proves the
// UI contract (states, attribution, link-out, refresh), not that a live provider returns jobs.
const adzuna = { id: 'adzuna', label: 'Jobs by Adzuna', url: 'https://www.adzuna.de', status: 'ok' };
const ba = { id: 'bundesagentur', label: 'Quelle: Bundesagentur für Arbeit', url: 'https://www.arbeitsagentur.de/jobsuche/', status: 'ok' };
const vacancy = {
  id: 'adzuna:4242', source: 'adzuna', title: 'Werkstudent Data Science (m/w/d)', subtitle: 'Muster GmbH',
  location: 'Berlin', startsAt: null, postedAt: '2026-11-20T08:00:00.000Z', url: 'https://www.adzuna.de/land/ad/4242',
};

async function openJobs(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/listings?*', route => route.fulfill({ json: [] }));
  await account(page);
  await signin(page);
  await page.getByText('Home', { exact: true }).click();
  await page.getByRole('button', { name: 'Browse Jobs', exact: true }).first().click();
  await page.getByLabel('Filter listings by city').fill('Berlin');
}

test('external jobs: disabled providers say so without a pointless retry', async ({ page }) => {
  await backend(page);
  await page.route('**/functions/v1/external-data', route =>
    route.fulfill({ status: 503, json: { code: 'FEATURE_DISABLED', error: 'No external sources are enabled for this category' } }));
  await openJobs(page);
  await expect(page.getByText('External jobs aren’t enabled yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry external jobs' })).toHaveCount(0);
});

test('external jobs: vacancies are attributed, link out, flag partial outages and refresh', async ({ page }) => {
  await backend(page);
  const bodies: unknown[] = [];
  await page.route('**/functions/v1/external-data', route => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ json: { items: [vacancy], sources: [adzuna, { ...ba, status: 'error' }] } });
  });
  await openJobs(page);
  const link = page.getByRole('link', { name: /Werkstudent Data Science.*from adzuna, opens external site/ });
  await expect(link).toBeVisible();
  await expect(page.getByText('Muster GmbH · Berlin')).toBeVisible();
  await expect(page.getByText('Source: Jobs by Adzuna ↗')).toBeVisible();
  await expect(page.getByText('Quelle: Bundesagentur für Arbeit (unavailable)')).toBeVisible();
  await expect(page.getByText('Some external sources are unavailable.', { exact: false })).toBeVisible();
  expect(bodies.at(-1)).toMatchObject({ action: 'feed', kind: 'jobs', city: 'Berlin' });
  // The original vacancy opens at the provider (no real network: the provider page is stubbed).
  await page.context().route('https://www.adzuna.de/**', route => route.fulfill({ body: 'provider page' }));
  const opened = page.context().waitForEvent('request', r => r.url() === vacancy.url);
  await link.click();
  expect((await opened).url()).toBe(vacancy.url);
  const before = bodies.length;
  await page.getByRole('button', { name: 'Refresh listings' }).click();
  await expect.poll(() => bodies.length).toBeGreaterThan(before);
});

test('external jobs: a forged or unsafe provider reply is shown as an error, never as jobs', async ({ page }) => {
  await backend(page);
  await page.route('**/functions/v1/external-data', route => route.fulfill({ json: {
    items: [{ ...vacancy, url: 'https://evil.example/apply' }], sources: [adzuna],
  } }));
  await openJobs(page);
  await expect(page.getByText('External sources returned an unexpected response.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: /Werkstudent Data Science/ })).toHaveCount(0);
});
