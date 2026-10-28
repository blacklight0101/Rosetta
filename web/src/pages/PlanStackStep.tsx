import type { JSX } from 'preact';
import type { PlanOptions, StackChoice } from '../api/plan-schemas.js';
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
}

/** RF-645: the option shown as chosen, read from the saved choice so an older brief shows it too. */
function shownOption(picked: StackChoice | undefined, options: readonly QuestionOption[]): string {
  if (picked === undefined) return '';
  if (picked.custom) return TYPED;
  return options.find((option) => option.title === picked.choice)?.id ?? '';
}

function LayerRow(props: LayerRowProps): JSX.Element {
  const { layer, options, offered, draft, change, problem } = props;
  const picked = draft.stack[layer.id];
  const question = `stack.${layer.id}`;
  const labelId = `stack-${layer.id}-name`;
  const shown = draft.chosen[question] === TYPED ? TYPED : shownOption(picked, options);
  return (
    <div class="rst-plan-layer" role="radiogroup" aria-labelledby={labelId}>
      <strong id={labelId} class="rst-plan-layer__name">
        {layer.name}
      </strong>
      <div class="rst-plan-layer__options">
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
    </div>
  );
}

const offeredOf = (options: PlanOptions | undefined, layer: string): readonly string[] =>
  options?.stack.find((each) => each.layer === layer)?.options ?? [];

// RF-609
export function PlanStackStep(props: StackProps): JSX.Element {
  const { draft, change, problems, load } = props;
  const options = load.status === 'ready' ? load.options : undefined;
  return (
    <PlanStepCard
      step="stack"
      defaultText="Default: nothing chosen; each layer you skip is listed as an open question."
    >
      <PlanOptionsNotice
        load={load}
        waitingForConsent={props.waitingForConsent}
        askAgain={props.askAgain}
      />
      <div class="rst-plan-layers">
        <p class="rst-plan-layers__head" aria-hidden="true">
          The first proposal is the closest to the legacy code and the other is the second proposal;
          you can also keep the legacy technology or type your own.
        </p>
        {STACK_LAYERS.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            options={questionOptions(`stack.${layer.id}`, { catalogue: props.catalogue, options })}
            offered={offeredOf(options, layer.id)}
            draft={draft}
            change={change}
            problem={problems[`stack.${layer.id}`]}
          />
        ))}
      </div>
    </PlanStepCard>
  );
}
