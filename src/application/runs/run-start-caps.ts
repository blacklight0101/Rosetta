import type { RunStartCaps } from '../../domain/budget/budget.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import type { KeySourceLookup } from '../ports/key-source-lookup.js';
import type { ServerSettings } from '../ports/server-settings.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { Project } from '../projects/project.js';

// RF-1106, DEC-107 (P3-91): the caps a run starts with, read for the stage's model roles, for the
// `run.started` event. Scaffolding only: the behaviour is written in the feat commit of this card.

export interface StartCapsDependencies {
  readonly projects: { find(userId: string, projectId: string): Promise<Project | undefined> };
  readonly users: Pick<UserRepository, 'findById'>;
  readonly serverSettings: Pick<ServerSettings, 'caps'>;
  readonly keys: KeySourceLookup;
}

export class StartCaps {
  private readonly deps: StartCapsDependencies;

  constructor(deps: StartCapsDependencies) {
    this.deps = deps;
  }

  /** The caps of the run, or undefined when its project is unknown. */
  of(run: Run, manifest: RunManifest): Promise<RunStartCaps | undefined> {
    throw new Error(`P3-91: the start caps of ${run.id} of ${manifest.runId} are not implemented.`);
  }
}
