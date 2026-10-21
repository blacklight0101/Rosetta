import type { Card } from '../../domain/cards/card.js';
import type { Overview } from '../../domain/overview/overview.js';
import type { AreaStanding } from '../../domain/overview/standing.js';
import type { PromptFile } from '../agent/prompt-file.js';
import {
  consolidationParts,
  type ConsolidationSource,
} from '../consolidate/consolidation-parts.js';
import { writeOverview } from '../overview/write-overview.js';
import type { RunExecution } from '../ports/run-executor.js';
import { plannedAreas, type PlannedFrom } from './planned-areas.js';
import type { ReaderTask } from './reader-tasks.js';
import type { RunCoverage } from './run-coverage.js';

// RF-264: the overview step of an understand session. It collects, for every area of the code map,
// whether the run explained it, and asks the summariser for the overview of the cards that passed.

/** What the step takes from the session's parts: the summariser and what it needs to be asked. */
interface OverviewStepParts extends Omit<ConsolidationSource, 'runId' | 'signal' | 'mergePrompt'> {
  readonly execution: Pick<RunExecution, 'run' | 'signal'>;
  readonly overviewPrompt: PromptFile;
  readonly scanned: PlannedFrom;
  readonly allTasks: readonly ReaderTask[];
}

interface OverviewStepInput {
  readonly parts: OverviewStepParts;
  readonly cards: readonly Card[];
  readonly coverage: RunCoverage;
  readonly thirdParty: ReadonlySet<string>;
}

function standingOf(input: OverviewStepInput): readonly AreaStanding[] {
  const { parts, coverage, thirdParty } = input;
  return plannedAreas(parts.scanned).map((area) => {
    const task = parts.allTasks.find((each) => each.area.name === area.name);
    const ended = task === undefined ? undefined : coverage.of(task.agentTaskId);
    return {
      name: area.name,
      thirdParty: thirdParty.has(area.name),
      selected: task !== undefined,
      ended: ended !== undefined,
      failure: ended?.failure,
      cards: 0,
    };
  });
}

// RF-264
export function overviewStep(
  parts: OverviewStepParts,
  cards: readonly Card[],
  state: Pick<OverviewStepInput, 'coverage' | 'thirdParty'>,
): Promise<Overview> {
  const input = { parts, cards, ...state };
  const { execution, overviewPrompt } = parts;
  const source = {
    ...parts,
    runId: execution.run.runKey,
    signal: execution.signal,
    mergePrompt: overviewPrompt,
  };
  return writeOverview(consolidationParts(source), { cards, areas: standingOf(input) });
}
