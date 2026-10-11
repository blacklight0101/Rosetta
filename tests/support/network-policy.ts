import { isIP } from 'node:net';

// Which hosts a unit or integration test may connect to (RNF-005, ADR-008): loopback, and the
// host of ROSETTA_TEST_DATABASE_URL, which a developer may point at another machine or container.

function normalise(host: string): string {
  const lower = host.toLowerCase();
  return lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;
}

function isLoopback(host: string): boolean {
  if (host === 'localhost' || host === '::1') return true;
  const mapped = host.startsWith('::ffff:') ? host.slice('::ffff:'.length) : host;
  return isIP(mapped) === 4 && mapped.startsWith('127.');
}

function databaseHost(databaseUrl: string | undefined): string | undefined {
  if (databaseUrl === undefined || databaseUrl === '') return undefined;
  try {
    return normalise(new URL(databaseUrl).hostname);
  } catch {
    return undefined;
  }
}

/** True when a test may open a connection to `host`. */
export function isAllowedHost(host: string, databaseUrl: string | undefined): boolean {
  const name = normalise(host);
  if (name === '') return false;
  return isLoopback(name) || name === databaseHost(databaseUrl);
}
