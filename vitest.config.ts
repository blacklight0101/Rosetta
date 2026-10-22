import preact from '@preact/preset-vite';
import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

// Local runs use half the cores (at least two). The suite is mostly file system and in-process
// server work; on Windows, with several agents sharing the machine, a worker per core pushed single
// tests past their timeouts and crashed workers (0xC0000005, 0xC0000409). CI runners are dedicated,
// so they keep Vitest's default. `--maxWorkers` on the command line still overrides this.
const localWorkers = Math.max(2, Math.floor(availableParallelism() / 2));
const workers = process.env['CI'] === undefined ? { maxWorkers: localWorkers } : {};

// Vitest's 5 s test timeout is a limit for a quiet machine. A test that takes 1 s alone takes
// several times that when the CPU is shared, so the default is 60 s; a test that hangs still fails.
const shared = {
  environment: 'node',
  env: { ROSETTA_TEST: '1' },
  testTimeout: 60_000,
  hookTimeout: 60_000,
} as const;
const offline = { ...shared, setupFiles: 'tests/support/block-network.ts' } as const;

// P1-178: CI splits the run in shards (`--shard=n/N --reporter=blob`); a shard sees only part of the code
// coverage, so it cannot meet the thresholds. ROSETTA_COVERAGE_SHARD=1 turns the check off for a
// shard run only; the merge job (`vitest --merge-reports --coverage`) never sets it and enforces them.
const thresholds = {
  lines: 80,
  'src/domain/**': { lines: 90, branches: 85 },
  'src/application/**': { lines: 90, branches: 85 },
} as const;
const shardRun = process.env['ROSETTA_COVERAGE_SHARD'] === '1';

export default defineConfig({
  test: {
    ...workers,
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
      ...(shardRun ? {} : { thresholds }),
    },
  },
});
