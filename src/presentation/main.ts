import { loadEnvironment } from '../infrastructure/config/environment.js';
import { composeApplication } from './composition-root.js';
import { installShutdown } from './shutdown.js';
import { startFailure } from './start-failure.js';

// RF-1305, RF-1302, ADR-014: read the environment (DATABASE_URL only; DATABASE_MIGRATOR_URL is
// refused, DEC-140), check that the migrate step brought the schema up to date, then listen on
// 0.0.0.0:8080 (Compose publishes it on 127.0.0.1 only). A failed start exits with code 1 and
// prints the RST code and its message, which never holds a configuration value.

const listenAddress = { host: '0.0.0.0', port: 8080 } as const;

async function main(): Promise<void> {
  const application = composeApplication({
    environment: loadEnvironment(),
    listen: listenAddress,
    output: process.stdout,
  });
  installShutdown(application, (error) => {
    console.error(startFailure(error, 'start-up'));
  });
  await application.start();
}

main().catch((error: unknown) => {
  console.error(startFailure(error, 'start-up'));
  process.exitCode = 1;
});
