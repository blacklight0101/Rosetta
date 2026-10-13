import { describe, expect, it } from 'vitest';
import { isAllowedHost, isAllowedPipe } from '../../support/network-policy.js';

const databaseUrl = 'postgres://postgres:test@host.docker.internal:5432/postgres';

describe('RNF-005 network policy', () => {
  it.each(['127.0.0.1', '127.1.2.3', 'localhost', 'LOCALHOST', '::1', '[::1]', '::ffff:127.0.0.1'])(
    'RNF-005 allows the loopback host %s',
    (host) => {
      expect(isAllowedHost(host, undefined)).toBe(true);
    },
  );

  it.each([
    '192.0.2.1',
    '8.8.8.8',
    'example.com',
    '10.0.0.5',
    '0.0.0.0',
    '',
    'localhost.example.com',
  ])('RNF-005 refuses the host %j', (host) => {
    expect(isAllowedHost(host, undefined)).toBe(false);
  });

  it('RNF-005 allows the host of the test database URL and nothing else', () => {
    expect(isAllowedHost('host.docker.internal', databaseUrl)).toBe(true);
    expect(isAllowedHost('HOST.docker.internal', databaseUrl)).toBe(true);
    expect(isAllowedHost('example.com', databaseUrl)).toBe(false);
  });

  it('RNF-005 ignores a test database URL that cannot be parsed', () => {
    expect(isAllowedHost('example.com', 'not a url')).toBe(false);
    expect(isAllowedHost('example.com', '')).toBe(false);
  });
});

describe('RNF-005 pipe policy', () => {
  it.each([
    '/tmp/rosetta.sock',
    String.raw`\\.\pipe\rosetta`,
    String.raw`\\?\pipe\rosetta`,
    String.raw`\??\pipe\rosetta`,
    String.raw`\\.\pipe\rosetta..sock`,
    String.raw`\\localhost\pipe\rosetta`,
    String.raw`\\127.0.0.1\pipe\rosetta`,
    '//./pipe/rosetta',
  ])('RNF-005 allows the local pipe %s', (path) => {
    expect(isAllowedPipe(path, undefined)).toBe(true);
  });

  it.each([
    String.raw`\\192.0.2.1\pipe\rosetta`,
    '//example.com/pipe/rosetta',
    String.raw`\/example.com\pipe\rosetta`,
    String.raw`\\?\UNC\example.com\pipe\rosetta`,
    String.raw`\\.\UNC\example.com\pipe\rosetta`,
    String.raw`\\example.com`,
    String.raw`\\.\GLOBALROOT\Device\Mup\example.com\pipe\rosetta`,
    String.raw`\\.\pipe\..\UNC\example.com\pipe\rosetta`,
    String.raw`\\?\pipe\..\UNC\example.com\pipe\rosetta`,
    String.raw`\??\pipe\..\UNC\example.com\pipe\rosetta`,
    String.raw`\??\UNC\example.com\pipe\rosetta`,
    String.raw`\\.\pipe\.\..\UNC\example.com\pipe\rosetta`,
    '//./pipe/../UNC/example.com/pipe/rosetta',
    String.raw`\\.\.\UNC\example.com\pipe\rosetta`,
  ])('RNF-005 refuses the remote pipe %s', (path) => {
    expect(isAllowedPipe(path, undefined)).toBe(false);
  });

  it('RNF-005 allows a pipe on the host of the test database URL', () => {
    expect(isAllowedPipe(String.raw`\\host.docker.internal\pipe\pg`, databaseUrl)).toBe(true);
  });
});
