import { ok } from '../../domain/errors/result.js';
import { recordManifestBrief } from '../../domain/runs/manifest-brief.js';
import { recordManifestSourceRun } from '../../domain/runs/manifest-source-run.js';
import {
  recordManifestCatalogue,
  recordManifestCodeMap,
  recordPromptVersions,
} from '../../domain/runs/run-manifest.js';
import type { RunExecution } from '../ports/run-executor.js';
import type { JourneyFactsStore } from '../ports/journey-facts-store.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { ManifestUpdates } from '../runs/manifest-updates.js';
import { scopeOf } from '../runs/run-scope.js';
import type { PlanInputs } from './plan-inputs.js';
import { planPromptVersions, type PlanFiles } from './plan-prompts.js';
import { resolvedSourceOf } from './resolved-source-of.js';

// RNF-004: what a plan run records in its manifest before its first call: the brief, the source
// run, the catalogue, the prompt versions, the resolved source and the code map it plans from; and
// (RF-432, P8-01) the text of those inputs that its kept planner answers are bound to.

// RNF-004
export async function recordPlanSources(
  deps: {
    readonly manifests: Pick<RunManifestStore, 'read'>;
    /** P8-139, DEC-226: stores the source the planner chose on the plan run's row. */
    readonly journeyFacts: Pick<JourneyFactsStore, 'recordPlanSource'>;
  },
  execution: Pick<RunExecution, 'recordSource' | 'run'>,
  updates: ManifestUpdates,
  used: { readonly inputs: PlanInputs; readonly files: PlanFiles },
): Promise<void> {
  const { inputs, files } = used;
  const { version, sha256 } = files.catalogue;
  const versions = planPromptVersions(files);
  await updates.update((manifest) => recordManifestBrief(manifest, inputs.brief));
  await updates.update((manifest) => recordManifestSourceRun(manifest, inputs.sourceRun.runKey));
  await deps.journeyFacts.recordPlanSource(execution.run.id, inputs.sourceRun.runKey);
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

/** RF-432: the text the fingerprint of a plan run's inputs is taken from. */
export function planInputsText(inputs: PlanInputs, files: PlanFiles): string {
  const { brief, questions, cards, project, sourceRun } = inputs;
  const { version, sha256 } = files.catalogue;
  return JSON.stringify({
    ...{ brief, questions, cards, settings: project.settings, sourceRun: sourceRun.id },
    ...{ catalogue: { version, sha256 }, prompts: planPromptVersions(files) },
  });
}
