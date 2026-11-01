import type { JSX } from 'preact';
import { navigate } from '../app/router.js';
import { Button } from '../components/Button.js';
import { Glyph, type GlyphName } from '../components/Glyph.js';
import { Link } from '../components/Link.js';
import { costLabel } from '../lib/live-run/format.js';
import type {
  JourneyAction,
  JourneyLink,
  JourneyStep,
  JourneyView,
  StepLink,
  StepState,
} from '../lib/journey/journey-steps.js';
import { DeepenAction } from './DeepenAction.js';
import { ResumeButton } from './ResumeButton.js';

// RF-615, RF-1015, RNF-010, design-system.md section 14 (journey strip): the seven steps from code to
// package as an ordered list. Each step says its state in a word and a glyph (never colour alone),
// gives its reason or its code and its cost, and is a link only when it has a page the user may open.
// The step that holds the next action is marked `aria-current="step"` and says so in text. One next
// action sits under the list. All the styles are under `.rst-road`.

export interface JourneyStripProps {
  readonly view: JourneyView;
  /** RF-006: called once the server has queued the understand run again. */
  readonly onResumed: () => void;
  /** Opens the questions where the page can show them; any other page opens the run. */
  readonly onAnswer?: (() => void) | undefined;
  /** RF-646: opens the Deepen of the run where the page holds it; any other page opens the run. */
  readonly onDeepen?: (() => void) | undefined;
  /** The path of the page that holds the strip: a second action that opens this page is left out. */
  readonly pagePath?: string | undefined;
  /** RF-1021: the understand run whose Deepen the page offers in place; none opens the run. */
  readonly deepenRunId?: string | undefined;
  /** RF-1021: the Questions and plan setup section, drawn in place of the answer and plan buttons. */
  readonly setup?: JSX.Element | undefined;
  /** RF-646: the user chose not to Deepen, so the questions are asked now (the project page). */
  readonly onSkipDeepen?: (() => void) | undefined;
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

function StepItem({ step }: { readonly step: JourneyStep }): JSX.Element {
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
      <span class="rst-road__detail">{step.detail}</span>{' '}
      <span class="rst-road__cost">{step.cost}</span>
      <StepLinks links={step.links} />
    </li>
  );
}

function Action(props: {
  readonly action: JourneyAction | undefined;
  readonly variant?: 'primary' | 'secondary';
  readonly onResumed: () => void;
  readonly onAnswer: (() => void) | undefined;
  readonly onDeepen?: (() => void) | undefined;
}): JSX.Element | null {
  const { action, onAnswer, onDeepen } = props;
  if (action === undefined) return null;
  if (action.kind === 'resume') {
    return <ResumeButton runId={action.runId} label={action.label} onResumed={props.onResumed} />;
  }
  const answersHere = action.kind === 'answer' && onAnswer !== undefined;
  const deepensHere = action.kind === 'deepen' && onDeepen !== undefined;
  return (
    <Button
      variant={props.variant ?? 'primary'}
      onClick={() => {
        if (answersHere) onAnswer();
        else if (deepensHere) onDeepen();
        else navigate(action.href);
      }}
    >
      {action.label}
    </Button>
  );
}

/** The second action, unless it only opens the page the strip is on. */
function secondaryOf(view: JourneyView, pagePath: string | undefined): JourneyLink | undefined {
  const { secondary } = view;
  return secondary?.href.split('?')[0] === pagePath ? undefined : secondary;
}

/** RF-1021: the actions that answer the questions or set up and start the plan, which the page holds in place. */
function setsUp(action: JourneyAction | undefined): boolean {
  if (action?.kind === 'answer') return true;
  return action?.kind === 'link' && action.href.includes('/plan-setup');
}

/** RF-1021: the next step in place. Deepen shows what it would read; any other action is a button. */
function Next(props: JourneyStripProps): JSX.Element {
  const { view, deepenRunId, setup } = props;
  const { action } = view;
  if (setup !== undefined && setsUp(action)) return setup;
  if (action?.kind === 'deepen' && deepenRunId !== undefined) {
    return (
      <>
        <DeepenAction runId={deepenRunId} recommended open />
        {props.onSkipDeepen === undefined ? null : (
          <Button variant="secondary" onClick={props.onSkipDeepen}>
            Do not Deepen: answer the questions now
          </Button>
        )}
      </>
    );
  }
  const own = action?.kind === 'link' && action.href.split('?')[0] === props.pagePath;
  return (
    <Action
      action={own ? undefined : action}
      onResumed={props.onResumed}
      onAnswer={props.onAnswer}
      onDeepen={props.onDeepen}
    />
  );
}

// RF-615, RF-1020, RF-1021
export function JourneyStrip(props: JourneyStripProps): JSX.Element {
  const { view } = props;
  return (
    <section class="rst-card rst-road" aria-labelledby="rst-road-title">
      <h2 class="rst-live-section__title" id="rst-road-title">
        Journey from code to package
      </h2>
      <ol class="rst-road__steps">
        {view.steps.map((step) => (
          <StepItem key={step.key} step={step} />
        ))}
      </ol>
      <div class="rst-road__foot">
        <Next {...props} />
        <Action
          action={
            props.setup !== undefined && setsUp(view.action)
              ? undefined
              : secondaryOf(view, props.pagePath)
          }
          variant="secondary"
          onResumed={props.onResumed}
          onAnswer={undefined}
        />
        <p class="rst-road__total">{`Total so far ${costLabel(view.totalCostMicros)}`}</p>
        {view.left === undefined ? null : <p class="rst-road__left">{view.left}</p>}
        <p class="rst-road__more">
          <Link href={`/projects/${view.projectId}/history`}>History</Link>{' '}
          <Link href={`/projects/${view.projectId}/settings`}>Project settings</Link>
        </p>
      </div>
    </section>
  );
}
