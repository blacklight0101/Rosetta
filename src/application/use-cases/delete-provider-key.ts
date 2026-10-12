import type { Actor } from '../../domain/accounts/actor.js';
import type { KeyProvider } from '../../domain/accounts/provider-keys.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ProviderKeyRepository } from '../ports/provider-key-repository.js';

// RF-1104, RF-1109: the signed-in user deletes their key for one provider. The row is removed, so
// the sealed value is gone from the database; a `key.deleted` audit row is written without the
// value. A key the user does not have answers RST-2003, whoever else has one (RF-1105).

export interface DeleteProviderKeyRequest {
  readonly actor: Actor;
  readonly provider: KeyProvider;
  readonly ip: string;
}

export interface DeleteProviderKeyDependencies {
  readonly keys: ProviderKeyRepository;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
}

export class DeleteProviderKey {
  private readonly deps: DeleteProviderKeyDependencies;

  constructor(deps: DeleteProviderKeyDependencies) {
    this.deps = deps;
  }

  // RF-1104
  async execute(
    request: DeleteProviderKeyRequest,
  ): Promise<Result<true, typeof ERROR_CODES.notFound>> {
    const { actor, provider, ip } = request;
    const deleted = await this.deps.keys.delete(actor.userId, provider);
    if (!deleted) return err(ERROR_CODES.notFound);
    await this.deps.auditLog.record({
      ...{ at: this.deps.clock.now(), actorUserId: actor.userId, action: 'key.deleted' },
      ...{ targetType: 'provider_key', targetId: provider, ip, outcome: 'ok' },
      detail: { provider },
    });
    await this.deps.logger.log({
      level: 'info',
      logger: 'keys',
      message: 'A provider key was deleted.',
      userId: actor.userId,
      data: { provider },
    });
    return ok(true);
  }
}
