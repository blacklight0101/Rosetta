import type { Run } from '../runs/run.js';
import type { UnsavedBrief } from './planning-brief.js';

// P7-18: the freshness of a saved brief, split out of planning-brief.ts (behaviour unchanged).

function contentOf(brief: UnsavedBrief): string {
  const { catalogueVersion, principles, architecture, migration, stack, context } = brief;
  const fields = [catalogueVersion, principles, architecture, migration, stack, context];
  return JSON.stringify([
    ...fields,
    brief.buildMethod,
    brief.defaulted,
    brief.application ?? null,
    brief.chosen ?? null,
    brief.typed ?? null,
  ]);
}

/** Whether two briefs hold the same answers, whatever instant they were saved at. */
// RF-605
export function sameBrief(left: UnsavedBrief, right: UnsavedBrief): boolean {
  return contentOf(left) === contentOf(right);
}

/** The start of the newest completed plan run, or undefined when no package exists. */
function newestPackageStart(runs: readonly Run[]): number | undefined {
  const starts = runs
    .filter((run) => run.stage === 'plan' && run.endState === 'Completed')
    .map((run) => run.startedAt ?? run.queuedAt);
  return starts.length === 0 ? undefined : Math.max(...starts);
}

/**
 * RF-605: the brief is out of date when it was saved after the newest completed `plan` run started,
 * because that package was written from an earlier brief. Without a package it cannot be.
 */
// RF-605
export function isBriefOutOfDate(savedAt: string, runs: readonly Run[]): boolean {
  const start = newestPackageStart(runs);
  return start !== undefined && Date.parse(savedAt) > start;
}
