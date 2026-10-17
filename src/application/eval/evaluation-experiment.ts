import { byCodeUnit } from '../../domain/code-map/code-unit-order.js';
import type { GoldenSet } from '../../domain/eval/golden-set.js';
import type { ManifestRole, RunManifest } from '../../domain/runs/run-manifest.js';
import type { EvaluationRun } from './evaluation-ports.js';
import type { Experiment, ExperimentRole } from './evaluation-schema.js';

// RNF-015, RNF-004, DEC-57: `experiment.json`, what makes an evaluation repeatable: its date, the
// Rosetta and golden set versions, the repetitions, the models of each role with the exact version
// the provider reported and the Ollama digest, every prompt file with its SHA-256, and the settings.
// The models and prompts come from the manifests of the runs themselves, never from what was asked.

/** A prompt file the runs used but their manifests do not list (the verifier's, RF-301). */
export interface PromptVersion {
  readonly name: string;
  readonly version: string;
  readonly sha256: string;
}

export interface ExperimentInput {
  readonly id: string;
  readonly at: string;
  readonly rosettaVersion: string;
  readonly golden: GoldenSet;
  readonly goldenSetSha256: string;
  readonly areas: readonly string[];
  readonly runs: readonly EvaluationRun[];
  readonly extraPrompts: readonly PromptVersion[];
  readonly settings: Experiment['settings'];
}

function roleOf(role: ManifestRole): ExperimentRole {
  const { provider, kind, model, modelVersion, modelDigest, toolMode } = role;
  const { maxOutputTokens, temperature, maxTurns } = role;
  return {
    ...{ provider, kind, model, modelVersion, modelDigest, toolMode },
    ...{ maxOutputTokens, temperature, maxTurns },
  };
}

/** Per role, the first manifest that knows the model version, else the first that has the role. */
function rolesOf(manifests: readonly RunManifest[]): Experiment['roles'] {
  const names = [...new Set(manifests.flatMap((m) => Object.keys(m.roles)))].sort(byCodeUnit);
  const roles: Record<string, ExperimentRole> = {};
  for (const name of names) {
    const all = manifests.flatMap((m) => m.roles[name] ?? []);
    const chosen = all.find((role) => role.modelVersion !== null) ?? all[0];
    if (chosen !== undefined) roles[name] = roleOf(chosen);
  }
  return roles;
}

function promptsOf(
  manifests: readonly RunManifest[],
  extra: readonly PromptVersion[],
): Experiment['promptVersions'] {
  const entries = [
    ...manifests.flatMap((m) => Object.entries(m.promptVersions)),
    ...extra.map((p) => [p.name, { version: p.version, sha256: p.sha256 }] as const),
  ];
  const prompts = new Map(entries);
  return Object.fromEntries([...prompts.entries()].sort(([a], [b]) => byCodeUnit(a, b)));
}

// RNF-015
export function experimentOf(input: ExperimentInput): Experiment {
  const { golden } = input;
  const manifests = input.runs.flatMap((run) => run.manifest ?? []);
  return {
    schemaVersion: 1,
    id: input.id,
    at: input.at,
    rosettaVersion: input.rosettaVersion,
    goldenSetVersion: golden.version,
    goldenSetSha256: input.goldenSetSha256,
    repetitions: input.runs.length,
    source: {
      url: golden.source.url,
      commit: golden.source.commit,
      subpath: golden.source.subpath,
    },
    areas: [...input.areas],
    roles: rolesOf(manifests),
    promptVersions: promptsOf(manifests, input.extraPrompts),
    settings: input.settings,
  };
}
