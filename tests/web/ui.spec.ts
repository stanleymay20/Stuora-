import { expect, test } from '@playwright/test';
import { backend } from './account-fixtures';
test('responsive branding and real empty Housing without invented offers', async ({ page }) => {
  await backend(page); await page.goto('/');
  await expect(page.getByText('Community housing', { exact: true })).toBeVisible();
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
  await expect(page.getByRole('button', { name: /^Preview / })).toHaveCount(0);
  await expect(page.getByText(/Prague weekend|TechStart|42,80/)).toHaveCount(0);
  await page.getByRole('button', { name: 'See all housing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh listings' })).toBeVisible();
});
test('styled email login and secure messaging gate expose no fake conversations', async ({ page }) => {
  await backend(page); await page.goto('/');
  await page.getByText('You', { exact: true }).click();
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('welcome.png') });
  await page.getByText('Messages', { exact: true }).first().click();
  await expect(page.getByText('Sign in to use secure messaging', { exact: true })).toBeVisible();
  await expect(page.getByText('Emma L.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send message' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open account' })).toBeVisible();
});
