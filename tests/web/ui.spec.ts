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

test('desktop reference navigation preserves real browse, messaging and account gates', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'Desktop navigation differs from the mobile bottom bar');
  await backend(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Home' })).toBeVisible();
  await expect(page.getByText('Browse by category', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open Explore' }).click();
  await expect(page.getByRole('button', { name: 'Refresh listings' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Messages' }).click();
  await expect(page.getByText('Sign in to use secure messaging', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open your profile' }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create listing' }).click();
  await expect(page.getByText('Sign in and complete your profile to publish a listing.')).toBeVisible();
  await page.getByRole('button', { name: 'Open Home' }).click();
  await expect(page.getByText('Community housing', { exact: true })).toBeVisible();
});

test('first listing CTA uses existing protected publishing path on desktop and mobile', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Post housing listing' })).toBeVisible();
  await page.getByRole('button', { name: 'Post housing listing' }).click();
  await expect(page.getByText('Sign in and complete your profile to publish a listing.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post Housing' })).toBeVisible();
  await page.getByRole('button', { name: 'Open account' }).click();
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Post marketplace listing' }).click();
  await expect(page.getByText('Sign in and complete your profile to publish a listing.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post Marketplace' })).toBeVisible();
});

test('listing search with zero results offers clear-search instead of misleading post suggestion', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse Housing', exact: true }).click();
  await page.getByPlaceholder('Search housing…').fill('no-results-search');
  await expect(page.getByRole('button', { name: 'Clear search' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post housing listing' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByPlaceholder('Search housing…')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Post housing listing' })).toBeVisible();
});

test('mobile homepage retains a genuine Berlin hero and four-up responsive discovery', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-web', 'Mobile-only hero regression');
  await backend(page);
  await page.goto('/');
  await expect(page.getByText('STUDENT LIFE, CONNECTED', { exact: true })).toBeVisible();
  await expect(page.getByText('Browse by category', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Search housing listings…')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('homepage scroll container is viewport-bounded and responds to wheel on desktop and mobile web', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  const viewport = page.getByTestId('home-scroll');
  await expect(viewport).toBeVisible();
  // Expose a draggable scrollbar as a fallback when device wheel gestures are unavailable.
  expect(await viewport.evaluate(element => getComputedStyle(element).scrollbarWidth)).not.toBe('none');
  await expect.poll(async () => viewport.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(100);
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + Math.min(bounds!.height / 2, 250));
  await page.mouse.wheel(0, 700);
  await expect.poll(async () => viewport.evaluate(element => element.scrollTop)).toBeGreaterThan(40);
  await expect(page.getByText('Marketplace', { exact: true }).first()).toBeAttached();
});

test('illustrated discovery tiles remain real category actions and hero search works by click', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Search housing listings' })).toBeVisible();
  await page.getByPlaceholder('Search housing listings…').fill('Kreuzberg');
  await page.getByRole('button', { name: 'Search housing listings' }).click();
  await expect(page.getByText('Housing', { exact: true }).first()).toBeVisible();
  await expect(page.getByPlaceholder('Search housing…')).toHaveValue('Kreuzberg');
  await expect(page.getByText('No housing listings found.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByPlaceholder('Search housing…')).toHaveValue('');
  await page.getByRole('button', { name: 'Browse Marketplace', exact: true }).click();
  await expect(page.getByText('Make more of student life with local, secondhand essentials.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post marketplace listing' })).toBeVisible();
});

test('unavailable illustrated categories do not imply real posts and offer a working safe path', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse Trips', exact: true }).click();
  await expect(page.getByText('Trips is not available yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Browse Housing instead' })).toBeVisible();
  await page.getByRole('button', { name: 'Browse Housing instead' }).click();
  await expect(page.getByRole('button', { name: 'Refresh listings' })).toBeVisible();
});

test('Student Savings is accessible from navigation without blocking the homepage', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  const savings = page.getByRole('button', { name: 'Open Student Savings' });
  await expect(savings).toBeVisible();
  const bounds = await savings.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeLessThan(90);
  await savings.click();
  await expect(page.getByText('Student life for less.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close Student Savings' }).click();
  await expect(page.getByText('Community housing', { exact: true })).toBeVisible();
});

test('compact homepage listing previews keep their real first-post actions discoverable', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  const post = page.getByRole('button', { name: 'Post housing listing' });
  await expect(post).toBeVisible();
  await expect(page.getByText('No housing listings found.', { exact: true })).toBeVisible();
  if (test.info().project.name === 'desktop') {
    const emptyCard = page.getByText('No housing listings found.', { exact: true }).locator('..').locator('..');
    const bounds = await emptyCard.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeLessThan(230);
  }
  await post.click();
  await expect(page.getByText('Sign in and complete your profile to publish a listing.')).toBeVisible();
});

test('unavailable category tiles are visibly disclosed before navigation', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  await expect(page.getByText('Coming soon', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Browse Housing', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Browse Marketplace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Browse Jobs', exact: true }).click();
  await expect(page.getByText('Jobs is not available yet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Browse Housing instead' }).click();
  await expect(page.getByRole('button', { name: 'Refresh listings' })).toBeVisible();
});
