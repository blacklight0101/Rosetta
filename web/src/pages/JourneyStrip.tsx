import type { JSX } from 'preact';
import { navigate } from '../app/router.js';
import { Button } from '../components/Button.js';
import { Glyph, type GlyphName } from '../components/Glyph.js';
import { Link } from '../components/Link.js';
import { costLabel } from '../lib/live-run/format.js';
import type {
  JourneyAction,
  JourneyStep,
  JourneyView,
  StepState,
} from '../lib/journey/journey-steps.js';
import { ResumeButton } from './ResumeButton.js';

// RF-615, RF-1015, RNF-010, design-system.md section 14 (journey strip): the seven steps from code to
// package as an ordered list. Each step says its state in a word and a glyph (never colour alone),
// gives its reason or its code and its cost, and is a link only when it has a page the user may open.
// The step that holds the next action is marked `aria-current="step"` and says so in text. One next
// action sits under the list. All the styles are under `.rst-journey`.

export interface JourneyStripProps {
  readonly view: JourneyView;
  /** RF-006: called once the server has queued the understand run again. */
  readonly onResumed: () => void;
  /** Opens the questions where the page can show them; any other page opens the run. */
  readonly onAnswer?: (() => void) | undefined;
}

const words: Readonly<Record<StepState, string>> = {
  done: 'Done',
  current: 'Current',
  upcoming: 'Not yet',
  locked: 'Locked',
  failed: 'Failed',
  'out-of-date': 'Out of date',
};

const glyphs: Readonly<Record<StepState, GlyphName>> = {
  done: 'check',
  current: 'live-dot',
  upcoming: 'open-circle',
  locked: 'dashed-circle',
  failed: 'cross',
  'out-of-date': 'warning-triangle',
};

function StepItem({ step }: { readonly step: JourneyStep }): JSX.Element {
  const { state } = step;
  return (
    <li
      class={`rst-journey__step rst-journey__step--${state}`}
      data-state={state}
      aria-current={step.here ? 'step' : undefined}
    >
      <span class="rst-journey__mark">
        <Glyph name={glyphs[state]} />
      </span>
      <span class="rst-journey__title">
        {step.href === undefined ? step.title : <Link href={step.href}>{step.title}</Link>}
      </span>{' '}
      <span class="rst-journey__state">{words[state]}</span>{' '}
      {step.here && state !== 'current' ? (
        <span class="rst-journey__here">Current step</span>
      ) : null}{' '}
      <span class="rst-journey__detail">{step.detail}</span>{' '}
      <span class="rst-journey__cost">{step.cost}</span>
    </li>
  );
}

function Action(props: {
  readonly action: JourneyAction | undefined;
  readonly onResumed: () => void;
  readonly onAnswer: (() => void) | undefined;
}): JSX.Element | null {
  const { action, onAnswer } = props;
  if (action === undefined) return null;
  if (action.kind === 'resume') {
    return <ResumeButton runId={action.runId} label={action.label} onResumed={props.onResumed} />;
  }
  const answersHere = action.kind === 'answer' && onAnswer !== undefined;
  return (
    <Button
      variant="primary"
      onClick={() => {
        if (answersHere) onAnswer();
        else navigate(action.href);
      }}
    >
      {action.label}
    </Button>
  );
}

// RF-615
export function JourneyStrip(props: JourneyStripProps): JSX.Element {
  const { view } = props;
  return (
    <section class="rst-card rst-journey" aria-labelledby="rst-journey-title">
      <h2 class="rst-live-section__title" id="rst-journey-title">
        Journey from code to package
      </h2>
      <ol class="rst-journey__steps">
        {view.steps.map((step) => (
          <StepItem key={step.key} step={step} />
        ))}
      </ol>
      <div class="rst-journey__foot">
        <Action action={view.action} onResumed={props.onResumed} onAnswer={props.onAnswer} />
        <p class="rst-journey__total">{`Total so far ${costLabel(view.totalCostMicros)}`}</p>
      </div>
    </section>
  );
}
