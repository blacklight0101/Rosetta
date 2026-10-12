import type { Actor } from '../../domain/accounts/actor.js';
import {
  isUsableKeyValue,
  keyAdditionalData,
  lastFourOf,
  parseBaseUrl,
  type KeyProvider,
} from '../../domain/accounts/provider-keys.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ProviderKeyRepository } from '../ports/provider-key-repository.js';
import type { PublicHostCheck } from '../ports/public-host-check.js';
import type { SecretBox } from '../ports/secret-box.js';
import type { ProviderKeySummary } from './list-provider-keys.js';

// RF-1104, RF-1109: the signed-in user saves or replaces their key for one provider. The key is
// sealed (AES-256-GCM, additional data `user_id:provider`) and stored with its last four
// characters; the answer holds only those. An OpenAI-compatible key needs an https base URL whose
// host resolves only to public addresses (RST-2304); a refused URL writes a refused audit row and a
// security event. Every saved key writes a `key.saved` audit row; no row or entry holds the key.

export interface SaveProviderKeyRequest {
  readonly actor: Actor;
  readonly provider: KeyProvider;
  readonly key: string;
  readonly baseUrl?: string | undefined;
  readonly ip: string;
}

export type SaveProviderKeyProblem =
  | typeof ERROR_CODES.providerKeyInvalid
  | typeof ERROR_CODES.baseUrlRejected
  | typeof ERROR_CODES.requestInvalid;

export interface SaveProviderKeyDependencies {
  readonly keys: ProviderKeyRepository;
  readonly box: SecretBox;
  readonly hostCheck: PublicHostCheck;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
}

const COMPATIBLE: KeyProvider = 'openai-compatible';

export class SaveProviderKey {
  private readonly deps: SaveProviderKeyDependencies;

  constructor(deps: SaveProviderKeyDependencies) {
    this.deps = deps;
  }

  // RF-1104
  async execute(
    request: SaveProviderKeyRequest,
  ): Promise<Result<ProviderKeySummary, SaveProviderKeyProblem>> {
    if (!isUsableKeyValue(request.key)) return err(ERROR_CODES.providerKeyInvalid);
    const baseUrl = await this.checkedBaseUrl(request);
    if (!baseUrl.ok) return baseUrl;
    const { keys, box, clock } = this.deps;
    const { actor, provider, key } = request;
    const now = clock.now();
    const last4 = lastFourOf(key);
    const replaced = await keys.upsert({
      userId: actor.userId,
      provider,
      baseUrl: baseUrl.value,
      sealed: box.seal(key, keyAdditionalData(actor.userId, provider)),
      last4,
      createdAt: now,
      updatedAt: now,
    });
    await this.recordSaved(request, now, replaced);
    return ok({ provider, last4, updatedAt: now });
  }

  /** The base URL to store: null for a provider that takes none, the checked URL otherwise. */
  private async checkedBaseUrl(
    request: SaveProviderKeyRequest,
  ): Promise<Result<string | null, SaveProviderKeyProblem>> {
    if (request.provider !== COMPATIBLE) {
      return request.baseUrl === undefined ? ok(null) : err(ERROR_CODES.requestInvalid);
    }
    const parsed = parseBaseUrl(request.baseUrl ?? '');
    const accepted =
      parsed.ok && (await this.deps.hostCheck.isPublicHost(parsed.value.hostname))
        ? parsed.value.href
        : undefined;
    if (accepted !== undefined) return ok(accepted);
    await this.recordRefusedUrl(request);
    return err(ERROR_CODES.baseUrlRejected);
  }

  private async recordSaved(
    request: SaveProviderKeyRequest,
    at: Date,
    replaced: boolean,
  ): Promise<void> {
    const { actor, provider, ip } = request;
    await this.deps.auditLog.record({
      ...{ at, actorUserId: actor.userId, action: 'key.saved', targetType: 'provider_key' },
      ...{ targetId: provider, ip, outcome: 'ok', detail: { provider, replaced } },
    });
    await this.deps.logger.log({
      level: 'info',
      logger: 'keys',
      message: replaced ? 'A provider key was replaced.' : 'A provider key was saved.',
      userId: actor.userId,
      data: { provider },
    });
  }

  // RF-1109, threat model TB5: a refused base URL may be an attempt to reach an internal address.
  private async recordRefusedUrl(request: SaveProviderKeyRequest): Promise<void> {
    const { actor, provider, ip } = request;
    const code = ERROR_CODES.baseUrlRejected;
    await this.deps.auditLog.record({
      ...{ at: this.deps.clock.now(), actorUserId: actor.userId, action: 'key.saved' },
      ...{ targetType: 'provider_key', targetId: provider, ip, outcome: 'refused' },
      detail: { provider, code },
    });
    await this.deps.logger.securityEvent(code, {
      message: 'A provider base URL was refused: it is not https or not a public address.',
      userId: actor.userId,
      data: { provider, ip },
    });
  }
}
