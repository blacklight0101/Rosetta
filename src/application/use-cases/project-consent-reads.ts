import type { Actor } from '../../domain/accounts/actor.js';
import type { ProjectConsent } from '../../domain/consent/project-consent.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';

// RF-143, P8-81: red stub; the use cases come in the next commit.

interface Owner {
  readonly actor: Actor;
  readonly projectId: string;
}

export class ReadProjectConsent {
  readonly deps: unknown;

  constructor(deps: unknown) {
    this.deps = deps;
  }

  execute(
    request: Owner & { readonly start: 'understand' | 'plan' },
  ): Promise<Result<ProjectConsent | undefined, typeof ERROR_CODES.notFound>> {
    return Promise.resolve(
      err(request.projectId === '' ? ERROR_CODES.notFound : ERROR_CODES.notFound),
    );
  }
}

export class WithdrawProjectConsent {
  readonly deps: unknown;

  constructor(deps: unknown) {
    this.deps = deps;
  }

  execute(request: Owner): Promise<Result<number, typeof ERROR_CODES.notFound>> {
    return Promise.resolve(
      err(request.projectId === '' ? ERROR_CODES.notFound : ERROR_CODES.notFound),
    );
  }
}
