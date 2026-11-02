import { runStartCapsOf, type RunStartCaps } from '../../domain/budget/budget.js';
import type { KeySource } from '../../domain/budget/price-table.js';
import type { AgentRole } from '../ports/llm-provider.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import type { KeySourceLookup } from '../ports/key-source-lookup.js';
import type { ServerSettings } from '../ports/server-settings.js';
import type { UserRepository } from '../ports/user-repository.js';
import { runCapsFor, uncappedLocalRun } from '../projects/local-run-caps.js';
import type { Project } from '../projects/project.js';
import { UNDERSTAND_ROLES } from '../understand/understand-options.js';

// RF-1106, DEC-107 (P3-91): the caps a run starts with, read from the project, the account, the
// server caps and the key each model role of the run would use. `run.started` records them, so the
// page and the log name the cap that applies before the first call. A stage without model roles
// (a scan) has no key and starts with the project's caps.

export interface StartCapsDependencies {
  readonly projects: { find(userId: string, projectId: string): Promise<Project | undefined> };
  readonly users: Pick<UserRepository, 'findById'>;
  readonly serverSettings: Pick<ServerSettings, 'caps'>;
  readonly keys: KeySourceLookup;
  /** P8-04, RF-433: the host of the Ollama server; one that is not this machine is not local. */
  readonly ollamaHost?: string | undefined;
}

/** The model roles each stage calls; a stage not listed makes no model call. */
const ROLES_OF_STAGE: Readonly<Record<string, readonly AgentRole[] | undefined>> = {
  understand: UNDERSTAND_ROLES,
  plan: ['planner'],
};

// RF-1106
export class StartCaps {
  private readonly deps: StartCapsDependencies;

  constructor(deps: StartCapsDependencies) {
    this.deps = deps;
  }

  /** The caps of the run, or undefined when its project or its account is unknown. */
  // RF-1106
  async of(run: Run, manifest: RunManifest): Promise<RunStartCaps | undefined> {
    const { projects, users, serverSettings } = this.deps;
    const project = await projects.find(run.userId, run.projectId);
    const account = await users.findById(run.userId);
    if (project === undefined || account === undefined) return undefined;
    const keySources = await this.keySourcesOf(run, manifest, project, account.serverKeysAllowed);
    // RF-433, P8-04: an uncapped local run is held to the administrator ceiling, and says so.
    const { settings } = project;
    const uncapped =
      ROLES_OF_STAGE[run.stage] !== undefined && uncappedLocalRun(settings, this.deps.ollamaHost);
    const caps = uncapped ? runCapsFor(settings, this.deps.ollamaHost) : settings.budget.run;
    const started = runStartCapsOf(keySources, {
      run: { maxCostMicros: BigInt(caps.maxCostMicros), maxTokens: BigInt(caps.maxTokens) },
      server: await serverSettings.caps(),
      account: {
        dailyCapMicros: account.dailyCapMicros,
        ownDailyCapMicros: account.ownDailyCapMicros,
      },
    });
    return uncapped ? { ...started, run: { ...started.run, source: 'administrator' } } : started;
  }

  /** The key source of each model role of the stage that the manifest records (RF-1104). */
  private async keySourcesOf(
    run: Run,
    manifest: RunManifest,
    project: Project,
    serverKeysAllowed: boolean,
  ): Promise<readonly KeySource[]> {
    const found: KeySource[] = [];
    for (const name of ROLES_OF_STAGE[run.stage] ?? []) {
      const role = Object.hasOwn(manifest.roles, name) ? manifest.roles[name] : undefined;
      const providers = project.settings.providers;
      const config =
        role === undefined || !Object.hasOwn(providers, role.provider)
          ? undefined
          : providers[role.provider];
      if (config === undefined) continue;
      const source = await this.deps.keys.keySourceOf({
        userId: run.userId,
        serverKeysAllowed,
        kind: config.kind,
        keySource: config.keySource,
      });
      if (source !== undefined) found.push(source);
    }
    return found;
  }
}

/** The start caps as the event carries them: plain numbers (JSON has no bigint). */
export function startCapsDataOf(caps: RunStartCaps): Record<string, unknown> {
  const { keySource, run, userDay } = caps;
  return {
    keySource,
    run: { maxCostMicros: Number(run.maxCostMicros), source: run.source },
    ...(userDay === undefined
      ? {}
      : { userDay: { maxCostMicros: Number(userDay.maxCostMicros), source: userDay.source } }),
  };
}
