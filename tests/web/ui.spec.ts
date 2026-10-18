import { expect, test } from '@playwright/test';
import { backend } from './account-fixtures';
test('responsive branding and real empty Housing without invented offers', async ({ page }) => {
  await backend(page); await page.goto('/');
  await expect(page.getByText('Community housing', { exact: true })).toBeVisible();
  await expect(page.getByText('No housing listings found.', { exact: true })).toBeVisible();
  // The former SVG category thumbnails are now real bundled editorial images.
  await expect.poll(async () => page.locator('img[src*="editorial"]').count()).toBeGreaterThanOrEqual(6);
  await expect.poll(async () => page.locator('img[src*="editorial"]').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
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

test('community catalogs do not imply fake posts and offer a safe path', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse Trips', exact: true }).click();
  await expect(page.getByText('No trips listings found.', { exact: true })).toBeVisible();
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

test('community category tiles disclose that posting remains gated', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  await expect(page.getByText('Posting soon', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Browse Housing', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Browse Marketplace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Browse Jobs', exact: true }).click();
  await expect(page.getByText('No jobs listings found.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Browse Housing instead' }).click();
  await expect(page.getByRole('button', { name: 'Refresh listings' })).toBeVisible();
});

test('real Trips/Jobs/Events catalog queries active persisted rows and keeps participation disabled', async ({ page }) => {
  await backend(page);
  let observed: string[] = [];
  const cityFilters: string[] = [];
  await page.route('**/rest/v1/listings?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    const kind = params.get('kind');
    if (!['eq.trip', 'eq.job', 'eq.event'].includes(kind || '')) return route.fallback();
    expect(params.get('status')).toBe('eq.active');
    observed.push(kind!);
    if (params.has('city')) cityFilters.push(params.get('city')!);
    const select = params.get('select') || '';
    expect(select).toContain('id,title,description,city,price_cents,created_at');
    const item = {
      id: 'persisted-item-1',
      title: kind === 'eq.job' ? 'Real opportunity' : kind === 'eq.event' ? 'Real student event' : 'Real student trip',
      description: 'From the database',
      city: 'Berlin',
      price_cents: 0,
      created_at: '2026-10-01T09:00:00Z',
      trip_details: { destination:'Potsdam', starts_at:'2026-11-02T12:00:00Z', ends_at:null, capacity:4 },
      job_details: { company_name:'A real employer', compensation_text:'€18/hour', workplace_mode:'hybrid' },
      event_details: { venue_name:'Campus Hall', starts_at:'2026-11-02T12:00:00Z', ends_at:null, capacity:50 },
    };
    await route.fulfill({ json: [item] });
  });
  await page.goto('/');
  for (const [label, expected, back] of [
    ['Trips','Real student trip','Back to Trips'],
    ['Jobs','Real opportunity','Back to Jobs'],
    ['Events','Real student event','Back to Events'],
  ] as const) {
    await page.getByRole('button', {name: `Browse ${label}`, exact:true}).click();
    await expect(page.getByRole('button', {name: `View ${expected}`})).toBeVisible();
    if (label === 'Events') {
      await page.getByRole('textbox', {name:'Filter listings by city'}).fill('Berlin');
      await expect(page.getByRole('button', {name:'Clear city filter'})).toBeVisible();
    }
    await page.getByRole('button', {name: `View ${expected}`}).click();
    await expect(page.getByText('Publishing, joining, and applying are not enabled until the reviewed safety migration is qualified.')).toBeVisible();
    await expect(page.getByRole('button', {name:back})).toBeVisible();
    await page.goto('/');
  }
  expect(observed).toContain('eq.trip');
  expect(observed).toContain('eq.job');
  expect(observed).toContain('eq.event');
  expect(cityFilters.some(value => value.includes('Berlin'))).toBe(true);
});

test('generated editorial images are bundled and displayed without replacing real listing data', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  const photos = page.locator('img[src*="editorial"]');
  await expect.poll(() => photos.count()).toBeGreaterThanOrEqual(6);
  await expect.poll(() => photos.first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText('No housing listings found.', { exact: true })).toBeVisible();
  await expect(page.getByText('No marketplace listings found.', { exact: true })).toBeAttached();
  await page.getByRole('button', { name: 'Browse Trips', exact: true }).click();
  await expect(page.getByText('No trips listings found.', { exact: true })).toBeVisible();
  const tripArtwork = page.locator('img[src*="editorial"]');
  await expect.poll(() => tripArtwork.first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test('Housing and Marketplace use one clear discovery toolbar and avoid duplicate posting CTAs', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse Housing', exact: true }).click();
  await expect(page.getByText('Refine your search', { exact: true })).toBeVisible();
  await expect(page.getByText('Available listings', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh listings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post housing listing' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Create in this category' })).toHaveCount(0);
  const city = page.getByRole('textbox', { name: 'Filter listings by city' });
  await city.fill('Berlin');
  await expect(page.getByRole('button', { name: 'Clear listing filters' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear listing filters' }).click();
  await expect(city).toHaveValue('');
  const search = page.getByPlaceholder('Search housing…');
  await search.fill('Kreuzberg');
  await expect(page.getByRole('button', { name: 'Clear housing search' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear housing search' }).click();
  await expect(search).toHaveValue('');
  await page.getByRole('button', { name: 'Browse Marketplace', exact: true }).click();
  await expect(page.getByText('Refine your search', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post marketplace listing' })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('user-selected photos replace original category thumbnails and remain bundled on web', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  const mappedPhotos = {
    Housing: 'housing-community.webp',
    Marketplace: 'marketplace-community.webp',
    Trips: 'trips-community.webp',
    Jobs: 'jobs-community.webp',
    Events: 'events-community.webp',
  } as const;
  for (const [category, expectedFile] of Object.entries(mappedPhotos)) {
    const tile = page.getByRole('button', { name: `Browse ${category}`, exact: true }).first();
    const photo = tile.locator('img');
    await expect(photo).toHaveCount(1);
    expect(await photo.getAttribute('src')).toContain(expectedFile.replace('.webp', '.'));
    await expect.poll(() => photo.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  }
  // The moodboard is only a reference; People still uses previously branded artwork.
  const peoplePhoto = page.getByRole('button', { name: 'Browse People', exact: true }).first().locator('img');
  expect(await peoplePhoto.getAttribute('src')).toContain('/people.');
  await page.getByRole('button', { name: 'Browse Events', exact: true }).first().click();
  const banner = page.locator('img[src*="events-community."]').first();
  await expect(banner).toBeVisible();
  await expect.poll(() => banner.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText('No events listings found.', { exact: true })).toBeVisible();
});

test('all Stuora web destinations load from shareable URLs and retain their page identity on refresh', async ({ page }) => {
  await backend(page);
  for (const [slug, label] of [
    ['housing', 'Housing'], ['marketplace', 'Marketplace'], ['trips', 'Trips'],
    ['jobs', 'Jobs'], ['events', 'Events'], ['people', 'People'],
  ] as const) {
    await page.goto('/?utm_source=testing&stuora=' + slug);
    await expect(page.getByText('STUORA / ' + label.toUpperCase(), { exact: true })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('stuora')).toBe(slug);
    await expect.poll(() => new URL(page.url()).searchParams.get('utm_source')).toBe('testing');
    await page.reload();
    await expect(page.getByText('STUORA / ' + label.toUpperCase(), { exact: true })).toBeVisible();
  }
  await page.goto('/?stuora=messages');
  await expect(page.getByText('Sign in to use secure messaging', { exact: true })).toBeVisible();
  await page.goto('/?stuora=profile');
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
  for (const slug of ['create-housing', 'create-marketplace'] as const) {
    await page.goto('/?stuora=' + slug);
    await expect(page.getByText('Create on Stuora', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: slug === 'create-housing' ? 'Post Housing' : 'Post Marketplace' })).toBeVisible();
  }
});

test('browser Back and Forward restore the correct category, without breaking query parameters', async ({ page }) => {
  await backend(page);
  await page.goto('/?utm_source=partner');
  await expect(page.getByText('Browse by category', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Browse Trips', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('stuora')).toBe('trips');
  await page.getByRole('button', { name: 'Browse Events', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('stuora')).toBe('events');
  await page.goBack();
  await expect(page.getByText('STUORA / TRIPS', { exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('stuora')).toBe('trips');
  await page.goBack();
  await expect(page.getByText('Browse by category', { exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('stuora')).toBe(null);
  await page.goForward();
  await expect(page.getByText('STUORA / TRIPS', { exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('utm_source')).toBe('partner');
});

test('desktop and mobile navigation buttons each reach the correct functional destination', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  const isMobile = test.info().project.name === 'mobile-web';
  await page.getByRole('button', { name: isMobile ? 'Explore' : 'Open Explore', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('stuora')).toBe('housing');
  await page.getByRole('button', { name: isMobile ? 'Messages' : 'Open Messages', exact: true }).click();
  await expect(page.getByText('Sign in to use secure messaging', { exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('stuora')).toBe('messages');
  await page.getByRole('button', { name: isMobile ? 'You' : 'Open your profile', exact: true }).click();
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('stuora')).toBe('profile');
  await page.getByRole('button', { name: 'Create listing' }).click();
  await expect(page.getByText('Create on Stuora', { exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('stuora')).toBe('create-marketplace');
  await page.getByRole('button', { name: isMobile ? 'Home' : 'Open Home', exact: true }).click();
  await expect(page.getByText('Browse by category', { exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.has('stuora')).toBe(false);
  await page.getByRole('button', { name: 'Open Student Savings' }).click();
  await expect(page.getByText('Student life for less.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close Student Savings' }).click();
});

test('switching Explore categories restores the top of the new category rather than an old scroll position', async ({ page }) => {
  await backend(page);
  await page.goto('/?stuora=housing');
  const scroll = page.getByTestId('explore-scroll');
  await expect(scroll).toBeVisible();
  await scroll.evaluate(node => { node.scrollTop = 400; });
  await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeGreaterThan(30);
  await page.getByRole('button', { name: 'Browse Marketplace', exact: true }).click();
  await expect(page.getByText('STUORA / MARKETPLACE', { exact: true })).toBeVisible();
  await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBe(0);
});

test('responsive UI audit: 320px phone through 1600px desktop preserve usable navigation and prevent sideways overflow', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'Viewport matrix runs on desktop browser once');
  await backend(page);
  await page.goto('/');
  for (const width of [320, 360, 390, 768, 959, 960, 1024, 1280, 1600]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.getByText('Find your people.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Browse Housing', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Student Savings' })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    if (width >= 960) {
      await expect(page.getByRole('button', { name: 'Open Home', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create listing', exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Explore', exact: true })).toBeVisible();
    }
  }
});
