// The network guard comes first: the server of the Compose smoke test must not reach the network
// either (RNF-005). It allows loopback and the host of ROSETTA_TEST_DATABASE_URL.
import '../support/block-network.js';
import { loadEnvironment } from '../../src/infrastructure/config/environment.js';
import { composeApplication } from '../../src/presentation/composition-root.js';
import { TestDoubles } from '../../src/presentation/test-doubles.js';
import { AnsweringProvider } from '../support/answering-provider.js';
import { FakeGitHub } from '../support/fake-github.js';
import { FIXTURE_SHA, fixtureArchive } from '../support/snapshot-fixtures.js';

// RNF-005, ADR-008, P1-45: the server of compose.ci.yaml, run in the image's `test` stage:
//   node --import ./scripts/register-ts.mjs tests/compose/serve.ts
// It reads the environment Compose gives the app (the compose database, ROSETTA_TEST=1), composes
// the application with the fake provider and a fake GitHub that knows octo/demo, and listens on
// 0.0.0.0:8080 as the real image does. Unlike tests/e2e/support/serve.ts it makes no disposable
// schema and no accounts: the stack keeps its database across `down` and `up`, and the smoke test
// signs in as the bootstrap administrator. SIGTERM and SIGINT stop it cleanly.

const listenAddress = { host: '0.0.0.0', port: 8080 } as const;

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

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const github = await demoGitHub();
  const application = composeApplication({
    environment,
    listen: listenAddress,
    output: process.stdout,
    doubles: TestDoubles.create(environment, {
      fetch: github.fetch,
      provider: new AnsweringProvider(),
    }),
  });
  const shutDown = (): void => {
    application.stop().catch((error: unknown) => {
      process.stderr.write(
        `compose server: ${error instanceof Error ? error.message : 'stop failed'}\n`,
      );
      process.exitCode = 1;
    });
  };
  process.once('SIGTERM', shutDown);
  process.once('SIGINT', shutDown);
  await application.start();
}

main().catch((error: unknown) => {
  process.stderr.write(
    `compose server: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
