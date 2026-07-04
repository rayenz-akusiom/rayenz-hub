import { expect, test } from '@playwright/test';

test('dailies link grid works after navigating away and back', async ({ page }) => {
   await page.goto('/');

   const firstTile = page.locator('#app-root .daily-tile').first();
   await expect(firstTile).toBeVisible();

   await page.getByRole('link', { name: 'Deck Review' }).click();
   await expect(page.locator('.deck-review-app')).toBeVisible();

   await page.getByRole('link', { name: 'Dailies' }).click();
   const tileAfterReturn = page.locator('#app-root .daily-tile').first();
   await expect(tileAfterReturn).toBeVisible();
   await expect(page.locator('#app-root .dailies-grid')).toBeVisible();
});
