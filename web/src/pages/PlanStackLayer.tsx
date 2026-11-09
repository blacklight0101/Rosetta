import type { JSX } from 'preact';
import type { StackChoice, StackOffer } from '../api/plan-schemas.js';
import { chooseLayer, typeLayer } from '../lib/plan-setup/choices.js';
import { withAnswered, type Draft } from '../lib/plan-setup/draft.js';
import { chosen } from '../lib/plan-setup/choices.js';
import { TYPED } from '../lib/plan-setup/own-answers.js';
import type { QuestionOption } from '../lib/plan-setup/question-options.js';
import { platformClashLine } from '../lib/plan-setup/stack-platform.js';
import type { STACK_LAYERS } from '../lib/plan-setup/steps.js';
import { PlanChoice } from './PlanChoice.js';
import { PlanOwnChoice } from './PlanOwnChoice.js';

// RF-609, RF-645, DEC-208, DEC-211, design-system.md section 14 (Plan setup): one layer of the Stack
// step as the heading of a group of option cards (the recommended first), "Type your own answer" last,
// a line that says where the suggestions come from, and a note when the answer belongs to another platform.

export interface LayerProps {
  readonly layer: (typeof STACK_LAYERS)[number];
  readonly options: readonly QuestionOption[];
  readonly offered: readonly string[];
  readonly draft: Draft;
  readonly change: (next: Draft) => void;
  readonly problem: string | undefined;
  readonly offer?: StackOffer | undefined;
  /** The language and runtime chosen, when it has a platform. */
  readonly language?: string | undefined;
  /** A line under the heading, for the language layer. */
  readonly hint?: string | undefined;
}

/** RF-645, P8-22: a saved choice that is none of the options is the own answer, whatever its flag. */
function isOwn(picked: StackChoice | undefined, options: readonly QuestionOption[]): boolean {
  if (picked === undefined) return false;
  return picked.custom || !options.some((option) => option.title === picked.choice);
}

/** RF-645: the option shown as chosen, read from the saved choice so an older brief shows it too. */
function shownOption(picked: StackChoice | undefined, options: readonly QuestionOption[]): string {
  if (picked === undefined) return '';
  if (isOwn(picked, options)) return TYPED;
  return options.find((option) => option.title === picked.choice)?.id ?? '';
}

/** What the layer says about where its suggestions come from, or whose answer it holds. */
function stateOf(props: LayerProps): string {
  const picked = props.draft.stack[props.layer.id];
  if (picked !== undefined) {
    return isOwn(picked, props.options) ? 'Your own answer' : 'Your choice, kept';
  }
  const suggested = props.options.some((option) => option.recommended);
  if (!suggested) return 'No suggestion: type your own';
  return props.language === undefined
    ? 'Suggested from the legacy code'
    : `Suggested for ${props.language}`;
}

/** P7-30: the catalogue's choices for the platform a typed answer names, when it names only that. */
function platformChoices(
  offer: StackOffer | undefined,
  layer: string,
  typed: string,
): readonly { readonly choice: string; readonly why: string }[] {
  const text = typed
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:\s]+$/u, '');
  const group = offer?.layers
    .find((each) => each.layer === layer)
    ?.vague.find((each) => each.words.includes(text));
  return group?.proposals ?? [];
}

function PlatformHint(props: LayerProps): JSX.Element | null {
  const { layer, draft, change, offered, options, offer } = props;
  const picked = draft.stack[layer.id];
  const choices = picked?.custom === true ? platformChoices(offer, layer.id, picked.choice) : [];
  if (picked === undefined || choices.length === 0) return null;
  return (
    <div class="rst-plan-note" role="status">
      <p>
        {`"${picked.choice.trim()}" names a platform, not a technology, so the package would treat ${layer.name} as open. Pick one:`}
      </p>
      {choices.map((each) => (
        <button
          key={each.choice}
          type="button"
          class="rst-button rst-button--secondary"
          title={each.why}
          onClick={() => {
            const option = options.find((candidate) => candidate.title === each.choice)?.id;
            const pick = {
              choice: each.choice,
              custom: false,
              offered,
              ...(option ? { option } : {}),
            };
            change(chooseLayer(draft, layer.id, pick));
          }}
        >
          {each.choice}
        </button>
      ))}
    </div>
  );
}

function Cards(props: LayerProps): JSX.Element {
  const { layer, offered, draft, change, problem } = props;
  const question = `stack.${layer.id}`;
  const group = `stack-${layer.id}`;
  const picked = draft.stack[layer.id];
  const { options } = props;
  const shown = draft.chosen[question] === TYPED ? TYPED : shownOption(picked, options);
  return (
    <div
      class="rst-plan-options rst-plan-options--cards"
      role="radiogroup"
      aria-labelledby={`${group}-name`}
    >
      {options.map((option) => (
        <PlanChoice
          key={option.id}
          id={`${group}-${option.id}`}
          group={group}
          title={option.recommended ? `${option.title} (Recommended)` : option.title}
          checked={shown === option.id}
          onChoose={() => {
            const pick = { choice: option.title, custom: false, offered, option: option.id };
            change(chooseLayer(draft, layer.id, pick));
          }}
        >
          <p class="rst-plan-note">{option.description}</p>
        </PlanChoice>
      ))}
      <PlanOwnChoice
        question={question}
        group={group}
        draft={draft}
        change={change}
        label={`Your answer for ${layer.name}`}
        problem={problem}
        own={{
          checked: shown === TYPED,
          text: isOwn(picked, options) ? (picked?.choice ?? '') : '',
          pick: () => withAnswered(chosen(draft, question, TYPED), [question]),
          type: (text) => typeLayer(draft, layer.id, text, offered),
        }}
      />
    </div>
  );
}

// RF-609, RF-645, DEC-208
export function PlanStackLayer(props: LayerProps): JSX.Element {
  const { layer, draft } = props;
  const clash = platformClashLine(props.offer, draft, layer.id);
  return (
    <section class="rst-plan-layer" aria-labelledby={`stack-${layer.id}-name`}>
      <div class="rst-plan-layer__head">
        <h3 id={`stack-${layer.id}-name`} class="rst-plan-layer__name">
          {layer.name}
        </h3>
        <span class="rst-plan-note">{stateOf(props)}</span>
      </div>
      <div class="rst-plan-layer__body">
        {props.hint === undefined ? null : <p class="rst-plan-note">{props.hint}</p>}
        <Cards {...props} />
        <PlatformHint {...props} />
        {clash === undefined ? null : (
          <p role="note" class="rst-plan-warn">
            <span aria-hidden="true">! </span>
            {clash}
          </p>
        )}
      </div>
    </section>
  );
}
