import type { ProviderKind } from '../../application/ports/llm-provider.js';
import type { ProviderKeyRepository } from '../../application/ports/provider-key-repository.js';
import type { SecretBox } from '../../application/ports/secret-box.js';
import { chooseKeySource, keyProviderOf } from '../../application/providers/key-choice.js';
import { keyAdditionalData, type KeyProvider } from '../../domain/accounts/provider-keys.js';
import type { KeySource } from '../../domain/budget/price-table.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { endpointOf, type ProviderEndpoint } from './provider-endpoint.js';

// RF-1104, ADR-015, RF-143: how a role reaches its provider: whose key pays, the key itself and the
// one parsed endpoint. The user's key is opened here, and only here, from the sealed value in the
// database; it goes to the adapter builder and nowhere else, and never into a message, a log
// entry or a result.

/** Where the server's own keys are found (environment variables). */
export interface ServerKeys {
  readonly openai?: string | undefined;
  readonly anthropic?: string | undefined;
}

export interface AccessSources {
  readonly keys: ProviderKeyRepository;
  readonly box: SecretBox;
  readonly serverKeys: ServerKeys;
  /** `ROSETTA_OLLAMA_URL`; the only source of the Ollama address (DEC-112). */
  readonly ollamaUrl: string | undefined;
}

export interface ProviderAccess {
  readonly keySource: KeySource;
  /** The chosen key, undefined for a provider that takes none. */
  readonly apiKey: string | undefined;
  readonly endpoint: ProviderEndpoint;
}

export interface AccessRequest {
  readonly userId: string;
  readonly serverKeysAllowed: boolean;
  readonly kind: ProviderKind;
  readonly keySource: 'user' | 'user-then-server';
}

const publicEndpoints: Partial<Record<ProviderKind, string>> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  // The fake never leaves the process; the address only gives the guard a host that is this machine.
  fake: 'http://localhost',
};

function serverKeyOf(
  serverKeys: ServerKeys,
  provider: KeyProvider | undefined,
): string | undefined {
  return provider === 'openai' || provider === 'anthropic' ? serverKeys[provider] : undefined;
}

function endpointFor(
  sources: AccessSources,
  kind: ProviderKind,
  storedBaseUrl: string | null | undefined,
): Result<ProviderEndpoint, ErrorCode> {
  if (kind === 'ollama') {
    return sources.ollamaUrl === undefined
      ? err(ERROR_CODES.providerUnavailable)
      : endpointOf(sources.ollamaUrl);
  }
  const text = kind === 'openai-compatible' ? storedBaseUrl : publicEndpoints[kind];
  return text === undefined || text === null
    ? err(ERROR_CODES.providerUnavailable)
    : endpointOf(text);
}

// RF-1104, RF-002, RF-143
export async function resolveAccess(
  sources: AccessSources,
  request: AccessRequest,
): Promise<Result<ProviderAccess, ErrorCode>> {
  const { kind, userId } = request;
  const provider = keyProviderOf(kind);
  const record = provider === undefined ? undefined : await sources.keys.find(userId, provider);
  const choice = chooseKeySource({
    kind,
    keySource: request.keySource,
    hasUserKey: record !== undefined,
    serverKeysAllowed: request.serverKeysAllowed,
    hasServerKey: serverKeyOf(sources.serverKeys, provider) !== undefined,
  });
  if (!choice.ok) return choice;
  const endpoint = endpointFor(sources, kind, record?.baseUrl);
  if (!endpoint.ok) return endpoint;
  if (choice.value === 'user' && record !== undefined && provider !== undefined) {
    const opened = sources.box.open(record.sealed, keyAdditionalData(userId, provider));
    if (!opened.ok) return opened;
    return ok({ keySource: 'user', apiKey: opened.value, endpoint: endpoint.value });
  }
  const apiKey = serverKeyOf(sources.serverKeys, provider);
  return ok({ keySource: choice.value, apiKey, endpoint: endpoint.value });
}
