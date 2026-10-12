import { dropDisposableSchema } from './database.js';
import { e2ePort } from './server-config.js';

// ADR-016, P1-13: when the run ends, drop its schema even if the test server is stopped without
// a signal handler running (Windows ends the process outright).

export default async function globalTeardown(): Promise<void> {
  const databaseUrl = process.env['ROSETTA_TEST_DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') return;
  await dropDisposableSchema(databaseUrl, e2ePort());
}
