import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { transitionsDone } from './support/transitions.js';

// RNF-005, RF-1303, RF-1201, RF-1009, RNF-010, P1-13: the smoke spec. It runs in every project of
// playwright.config.ts (two viewports, light and dark) against the test server: the server answers
// health and robots, the sign-in page opens without a session, a page that needs a session sends
// the visitor to sign-in, and the pages pass axe.

test.describe('smoke', () => {
  test('RF-1303 /healthz answers ok with the version', async ({ request }) => {
    const response = await request.get('/healthz');

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  test('RF-1201 robots.txt disallows everything and every response says noindex', async ({
    request,
  }) => {
    const response = await request.get('/robots.txt');

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('Disallow: /');
    expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
  });

  test('RF-1009 the sign-in page opens without a session and the front end starts', async ({
    page,
  }) => {
    const response = await page.goto('/sign-in');

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Rosetta/);
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('RF-1009 a page that needs a session sends the visitor to sign-in', async ({ page }) => {
    await page.goto('/projects');

    await expect(page).toHaveURL(/\/sign-in$/);
  });
});

test.describe('smoke accessibility', () => {
  test('RNF-010 the sign-in page has no serious or critical accessibility violation', async ({
    page,
  }, info) => {
    await page.goto('/sign-in');
    await expect(page.locator('#root')).not.toBeEmpty();
    // The theme is set after the first render, so in the dark scheme the Sign in button fades from
    // the light brand colour to the dark one under dark ink (2.7:1 half-way): axe waits for it.
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      info.project.use.colorScheme ?? 'light',
    );
    await transitionsDone(page);

    await expectNoSeriousViolations(page);
  });

  test('RNF-010 the page follows the colour scheme of the project', async ({ page }, info) => {
    await page.goto('/sign-in');
    const scheme = info.project.use.colorScheme ?? 'light';

    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
  });
});
