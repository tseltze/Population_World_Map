import { test, expect } from '@playwright/test';

test.describe('World Map smoke', () => {
  test('selecting a country shows its card and highlights it on the map', async ({ page }) => {
    await page.goto('/');

    const us = page.locator('app-world-map svg path#us');
    await expect(us).toBeVisible(); // map SVG rendered

    // The US path is concave (Alaska balloons its bounding box), so a geometric
    // click can land on a neighbour. Dispatch the event straight to the element.
    await us.dispatchEvent('click');

    // The selection flows shell → panel (card) and shell → map (highlight).
    await expect(page.locator('app-country-panel .country-card h3').first()).toHaveText('United States');
    await expect(us).toHaveClass(/selected/);
  });

  test('coloring by GDP renders a choropleth legend', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-world-map svg path#us')).toBeVisible();

    await page.locator('.controls select').first().selectOption('gdp');

    await expect(page.locator('app-world-map .legend-title')).toHaveText('GDP per capita');
  });
});
