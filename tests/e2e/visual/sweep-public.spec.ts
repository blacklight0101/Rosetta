import { expect, test } from '../support/fixtures.js';
import { expectPageInView, holdAnimationsAtStart } from '../support/sweep.js';
import { submitSignIn } from '../support/sign-in-page.js';

// RNF-010, RF-1200, RF-1100, architecture.md section 17: the visual sweep of the pages a visitor
// without an account sees, in all four projects (@visual): the landing page and the sign-in page
// with its refusal. Each page follows the colour scheme, passes axe and never scrolls sideways, at
// 360 px either (the landing page and sign-in are phone pages). The sign-in page at rest is checked
// by smoke.spec.ts, whose accessibility block is tagged @visual too.

test.describe('visual sweep: signed out', { tag: '@visual' }, () => {
  test('RNF-010 the landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('legacy code');
    await holdAnimationsAtStart(page);

    await expectPageInView(page, 'static');
  });

  test('RNF-010 the sign-in page with its refusal', async ({ page }) => {
    await page.goto('/sign-in');
    await submitSignIn(page, { userName: 'nobody.here', password: 'not-the-password-at-all' });
    await expect(page.getByRole('alert')).toContainText('RST-2201');

    await expectPageInView(page);
  });
});
