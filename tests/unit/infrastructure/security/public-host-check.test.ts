import { afterEach, describe, expect, it, vi } from 'vitest';
import { DnsPublicHostCheck } from '../../../../src/infrastructure/security/public-host-check.js';
import { FakeHostResolver } from '../../../support/fake-host-resolver.js';

// RF-1104, DEC-112: at save time the host of an OpenAI-compatible base URL is resolved through
// node:dns in infrastructure (here a fake resolver: tests never touch the network) and every
// address it resolves to must be public. A name that does not resolve, or not in time, is refused.

function checkWith(resolver: FakeHostResolver, timeoutMs = 5_000): DnsPublicHostCheck {
  return new DnsPublicHostCheck({ resolver: resolver.resolve, timeoutMs });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DnsPublicHostCheck', () => {
  it('RF-1104 accepts a name whose every address is public', async () => {
    const resolver = new FakeHostResolver().answer('llm.example.com', [
      '93.184.215.14',
      '2606:4700:4700::1111',
    ]);

    expect(await checkWith(resolver).isPublicHost('llm.example.com')).toBe(true);
    expect(resolver.lookups).toEqual(['llm.example.com']);
  });

  it.each([
    ['one private address among public ones', ['93.184.215.14', '10.0.0.8']],
    ['a loopback address', ['127.0.0.1']],
    ['an IPv4-mapped address', ['::ffff:169.254.169.254']],
    ['no address at all', []],
  ])('RF-1104 refuses a name that resolves to %s', async (_case, addresses) => {
    const resolver = new FakeHostResolver().answer('llm.example.com', addresses);

    expect(await checkWith(resolver).isPublicHost('llm.example.com')).toBe(false);
  });
});

describe('DnsPublicHostCheck failures', () => {
  it('RF-1104 refuses a name that does not resolve', async () => {
    expect(await checkWith(new FakeHostResolver()).isPublicHost('nowhere.example')).toBe(false);
  });

  it('RF-1104 refuses a name whose lookup does not answer in time', async () => {
    vi.useFakeTimers();
    const check = new DnsPublicHostCheck({
      resolver: () => new Promise(() => undefined),
      timeoutMs: 2_000,
    });

    const answer = check.isPublicHost('slow.example.com');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(await answer).toBe(false);
  });

  it.each([
    ['127.0.0.1', false],
    ['[::1]', false],
    ['[fd12::1]', false],
    ['93.184.215.14', true],
    ['[2606:4700:4700::1111]', true],
  ])('RF-1104 checks the IP literal %s without a lookup', async (host, expected) => {
    const resolver = new FakeHostResolver();

    expect(await checkWith(resolver).isPublicHost(host)).toBe(expected);
    expect(resolver.lookups).toEqual([]);
  });
});
