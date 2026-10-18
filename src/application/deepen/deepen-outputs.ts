import type { Card } from '../../domain/cards/card.js';
import type { Area } from '../../domain/code-map/area.js';
import { thirdPartyAreaNames } from '../../domain/code-map/third-party.js';
import type { DeepenRecord } from '../../domain/deepen/deepen-record.js';
import { err, ok } from '../../domain/errors/result.js';
import type { Overview } from '../../domain/overview/overview.js';
import { scopeOf } from '../runs/run-scope.js';
import { openQuestionsOf } from '../understand/open-questions.js';
import { overviewStep } from '../understand/overview-step.js';
import type { ReaderTask } from '../understand/reader-tasks.js';
import { RunCoverage } from '../understand/run-coverage.js';
import type { DeepenParts } from './deepen-parts.js';
import { cardsOf, coverageOf, type DeepenState } from './deepen-state.js';

// RF-209, RF-204, RF-230, RF-264, DEC-98: what a Deepen run writes, so it is a complete understand
// run on its own: every card with its status (the copied ones and the new), one coverage row per
// area, the task results a resume reads back, its Deepen record in the manifest, the open
// questions of its new cards in `answers.md` and, at its end, its own overview.

/** RF-209, data-model.md section 3.6: the record goes into the manifest while the run is open. */
export function saveRecord(parts: DeepenParts, record: DeepenRecord): Promise<void> {
  return parts.updates.update((manifest) =>
    manifest.endState === null ? ok({ ...manifest, deepen: record }) : err('already-ended'),
  );
}

// RF-204, RF-230, RF-006
export async function writeOutputs(
  parts: DeepenParts,
  state: DeepenState,
  overview?: Overview,
): Promise<void> {
  const { deps, execution, scanned, source } = parts;
  const scope = scopeOf(execution.run);
  const areasWithoutCards = state.results
    .filter((result) => result.withoutCards)
    .map((result) => result.area);
  await deps.cards.writeCards(scope, {
    ...{ cards: cardsOf(state), source, areasWithoutCards },
    ...(overview === undefined ? {} : { overview }),
  });
  await deps.cards.writeCoverage(scope, coverageOf(state, scanned.codeMap));
  await deps.taskResults.write(scope, state.results);
}

/** DEC-98: the open questions of the cards this Deepen wrote go to the project's `answers.md`. */
export async function addQuestions(parts: DeepenParts, cards: readonly Card[]): Promise<void> {
  const { run } = parts.execution;
  const questions = openQuestionsOf(cards, run.runKey);
  if (questions.length === 0) return;
  await parts.deps.answers.addQuestions(
    { userId: run.userId, projectId: run.projectId },
    questions,
  );
}

/** The task of each result, over the code map's area of its name (one task per area counts). */
function tasksOf(parts: DeepenParts, state: DeepenState): readonly ReaderTask[] {
  const { areas } = parts.scanned.codeMap;
  return state.results.flatMap((result) => {
    const area: Area | undefined = areas.find((each) => each.name === result.area);
    return area === undefined ? [] : [{ agentTaskId: result.agentTaskId, area }];
  });
}

/** RF-264: the overview of every card of the run, with the areas it explained. */
export function overviewOf(parts: DeepenParts, state: DeepenState): Promise<Overview> {
  const allTasks = tasksOf(parts, state);
  const coverage = new RunCoverage(allTasks);
  for (const area of coverageOf(state, parts.scanned.codeMap)) {
    const first = allTasks.find((task) => task.area.name === area.area);
    if (first !== undefined) coverage.restore(first.agentTaskId, area);
  }
  const thirdParty = thirdPartyAreaNames(parts.scanned.codeMap);
  return overviewStep({ ...parts, allTasks }, cardsOf(state), { coverage, thirdParty });
}
