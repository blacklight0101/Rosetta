import type { JSX } from 'preact';
import type { PlanOptions, StackChoice, StackOffer } from '../api/plan-schemas.js';
import { chooseLayer, chosen } from '../lib/plan-setup/choices.js';
import { MAX_CHOICE, withAnswered, type Draft } from '../lib/plan-setup/draft.js';
import { TYPED } from '../lib/plan-setup/own-answers.js';
import {
  OWN_ANSWER,
  questionOptions,
  type QuestionOption,
} from '../lib/plan-setup/question-options.js';
import { STACK_LAYERS } from '../lib/plan-setup/steps.js';
import { Field } from '../components/Field.js';
import { PlanOptionsNotice } from './PlanOptionsNotice.js';
import { PlanStepCard } from './PlanStepCard.js';
import type { StepProps } from './PlanPrinciplesStep.js';
import type { OptionsLoad } from './use-plan-options.js';

// RF-609, design-system.md section 14 (Plan setup): one row for each of the seven layers, with two
// options derived from the legacy stack (option A stays closest to it) and a field for your own.

export interface StackProps extends StepProps {
  readonly load: OptionsLoad;
  readonly offer?: StackOffer | undefined;
  readonly waitingForConsent: boolean;
  readonly askAgain: () => void;
}

interface LayerRowProps {
  readonly layer: (typeof STACK_LAYERS)[number];
  readonly options: readonly QuestionOption[];
  readonly offered: readonly string[];
  readonly draft: Draft;
  readonly change: (next: Draft) => void;
  readonly problem: string | undefined;
  /** RF-609: the catalogue has no option for the layer. */
  readonly noOption: boolean;
  readonly offer?: StackOffer | undefined;
}

type PlatformChoices = ReturnType<typeof platformChoices>;

/** RF-645: the option shown as chosen, read from the saved choice so an older brief shows it too. */
function shownOption(picked: StackChoice | undefined, options: readonly QuestionOption[]): string {
  if (picked === undefined) return '';
  if (picked.custom) return TYPED;
  return options.find((option) => option.title === picked.choice)?.id ?? '';
}

function LayerOptions(props: LayerRowProps): JSX.Element {
  const { layer, options, offered, draft, change } = props;
  const question = `stack.${layer.id}`;
  const picked = draft.stack[layer.id];
  const shown = draft.chosen[question] === TYPED ? TYPED : shownOption(picked, options);
  return (
    <div class="rst-plan-layer__options">
      {props.noOption ? (
        <p class="rst-plan-note">
          The catalogue has no option for this layer, so only the choices below are offered.
        </p>
      ) : null}
      {options.map((option) => (
        <label key={option.id} class="rst-plan-layer__option">
          <input
            type="radio"
            name={`stack-${layer.id}`}
            checked={shown === option.id}
            onChange={() => {
              const pick = { choice: option.title, custom: false, offered, option: option.id };
              change(chooseLayer(draft, layer.id, pick));
            }}
          />
          <span>
            <span>{option.title}</span>
            {option.recommended ? <span> (Recommended)</span> : null}
            <span class="rst-plan-note"> {option.description}</span>
          </span>
        </label>
      ))}
      <label class="rst-plan-layer__option">
        <input
          type="radio"
          name={`stack-${layer.id}`}
          checked={shown === TYPED}
          onChange={() => {
            change(withAnswered(chosen(draft, question, TYPED), [question]));
          }}
        />
        <span>{OWN_ANSWER}</span>
      </label>
    </div>
  );
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

function PlatformHint(props: LayerRowProps & { readonly choices: PlatformChoices }): JSX.Element {
  const { layer, draft, change, offered, options, choices } = props;
  const typed = draft.stack[layer.id]?.choice ?? '';
  return (
    <div class="rst-plan-note" role="status">
      <p>
        {`"${typed.trim()}" names a platform, not a technology, so the package would treat ${layer.name} as open. Pick one:`}
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

function LayerRow(props: LayerRowProps): JSX.Element {
  const { layer, offered, draft, change, problem } = props;
  const picked = draft.stack[layer.id];
  const labelId = `stack-${layer.id}-name`;
  const choices =
    picked?.custom === true ? platformChoices(props.offer, layer.id, picked.choice) : [];
  return (
    <div class="rst-plan-layer" role="radiogroup" aria-labelledby={labelId}>
      <strong id={labelId} class="rst-plan-layer__name">
        {layer.name}
      </strong>
      <LayerOptions {...props} />
      <Field
        kind="text"
        id={`stack-${layer.id}-own`}
        label={`Your own for ${layer.name}`}
        value={picked?.custom === true ? picked.choice : ''}
        error={problem === undefined ? undefined : { message: problem }}
        placeholder={`Max ${String(MAX_CHOICE)} characters`}
        onInput={(text) => {
          change(chooseLayer(draft, layer.id, { choice: text, custom: true, offered }));
        }}
      />
      {picked?.custom === true && choices.length > 0 ? (
        <PlatformHint {...props} choices={choices} />
      ) : null}
    </div>
  );
}

/** The proposals shown for the layer, the recommended first: the planner's, else the catalogue's. */
function offeredOf(
  options: PlanOptions | undefined,
  offer: StackOffer | undefined,
  layer: string,
): readonly string[] {
  const planned = options?.stack.find((each) => each.layer === layer)?.options ?? [];
  if (planned.length > 0) return planned;
  return offer?.layers.find((each) => each.layer === layer)?.proposals.map((p) => p.choice) ?? [];
}

// RF-609
export function PlanStackStep(props: StackProps): JSX.Element {
  const { draft, change, problems, load } = props;
  const options = load.status === 'ready' ? load.options : undefined;
  return (
    <PlanStepCard
      step="stack"
      defaultText="Default: the recommended option of each layer; a layer you skip takes it."
    >
      <PlanOptionsNotice
        load={load}
        waitingForConsent={props.waitingForConsent}
        askAgain={props.askAgain}
      />
      <div class="rst-plan-layers">
        <p class="rst-plan-layers__head" aria-hidden="true">
          The recommended proposal comes first, then the second proposal; you can also keep the
          legacy technology (not offered for a workbook or an end-of-life technology) or type your
          own.
        </p>
        {STACK_LAYERS.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            options={questionOptions(`stack.${layer.id}`, {
              ...{ catalogue: props.catalogue, options, offer: props.offer },
            })}
            offered={offeredOf(options, props.offer, layer.id)}
            noOption={
              props.offer !== undefined && offeredOf(options, props.offer, layer.id).length === 0
            }
            draft={draft}
            change={change}
            problem={problems[`stack.${layer.id}`]}
            offer={props.offer}
          />
        ))}
      </div>
    </PlanStepCard>
  );
}
