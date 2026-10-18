// RF-1304, RF-1107, P1-55: the smoke test of a deployment (docs/runbooks/deploy.md, section Smoke
// test). Given the base URL it checks, in order:
//   health    GET /healthz answers 200 with status ok;
//   redirect  for an https base URL only: plain http://<host>/healthz is redirected to https;
//   landing   GET / answers the landing page;
//   sign-in   the smoke account signs in and does not have to change its password (RF-1107);
//   scan      a cheap scan (no provider) of ROSETTA_SMOKE_REPO completes; the project it created
//             is deleted again, so the account's workspace stays as it was;
// then it signs out. Exit 0 when every check passed, 1 when one failed, 2 on a usage error.
//
// Usage: node scripts/smoke.mjs <BASE_URL>      (or BASE_URL in the environment)
//   ROSETTA_SMOKE_USER, ROSETTA_SMOKE_PASSWORD   the account (required; never printed)
//   ROSETTA_SMOKE_REPO                           default https://github.com/dotnet-architecture/eShopModernizing
//   ROSETTA_SMOKE_SCAN_TIMEOUT_MS                default 300000
import { accountFrom, messageOf, missingAccount, RosettaClient } from './deploy/client.mjs';

const usage = 'usage: node scripts/smoke.mjs <BASE_URL> (or set BASE_URL)';
const defaultRepo = 'https://github.com/dotnet-architecture/eShopModernizing';

async function health(client) {
  const response = await client.request('GET', '/healthz');
  const answer = response.status === 200 ? await response.json() : undefined;
  if (answer?.status !== 'ok') throw new Error(`GET /healthz answered ${String(response.status)}`);
  return `version ${String(answer.version)}`;
}

async function redirect(client) {
  const plain = new URL('/healthz', client.base);
  plain.protocol = 'http:';
  const response = await fetch(plain, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  const location = response.headers.get('location') ?? '';
  const expected = new URL('/healthz', client.base).href;
  if (![301, 308].includes(response.status) || location !== expected) {
    throw new Error(`${plain.href} answered ${String(response.status)} to "${location}"`);
  }
  return `${plain.href} -> ${location}`;
}

async function landing(client) {
  const response = await client.request('GET', '/');
  const text = await response.text();
  if (response.status !== 200 || !text.includes('Rosetta')) {
    throw new Error(`GET / answered ${String(response.status)} without the landing page`);
  }
  return 'GET / 200';
}

async function signIn(client, account) {
  const user = await client.signIn(account);
  if (user.state === 'MustChangePassword') {
    throw new Error('the account must change its password first (RF-1107)');
  }
  return `signed in as ${String(user.userName)}`;
}

async function readJson(response, expected, what) {
  if (!expected.includes(response.status)) {
    throw new Error(`${what} answered ${String(response.status)}`);
  }
  return response.json();
}

async function scanOf(client, projectId, timeoutMs) {
  const start = await client.request('POST', `/api/projects/${projectId}/runs`, {
    body: { stage: 'scan' },
  });
  const run = await readJson(start, [202], 'starting the scan');
  let endState = 'no run.ended event';
  await client.followEvents(
    run.id,
    (event) => {
      if (event.type === 'run.ended') endState = String(event.data?.endState);
    },
    timeoutMs,
  );
  if (endState !== 'Completed') throw new Error(`the scan ${run.id} ended ${endState}`);
  return `run ${run.id} Completed`;
}

async function scan(client, env) {
  const repo = env.ROSETTA_SMOKE_REPO || defaultRepo;
  const timeoutMs = Number(env.ROSETTA_SMOKE_SCAN_TIMEOUT_MS || 300_000);
  const create = await client.request('POST', '/api/projects', { body: { url: repo } });
  const project = await readJson(create, [200, 201], 'creating the project');
  try {
    return await scanOf(client, project.id, timeoutMs);
  } finally {
    // Only a project this check created is removed; an existing one stays (RF-1107).
    if (create.status === 201) await client.request('DELETE', `/api/projects/${project.id}`);
  }
}

async function check(name, results, action) {
  try {
    results.push({ name, ok: true, detail: await action() });
    return true;
  } catch (error) {
    results.push({ name, ok: false, detail: messageOf(error) });
    return false;
  }
}

async function runChecks(client, account, env) {
  const results = [];
  await check('health', results, () => health(client));
  if (client.base.protocol === 'https:') await check('redirect', results, () => redirect(client));
  await check('landing', results, () => landing(client));
  if (await check('sign-in', results, () => signIn(client, account))) {
    await check('scan', results, () => scan(client, env));
  }
  const signedOut = await client.signOut().catch(messageOf);
  return { results, signedOut };
}

async function main(argv, env) {
  const baseUrl = argv[0] ?? env.BASE_URL ?? '';
  const account = accountFrom(env);
  if (baseUrl === '') throw Object.assign(new Error(usage), { exitCode: 2 });
  if (account === undefined) throw Object.assign(new Error(missingAccount), { exitCode: 2 });
  const { results, signedOut } = await runChecks(new RosettaClient(baseUrl), account, env);
  for (const { name, ok, detail } of results) {
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(8)}  ${detail}`);
  }
  console.log(`      sign-out  ${signedOut}`);
  const failed = results.filter((result) => !result.ok).length;
  console.log(failed === 0 ? `Smoke test passed on ${baseUrl}` : `Smoke test FAILED (${failed})`);
  return failed === 0 ? 0 : 1;
}

try {
  process.exitCode = await main(process.argv.slice(2), process.env);
} catch (error) {
  console.error(messageOf(error));
  process.exitCode = error?.exitCode ?? 1;
}
