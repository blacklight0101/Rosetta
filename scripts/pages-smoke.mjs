// RF-800, P1-50: the smoke step of the Pages workflow. Fetches the published index and fails (exit 1)
// when the page does not show the run id; it retries while the deployment reaches the public address.
// Usage: node --import ./scripts/register-ts.mjs scripts/pages-smoke.mjs <url> <runKey> [--attempts n] [--delay-ms ms]
//   --attempts  tries before the check fails; default 6
//   --delay-ms  wait between tries; default 10000
import { setTimeout as sleep } from 'node:timers/promises';

const { checkPublishedIndex } = await import('../src/infrastructure/report/published-site.ts');

const usage = 'usage: pages-smoke.mjs <url> <runKey> [--attempts n] [--delay-ms ms]';

function parseArguments(argv) {
  const [url, runKey, ...flags] = argv;
  if (url === undefined || runKey === undefined) throw new Error(usage);
  const options = { url, runKey, attempts: 6, delayMs: 10_000 };
  for (let index = 0; index < flags.length; index += 2) {
    const value = Number(flags[index + 1]);
    if (!Number.isInteger(value) || value < 0) throw new Error(usage);
    if (flags[index] === '--attempts') options.attempts = Math.max(value, 1);
    else if (flags[index] === '--delay-ms') options.delayMs = value;
    else throw new Error(usage);
  }
  return options;
}

async function fetchIndex(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return await response.text();
}

async function attemptOnce(url, runKey) {
  try {
    const check = checkPublishedIndex(await fetchIndex(url), runKey);
    return check.ok ? { ok: true } : { ok: false, reason: check.reason };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `${url} could not be read (${detail})` };
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  let outcome = { ok: false, reason: 'no attempt was made' };
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    outcome = await attemptOnce(options.url, options.runKey);
    if (outcome.ok) {
      console.log(`ok: ${options.url} shows run ${options.runKey}`);
      return 0;
    }
    if (attempt < options.attempts) await sleep(options.delayMs);
  }
  console.error(`The Pages smoke check failed: ${outcome.reason}`);
  return 1;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
