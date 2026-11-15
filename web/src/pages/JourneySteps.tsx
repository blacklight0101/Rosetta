import type { JSX } from 'preact';
import { Glyph, type GlyphName } from '../components/Glyph.js';
import { Link } from '../components/Link.js';
import { interruptedWord } from '../lib/interrupted-word.js';
import { MoneyAmount } from '../components/MoneyAmount.js';
import type { JourneyStep, StepLink, StepState } from '../lib/journey/journey-steps.js';

// RF-615, RF-1015, RF-1020, RNF-010, design-system.md section 14 (journey strip): one step of the strip
// and the head above the steps. A step says its state in a word and a glyph (never colour alone); its
// reason or code, cost and links are the detail that the compact row hides (P8-100).

/** RF-241, P8-26: the choice to re-run with the answers that wait, held by the Questions step. */
export interface RerunChoice {
  readonly answered: number;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

const words: Readonly<Record<StepState, string>> = {
  done: 'Done',
  current: 'Current',
  upcoming: 'Not yet',
  locked: 'Locked',
  failed: 'Failed',
  'out-of-date': 'Out of date',
  gaps: 'With gaps',
  awaiting: 'Waiting for approval',
  skipped: 'Skipped',
  stopped: interruptedWord('UserStop'),
  restarted: interruptedWord('Restart'),
  cancelled: interruptedWord('QueueCancel'),
  capped: 'Stopped at its cap',
  'stopped-here': interruptedWord('StoppedAtApproval'),
};

const glyphs: Readonly<Record<StepState, GlyphName>> = {
  done: 'check',
  current: 'live-dot',
  upcoming: 'open-circle',
  locked: 'dashed-circle',
  failed: 'cross',
  'out-of-date': 'warning-triangle',
  gaps: 'warning-triangle',
  awaiting: 'pause-bars',
  skipped: 'dashed-circle',
  stopped: 'pause-bars',
  restarted: 'pause-bars',
  cancelled: 'pause-bars',
  capped: 'warning-triangle',
  'stopped-here': 'pause-bars',
};

/** RF-627: the files and downloads of a step, plain links because they leave the app. */
function StepLinks({ links }: { readonly links: readonly StepLink[] }): JSX.Element | null {
  if (links.length === 0) return null;
  return (
    <span class="rst-road__links">
      {links.map((each) => (
        <a key={each.href} class="rst-road__link" href={each.href}>
          {each.label}
        </a>
      ))}
    </span>
  );
}

/** RF-241, P8-26: re-run the areas of the answered questions with the answers, in the Questions step. */
function RerunControl({ rerun }: { readonly rerun: RerunChoice }): JSX.Element {
  const noun = rerun.answered === 1 ? 'question' : 'questions';
  return (
    <label class="rst-road__rerun">
      <input
        type="checkbox"
        checked={rerun.checked}
        onChange={(event) => {
          rerun.onChange(event.currentTarget.checked);
        }}
      />
      {`Re-run with my ${String(rerun.answered)} answered ${noun} (areas no longer in the code map are skipped)`}
    </label>
  );
}

export function StepItem(props: {
  readonly step: JourneyStep;
  readonly rerun: RerunChoice | undefined;
  readonly expanded: boolean;
}): JSX.Element {
  const { step, rerun } = props;
  const { state } = step;
  return (
    <li
      class={`rst-road__step rst-road__step--${state}`}
      data-state={state}
      aria-current={step.here ? 'step' : undefined}
    >
      <span class="rst-road__mark">
        <Glyph name={glyphs[state]} />
      </span>
      <span class="rst-road__title">
        {step.href === undefined ? step.title : <Link href={step.href}>{step.title}</Link>}
      </span>{' '}
      <span class="rst-road__state">{words[state]}</span>{' '}
      {step.here && state !== 'current' ? <span class="rst-road__here">Current step</span> : null}{' '}
      <div class="rst-road__body" hidden={!props.expanded}>
        <span class="rst-road__detail">{step.detail}</span>{' '}
        <span class="rst-road__cost">
          {step.costMicros === undefined ? (
            step.cost
          ) : (
            <MoneyAmount micros={step.costMicros} tabStop />
          )}
        </span>
        <StepLinks links={step.links} />
        {step.key === 'questions' && rerun !== undefined && rerun.answered > 0 ? (
          <RerunControl rerun={rerun} />
        ) : null}
      </div>
    </li>
  );
}

/** RF-1020, P8-100: the title and, unless the details stay open, the button that shows or hides them. */
export function Head(props: {
  readonly expanded: boolean;
  readonly toggles: boolean;
  readonly onToggle: () => void;
}): JSX.Element {
  return (
    <div class="rst-road__head">
      <h2 class="rst-live-section__title" id="rst-road-title">
        Journey from code to package
      </h2>
      {props.toggles ? (
        <button
          type="button"
          class="rst-button rst-button--secondary"
          aria-expanded={props.expanded}
          aria-controls="rst-road-steps"
          onClick={props.onToggle}
        >
          {props.expanded ? 'Hide step details' : 'Show step details'}
        </button>
      ) : null}
    </div>
  );
}
