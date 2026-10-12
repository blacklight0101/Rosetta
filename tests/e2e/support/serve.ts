import { access, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// The server process of an end-to-end run must not reach the network either (RNF-005).
import '../../support/block-network.js';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { TestDoubles } from '../../../src/presentation/test-doubles.js';
import { AnsweringProvider } from '../../support/answering-provider.js';
import { FakeGitHub } from '../../support/fake-github.js';
import { FIXTURE_SHA, fixtureArchive } from '../../support/snapshot-fixtures.js';
import { createDisposableSchema } from './database.js';
import { e2ePort } from './server-config.js';
import { seededAdmin, seedUsers } from './seed.js';
import { clearSessions } from './sign-in.js';

// RNF-005, ADR-008, P1-13: the end-to-end test server. Usage (from the repository root):
//   node --import ./scripts/register-ts.mjs tests/e2e/support/serve.ts
// It needs ROSETTA_TEST_DATABASE_URL, the built front end (`npm run build:web`) and the fixture
// archives; it makes a disposable schema, ROSETTA_TEST=1, the answering provider double and a fake GitHub that
// knows octo/demo, creates the seeded administrator through the bootstrap use case and the seeded
// user through CreateUser, listens on 127.0.0.1 at ROSETTA_E2E_PORT and removes everything on
// SIGTERM or SIGINT. The accounts exist before the port answers: a first start on a free port
// applies the migrations and bootstraps the administrator, the user is seeded, and only then the
// server starts on the port Playwright waits for.

const frontEnd = fileURLToPath(new URL('../../../dist/web/index.html', import.meta.url));

async function requireFrontEnd(): Promise<void> {
  try {
    await access(frontEnd);
  } catch {
    throw new Error('dist/web/index.html is missing; run "npm run build:web" first.');
  }
}

async function demoGitHub(): Promise<FakeGitHub> {
  return new FakeGitHub([
    {
      owner: 'octo',
      repo: 'demo',
      defaultBranch: 'main',
      refs: { main: FIXTURE_SHA },
      archive: await fixtureArchive('normal'),
      licence: 'MIT',
    },
  ]);
}

type Composer = (port: number) => ReturnType<typeof composeApplication>;

/** Composes the application with the fake provider and the fake GitHub, on a given port. */
async function composer(environment: ReturnType<typeof loadEnvironment>): Promise<Composer> {
  // RF-407: every role answers, except the summariser, whose call fails with RST-1506.
  const provider = new AnsweringProvider(['summariser']);
  const github = await demoGitHub();
  return (port) =>
    composeApplication({
      environment,
      listen: { host: '127.0.0.1', port },
      output: { write: () => true },
      doubles: TestDoubles.create(environment, { fetch: github.fetch, provider }),
    });
}

async function main(): Promise<void> {
  const databaseUrl = process.env['ROSETTA_TEST_DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error('ROSETTA_TEST_DATABASE_URL is not set.');
  }
  await requireFrontEnd();
  await clearSessions();
  const port = e2ePort();
  const schema = await createDisposableSchema(databaseUrl, port);
  const dataDir = join(tmpdir(), `rosetta-e2e-${String(port)}`);
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });
  const environment = loadEnvironment({
    DATABASE_URL: schema.url,
    ROSETTA_SECRET_KEY: Buffer.alloc(32, 3).toString('base64'),
    ROSETTA_PUBLIC_URL: `http://127.0.0.1:${String(port)}`,
    ROSETTA_DATA_DIR: dataDir,
    ROSETTA_ADMIN_USER: seededAdmin.userName,
    ROSETTA_ADMIN_PASSWORD: seededAdmin.password,
    // One hop: the test server trusts X-Forwarded-For from the browser, so each test has an
    // address of its own and the sign-in rate limit (10 a minute per address) never couples tests.
    ROSETTA_TRUST_PROXY: '1',
    // RF-407: Ollama is offered (the double stands in for it; nothing connects to this address).
    ROSETTA_OLLAMA_URL: 'http://127.0.0.1:11434',
    ROSETTA_LOG_LEVEL: 'error',
    ROSETTA_TEST: '1',
    ROSETTA_TEST_DATABASE_URL: databaseUrl,
  });
  const compose = await composer(environment);
  const preparation = compose(0);
  await preparation.start();
  await preparation.stop();
  await seedUsers(schema.url);
  const application = compose(port);
  const shutDown = (): void => {
    void (async () => {
      await application.stop();
      await schema.drop();
      await rm(dataDir, { recursive: true, force: true });
    })();
  };
  process.once('SIGTERM', shutDown);
  process.once('SIGINT', shutDown);
  await application.start();
}

main().catch((error: unknown) => {
  process.stderr.write(`e2e server: ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
