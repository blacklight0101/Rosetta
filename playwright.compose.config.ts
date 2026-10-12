import { defineConfig } from '@playwright/test';
import { origin } from './tests/compose/stack.js';

// RF-1301, P1-45: Chromium against the running Compose stack (compose.yaml and compose.ci.yaml),
// for the compose-smoke job of CI: `npx playwright test --config=playwright.compose.config.ts smoke`,
// then, after the stack has been restarted, `... persistence`. It starts no server of its own.

export default defineConfig({
  testDir: 'tests/compose',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results/compose',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: origin, browserName: 'chromium' },
});
