import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { e2eContactEmail } from './support/server-config.js';
import { seededUser, signInAs } from './support/sign-in.js';

// RF-1200, RF-1201, RNF-010, P1-15: the public landing page at `/`. It runs in every project of
// playwright.config.ts (1280 and 360 px wide, light and dark), so it is checked at both viewports
// and in both colour schemes against the running server, with JavaScript on and off.

const backgrounds = { light: 'rgb(244, 246, 246)', dark: 'rgb(13, 20, 19)' } as const;

async function stylesOf(page: Page, selector: string, property: string): Promise<string> {
  return await page
    .locator(selector)
    .first()
    .evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

test.describe('landing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('RF-1200 says what Rosetta does and offers Sign in', async ({ page }) => {
    await expect(page).toHaveTitle(/Rosetta/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('legacy code');
    await expect(page.getByText('Paste a public GitHub URL')).toBeVisible();

    await page.getByRole('link', { name: 'Sign in to try it' }).click();

    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('RF-1200 shows every section of the artboard', async ({ page }) => {
    for (const name of [
      'Watch it work',
      'From a GitHub URL to a hand-off your team can build from.',
      'No claim without the lines that prove it.',
      'You see the price before, during and after.',
      'Built to read code it does not trust.',
      'Any stack. Any model.',
    ]) {
      await expect(page.getByRole('heading', { name, level: 2 })).toBeAttached();
    }
    await expect(
      page.getByRole('heading', { level: 2, name: /master's final project/ }),
    ).toBeVisible();
    await expect(page.getByRole('list', { name: 'Pipeline' }).getByRole('listitem')).toHaveCount(6);
    await expect(page.getByRole('region', { name: 'Cited lines' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read the source on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/blacklight0101/Rosetta',
    );
  });

  test('RF-1200 labels the replay as a sample run and keeps the sample neutral', async ({
    page,
  }) => {
    const stage = page.getByRole('region', { name: 'Replay of a sample run' });

    await expect(stage.getByText('Sample run', { exact: true })).toBeVisible();
    await expect(stage.getByRole('meter', { name: 'Run cost' })).toBeVisible();
    await expect(stage.getByRole('list', { name: 'Event stream' })).toBeVisible();
    await expect(page.getByText('Sample run of Microsoft')).toBeVisible();
  });

  test('RF-1200 plays the replay once per 10 s cycle and pauses it on hover and on focus', async ({
    page,
  }) => {
    expect(await stylesOf(page, '.seg', 'animation-duration')).toBe('10s');
    expect(await stylesOf(page, '.seg', 'animation-iteration-count')).toBe('infinite');
    expect(await stylesOf(page, '.seg', 'animation-play-state')).toBe('running');

    await page.locator('.stage').hover();
    expect(await stylesOf(page, '.seg', 'animation-play-state')).toBe('paused');
    expect(await stylesOf(page, '.ev', 'animation-play-state')).toBe('paused');
    expect(await stylesOf(page, '.fill', 'animation-play-state')).toBe('paused');

    await page.mouse.move(0, 0);
    expect(await stylesOf(page, '.seg', 'animation-play-state')).toBe('running');
    await page.locator('.stage').focus();
    expect(await stylesOf(page, '.seg', 'animation-play-state')).toBe('paused');
  });

  test('RF-1200 shows the finished replay without motion under prefers-reduced-motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });

    for (const selector of ['.seg', '.ev', '.fill', '.swap-a', '.swap-b']) {
      expect(await stylesOf(page, selector, 'animation-name')).toBe('none');
    }
    expect(await stylesOf(page, '.swap-b', 'opacity')).toBe('1');
    expect(await stylesOf(page, '.swap-a', 'opacity')).toBe('0');
  });

  test('RNF-010 follows the colour scheme of the browser', async ({ page }, info) => {
    const scheme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light';

    expect(await stylesOf(page, 'body', 'background-color')).toBe(backgrounds[scheme]);
  });

  test('RNF-010 has no serious or critical accessibility violation', async ({ page }) => {
    await expectNoSeriousViolations(page);
  });

  test('RNF-010 never scrolls sideways', async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('RF-1200 loads without a console error or a policy violation', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));

    await page.reload();

    expect(problems).toEqual([]);
  });
});

test.describe('landing page without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('RF-1200 shows the whole page and keeps Sign in inside the screen', async ({
    page,
    viewport,
  }) => {
    await page.goto('/');
    const signIn = page.getByRole('banner').getByRole('link', { name: 'Sign in' });

    await expect(page.getByRole('heading', { level: 1 })).toContainText('legacy code');
    await expect(page.getByText('Sample run', { exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Pipeline' }).getByRole('listitem')).toHaveCount(6);
    await expect(page.getByRole('region', { name: 'Cited lines' })).toBeVisible();
    await expect(signIn).toBeVisible();
    const box = await signIn.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(
      viewport?.width ?? 0,
    );
  });

  test('RF-1200 still reaches the sign-in page with a click', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'Sign in to try it' }).click();

    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('RNF-010 follows the colour scheme of the browser without a script', async ({
    page,
  }, info) => {
    await page.goto('/');
    const scheme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light';

    await expect(page.locator('body')).toHaveCSS('background-color', backgrounds[scheme]);
  });
});

test.describe('landing page for a signed-in visitor', () => {
  test('RF-1200 goes to the projects of a signed-in user', async ({ context, page }) => {
    await signInAs(context, seededUser);

    await page.goto('/');

    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  });
});

test.describe('landing page reach', () => {
  test('RF-1201 offers Request access as an e-mail link when a contact address is configured', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Request access' })).toHaveAttribute(
      'href',
      `mailto:${e2eContactEmail}`,
    );
  });

  test('RF-1201 says noindex on the page and robots.txt disallows everything', async ({
    page,
    request,
  }) => {
    const response = await page.goto('/');

    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /');
  });
});
