import { createPool } from '../../src/infrastructure/db/pool.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { StdoutJsonLogger } from '../../src/infrastructure/system/stdout-json-logger.js';
import { SystemClock } from '../../src/infrastructure/system/system-clock.js';
import { installShutdown, stopWithin } from '../../src/presentation/shutdown.js';

// RF-1302, ADR-014, P1-68: the shutdown code of src/presentation/main.ts (installShutdown and
// stopWithin) on a pool whose database accepts connections and never answers; the test starts a
// TCP server for it and gives its URL in FROZEN_DATABASE_URL, then sends SIGTERM.
//   node --import ./scripts/register-ts.mjs tests/support/frozen-database-harness.ts

const url = process.env['FROZEN_DATABASE_URL'];
if (url === undefined) throw new Error('FROZEN_DATABASE_URL is not set.');

const logger = new StdoutJsonLogger({
  output: process.stdout,
  clock: new SystemClock(),
  masker: new SecretMasker(),
  minLevel: 'info',
});
const pool = createPool({ connectionString: url, onIdleError: () => undefined });
// A query waiting on the frozen database, as a request would be.
pool.query('SELECT 1').catch(() => undefined);

installShutdown(
  { stop: () => stopWithin({ close: () => Promise.resolve(), pool }, logger) },
  (error) => {
    process.stderr.write(`${String(error)}\n`);
  },
);
process.stdout.write('ready\n');
