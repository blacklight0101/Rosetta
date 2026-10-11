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

// Two leading separators (either slash), then up to three path segments.
const UNC_PREFIX = /^[\\/]{2}([^\\/]*)(?:[\\/]([^\\/]*)(?:[\\/]([^\\/]*))?)?/;

/**
 * The server a Windows pipe path names, or undefined for a local one: `\\server\pipe\x` and
 * `\\?\UNC\server\...` name a server; `\\.\pipe\x` and `\\?\pipe\x` are local; any other device
 * path (`\\.\GLOBALROOT\...`) is reported by its device name so the policy refuses it.
 */
function pipeServer(path: string): string | undefined {
  const parts = UNC_PREFIX.exec(path);
  if (parts === null) return undefined;
  const [, server = '', device = '', next = ''] = parts;
  if (server !== '.' && server !== '?') return server;
  const kind = device.toLowerCase();
  if (kind === 'pipe') return undefined;
  return kind === 'unc' ? next : device;
}

/** True when a test may open a pipe (unix-domain socket or Windows named pipe) at `path`. */
export function isAllowedPipe(path: string, databaseUrl: string | undefined): boolean {
  const server = pipeServer(path);
  return server === undefined || isAllowedHost(server, databaseUrl);
}
