import type { Card } from '../../domain/cards/card.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { noticeOverview, sectionsOf } from '../../domain/overview/build-overview.js';
import { eligibleCards } from '../../domain/overview/eligible-cards.js';
import type { Overview } from '../../domain/overview/overview.js';
import { questionLinks } from '../../domain/overview/question-links.js';
import { notCoveredOf, type AreaStanding } from '../../domain/overview/standing.js';
import {
  isThin,
  MIN_CARDS_FOR_OVERVIEW,
  thinNotice,
  type RunReach,
} from '../../domain/overview/thin-run.js';
import type { ConsolidationParts } from '../consolidate/consolidate-cards.js';
import { parseOverviewAnswer } from './overview-answer.js';
import { overviewMessage } from './overview-request.js';

// RF-264, DEC-136: once the readers have ended, the judgement is done and duplicates are merged, the
// `summariser` role writes the overview from the cards whose citations passed. A run with too few
// cards is told so without a call; a stopped run or a failed call leaves an overview that says so
// and still lists what the run could not cover. Writing the overview never fails the run.

const SUMMARISER = 'summariser';

export type OverviewParts = ConsolidationParts;

export interface OverviewInput {
  readonly cards: readonly Card[];
  readonly areas: readonly AreaStanding[];
}

async function log(
  parts: OverviewParts,
  level: 'info' | 'warn',
  message: string,
  code?: ErrorCode,
): Promise<void> {
  await parts.logger.log({
    ...{ level, logger: 'understand', message, runId: parts.runId },
    ...(code === undefined ? {} : { code }),
  });
}

/** The summariser's answer, or undefined when the call failed or the run stopped. */
async function ask(parts: OverviewParts, cards: readonly Card[]): Promise<string | undefined> {
  const { role, signal } = parts;
  try {
    const response = await parts.provider.complete({
      context: {
        ...{ runId: parts.runId, agentTaskId: `${SUMMARISER}-overview`, role: SUMMARISER },
        ...{ callId: parts.nextCallId(), traceId: parts.traceId },
        parentSpanId: `${parts.traceId.slice(0, 13)}fff`,
      },
      model: role.model,
      system: parts.prompt.text,
      messages: [{ role: 'user', content: overviewMessage(cards, parts.ids.dataBlockTag()) }],
      tools: [],
      maxOutputTokens: role.maxOutputTokens,
      ...(role.temperature === undefined ? {} : { temperature: role.temperature }),
      signal,
    });
    await parts.onAnswer(response);
    return response.text;
  } catch (error) {
    if (!signal.aborted) {
      const code = error instanceof RosettaError ? error.code : ERROR_CODES.providerCallFailed;
      await log(parts, 'warn', 'The summariser could not write the overview.', code);
    }
    return undefined;
  }
}

/** An area the run left out on purpose (not selected, own code) does not count against the run. */
function reachOf(cards: readonly Card[], standing: readonly AreaStanding[]): RunReach {
  const areas = standing.filter((area) => area.selected || area.thirdParty);
  const withCards = new Set(cards.map((card) => card.area));
  return {
    cards: cards.length,
    areas: areas.length,
    areasWithCards: areas.filter((area) => withCards.has(area.name)).length,
    thirdPartyAreas: areas.filter((area) => area.thirdParty).length,
  };
}

/** The run may have been stopped while the call was out; the signal has changed since it was read. */
function isStopped(signal: AbortSignal): boolean {
  return signal.aborted;
}

const STOPPED =
  'The run stopped before the overview was written. Resume the run, or run it again, to get the overview; the cards written so far are in the specification.';
const FAILED =
  'The overview could not be written: the summariser did not answer, or its answer was not usable. The cards and the specification are complete; run again to try once more.';
const EMPTY =
  'The summariser wrote no statement that links a card, so the overview holds none. The cards and the specification are complete.';

// RF-264
export async function writeOverview(parts: OverviewParts, input: OverviewInput): Promise<Overview> {
  const eligible = eligibleCards(input.cards);
  const standing = input.areas.map((area) => ({
    ...area,
    cards: eligible.filter((card) => card.area === area.name).length,
  }));
  const notCovered = notCoveredOf(standing);
  const reach = reachOf(eligible, input.areas);
  if (parts.signal.aborted) return noticeOverview('unavailable', STOPPED, notCovered);
  if (eligible.length < MIN_CARDS_FOR_OVERVIEW) {
    return noticeOverview('thin', thinNotice(reach), notCovered);
  }
  const output = await ask(parts, eligible);
  if (output === undefined) {
    return noticeOverview('unavailable', isStopped(parts.signal) ? STOPPED : FAILED, notCovered);
  }
  const draft = parseOverviewAnswer(output);
  if (draft === undefined) {
    await log(parts, 'warn', 'The summariser answer for the overview could not be used.');
    return noticeOverview('unavailable', FAILED, notCovered);
  }
  const { sections, dropped } = sectionsOf(draft, eligible);
  if (dropped > 0)
    await log(
      parts,
      'warn',
      `${String(dropped)} overview statement(s) without a card were dropped.`,
    );
  if (sections.length === 0) return noticeOverview('thin', EMPTY, notCovered);
  const questions = questionLinks(sections, input.cards);
  const thin = isThin(reach);
  const base = { sections, notCovered, questions };
  return thin ? { ...base, state: 'thin', notice: thinNotice(reach) } : { ...base, state: 'full' };
}
