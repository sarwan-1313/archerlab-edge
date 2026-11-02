import { expect, test } from '@playwright/test';
import { openPage } from './support/helpers';

test('Home loads with its calls to action', async ({ page }) => {
  await openPage(page, '/', 'ArcherLab Edge');
  await expect(page.getByRole('button', { name: /Start Analysis/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Analyse a Video/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore User Guide' })).toBeVisible();
});

test('Home leads to Video Analysis', async ({ page }) => {
  await openPage(page, '/', 'ArcherLab Edge');
  await page.getByRole('button', { name: /Analyse a Video/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Video Analysis' })).toBeVisible();
  await expect(page).toHaveURL(/\/video$/);
});
