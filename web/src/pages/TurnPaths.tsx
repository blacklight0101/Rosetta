import type { JSX } from 'preact';
import type { MeasureFigures } from '../api/understanding.js';
import { navigate } from '../app/router.js';
import { Button } from '../components/Button.js';
import type { AreaReading } from '../lib/understanding/area-read.js';
import { countText } from '../lib/understanding/measure-text.js';
import { DeepenAction } from './DeepenAction.js';
import { planSetupPath } from './PlanNext.js';
import type { SkipDeepen } from './use-skip-deepen.js';

// RF-1021, RF-646, P8-84 (UX-24, UX-25), the P8Run artboard: "Your turn" shows the journey's next
// step as its one primary button, Deepen while the run read an area of own code below the coverage
// bar (the "Partly read" of RF-230), else Set up the plan; the other paths are links under it. A run
// that stopped at its cap has no primary button here (Resume in the page head is the next step), so
// Set up the plan is a link too. All the styles are under `.rst-p170-`.

/** The step the one primary button takes; `none` when the panel has no plan to set up. */
export type TurnStep = 'deepen' | 'plan' | 'none';

export const turnTitles: Readonly<Record<TurnStep, string>> = {
  deepen: 'Your turn: read the rest of the code',
  plan: 'Your turn: set up the plan',
  none: 'Your turn',
};

/** RF-230: the run read an area of own code below the coverage bar; not known counts as not below. */
export function belowTheBar(reading: AreaReading | undefined): boolean {
  return reading?.status === 'known' && reading.partly.size > 0;
}

export type Covered = Pick<
  MeasureFigures,
  'firstPartyReadTokens' | 'firstPartyTokens' | 'filesNotReadCount' | 'rejected'
>;

const plural = (count: number, word: string): string =>
  `${countText(count)} ${word}${count === 1 ? '' : 's'}`;

/** What a Deepen reads again: the files never read and the rejected claims. */
function deepenReads(measures: Covered): string {
  const parts = [
    measures.filesNotReadCount > 0
      ? `reads the ${plural(measures.filesNotReadCount, 'file')} never read`
      : '',
    measures.rejected > 0 ? `re-checks the ${plural(measures.rejected, 'rejected claim')}` : '',
  ].filter((part) => part !== '');
  return parts.length === 0 ? '' : ` A Deepen ${parts.join(' and ')}.`;
}

/** RF-646, RF-1021: what the readers covered, and that a Deepen uses the answers given before it. */
export function DeepenNote(props: { readonly measures: Covered | null | undefined }): JSX.Element {
  const { measures } = props;
  const covered =
    measures === null || measures === undefined
      ? 'Part of your own code was read below the coverage bar. A Deepen reads the rest.'
      : `The readers covered ${countText(measures.firstPartyReadTokens)} of ${countText(measures.firstPartyTokens)} tokens of your own code.${deepenReads(measures)}`;
  return (
    <p data-testid="deepen-first">{`${covered} Answers you give before it are used by it.`}</p>
  );
}

interface TurnLinksProps {
  readonly step: TurnStep;
  /** The questions that wait for an answer; 0 when none or not known. */
  readonly open: number;
  readonly onAnswer: () => void;
  readonly skip: SkipDeepen;
  readonly run: { readonly id: string; readonly projectId: string };
  /** The run has a Supported claim and ended so that a plan can start from it. */
  readonly plannable: boolean;
  /** The run to Deepen, when Deepen is a link: it can be deepened and no Deepen of it is running. */
  readonly deepenRunId: string | undefined;
}

function answerLabel(open: number): string {
  return open === 1 ? 'Answer the question first' : `Answer the ${String(open)} questions first`;
}

/** The links under the primary button, in the order of the artboard. */
function linksOf(props: TurnLinksProps): JSX.Element[] {
  const { step, run } = props;
  const links: JSX.Element[] = [];
  if (props.open > 0) {
    links.push(
      <Button key="answer" variant="link" onClick={props.onAnswer}>
        {answerLabel(props.open)}
      </Button>,
    );
  }
  if (step === 'none' && props.plannable) {
    links.push(
      <Button
        key="plan"
        variant="link"
        onClick={() => {
          navigate(planSetupPath(run.projectId, run.id));
        }}
      >
        Set up the plan
      </Button>,
    );
  }
  if (step === 'deepen' && props.plannable) {
    const skipAndSetUp = (): void => {
      props.skip.choose(true);
      navigate(planSetupPath(run.projectId, run.id));
    };
    links.push(
      <Button key="skip" variant="link" onClick={skipAndSetUp}>
        Skip the Deepen and set up the plan
      </Button>,
    );
  }
  if (step !== 'deepen' && props.deepenRunId !== undefined) {
    links.push(
      <DeepenAction key="deepen" runId={props.deepenRunId} projectId={run.projectId} look="link" />,
    );
  }
  return links;
}

// RF-1021
export function TurnLinks(props: TurnLinksProps): JSX.Element | null {
  const links = linksOf(props);
  if (links.length === 0) return null;
  return (
    <div class="rst-p170-paths">
      {links.flatMap((link, index) =>
        index === 0
          ? [link]
          : [
              <span key={`dot-${String(index)}`} aria-hidden="true">
                ·
              </span>,
              link,
            ],
      )}
    </div>
  );
}
