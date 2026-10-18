// RNF-017, P1-55: the one-time measurement of the hosted deployment (docs/runbooks/deploy.md,
// section RNF-017 measurement). Run it while two runs are in progress. It signs in, then
//   pages   requests each page --samples times, one after the other, and reports P50 and P95;
//           a page passes when its P95 is under 1 second;
//   events  follows the event stream of --run (a run of the signed-in account) for --watch-ms and
//           times every live event from its `at` to its arrival; it passes when there is at least
//           one live event and none took more than 2 seconds.
// The event delay compares the server's clock with this machine's, so synchronise this machine's
// clock first (Windows: `w32tm /resync`). Exit 0 when RNF-017 passes, 1 when it fails, 2 on a
// usage error.
//
// Usage: node scripts/measure-rnf017.mjs <BASE_URL> --run <runId> [--samples 20] [--watch-ms 120000]
//   ROSETTA_SMOKE_USER, ROSETTA_SMOKE_PASSWORD   the account that owns the run (never printed)
import { accountFrom, messageOf, missingAccount, RosettaClient } from './deploy/client.mjs';

const usage =
  'usage: node scripts/measure-rnf017.mjs <BASE_URL> --run <runId> [--samples n] [--watch-ms ms]';
const pages = ['/', '/healthz', '/api/session', '/api/projects', '/projects'];
const PAGE_LIMIT_MS = 1_000;
const EVENT_LIMIT_MS = 2_000;

function usageError(message = usage) {
  return Object.assign(new Error(message), { exitCode: 2 });
}

/** One `--flag value` pair; anything else is a usage error. */
function applyFlag(options, flag, value) {
  if (flag === '--run' && value) options.runId = value;
  else if (flag === '--samples' && Number(value) >= 1) options.samples = Number(value);
  else if (flag === '--watch-ms' && Number(value) >= 1) options.watchMs = Number(value);
  else throw usageError();
}

function parseArguments(argv) {
  const [baseUrl, ...flags] = argv;
  const options = { baseUrl, runId: undefined, samples: 20, watchMs: 120_000 };
  for (let index = 0; index < flags.length; index += 2) {
    applyFlag(options, flags[index], flags[index + 1]);
  }
  if (baseUrl === undefined || baseUrl.startsWith('--') || options.runId === undefined) {
    throw usageError();
  }
  return options;
}

/** The nearest-rank percentile of a list of milliseconds. */
function percentile(values, share) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(Math.ceil(share * sorted.length) - 1, 0)] ?? 0;
}

const ms = (value) => `${String(Math.round(value))} ms`;

async function timePage(client, path, samples) {
  const durations = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    const response = await client.request('GET', path);
    await response.arrayBuffer();
    durations.push(performance.now() - started);
    if (response.status >= 400) throw new Error(`GET ${path} answered ${String(response.status)}`);
  }
  const [p50, p95] = [percentile(durations, 0.5), percentile(durations, 0.95)];
  const detail = `p50 ${ms(p50)}  p95 ${ms(p95)}  (n=${String(samples)})`;
  return { name: `page ${path}`, ok: p95 < PAGE_LIMIT_MS, detail };
}

async function timeEvents(client, runId, watchMs) {
  const delays = [];
  const opened = Date.now();
  await client
    .followEvents(
      runId,
      (event, receivedAt) => {
        const at = Date.parse(event.at);
        if (at >= opened) delays.push(receivedAt - at);
      },
      watchMs,
    )
    .catch((error) => {
      // The watch ending on its timeout is the normal end of a run that is still going.
      if (error?.name !== 'TimeoutError') throw error;
    });
  if (delays.length === 0) return { name: 'events', ok: false, detail: 'no live event arrived' };
  const max = Math.max(...delays);
  const detail = `${String(delays.length)} live  p50 ${ms(percentile(delays, 0.5))}  p95 ${ms(
    percentile(delays, 0.95),
  )}  max ${ms(max)}`;
  return { name: 'events', ok: max <= EVENT_LIMIT_MS, detail };
}

async function main(argv, env) {
  const options = parseArguments(argv);
  const account = accountFrom(env);
  if (account === undefined) throw usageError(missingAccount);
  const client = new RosettaClient(options.baseUrl);
  await client.signIn(account);
  const results = [];
  try {
    // The stream is followed while the pages are timed; a run that cannot be followed is a failed
    // check, reported next to the page timings.
    const events = timeEvents(client, options.runId, options.watchMs).catch((error) => ({
      name: 'events',
      ok: false,
      detail: messageOf(error),
    }));
    for (const path of pages) results.push(await timePage(client, path, options.samples));
    results.push(await events);
  } finally {
    await client.signOut().catch(messageOf);
  }
  for (const { name, ok, detail } of results) {
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  ${detail}`);
  }
  const passed = results.every((result) => result.ok);
  console.log(passed ? 'RNF-017 pass' : 'RNF-017 FAIL');
  return passed ? 0 : 1;
}

try {
  process.exitCode = await main(process.argv.slice(2), process.env);
} catch (error) {
  console.error(messageOf(error));
  process.exitCode = error?.exitCode ?? 1;
}
