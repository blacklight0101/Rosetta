import type { JSX } from 'preact';
import type { PlanOptions } from '../api/plan-schemas.js';
import { chooseLayer } from '../lib/plan-setup/choices.js';
import type { Draft } from '../lib/plan-setup/draft.js';
import { MAX_CHOICE } from '../lib/plan-setup/draft.js';
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
  readonly options: readonly string[];
  readonly draft: Draft;
  readonly change: (next: Draft) => void;
  readonly problem: string | undefined;
}

function LayerRow({ layer, options, draft, change, problem }: LayerRowProps): JSX.Element {
  const picked = draft.stack[layer.id];
  const labelId = `stack-${layer.id}-name`;
  return (
    <div class="rst-plan-layer" role="radiogroup" aria-labelledby={labelId}>
      <strong id={labelId} class="rst-plan-layer__name">
        {layer.name}
      </strong>
      {options.map((option) => (
        <label key={option} class="rst-plan-layer__option">
          <input
            type="radio"
            name={`stack-${layer.id}`}
            checked={picked?.choice === option && !picked.custom}
            onChange={() => {
              change(chooseLayer(draft, layer.id, option, false));
            }}
          />{' '}
          {option}
        </label>
      ))}
      <Field
        kind="text"
        id={`stack-${layer.id}-own`}
        label={`Your own for ${layer.name}`}
        value={picked?.custom === true ? picked.choice : ''}
        error={problem === undefined ? undefined : { message: problem }}
        placeholder={`Max ${String(MAX_CHOICE)} characters`}
        onInput={(text) => {
          change(chooseLayer(draft, layer.id, text, true));
        }}
      />
    </div>
  );
}

const optionsOf = (options: PlanOptions | undefined, layer: string): readonly string[] =>
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
          Option A is the closest to the legacy code; option B is the other proposal.
        </p>
        {STACK_LAYERS.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            options={optionsOf(options, layer.id)}
            draft={draft}
            change={change}
            problem={problems[`stack.${layer.id}`]}
          />
        ))}
      </div>
    </PlanStepCard>
  );
}
