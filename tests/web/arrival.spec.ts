import { expect, test } from '@playwright/test';
import { asStudent, backend } from './account-fixtures';

test('new arrival can live in Brandenburg, study in Berlin and find ticket help before signing in', async ({ page }) => {
  await backend(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'My first 30 days', exact: true }).click();
  await page.getByRole('button', { name: 'Brandenburg an der Havel' }).click();
  await page.getByRole('button', { name: 'Berlin campus' }).click();
  await expect(page.getByText(/Donaustraße 42/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark done' })).toHaveCount(0);
  await page.getByRole('button', { name: 'I’m stuck' }).nth(1).click();
  await expect(page.getByText(/resend the link/)).toBeVisible();
  const popup = page.waitForEvent('popup');
  await page.context().route('https://service.stadt-brandenburg.de/**', route => route.fulfill({ body: 'City' }));
  await page.getByRole('button', { name: 'Open city registration service' }).click();
  await expect(await popup).toHaveURL(/service\.stadt-brandenburg\.de/);
});

test('student can save arrival choices, reject invalid dates and undo a completed task after reload', async ({ page }) => {
  await backend(page); await asStudent(page);
  async function openGuide() {
    await page.goto('/');
    await page.getByRole('button', { name: 'My first 30 days', exact: true }).click();
  }
  await openGuide();
  await page.getByRole('button', { name: 'Potsdam campus' }).click();
  await page.getByLabel('Arrival date', { exact: true }).fill('2026-02-31');
  await page.getByRole('button', { name: 'Set arrival date' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a valid date' })).toBeVisible();
  await page.getByLabel('Arrival date', { exact: true }).fill('2026-02-01');
  await page.getByRole('button', { name: 'Set arrival date' }).click();
  await page.getByRole('button', { name: 'Mark done' }).first().click();
  await expect(page.getByRole('button', { name: 'Done · undo' })).toBeVisible();
  await openGuide();
  await expect(page.getByText(/Konrad-Zuse-Ring 11/)).toBeVisible();
  await expect(page.getByLabel('Arrival date', { exact: true })).toHaveValue('2026-02-01');
  await page.getByRole('button', { name: 'Done · undo' }).click();
  await expect(page.getByRole('button', { name: 'Mark done' })).toHaveCount(3);
});
