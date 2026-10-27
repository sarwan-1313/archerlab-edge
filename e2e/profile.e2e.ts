import { expect, test } from '@playwright/test';
import { openPage } from './support/helpers';

test('a new athlete is invited to analyse a video for a form status', async ({ page }) => {
  await openPage(page, '/profile', 'Athlete Profile');
  await expect(page.getByRole('heading', { level: 2, name: 'Form status' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Analyse a video' })).toBeVisible();
});
