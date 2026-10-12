// RNF-005, P1-13: builds the front end and runs the Playwright project (playwright.config.ts)
// against a disposable schema of the PostgreSQL at ROSETTA_TEST_DATABASE_URL.
// Usage: node scripts/run-e2e.mjs [--ci] [playwright arguments]
// With --ci (the step of `npm run test:ci`) it runs on Linux where a database is configured and
// otherwise says it was skipped and succeeds; the Windows job has no database service.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const [, , ...args] = process.argv;
const ci = args[0] === '--ci';
const passThrough = ci ? args.slice(1) : args;
const database = process.env.ROSETTA_TEST_DATABASE_URL ?? '';

function runNode(script, scriptArgs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...scriptArgs], { stdio: 'inherit' });
    child.on('exit', (code) => {
      resolve(code ?? 1);
    });
  });
}

if (ci && (process.platform !== 'linux' || database === '')) {
  const why =
    database === ''
      ? 'ROSETTA_TEST_DATABASE_URL is not set'
      : 'it runs on Linux only (the CI database service)';
  process.stdout.write(`End-to-end tests skipped: ${why}.\n`);
} else if (database === '') {
  process.stderr.write(
    'run-e2e: ROSETTA_TEST_DATABASE_URL is not set; point it at a disposable PostgreSQL.\n',
  );
  process.exitCode = 1;
} else {
  const vite = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
  const playwright = require.resolve('@playwright/test/cli');
  const built = await runNode(vite, ['build', '--config', 'web/vite.config.ts']);
  process.exitCode = built === 0 ? await runNode(playwright, ['test', ...passThrough]) : built;
}
