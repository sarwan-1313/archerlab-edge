import { expect, test } from '@playwright/test';
import { openPage } from './support/helpers';

test('the Privacy page loads and explains what is stored', async ({ page }) => {
  await openPage(page, '/privacy', 'Privacy');
  await expect(page.getByRole('heading', { level: 2, name: 'What runs on this device' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'What is stored on this device' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Your data on this device' })).toBeVisible();
});
