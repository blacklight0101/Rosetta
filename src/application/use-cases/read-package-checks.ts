import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { checkSectionsOf, type CheckSection } from '../plan/check-sections.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunTextFiles } from '../ports/run-text-files.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-1015, RF-627, RF-1105: Read package checks gives the plan run page the checks of the package the
// run wrote, as the sections of its `handoff/checks.md`. A run with no such file (still running,
// another stage, or a package not written) gives no section. Another user's run id and an unknown id
// give the same answer, `not-found`.

export interface ReadPackageChecksDependencies {
  readonly runs: RunIndex;
  readonly files: RunTextFiles;
}

export class ReadPackageChecks {
  private readonly deps: ReadPackageChecksDependencies;

  constructor(deps: ReadPackageChecksDependencies) {
    this.deps = deps;
  }

  // RF-1015, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<readonly CheckSection[], 'not-found'>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    const text = await this.deps.files.read(scopeOf(run), 'handoff/checks.md');
    return ok(text === undefined ? [] : checkSectionsOf(text));
  }
}
