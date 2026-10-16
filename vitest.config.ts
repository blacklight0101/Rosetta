import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

// Vitest's 5 s test timeout is a limit for a quiet machine. A test that takes 1 s alone takes
// several times that when the CPU and disk are shared, so the default is 60 s; a hung test still fails.
const shared = {
  environment: 'node',
  env: { ROSETTA_TEST: '1' },
  testTimeout: 60_000,
  hookTimeout: 60_000,
} as const;
const offline = { ...shared, setupFiles: 'tests/support/block-network.ts' } as const;

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...offline,
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          // The front end has its own project: it needs a DOM (conventions section 7, DEC-112).
          exclude: ['tests/unit/web/**'],
        },
      },
      {
        plugins: [preact()],
        test: {
          ...offline,
          name: 'web',
          environment: 'happy-dom',
          setupFiles: ['tests/support/block-network.ts', 'tests/unit/web/setup.ts'],
          include: ['tests/unit/web/**/*.test.{ts,tsx}'],
        },
      },
      { test: { ...offline, name: 'integration', include: ['tests/integration/**/*.test.ts'] } },
      { test: { ...shared, name: 'e2e', include: ['tests/e2e/**/*.test.ts'] } },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'text', 'lcov'],
      thresholds: {
        lines: 80,
        'src/domain/**': { lines: 90, branches: 85 },
        'src/application/**': { lines: 90, branches: 85 },
      },
    },
  },
});
