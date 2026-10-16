import { loadMigrationEnvironment } from '../infrastructure/config/environment.js';
import { migrateDatabase } from './compose-migrations.js';
import { startFailure } from './start-failure.js';

// RF-1302, ADR-016 (DEC-140, P1-158): the one-off migrate step of the image,
//   node dist/presentation/migrate.js
// run before the server (the `migrate` service of compose.yaml). It reads DATABASE_MIGRATOR_URL
// only, applies the pending migrations and ends with 0, also when nothing was pending; a failure
// prints the RST line and ends with 1, so the server is not started after it.

async function main(): Promise<void> {
  await migrateDatabase({ environment: loadMigrationEnvironment(), output: process.stdout });
}

main().catch((error: unknown) => {
  console.error(startFailure(error, 'migrate'));
  process.exitCode = 1;
});
