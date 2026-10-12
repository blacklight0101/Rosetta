import type { Actor } from '../../domain/accounts/actor.js';
import type { User } from '../../domain/accounts/user.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { Project } from '../projects/project.js';

// RF-1105, RF-1109: Open workspace lets an administrator read another user's projects. It is the
// only use case that takes another user's id; it writes an `admin.workspace_opened` audit row and
// an `info` entry. A user who is not an administrator is refused before anything is read, and an
// unknown user id is "not found" and writes nothing.

export interface OpenWorkspaceRequest {
  readonly actor: Actor;
  /** The user whose workspace is opened. */
  readonly ownerId: string;
  readonly ip: string;
}

export interface OpenedWorkspace {
  readonly owner: Pick<User, 'id' | 'userName' | 'displayName'>;
  readonly projects: readonly Project[];
}

export interface OpenWorkspaceDependencies {
  readonly projects: ProjectRepository;
  readonly users: UserRepository;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
}

type OpenWorkspaceRefusal = typeof ERROR_CODES.notAllowed | typeof ERROR_CODES.notFound;

export class OpenWorkspace {
  private readonly deps: OpenWorkspaceDependencies;

  constructor(deps: OpenWorkspaceDependencies) {
    this.deps = deps;
  }

  // RF-1105
  async execute(
    request: OpenWorkspaceRequest,
  ): Promise<Result<OpenedWorkspace, OpenWorkspaceRefusal>> {
    const { projects, users, auditLog, logger, clock } = this.deps;
    if (request.actor.role !== 'admin') return err(ERROR_CODES.notAllowed);
    const account = await users.findById(request.ownerId);
    if (account === undefined) return err(ERROR_CODES.notFound);
    const owner = { id: account.id, userName: account.userName, displayName: account.displayName };
    const opened = await projects.list(owner.id);
    await auditLog.record({
      at: clock.now(),
      actorUserId: request.actor.userId,
      action: 'admin.workspace_opened',
      targetType: 'user',
      targetId: owner.id,
      ip: request.ip,
      outcome: 'ok',
      detail: { projects: opened.length },
    });
    await logger.log({
      level: 'info',
      logger: 'accounts',
      message: 'An administrator opened a workspace.',
      userId: request.actor.userId,
      data: { ownerId: owner.id },
    });
    return ok({ owner, projects: opened });
  }
}
