import { runScoreReader } from './score-reader-cli.js';

// P1-47: the entry of `npm run spike:reader`; the work is in score-reader-cli.ts.
process.exitCode = await runScoreReader({
  argv: process.argv.slice(2),
  env: process.env,
  fetch: (url, init) => fetch(url, init),
  write: (line) => {
    process.stdout.write(`${line}\n`);
  },
  now: () => performance.now(),
});
