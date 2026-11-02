import { ok } from '../../domain/errors/result.js';
import { recordManifestBrief } from '../../domain/runs/manifest-brief.js';
import { recordManifestSourceRun } from '../../domain/runs/manifest-source-run.js';
import {
  recordManifestCatalogue,
  recordManifestCodeMap,
  recordPromptVersions,
} from '../../domain/runs/run-manifest.js';
import type { RunExecution } from '../ports/run-executor.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { ManifestUpdates } from '../runs/manifest-updates.js';
import { scopeOf } from '../runs/run-scope.js';
import type { PlanInputs } from './plan-inputs.js';
import { planPromptVersions, type PlanFiles } from './plan-prompts.js';
import { resolvedSourceOf } from './resolved-source-of.js';

// RNF-004: what a plan run records in its manifest before its first call: the brief, the source
// run, the catalogue, the prompt versions, the resolved source and the code map it plans from.

// RNF-004
export async function recordPlanSources(
  deps: { readonly manifests: Pick<RunManifestStore, 'read'> },
  execution: Pick<RunExecution, 'recordSource'>,
  updates: ManifestUpdates,
  used: { readonly inputs: PlanInputs; readonly files: PlanFiles },
): Promise<void> {
  const { inputs, files } = used;
  const { version, sha256 } = files.catalogue;
  const versions = planPromptVersions(files);
  await updates.update((manifest) => recordManifestBrief(manifest, inputs.brief));
  await updates.update((manifest) => recordManifestSourceRun(manifest, inputs.sourceRun.runKey));
  await updates.update((manifest) => recordManifestCatalogue(manifest, { version, sha256 }));
  await updates.update((manifest) => ok(recordPromptVersions(manifest, versions)));
  const source = await deps.manifests.read(scopeOf(inputs.sourceRun));
  // RF-130: an upload run has a snapshot and no commit.
  const resolved = resolvedSourceOf(inputs.sourceRun, source);
  if (resolved !== undefined) await execution.recordSource(resolved);
  const codemapHash = source?.codemapHash ?? null;
  if (codemapHash !== null)
    await updates.update((manifest) => recordManifestCodeMap(manifest, codemapHash));
}
