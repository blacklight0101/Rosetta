import { defineConfig } from 'vitest/config';

const shared = { environment: 'node', env: { ROSETTA_TEST: '1' } } as const;
const offline = { ...shared, setupFiles: 'tests/support/block-network.ts' } as const;

export default defineConfig({
  test: {
    projects: [
      { test: { ...offline, name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
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
