import { defineConfig } from '@playwright/test';
import { e2eOrigin } from './tests/e2e/support/server-config.js';
import { behaviouralProject, phoneTag, views, visualTag } from './tests/e2e/support/views.js';

// P1-13, architecture section 17, orchestration README section 1: Chromium against the test server
// (tests/e2e/support/serve.ts: disposable database, ROSETTA_TEST=1, fake provider, fake GitHub).
// Four projects, the four views of the page walk (tests/e2e/support/views.ts): the two viewports
// (1280x800 for the web UI, 360x780 for the landing page, sign-in and report) in the light and the
// dark colour scheme. The browser resolves only 127.0.0.1; the fixtures abort every other request
// and fail the test (RNF-005).
//
// Which test runs where is decided by its tag, so a new spec needs no change here:
// - no tag: a behavioural test. It runs once, in desktop-light. Its axe checks
//   (`expectNoSeriousViolations`) are made there in all four views on the page as it is
//   (tests/e2e/support/axe.ts), so a state reached only in the middle of a test keeps its check in
//   light and dark, at 1280 and at 360 px.
// - `@visual`: runs in all four projects. The visual sweep (tests/e2e/visual/) opens every page the
//   suite visits and checks axe, the colour scheme and that nothing scrolls sideways.
// - `@phone`: a test about the 360 px layout. It runs in desktop-light and in phone-light, where it
//   runs on its own, so it must not depend on an earlier test of its file.
// Tag a test with `test('RF-123 ...', { tag: '@visual' }, async (...) => ...)`, or a describe block.

const origin = e2eOrigin();
const visual = new RegExp(visualTag, 'u');
const visualOrPhone = new RegExp(`${visualTag}|${phoneTag}`, 'u');

/** The tests each project runs: desktop-light every test, the others the tagged ones only. */
const selection: Record<(typeof views)[number]['name'], { grep?: RegExp }> = {
  [behaviouralProject]: {},
  'desktop-dark': { grep: visual },
  'phone-light': { grep: visualOrPhone },
  'phone-dark': { grep: visual },
};

const projects = views.map(({ name, viewport, colorScheme }) => ({
  name,
  ...selection[name],
  use: { browserName: 'chromium' as const, viewport, colorScheme },
}));

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  globalTeardown: './tests/e2e/support/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: origin,
    launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] },
  },
  projects,
  webServer: {
    command: 'node --import ./scripts/register-ts.mjs tests/e2e/support/serve.ts',
    url: `${origin}/healthz`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
