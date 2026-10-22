import type { Card } from '../../domain/cards/card.js';
import { EXTENDABLE_TYPES } from '../../domain/cards/card-vocabulary.js';
import { formatCitation } from '../../domain/cards/citation.js';
import type { Area } from '../../domain/code-map/area.js';
import { byCodeUnit } from '../../domain/code-map/code-unit-order.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { isThirdPartyFile } from '../../domain/code-map/third-party.js';
import type {
  FailedArea,
  GapFile,
  RereadClaim,
  RoundPlan,
} from '../../domain/deepen/round-plan.js';
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

/** The cards of the area: those it wrote and those merged into one of another area (RF-250). */
function cardsOfArea(cards: readonly Card[], name: string): readonly Card[] {
  return cards.filter((card) => (card.mergedAreas ?? [card.area]).includes(name));
}

/**
 * RF-209, DEC-158: the cards the run holds for the task's area (id, type, title) as JSON for a data
 * block, and the ids a card of the task may add its claims to. A title is model text: it only ever
 * travels inside the block. A task whose area holds no card is given neither.
 */
function withParentCards(
  task: Omit<ReaderTask, 'agentTaskId'>,
  cards: readonly Card[],
): Omit<ReaderTask, 'agentTaskId'> {
  const held = cardsOfArea(cards, task.area.name);
  if (held.length === 0) return task;
  const listed = held.map(({ id, type, title }) => ({ id, type, title }));
  const extendable = held.filter((card) => EXTENDABLE_TYPES.includes(card.type));
  return {
    ...task,
    parentCards: JSON.stringify({ cards: listed }, null, 2),
    extendable: extendable.map((card) => card.id),
  };
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

/**
 * EV-10: a failed area is read again over every file of the area. When it ended on a repeated
 * call (RST-1303) the task starts with a note: the same prompt would give the same loop.
 */
function failedTasks(
  failed: readonly FailedArea[],
  codeMap: TaskMap,
): readonly Omit<ReaderTask, 'agentTaskId'>[] {
  return failed.map(({ area, failure, unread }) => {
    const known = codeMap.areas.find((each) => each.name === area);
    const task = { area: known ?? areaOf(area, [], codeMap) };
    return failure.includes(ERROR_CODES.agentRepeatedCalls)
      ? { ...task, retryNote: { unread } }
      : task;
  });
}

// RF-209
export function roundTasks(
  plan: RoundPlan,
  codeMap: TaskMap,
  firstNumber: number,
  cards: readonly Card[] = [],
): readonly ReaderTask[] {
  // A failed area is read whole, so its unread files need no task of their own.
  const failed = new Set(plan.failedAreas.map((each) => each.area));
  const tasks = [
    ...rereadTasks(plan, codeMap),
    ...gapTasks(
      plan.gaps.filter((gap) => !failed.has(gap.area)),
      codeMap,
    ),
    ...failedTasks(plan.failedAreas, codeMap),
  ];
  return tasks
    .filter((task) => task.area.files.length > 0)
    .map((task) => withParentCards(task, cards))
    .map((task, index) => ({ ...task, agentTaskId: taskIdOf(firstNumber + index) }));
}
