import { parseGitHubUrl } from '../../domain/sources/github-repo-ref.js';
import type { Run } from '../../domain/runs/run.js';
import type { ManifestCaps, ManifestRole, RunManifest } from '../../domain/runs/run-manifest.js';
import type { Project } from '../projects/project.js';
import { ROLE_NAMES, type ProjectSettings } from '../projects/project-settings.js';

// Data-model.md section 3.6, RF-003, RF-126, RNF-004: the manifest written when a run is accepted.
// It holds what the request fixes: the Rosetta version, stage, options, source, the roles and
// caps of the project's settings and the deny patterns lifted for it. The commit, the snapshot
// hash, the code map hash, the prompt versions and the spend are recorded as the run learns them.

export interface AcceptedRun {
  readonly run: Run;
  readonly project: Project;
  readonly rosettaVersion: string;
  /** The start request's options. */
  readonly options: Readonly<Record<string, unknown>>;
}

function rolesOf(settings: ProjectSettings): Record<string, ManifestRole> {
  return Object.fromEntries(
    ROLE_NAMES.map((name) => {
      const role = settings.roles[name];
      const provider = settings.providers[role.provider];
      return [
        name,
        {
          provider: role.provider,
          kind: provider?.kind ?? role.provider,
          model: role.model,
          modelVersion: null,
          modelDigest: null,
          toolMode: provider?.toolMode ?? 'native',
          maxOutputTokens: role.maxOutputTokens,
          temperature: role.temperature ?? null,
          maxTurns: 'maxTurns' in role ? (role.maxTurns ?? null) : null,
        },
      ];
    }),
  );
}

function capsOf(settings: ProjectSettings): ManifestCaps {
  const { run, roles = {} } = settings.budget;
  return {
    run: { maxCostMicros: run.maxCostMicros, maxTokens: run.maxTokens },
    roles: Object.fromEntries(
      ROLE_NAMES.flatMap((name) => {
        const caps = roles[name];
        if (caps === undefined) return [];
        return [
          [name, { maxCostMicros: caps.maxCostMicros ?? null, maxTokens: caps.maxTokens ?? null }],
        ];
      }),
    ),
  };
}

/** The repository's owner and name from the normalised address of the project. */
function repositoryOf(project: Project): { owner: string; repo: string } {
  const parsed = parseGitHubUrl(project.sourceUrl);
  return parsed.ok
    ? { owner: parsed.value.owner, repo: parsed.value.repo }
    : { owner: '', repo: '' };
}

// RF-003, RF-126, RNF-004
export function acceptedManifest(accepted: AcceptedRun): RunManifest {
  const { run, project, rosettaVersion, options } = accepted;
  return {
    schemaVersion: 1,
    runId: run.runKey,
    stage: run.stage,
    rosettaVersion,
    startedAt: null,
    endedAt: null,
    endState: null,
    resumedFrom: null,
    source: {
      url: project.sourceUrl,
      ...repositoryOf(project),
      ref: project.ref,
      commitSha: null,
      subpath: project.subpath,
      snapshotHash: null,
    },
    codemapHash: null,
    options,
    roles: rolesOf(project.settings),
    promptVersions: {},
    security: {
      deniedReads: 0,
      refusedRequests: 0,
      skippedLinks: 0,
      blockedCalls: 0,
      allowDenied: project.settings.scan.allowDenied,
    },
    priceTable: null,
    caps: capsOf(project.settings),
    masking: {},
    totals: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costMicros: 0, calls: 0 },
    agentTasks: [],
  };
}
