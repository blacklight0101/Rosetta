import type { BrowserContext } from '@playwright/test';
import { z } from 'zod';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations, gotoWithoutScripts } from './support/axe.js';
import { e2eOrigin } from './support/server-config.js';
import { replayRunId } from './support/seed-replay.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-506, RF-507, RF-1013, RNF-010, P1-43: the run replay page of a recorded run whose cards hold a
// `<script>` element, an `onerror` attribute and a `javascript:` link. The account owns the run
// (seed-replay.ts); the report is built through the API, as the page that offers it would, and the
// page is opened with JavaScript on (play, pause, step) and off (the whole timeline as a list).
// Whatever the run's text says, nothing in it runs.

/** One step of the replay playback (templates/report/replay.js, `data-interval` unset). */
const stepMs = 700;

const pagePath = (project: string): string =>
  `/runs/${replayRunId(project)}/files/report/replay.html`;

/** Asks for the report of the account's run, as the run page's button would (cookies and token). */
async function buildReport(context: BrowserContext, project: string): Promise<void> {
  const cookie = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const session = await context.request.get('/api/session', { headers: { cookie } });
  const { csrfToken } = z.object({ csrfToken: z.string() }).parse(await session.json());
  const built = await context.request.post(`/api/runs/${replayRunId(project)}/report`, {
    headers: { origin: e2eOrigin(), cookie, 'x-csrf-token': csrfToken },
  });
  expect(built.status()).toBe(200);
}

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('replay', info.project.name));
  await buildReport(context, info.project.name);
});

test.describe('with JavaScript, the controls', () => {
  test('RF-506 plays, pauses and steps through the run, and passes axe', async ({ page }, info) => {
    await page.goto(pagePath(info.project.name));
    const steps = page.locator('[data-replay-steps] > li');
    const total = await steps.count();
    expect(total).toBeGreaterThan(3);
    await expect(page.getByRole('heading', { name: 'Run replay', level: 1 })).toBeVisible();
    await expectNoSeriousViolations(page);
    // The run plays at one step in `stepMs`: the timers of the page run on a clock the test
    // moves, so playing and pausing take no real time.
    await page.clock.install();

    await page.getByRole('button', { name: 'Restart' }).click();
    await expect(steps.locator('visible=true')).toHaveCount(0);

    await page.getByRole('button', { name: 'Step' }).click();
    await expect(steps.locator('visible=true')).toHaveCount(1);
    await page.getByRole('button', { name: 'Step' }).click();
    await expect(steps.locator('visible=true')).toHaveCount(2);

    await page.getByRole('button', { name: 'Play' }).click();
    await page.getByRole('button', { name: 'Pause' }).click();
    const paused = await steps.locator('visible=true').count();
    await page.clock.runFor(1_500);
    await expect(steps.locator('visible=true')).toHaveCount(paused);

    await page.getByRole('button', { name: 'Play' }).click();
    await page.clock.runFor(stepMs * total);
    await expect(steps.locator('visible=true')).toHaveCount(total);
  });
});

test.describe('with JavaScript, the text of the run', () => {
  test('RF-507 nothing in the text of the run runs, and no link leads to javascript:', async ({
    page,
  }, info) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await page.goto(pagePath(info.project.name));
    await page.getByRole('button', { name: 'Play' }).click();

    expect(await page.evaluate<unknown>('globalThis.__pwned')).toBeUndefined();
    expect(dialogs).toEqual([]);
    await expect(
      page.locator('a[href^="javascript:" i], main img, iframe, object, embed'),
    ).toHaveCount(0);
    await expect(page.locator('script')).toHaveCount(1);
    await expect(page.locator('body')).toContainText('<script>');
  });

  test('RF-1013 the page carries its policy and refuses to send a referrer', async ({
    page,
  }, info) => {
    const response = await page.goto(pagePath(info.project.name));

    expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(response?.headers()['x-content-type-options']).toBe('nosniff');
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('RF-506 shows the whole timeline as a list, controls hidden', async ({ page }, info) => {
    await page.goto(pagePath(info.project.name));

    const steps = page.locator('[data-replay-steps] > li');
    expect(await steps.count()).toBeGreaterThan(3);
    await expect(steps.locator('visible=true')).toHaveCount(await steps.count());
    await expect(page.getByRole('button', { name: 'Play' })).toHaveCount(0);
    await expect(page.locator('body')).toContainText('<script>');
  });
});

test.describe('with the script of the page not run', () => {
  test('RNF-010 passes axe on the replay page as a browser without JavaScript shows it', async ({
    page,
  }, info) => {
    await gotoWithoutScripts(page, pagePath(info.project.name));

    const steps = page.locator('[data-replay-steps] > li');
    await expect(steps.locator('visible=true')).toHaveCount(await steps.count());
    await expect(page.getByRole('button', { name: 'Play' })).toHaveCount(0);
    await expectNoSeriousViolations(page);
    await expect(page.getByRole('button', { name: 'Play' })).toHaveCount(0);
  });
});
