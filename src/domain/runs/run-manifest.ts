import { byCodeUnit } from '../code-map/code-unit-order.js';
import { err, ok, type Result } from '../errors/result.js';
import type { RunEndState, RunStage } from './run-states.js';

// Data-model.md section 3.6, RF-003, RF-126, RNF-004: the manifest of a run, what it was and what it
// used. Instants are ISO 8601 UTC text. A field that is not known yet is `null` (the end state and
// time while the run is not over, the commit and the snapshot hash until the source is resolved),
// so the file always has the same fields. The end state is set exactly once.

interface ManifestSource {
  readonly url: string;
  readonly owner: string;
  readonly repo: string;
  readonly ref: string;
  readonly commitSha: string | null;
  readonly subpath: string;
  readonly snapshotHash: string | null;
}

export interface ManifestRole {
  readonly provider: string;
  readonly kind: string;
  readonly model: string;
  /** The exact id the provider reports, known after the first call (RNF-004). */
  readonly modelVersion: string | null;
  /** The Ollama digest. */
  readonly modelDigest: string | null;
  readonly toolMode: string;
  readonly maxOutputTokens: number;
  readonly temperature: number | null;
  readonly maxTurns: number | null;
}

export interface ManifestCaps {
  readonly run: { readonly maxCostMicros: number; readonly maxTokens: number };
  readonly roles: Readonly<
    Record<string, { readonly maxCostMicros: number | null; readonly maxTokens: number | null }>
  >;
}

interface ManifestSecurity {
  readonly deniedReads: number;
  readonly refusedRequests: number;
  readonly skippedLinks: number;
  readonly blockedCalls: number;
  readonly allowDenied: readonly string[];
}

interface ManifestTotals {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly costMicros: number;
  readonly calls: number;
}

export interface ManifestAgentTask {
  readonly agentTaskId: string;
  readonly area: string;
  readonly role: string;
  readonly state: string;
  readonly turns: number;
  readonly cards: number;
}

export interface RunManifest {
  readonly schemaVersion: 1;
  /** The run's folder name. */
  readonly runId: string;
  readonly stage: RunStage;
  readonly rosettaVersion: string;
  /** Null while the run waits in the queue. */
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly endState: RunEndState | null;
  /** The earlier run when this one resumes it (RF-006). */
  readonly resumedFrom: string | null;
  readonly source: ManifestSource;
  readonly codemapHash: string | null;
  /** The start request's options (areas, answers option, consent). */
  readonly options: Readonly<Record<string, unknown>>;
  readonly roles: Readonly<Record<string, ManifestRole>>;
  readonly promptVersions: Readonly<
    Record<string, { readonly version: string; readonly sha256: string }>
  >;
  readonly security: ManifestSecurity;
  readonly priceTable: { readonly version: string; readonly currency: string } | null;
  readonly caps: ManifestCaps;
  /** Secrets masked, per kind (RF-141). */
  readonly masking: Readonly<Record<string, number>>;
  readonly totals: ManifestTotals;
  readonly agentTasks: readonly ManifestAgentTask[];
}

export type ManifestProblem = 'already-ended';

// RF-003
export function markManifestStarted(manifest: RunManifest, startedAt: string): RunManifest {
  return { ...manifest, startedAt };
}

/** Sets the end state and time; refuses a manifest that already has an end state. */
// RF-003
export function endManifest(
  manifest: RunManifest,
  endState: RunEndState,
  endedAt: string,
): Result<RunManifest, ManifestProblem> {
  if (manifest.endState !== null) return err('already-ended');
  return ok({ ...manifest, endState, endedAt });
}

/** Records the pinned commit and the snapshot hash once the source is resolved (RF-126). */
// RF-126
export function recordManifestSource(
  manifest: RunManifest,
  resolved: { readonly commitSha: string; readonly snapshotHash: string },
): Result<RunManifest, ManifestProblem> {
  if (manifest.endState !== null) return err('already-ended');
  return ok({ ...manifest, source: { ...manifest.source, ...resolved } });
}

/** Records the hash of `codemap.json` once the scan has written it. */
// RF-003
export function recordManifestCodeMap(
  manifest: RunManifest,
  codemapHash: string,
): Result<RunManifest, ManifestProblem> {
  if (manifest.endState !== null) return err('already-ended');
  return ok({ ...manifest, codemapHash });
}

/** Records the links the snapshot extraction skipped, as soon as the snapshot is known. */
// RF-127
export function recordManifestSkippedLinks(
  manifest: RunManifest,
  skippedLinks: number,
): Result<RunManifest, ManifestProblem> {
  if (manifest.endState !== null) return err('already-ended');
  return ok({ ...manifest, security: { ...manifest.security, skippedLinks } });
}

/** Adds the secrets masked before egress to the count per kind, kinds in name order (RF-141). */
// RF-141
export function recordManifestMasking(
  manifest: RunManifest,
  counts: Readonly<Record<string, number>>,
): Result<RunManifest, ManifestProblem> {
  if (manifest.endState !== null) return err('already-ended');
  const sums = new Map(Object.entries(manifest.masking));
  for (const [kind, count] of Object.entries(counts)) sums.set(kind, (sums.get(kind) ?? 0) + count);
  const masking = Object.fromEntries([...sums].sort(([a], [b]) => byCodeUnit(a, b)));
  return ok({ ...manifest, masking });
}

/** Counts one model call a guard blocked (RF-009, RF-141, RF-143). */
// RF-141
export function recordManifestBlockedCall(
  manifest: RunManifest,
): Result<RunManifest, ManifestProblem> {
  if (manifest.endState !== null) return err('already-ended');
  const blockedCalls = manifest.security.blockedCalls + 1;
  return ok({ ...manifest, security: { ...manifest.security, blockedCalls } });
}

/** A prompt file's version and the SHA-256 of its bytes (RNF-004). */
export interface PromptVersion {
  readonly version: string;
  readonly sha256: string;
}

/** Adds the prompt files a run used, by file name, names in order; a name recorded again is replaced. */
// RNF-004
export function recordPromptVersions(
  manifest: RunManifest,
  versions: Readonly<Record<string, PromptVersion>>,
): RunManifest {
  const merged = Object.entries({ ...manifest.promptVersions, ...versions });
  const promptVersions = Object.fromEntries(merged.sort(([a], [b]) => byCodeUnit(a, b)));
  return { ...manifest, promptVersions };
}

/** One metered model call: its tokens and its cost in micro-dollars (RF-421). */
export interface MeteredCall {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly costMicros: bigint;
}

/** Adds one metered call to the run totals (RF-421, data-model.md section 3.6). */
// RF-421
export function recordManifestCall(
  manifest: RunManifest,
  call: MeteredCall,
): Result<RunManifest, ManifestProblem> {
  if (manifest.endState !== null) return err('already-ended');
  const { totals } = manifest;
  return ok({
    ...manifest,
    totals: {
      inputTokens: totals.inputTokens + call.inputTokens,
      outputTokens: totals.outputTokens + call.outputTokens,
      cachedInputTokens: totals.cachedInputTokens + call.cachedInputTokens,
      costMicros: totals.costMicros + Number(call.costMicros),
      calls: totals.calls + 1,
    },
  });
}

/**
 * Records an agent task: a task already listed is replaced where it stands, a new one is added at
 * the end, so the list keeps the order the run planned (RF-200, RNF-002).
 */
// RF-200
export function recordManifestAgentTask(
  manifest: RunManifest,
  task: ManifestAgentTask,
): Result<RunManifest, ManifestProblem> {
  if (manifest.endState !== null) return err('already-ended');
  const listed = manifest.agentTasks.some((each) => each.agentTaskId === task.agentTaskId);
  const agentTasks = listed
    ? manifest.agentTasks.map((each) => (each.agentTaskId === task.agentTaskId ? task : each))
    : [...manifest.agentTasks, task];
  return ok({ ...manifest, agentTasks });
}

/** Records the exact model version a role's provider reported, once it is known (RNF-004). */
// RNF-004
export function recordManifestModelVersion(
  manifest: RunManifest,
  role: string,
  modelVersion: string,
): Result<RunManifest, ManifestProblem> {
  if (manifest.endState !== null) return err('already-ended');
  const current = manifest.roles[role];
  if (current === undefined || current.modelVersion === modelVersion) return ok(manifest);
  return ok({ ...manifest, roles: { ...manifest.roles, [role]: { ...current, modelVersion } } });
}

/** Records the price table the run's calls were priced with (data-model.md section 3.6). */
// RF-426
export function recordManifestPriceTable(
  manifest: RunManifest,
  priceTable: { readonly version: string; readonly currency: string },
): Result<RunManifest, ManifestProblem> {
  if (manifest.endState !== null) return err('already-ended');
  return ok({ ...manifest, priceTable });
}
