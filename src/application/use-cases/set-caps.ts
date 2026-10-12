import type { Actor } from '../../domain/accounts/actor.js';
import type { ServerCaps } from '../../domain/budget/budget.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { FieldProblem } from '../../domain/errors/field-problems.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ServerSettings } from '../ports/server-settings.js';

// RF-1106, RF-1109, DEC-107: the administrator sets the caps on the server keys. A cap below zero
// is refused on its field (RST-1003); a saved change writes an `admin.caps_changed` audit row with
// the new and the previous figures (decimal strings of micro-dollars). Caps take effect for the
// calls checked after the change; a call already reserved keeps its reservation.

export interface SetCapsRequest {
  readonly actor: Actor;
  readonly caps: ServerCaps;
  readonly ip: string;
}

export interface SetCapsDependencies {
  readonly settings: ServerSettings;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
}

const capFields = ['runMicros', 'userDayMicros', 'serverMonthMicros'] as const;

function previousName(field: (typeof capFields)[number]): string {
  return `previous${field.charAt(0).toUpperCase()}${field.slice(1)}`;
}

export class SetCaps {
  private readonly deps: SetCapsDependencies;

  constructor(deps: SetCapsDependencies) {
    this.deps = deps;
  }

  // RF-1106
  async execute(request: SetCapsRequest): Promise<Result<ServerCaps, readonly FieldProblem[]>> {
    const { caps, actor, ip } = request;
    const problems = capFields
      .filter((field) => caps[field] < 0n)
      .map((field) => ({ field, code: ERROR_CODES.settingsCapNegative }));
    if (problems.length > 0) return err(problems);
    const { settings, auditLog, logger, clock } = this.deps;
    const previous = await settings.caps();
    const at = clock.now();
    await settings.saveCaps(caps, { by: actor.userId, at });
    const detail = Object.fromEntries(
      capFields.flatMap((field) => [
        [field, caps[field].toString()],
        [previousName(field), previous[field].toString()],
      ]),
    );
    await auditLog.record({
      ...{ at, actorUserId: actor.userId, action: 'admin.caps_changed', ip, outcome: 'ok' },
      ...{ targetType: 'server_settings', targetId: 'caps', detail },
    });
    await logger.log({
      level: 'info',
      logger: 'budget',
      message: 'An administrator changed the server caps.',
      userId: actor.userId,
      data: detail,
    });
    return ok(caps);
  }
}
