import { access, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// The server process of an end-to-end run must not reach the network either (RNF-005).
import '../../support/block-network.js';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { migrateDatabase } from '../../../src/presentation/compose-migrations.js';
import { TestDoubles } from '../../../src/presentation/test-doubles.js';
import { FakeGitHub } from '../../support/fake-github.js';
import { archiveOfFolder } from '../../support/tree-archive.js';
import { FIXTURE_SHA, fixtureArchive } from '../../support/snapshot-fixtures.js';
import { removeWritableTree } from '../../support/writable-temp-root.js';
import { createDisposableSchema } from './database.js';
import { createE2eProvider } from './e2e-provider.js';
import { e2eContactEmail, e2ePort } from './server-config.js';
import { e2eServerKeyVariables } from './server-key.js';
import { seededAdmin, seedUsers } from './seed.js';
import { seedCost } from './seed-cost.js';
import { seedReplayRuns } from './seed-replay.js';
import { clearSessions } from './sign-in.js';
import { fixtureSecret } from '../../support/provider-key-fixtures.js';

// RNF-005, ADR-008, P1-13: the end-to-end test server. Usage (from the repository root):
//   node --import ./scripts/register-ts.mjs tests/e2e/support/serve.ts
// It needs ROSETTA_TEST_DATABASE_URL, the built front end (`npm run build:web`) and the fixture
// archives; it makes a disposable schema, ROSETTA_TEST=1, the answering provider double and a fake GitHub that
// knows octo/demo, creates the seeded administrator through the bootstrap use case and the seeded
// user through CreateUser, listens on 127.0.0.1 at ROSETTA_E2E_PORT and removes everything on
// SIGTERM or SIGINT. The accounts exist before the port answers: the migrate step runs on the
// schema, a first start on a free port bootstraps the administrator, the user is seeded, and only then the
// server starts on the port Playwright waits for.

const frontEnd = fileURLToPath(new URL('../../../dist/web/index.html', import.meta.url));

async function requireFrontEnd(): Promise<void> {
  try {
    await access(frontEnd);
  } catch {
    throw new Error('dist/web/index.html is missing; run "npm run build:web" first.');
  }
}

// P1-35: `octo/webforms` is the C# fixture repository, whose recorded understand run the live run
// page journeys replay (e2e-provider.ts). P1-46: `octo/ledger` is the COBOL fixture, a language
// without a pack (RF-112), whose reads the answering provider takes like those of `octo/demo`.
async function folderRepository(
  repo: string,
  folder: string,
): Promise<ConstructorParameters<typeof FakeGitHub>[0][number]> {
  return {
    owner: 'octo',
    repo,
    defaultBranch: 'main',
    refs: { main: FIXTURE_SHA },
    archive: await archiveOfFolder(
      join('tests', 'fixtures', 'repos', folder),
      `octo-${repo}-${FIXTURE_SHA.slice(0, 7)}`,
    ),
    licence: 'MIT',
  };
}

async function demoGitHub(): Promise<FakeGitHub> {
  return new FakeGitHub([
    await folderRepository('webforms', 'webforms-csharp'),
    await folderRepository('ledger', 'cobol-ledger'),
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
  // RF-407, P1-34, P1-35: see e2e-provider.ts.
  const provider = await createE2eProvider();
  const github = await demoGitHub();
  return (port) =>
    composeApplication({
      environment,
      listen: { host: '127.0.0.1', port },
      output: { write: () => true },
      doubles: TestDoubles.create(environment, { fetch: github.fetch, provider }),
    });
}

/** The disposable schema after the one-off migrate step, as Compose runs it before the server (DEC-140). */
async function migratedSchema(databaseUrl: string, port: number) {
  const schema = await createDisposableSchema(databaseUrl, port);
  await migrateDatabase({
    environment: { databaseMigratorUrl: schema.url, logLevel: 'error' },
    output: { write: () => true },
  });
  return schema;
}

async function main(): Promise<void> {
  const databaseUrl = process.env['ROSETTA_TEST_DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error('ROSETTA_TEST_DATABASE_URL is not set.');
  }
  await requireFrontEnd();
  await clearSessions();
  const port = e2ePort();
  const schema = await migratedSchema(databaseUrl, port);
  const dataDir = join(tmpdir(), `rosetta-e2e-${String(port)}`);
  await removeWritableTree(dataDir);
  await mkdir(dataDir, { recursive: true });
  const environment = loadEnvironment({
    DATABASE_URL: schema.url,
    ROSETTA_SECRET_KEY: fixtureSecret(3),
    ROSETTA_PUBLIC_URL: `http://127.0.0.1:${String(port)}`,
    ROSETTA_DATA_DIR: dataDir,
    ROSETTA_ADMIN_USER: seededAdmin.userName,
    ROSETTA_ADMIN_PASSWORD: seededAdmin.password,
    // One hop: X-Forwarded-For gives each test an address of its own, so no sign-in rate limit couples tests.
    ROSETTA_TRUST_PROXY: '1',
    // RF-407: Ollama is offered (the double stands in for it; nothing connects to this address).
    ROSETTA_OLLAMA_URL: 'http://127.0.0.1:11434',
    // RF-1201: the landing page offers Request access only because this is set.
    ROSETTA_CONTACT_EMAIL: e2eContactEmail,
    ...e2eServerKeyVariables(),
    ROSETTA_LOG_LEVEL: 'error',
    ROSETTA_TEST: '1',
    ROSETTA_TEST_DATABASE_URL: databaseUrl,
  });
  const compose = await composer(environment);
  const preparation = compose(0);
  await preparation.start();
  await preparation.stop();
  await seedUsers(schema.url);
  // P1-36: the accounts of the cost specs and the server's spend this month.
  await seedCost(schema.url);
  await seedReplayRuns(schema.url, dataDir);
  const application = compose(port);
  const shutDown = (): void => {
    void (async () => {
      await application.stop();
      await schema.drop();
      await removeWritableTree(dataDir);
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
