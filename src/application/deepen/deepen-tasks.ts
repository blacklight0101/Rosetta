import { formatCitation } from '../../domain/cards/citation.js';
import type { Area } from '../../domain/code-map/area.js';
import { byCodeUnit } from '../../domain/code-map/code-unit-order.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import { isThirdPartyFile } from '../../domain/code-map/third-party.js';
import type { GapFile, RereadClaim, RoundPlan } from '../../domain/deepen/round-plan.js';
import type { TaskResult } from '../ports/task-results.js';
import type { ReaderTask } from '../understand/reader-tasks.js';

// RF-209, ADR-013: the reader tasks of one Deepen round. Each area with rejected first-party claims
// gets a re-read task over the first-party files those claims cite, with the claims and the
// verifier's reasons as JSON for a data block; each area with first-party files no task read gets
// a task over those files, the area holding the largest first. Task ids go on after every task the
// run holds, so a card's task is never ambiguous.

type TaskMap = Pick<CodeMap, 'areas' | 'files'>;

/** The number after the highest `reader-<n>` among the results. */
export function nextTaskNumber(results: readonly Pick<TaskResult, 'agentTaskId'>[]): number {
  const numbers = results.map((result) => Number(/^reader-(\d+)$/u.exec(result.agentTaskId)?.[1]));
  return Math.max(0, ...numbers.filter(Number.isFinite)) + 1;
}

function taskIdOf(number: number): string {
  return `reader-${String(number).padStart(3, '0')}`;
}

/** An area of the code map's name with only these files (in path order). */
function areaOf(name: string, paths: readonly string[], codeMap: TaskMap): Area {
  const known = codeMap.areas.find((area) => area.name === name);
  const files = [...new Set(paths)].sort(byCodeUnit);
  const tokensOf = (path: string): number =>
    codeMap.files.find((file) => file.path === path)?.estimatedTokens ?? 0;
  return {
    name,
    files,
    estimatedTokens: files.reduce((sum, path) => sum + tokensOf(path), 0),
    mapLevel: known?.mapLevel ?? 'coarse',
    origin: known?.origin ?? 'folder',
  };
}

/** The items grouped by area, in the order the areas first appear. */
function byArea<T extends { readonly area: string }>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(item.area, [...(groups.get(item.area) ?? []), item]);
  return groups;
}

/** The first-party files the claims cite that the code map lists. */
function citedFiles(claims: readonly RereadClaim[], codeMap: TaskMap): readonly string[] {
  return claims
    .flatMap((claim) => claim.citations.map((citation) => citation.path))
    .filter((path) => {
      const file = codeMap.files.find((each) => each.path === path);
      return file !== undefined && !isThirdPartyFile(file);
    });
}

/** RF-209: the rejected claims as the re-read's data block holds them. */
function rejectedText(claims: readonly RereadClaim[]): string {
  const rejected = claims.map(({ claimId, text, citations, reason }) => ({
    claimId,
    text,
    citations: citations.map(formatCitation),
    reason,
  }));
  return JSON.stringify({ rejected }, null, 2);
}

function rereadTasks(
  plan: RoundPlan,
  codeMap: TaskMap,
): readonly Omit<ReaderTask, 'agentTaskId'>[] {
  return [...byArea(plan.reread)].map(([name, claims]) => ({
    area: areaOf(name, citedFiles(claims, codeMap), codeMap),
    rejected: rejectedText(claims),
    replaceable: claims.map((claim) => claim.claimId),
  }));
}

function gapTasks(
  gaps: readonly GapFile[],
  codeMap: TaskMap,
): readonly Omit<ReaderTask, 'agentTaskId'>[] {
  return [...byArea(gaps)].map(([name, files]) => ({
    area: areaOf(
      name,
      files.map((file) => file.path),
      codeMap,
    ),
  }));
}

// RF-209
export function roundTasks(
  plan: RoundPlan,
  codeMap: TaskMap,
  firstNumber: number,
): readonly ReaderTask[] {
  const tasks = [...rereadTasks(plan, codeMap), ...gapTasks(plan.gaps, codeMap)];
  return tasks
    .filter((task) => task.area.files.length > 0)
    .map((task, index) => ({ ...task, agentTaskId: taskIdOf(firstNumber + index) }));
}
