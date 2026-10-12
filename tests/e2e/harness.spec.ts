import { expectNoSeriousViolations } from './support/axe.js';
import { expect, test } from './support/fixtures.js';
import { seededAdmin, signInAs } from './support/sign-in.js';

// RNF-005, RNF-010, RF-1100, ADR-008, P1-13: the harness itself. A request outside 127.0.0.1 is
// blocked and fails the test; the axe helper fails on a critical violation; the sign-in helper
// opens a session of the seeded administrator in the browser context.

test.describe('network guard', () => {
  test('RNF-005 blocks a request outside 127.0.0.1 and records it', async ({ page, network }) => {
    await page.goto('/robots.txt');

    const outcome = await page.evaluate(() =>
      fetch('https://example.com/outside').then(
        () => 'reached',
        () => 'blocked',
      ),
    );

    expect(outcome).toBe('blocked');
    expect(network.takeBlocked()).toEqual(['https://example.com/outside']);
  });

  test('RNF-005 a blocked request nobody expected fails the test', async ({ page }) => {
    test.fail();
    await page.goto('/robots.txt');

    await page.evaluate(() => fetch('https://example.com/unexpected').catch(() => 'blocked'));
  });

  test('RNF-005 requests to 127.0.0.1 and data URLs are not blocked', async ({ page, network }) => {
    await page.goto('/');
    await page.evaluate(() => fetch('data:text/plain,ok'));

    expect(network.takeBlocked()).toEqual([]);
  });
});

test.describe('axe helper', () => {
  test('RNF-010 fails on a critical violation', async ({ page }) => {
    await page.setContent(
      '<!doctype html><html lang="en"><title>t</title><img src="data:,"></html>',
    );

    await expect(expectNoSeriousViolations(page)).rejects.toThrow(/image-alt/);
  });

  test('RNF-010 passes on a page without violations', async ({ page }) => {
    await page.setContent(
      '<!doctype html><html lang="en"><title>t</title><main><h1>Title</h1></main></html>',
    );

    await expectNoSeriousViolations(page);
  });
});

test.describe('sign-in helper', () => {
  test('RF-1100 opens a session of the seeded administrator in the browser context', async ({
    context,
    page,
  }) => {
    await signInAs(context, seededAdmin);

    const response = await page.request.get('/api/session');
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ user: { userName: seededAdmin.userName } });
  });

  test('RF-1009 a signed-in browser opens a page that needs a session', async ({
    context,
    page,
  }) => {
    await signInAs(context, seededAdmin);

    const response = await page.goto('/projects');

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/projects$/);
  });
});
