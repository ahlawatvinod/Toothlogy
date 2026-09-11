/**
 * TL-TEST-E2E-VISUAL-001 — visual regression of stable public pages.
 *
 * Each page is compared with its committed baseline at a desktop and a phone
 * width, with animations off. Pages chosen because their content does not
 * depend on the database (sign-in, registration, the concern router, the
 * privacy page). A deliberate design change updates the baselines with
 * `npx playwright test visual --update-snapshots`, reviewed like code.
 */

import { expect, test } from '@playwright/test';

const PAGES = [
  ['login', '/login'],
  ['register', '/register'],
  ['which-dentist', '/which-dentist'],
  ['privacy', '/privacy'],
] as const;

const SIZES = [
  ['desktop', { width: 1280, height: 900 }],
  ['phone', { width: 375, height: 812 }],
] as const;

for (const [name, path] of PAGES) {
  for (const [size, viewport] of SIZES) {
    test(`${name} looks as it did (${size})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(path, { timeout: 240_000 });
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${name}-${size}.png`, { fullPage: true, animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 });
    });
  }
}
