import { defineConfig } from '@playwright/test';
import { e2eOrigin } from './tests/e2e/support/server-config.js';

// P1-13, architecture section 17, orchestration README section 1: Chromium against the test server
// (tests/e2e/support/serve.ts: disposable database, ROSETTA_TEST=1, fake provider, fake GitHub).
// Four projects: the two viewports (1280x800 for the web UI, 360x780 for the landing page, sign-in
// and report) in the light and the dark colour scheme. The browser resolves only 127.0.0.1; the
// fixtures abort every other request and fail the test (RNF-005).

const origin = e2eOrigin();
const viewports = {
  desktop: { width: 1280, height: 800 },
  phone: { width: 360, height: 780 },
} as const;

const projects = (['desktop', 'phone'] as const).flatMap((device) =>
  (['light', 'dark'] as const).map((colorScheme) => ({
    name: `${device}-${colorScheme}`,
    use: { browserName: 'chromium' as const, viewport: viewports[device], colorScheme },
  })),
);

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
