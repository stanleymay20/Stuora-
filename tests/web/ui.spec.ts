import { expect, test } from '@playwright/test';
import { backend } from './account-fixtures';
test('responsive branding, real empty Housing and interactive demo preview', async ({ page }) => {
  await backend(page); await page.goto('/');
  await expect(page.getByText('Housing near you', { exact: true })).toBeVisible();
  await expect(page.getByText('No housing listings found.', { exact: true })).toBeVisible();
  expect(await page.locator('svg').count()).toBeGreaterThan(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (test.info().project.name === 'mobile-web') {
    const first = await page.getByRole('button', { name: 'Browse Housing', exact: true }).boundingBox();
    const fourth = await page.getByRole('button', { name: 'Browse Jobs', exact: true }).boundingBox();
    expect(Math.abs(first!.y - fourth!.y)).toBeLessThan(2);
  } else {
    await expect(page.getByText(/Find your people./)).toBeVisible();
    await expect.poll(async () => page.locator('img').evaluateAll(imgs => imgs.every(img => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0))).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath('home.png') });
  await page.getByRole('button', { name: /^Preview / }).first().click();
  await expect(page.getByText('Demo preview · not a live offer', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close demo preview', exact: true }).click();
  await expect(page.getByText('Demo preview · not a live offer', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'See all housing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh listings' })).toBeVisible();
});
test('styled email login and searchable demo messages expose no fake sending', async ({ page }) => {
  await backend(page); await page.goto('/');
  await page.getByText('You', { exact: true }).click();
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('welcome.png') });
  await page.getByText('Messages', { exact: true }).first().click();
  await page.getByPlaceholder('Search demo conversations…').fill('Emma');
  await expect(page.getByRole('button', { name: /^Preview conversation with / })).toHaveCount(1);
  await page.getByRole('button', { name: 'Preview conversation with Emma L.' }).click();
  await expect(page.getByText('Preview only · secure messaging is coming next.')).toBeVisible();
  await page.getByPlaceholder('Search demo conversations…').fill('No match');
  await expect(page.getByText('No demo conversations match.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Send message|Continue with Google|Continue with Apple/ })).toHaveCount(0);
});
