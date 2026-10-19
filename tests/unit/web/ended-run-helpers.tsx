import { screen } from '@testing-library/preact';
import { json, type Answer } from './fake-api.js';
import {
  agentEnded,
  agentStarted,
  cardProposed,
  citationChecked,
  ev,
  planned,
  runEnded,
  startedData,
} from './live-run-fixtures.js';
import { renderLive, runPath, runRow, type LiveRun } from './live-run-helpers.js';
import { codeMapAnswer, codeMapPath, ownAreas } from './live-run-running-helpers.js';

// The page of an ended run (P1-170): one understand run that read one area, wrote two cards and
// asked questions, with the answers of the overview and the open questions.

const overview = {
  state: 'full',
  sections: [
    {
      id: 'application',
      statements: [{ text: 'A small shop front.', cards: [{ id: 'BR-001', type: 'BR' }] }],
    },
    {
      id: 'features',
      statements: [
        { text: 'Orders are placed at checkout.', cards: [{ id: 'BR-001', type: 'BR' }] },
      ],
    },
  ],
  notCovered: ['Vendor: third-party code; nothing about the application was read from it.'],
  questions: [{ cardId: 'OQ-001', section: 'features' }],
};

export interface QuestionRow {
  readonly cardId: string;
  readonly question: string;
  readonly context: string;
  readonly answer: string;
  readonly state: 'Open' | 'Answered';
  readonly dependents: number;
}

export function question(n: number, extra: Partial<QuestionRow> = {}): QuestionRow {
  const id = `OQ-${String(n).padStart(3, '0')}`;
  return {
    cardId: id,
    question: `Question number ${String(n)}?`,
    context: `Orders/Order.cs:${String(n)}-${String(n + 4)} The code does not say.`,
    answer: '',
    state: 'Open',
    dependents: n,
    ...extra,
  };
}

const threeQuestions = [question(1), question(2), question(3)];

/** The events of a run that read one area and gave two cards, one of whose claims failed its check. */
const finishedEvents = [
  ev(1, 'run.started', startedData),
  planned(2, 'r1', 'Catalog'),
  agentStarted(3, 'r1', 'Catalog'),
  cardProposed(4, 'r1', 'BR-001', 2),
  citationChecked(5, 'r1', 'BR-001.c1', true),
  citationChecked(6, 'r1', 'BR-001.c2', 'The lines are not in the file.'),
  agentEnded(7, 'r1', 'Done', 1),
  runEnded(8, 'Completed'),
];

/** The same events, for a run of this stage that ended as it did. */
function eventsOf(
  options: Pick<EndedOptions, 'stage' | 'endState' | 'judged'>,
): typeof finishedEvents {
  const { stage = 'understand', endState = 'Completed' } = options;
  const judged =
    options.judged === undefined
      ? []
      : [ev(8, 'verify.claim.judged', { claimId: 'BR-001.c1', status: options.judged })];
  return [
    ev(1, 'run.started', { ...startedData, stage }),
    ...finishedEvents.slice(1, -1),
    ...judged,
    runEnded(9, endState, endState === 'Failed' ? 'RST-2006' : undefined),
  ];
}

export interface EndedOptions {
  /** RF-614: the verdict of the judgement step on the first claim of BR-001; none by default. */
  readonly judged?: 'Supported' | 'Rejected';
  readonly questions?: readonly QuestionRow[];
  readonly overviewBody?: Response;
  /** How the run ended; Completed unless a test says otherwise. */
  readonly endState?: string;
  /** The stage of the run; understand unless a test says otherwise. */
  readonly stage?: string;
  readonly extra?: Readonly<Record<string, Answer>>;
}

/** Opens the page of the ended run with the events replayed; resolves once the results tabs show. */
export async function openEnded(options: EndedOptions = {}): Promise<LiveRun> {
  const page = renderLive({
    [`GET ${runPath}`]: runRow({
      stage: options.stage ?? 'understand',
      queueState: 'Ended',
      endState: options.endState ?? 'Completed',
    }),
    [`GET ${runPath}/overview`]: options.overviewBody ?? json(200, { overview }),
    [`GET ${runPath}/answers`]: json(200, { questions: options.questions ?? threeQuestions }),
    [`GET ${codeMapPath}`]: codeMapAnswer(ownAreas),
    ...options.extra,
  });
  const connection = await page.stream.connection();
  for (const event of eventsOf(options)) connection.event(event);
  await screen.findByRole('tablist', { name: 'Results' });
  return page;
}
