import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { navigate } from '../app/router.js';
import { Button } from '../components/Button.js';
import { Link } from '../components/Link.js';
import { MoneyAmount } from '../components/MoneyAmount.js';
import type { JourneyAction, JourneyLink, JourneyView } from '../lib/journey/journey-steps.js';
import { DeepenAction } from './DeepenAction.js';
import { Head, StepItem, type RerunChoice } from './JourneySteps.js';
import { ResumeButton } from './ResumeButton.js';

// RF-615, RF-1015, RNF-010, design-system.md section 14 (journey strip): the seven steps from code to
// package as an ordered list. Each step says its state in a word and a glyph (never colour alone),
// gives its reason or its code and its cost, and is a link only when it has a page the user may open.
// The step that holds the next action is marked `aria-current="step"` and says so in text. One next
// action sits under the list. All the styles are under `.rst-road`.
// RF-1020, P8-100: on every page but the project page the steps are one compact row (glyph, name, state)
// and "Show step details" opens the detail cards; the project page keeps them open and has no button.

export interface JourneyStripProps {
  readonly view: JourneyView;
  /** RF-241: the labelled choice to re-run with the answered questions; none when nothing waits. */
  readonly rerun?: RerunChoice | undefined;
  /** RF-006: called once the server has queued the understand run again. */
  readonly onResumed: () => void;
  /** Opens the questions where the page can show them; any other page opens the run. */
  readonly onAnswer?: (() => void) | undefined;
  /** RF-646: opens the Deepen of the run where the page holds it; any other page opens the run. */
  readonly onDeepen?: (() => void) | undefined;
  /** P8-27: the path of the package's own run page, where "Open the package" focuses the package in place. */
  readonly packageHere?: string | undefined;
  readonly onPackage?: (() => boolean) | undefined;
  /** The path of the page that holds the strip: a second action that opens this page is left out. */
  readonly pagePath?: string | undefined;
  /** RF-1021: the understand run whose Deepen the page offers in place; none opens the run. */
  readonly deepenRunId?: string | undefined;
  /** RF-1021: the Questions and plan setup section, drawn in place of the answer and plan buttons. */
  readonly setup?: JSX.Element | undefined;
  /** RF-646: the user chose not to Deepen, so the questions are asked now (the project page). */
  readonly onSkipDeepen?: (() => void) | undefined;
  /** RF-1020, P8-100: the detail cards stay open and no button hides them (the project page). */
  readonly alwaysExpanded?: boolean | undefined;
  /**
   * RF-1021 (P8-84): the next action is a secondary button, because the page holds its one primary
   * action elsewhere (Your turn or Resume in the head of an ended understand run page).
   */
  readonly actionVariant?: 'primary' | 'secondary' | undefined;
}

function Action(props: {
  readonly action: JourneyAction | undefined;
  readonly variant?: 'primary' | 'secondary' | undefined;
  readonly onResumed: () => void;
  readonly onAnswer: (() => void) | undefined;
  readonly onDeepen?: (() => void) | undefined;
  readonly inPlace?: (() => boolean) | undefined;
}): JSX.Element | null {
  const { action, onAnswer, onDeepen } = props;
  if (action === undefined) return null;
  if (action.kind === 'resume') {
    return (
      <ResumeButton
        {...{ runId: action.runId, label: action.label, onResumed: props.onResumed }}
        variant={props.variant ?? 'primary'}
      />
    );
  }
  const answersHere = action.kind === 'answer' && onAnswer !== undefined;
  // P8-11 (EV-90): the run page has the Deepen button in "Your turn"; the strip points to it in words.
  if (action.kind === 'deepen' && onDeepen !== undefined) {
    return <p class="rst-journey__note">Deepen first: use the Deepen button in Your turn.</p>;
  }
  return (
    <Button
      variant={props.variant ?? 'primary'}
      onClick={() => {
        if (answersHere) onAnswer();
        else if (props.inPlace?.() !== true) navigate(action.href);
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

/** P8-27: "Open the package" of the run the page is about focuses its package section in place. */
function inPlaceOf(
  action: JourneyAction | undefined,
  props: JourneyStripProps,
): (() => boolean) | undefined {
  const here = action?.kind === 'link' && action.href === props.packageHere;
  return here ? props.onPackage : undefined;
}

/** RF-1021: the next step in place. Deepen shows what it would read; any other action is a button. */
function Next(props: JourneyStripProps): JSX.Element {
  const { view, deepenRunId, setup } = props;
  const { action } = view;
  if (setup !== undefined && setsUp(action)) return setup;
  if (action?.kind === 'deepen' && deepenRunId !== undefined) {
    return (
      <>
        <DeepenAction runId={deepenRunId} projectId={view.projectId} recommended open />
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
      variant={props.actionVariant}
      onResumed={props.onResumed}
      onAnswer={props.onAnswer}
      onDeepen={props.onDeepen}
      inPlace={inPlaceOf(action, props)}
    />
  );
}

// RF-615, RF-1020, RF-1021
export function JourneyStrip(props: JourneyStripProps): JSX.Element {
  const { view } = props;
  const [shown, setShown] = useState(false);
  const expanded = props.alwaysExpanded === true || shown;
  return (
    <section
      class={`rst-card rst-road${expanded ? '' : ' rst-road--compact'}`}
      aria-labelledby="rst-road-title"
    >
      <Head
        expanded={expanded}
        toggles={props.alwaysExpanded !== true}
        onToggle={() => {
          setShown(!shown);
        }}
      />
      <ol class="rst-road__steps" id="rst-road-steps">
        {view.steps.map((step) => (
          <StepItem key={step.key} step={step} rerun={props.rerun} expanded={expanded} />
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
        <p class="rst-road__total">
          {'Total so far '}
          <MoneyAmount micros={view.totalCostMicros} tabStop />
        </p>
        {view.left === undefined ? null : <p class="rst-road__left">{view.left}</p>}
        <p class="rst-road__more">
          <Link href={`/projects/${view.projectId}/history`}>Past runs</Link>{' '}
          <Link href={`/projects/${view.projectId}/settings`}>Settings for this project</Link>
        </p>
      </div>
    </section>
  );
}
