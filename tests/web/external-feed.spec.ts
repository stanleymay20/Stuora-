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
