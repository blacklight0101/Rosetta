import { isCapStop } from '../../domain/budget/cap-stop.js';
import type { Card } from '../../domain/cards/card.js';
import type { FileEntry } from '../../domain/code-map/file-entry.js';
import type { Overview } from '../../domain/overview/overview.js';
import { understandingMeasures } from '../../domain/deepen/understanding-measures.js';
import type { AreaStanding } from '../../domain/overview/standing.js';
import type { UnreadFiles } from '../../domain/overview/unread-files.js';
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
  readonly scanned: PlannedFrom & { readonly codeMap: { readonly files: readonly FileEntry[] } };
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

/** RF-231 (Q-53): the measures the run already computes say which first-party files were not read. */
function unreadOf(input: OverviewStepInput): UnreadFiles {
  const { parts, coverage } = input;
  const measures = understandingMeasures({
    ...{ cards: [], coverage: coverage.areas(), files: parts.scanned.codeMap.files },
  });
  const { filesNotRead, firstPartyTokens, firstPartyReadTokens } = measures;
  return { files: filesNotRead, firstPartyTokens, firstPartyReadTokens };
}

/**
 * P7-26: a run stopped by a cap still writes its overview; the budget guard decides whether the
 * call fits. Only the owner's Stop (or a shutdown) keeps the overview from being asked.
 */
function signalOf(signal: AbortSignal): AbortSignal {
  return signal.aborted && isCapStop(signal.reason) ? new AbortController().signal : signal;
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
    signal: signalOf(execution.signal),
    mergePrompt: overviewPrompt,
  };
  return writeOverview(consolidationParts(source), {
    cards,
    areas: standingOf(input),
    unread: unreadOf(input),
  });
}
