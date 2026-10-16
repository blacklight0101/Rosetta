import { createServer, type AddressInfo, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { LlmAttemptObserver } from '../../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { realAdapters } from '../../../../../src/infrastructure/providers/adapter-builder.js';
import type { AdapterSpec } from '../../../../../src/infrastructure/providers/adapter-spec.js';
import { publicAddressFetch } from '../../../../../src/infrastructure/providers/openai/agent-fetch.js';
import { OpenAiCompatibleProvider } from '../../../../../src/infrastructure/providers/openai/openai-compatible-provider.js';
import { PublicAddressAgent } from '../../../../../src/infrastructure/security/public-address-agent.js';
import { DnsPublicHostCheck } from '../../../../../src/infrastructure/security/public-host-check.js';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { failureOf } from '../../../../support/failure-of.js';
import { FakeHostResolver } from '../../../../support/fake-host-resolver.js';
import { FixedClock } from '../../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../../support/memory-logger.js';
import { fakeCompatibleKey } from '../../../../support/openai-compatible-harness.js';

// RF-1104, DEC-112, threat model TB5 (SSRF): every request of the OpenAI-compatible adapter goes
// through the public-address agent, which resolves the host again on every connect and refuses an
// internal IP literal without a lookup. A loopback TCP listener counts connection attempts and the
// fake resolver keeps every test offline: a refused call opens no socket at all.

interface Listener {
  readonly server: Server;
  port: number;
  connections: number;
}

const listeners: Listener[] = [];

async function listen(): Promise<Listener> {
  const listener: Listener = {
    server: createServer((socket) => {
      listener.connections += 1;
      socket.destroy();
    }),
    port: 0,
    connections: 0,
  };
  await new Promise<void>((resolve) => listener.server.listen(0, '127.0.0.1', resolve));
  const address: AddressInfo | string | null = listener.server.address();
  listener.port = typeof address === 'object' && address !== null ? address.port : 0;
  listeners.push(listener);
  return listener;
}

afterEach(async () => {
  await Promise.all(
    listeners.splice(0).map((listener) => new Promise((done) => listener.server.close(done))),
  );
});

function counting(): LlmAttemptObserver & { started: number } {
  const observer = {
    started: 0,
    attemptStarted: () => {
      observer.started += 1;
    },
    attemptRetried: () => Promise.resolve(),
  };
  return observer;
}

/** The adapter with the transport the builder gives it, on a fake resolver. */
function guarded(baseUrl: string, resolver: FakeHostResolver): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider({
    apiKey: fakeCompatibleKey,
    baseUrl,
    timeoutSeconds: 5,
    maxRetries: 2,
    testMode: false,
    transport: publicAddressFetch(new PublicAddressAgent({ resolver: resolver.resolve })),
    sleep: () => Promise.resolve(),
  });
}

describe('OpenAiCompatibleProvider refuses internal IP literals', () => {
  it.each([
    ['127.0.0.1'],
    ['127.1'],
    ['0x7f000001'],
    ['2130706433'],
    ['0177.0.0.1'],
    ['0.0.0.0'],
    ['[::1]'],
    ['[::]'],
    ['[::ffff:127.0.0.1]'],
    ['[::ffff:a9fe:a9fe]'],
    ['169.254.169.254'],
    ['10.0.0.1'],
    ['172.16.0.1'],
    ['172.31.255.254'],
    ['192.168.1.1'],
    ['100.64.0.1'],
    ['[fc00::1]'],
    ['[fd12:3456::1]'],
    ['[fe80::1]'],
  ])('RF-1104 %s is refused with RST-2304, without a lookup, a socket or a retry', async (host) => {
    const listener = await listen();
    const resolver = new FakeHostResolver();
    const observer = counting();
    const provider = guarded(`https://${host}:${String(listener.port)}/v1`, resolver);

    const error = await failureOf(provider.complete(contractRequest(), observer));

    expect(error).toMatchObject({ code: ERROR_CODES.baseUrlRejected });
    expect(resolver.lookups).toEqual([]);
    expect(listener.connections).toBe(0);
    expect(observer.started).toBe(1);
  });

  it('RF-1104 a plain http base URL is refused by the transport without a connection', async () => {
    const listener = await listen();
    const resolver = new FakeHostResolver().answer('llm.example.com', ['93.184.215.14']);
    const provider = guarded(`http://llm.example.com:${String(listener.port)}/v1`, resolver);

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.baseUrlRejected });
    expect(resolver.lookups).toEqual([]);
    expect(listener.connections).toBe(0);
  });
});

describe('OpenAiCompatibleProvider resolves the host on every connect', () => {
  it.each([
    ['localhost', ['127.0.0.1']],
    ['LOCALHOST', ['127.0.0.1', '::1']],
    ['localhost.', ['127.0.0.1']],
    ['api.localhost', ['127.0.0.1']],
    ['llm.internal.example', ['10.20.30.40']],
    ['metadata.example', ['169.254.169.254']],
    ['mixed.example', ['93.184.215.14', '192.168.0.10']],
    ['v6.internal.example', ['fd00::5']],
  ])('RF-1104 a name that resolves to %s %j is refused', async (host, addresses) => {
    const listener = await listen();
    const resolver = new FakeHostResolver().answer(host, addresses);
    const provider = guarded(`https://${host}:${String(listener.port)}/v1`, resolver);

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.baseUrlRejected });
    expect(resolver.lookups.length).toBeGreaterThan(0);
    expect(listener.connections).toBe(0);
  });

  it('RF-1104 a name that does not resolve is refused', async () => {
    const provider = guarded('https://nowhere.example:443/v1', new FakeHostResolver());

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.baseUrlRejected });
  });

  it('RF-1104 a name public when the key was saved and internal at the call is refused (DNS rebinding)', async () => {
    const listener = await listen();
    const resolver = new FakeHostResolver().answer(
      'rebind.example.com',
      ['93.184.215.14'],
      ['127.0.0.1'],
    );
    const saved = await new DnsPublicHostCheck({ resolver: resolver.resolve }).isPublicHost(
      'rebind.example.com',
    );
    const provider = guarded(`https://rebind.example.com:${String(listener.port)}/v1`, resolver);

    const error = await failureOf(provider.complete(contractRequest()));

    expect(saved).toBe(true);
    expect(error).toMatchObject({ code: ERROR_CODES.baseUrlRejected });
    expect(resolver.lookups).toEqual(['rebind.example.com', 'rebind.example.com']);
    expect(listener.connections).toBe(0);
  });
});

describe('the adapter builder wires the guard', () => {
  const logger = new MemoryLogger(new FixedClock('2026-10-16T10:00:00.000Z'), new SecretMasker());
  const build = realAdapters({ testMode: false, textProtocolPrompt: 'protocol {{tools}}', logger });
  const spec = (baseUrl: string): AdapterSpec => ({
    name: 'compatible',
    kind: 'openai-compatible',
    baseUrl,
    apiKey: fakeCompatibleKey,
    timeoutSeconds: 5,
    maxRetries: 0,
    toolMode: 'native',
    contextTokens: undefined,
  });

  it.each(['127.0.0.1', '[::ffff:127.0.0.1]', 'localhost'])(
    'RF-1104 an adapter the builder made for %s refuses it without a connection',
    async (host) => {
      const listener = await listen();
      const adapter = build(spec(`https://${host}:${String(listener.port)}/v1`));

      const error = await failureOf(adapter?.complete(contractRequest()) ?? Promise.resolve());

      expect(adapter).toBeInstanceOf(OpenAiCompatibleProvider);
      expect(error).toMatchObject({ code: ERROR_CODES.baseUrlRejected });
      expect(listener.connections).toBe(0);
    },
  );
});
