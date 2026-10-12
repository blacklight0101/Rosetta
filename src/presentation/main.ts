import { RosettaError } from '../domain/errors/rosetta-error.js';
import { loadEnvironment } from '../infrastructure/config/environment.js';
import { composeApplication } from './composition-root.js';
import { installShutdown } from './shutdown.js';

// RF-1305, RF-1302, ADR-014: read the environment, apply the migrations, then listen on
// 0.0.0.0:8080 (Compose publishes it on 127.0.0.1 only). A failed start exits with code 1 and
// prints the RST code and its message, which never holds a configuration value.

const listenAddress = { host: '0.0.0.0', port: 8080 } as const;

function startFailure(error: unknown): string {
  const detail =
    error instanceof RosettaError
      ? { code: error.code, message: error.message, nextStep: error.nextStep }
      : { message: 'Rosetta could not start; see the application log.' };
  return JSON.stringify({ level: 'error', logger: 'start-up', ...detail });
}

async function main(): Promise<void> {
  const application = composeApplication({
    environment: loadEnvironment(),
    listen: listenAddress,
    output: process.stdout,
  });
  installShutdown(application, (error) => {
    console.error(startFailure(error));
  });
  await application.start();
}

main().catch((error: unknown) => {
  console.error(startFailure(error));
  process.exitCode = 1;
});
