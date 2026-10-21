import type { Actor } from '../../domain/accounts/actor.js';
import type { AuditDetail, AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ServerSettings } from '../ports/server-settings.js';
import type { DefaultRoles } from '../projects/default-roles.js';

// DEC-106, RF-1109: the administrator sets the provider and model each role of a new project
// starts with. A role left out keeps the template's model. Projects that exist keep their own
// settings. A saved change writes an `admin.default_roles_changed` audit row that names the
// provider and model per role (`template` for a role left out).

export interface SetDefaultRolesRequest {
  readonly actor: Actor;
  readonly roles: DefaultRoles;
  readonly ip: string;
}

export interface SetDefaultRolesDependencies {
  readonly settings: ServerSettings;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
}

const roleNames = ['reader', 'verifier', 'planner', 'summariser'] as const;

function detailOf(roles: DefaultRoles): AuditDetail {
  const detail: Record<string, string> = {};
  for (const name of roleNames) {
    const choice = roles[name];
    detail[name] = choice === undefined ? 'template' : `${choice.provider}/${choice.model}`;
  }
  const size = roles.ollamaContextTokens;
  if (size !== undefined) detail['ollamaContextTokens'] = String(size);
  return detail;
}

export class SetDefaultRoles {
  private readonly deps: SetDefaultRolesDependencies;

  constructor(deps: SetDefaultRolesDependencies) {
    this.deps = deps;
  }

  // DEC-106
  async execute(request: SetDefaultRolesRequest): Promise<DefaultRoles> {
    const { roles, actor, ip } = request;
    const { settings, auditLog, logger, clock } = this.deps;
    const at = clock.now();
    await settings.saveDefaultRoles(roles, { by: actor.userId, at });
    const detail = detailOf(roles);
    await auditLog.record({
      ...{ at, actorUserId: actor.userId, action: 'admin.default_roles_changed', ip },
      ...{ outcome: 'ok', targetType: 'server_settings', targetId: 'defaultRoles', detail },
    });
    await logger.log({
      level: 'info',
      logger: 'accounts',
      message: 'An administrator changed the default models.',
      userId: actor.userId,
      data: detail,
    });
    return roles;
  }
}
