import { rm } from 'node:fs/promises';
import { dropDisposableSchema } from './database.js';
import { capsLockFolder } from './caps-lock.js';
import { e2ePort } from './server-config.js';
import { clearSessions } from './sign-in.js';

// ADR-016, P1-13: when the run ends, drop its schema even if the test server is stopped without
// a signal handler running (Windows ends the process outright), and forget the kept sessions.

export default async function globalTeardown(): Promise<void> {
  await clearSessions();
  await rm(capsLockFolder(), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  const databaseUrl = process.env['ROSETTA_TEST_DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') return;
  await dropDisposableSchema(databaseUrl, e2ePort());
}
