import { describe, expect, it } from 'vitest';
import { isAllowedHost } from '../../support/network-policy.js';

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
