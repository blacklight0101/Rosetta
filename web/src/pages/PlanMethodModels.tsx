import type { JSX } from 'preact';
import { Field } from '../components/Field.js';
import {
  MAX_NAME,
  MODEL_SLOTS,
  TOOL_CHOICES,
  modelExample,
  toolUsable,
  type ModelSlot,
} from '../lib/plan-setup/build-method.js';
import type { Draft } from '../lib/plan-setup/draft.js';
import { PlanChoice } from './PlanChoice.js';

// RF-639, DEC-176: after "Agents will build", the agent tool and, once a tool is chosen, one model
// name per tier and an optional escalation model. A tier left blank takes the tool's default. The
// model fields show only once the tool can be sent (another tool needs its name), so no model is
// typed and then dropped by the save.

export interface PlanMethodModelsProps {
  readonly draft: Draft;
  readonly change: (next: Draft) => void;
  readonly problems: Readonly<Record<string, string>>;
}

const LABELS: Readonly<Record<ModelSlot, string>> = {
  smallest: 'Smallest tier model',
  middle: 'Middle tier model',
  largest: 'Largest tier model',
  escalation: 'Escalation model (optional)',
};

const HELP: Readonly<Record<ModelSlot, string>> = {
  smallest: 'Used for difficulty 1 to 5.',
  middle: 'Used for difficulty 6 to 8 and to verify them.',
  largest: 'Used for difficulty 9 and 10 and to verify them.',
  escalation: 'Used only with your approval in chat; it never has a default.',
};

function Models(props: PlanMethodModelsProps): JSX.Element | null {
  const { draft, change, problems } = props;
  const kind = draft.toolKind;
  if (kind === '' || !toolUsable(draft)) return null;
  return (
    <>
      {MODEL_SLOTS.map((slot) => {
        const error = problems[`buildMethod.models.${slot}`];
        return (
          <Field
            key={slot}
            kind="text"
            id={`build-model-${slot}`}
            label={LABELS[slot]}
            help={`${HELP[slot]} Leave blank for the default${slot === 'escalation' ? ': none' : ''}.`}
            placeholder={modelExample(kind, slot)}
            value={draft.models[slot]}
            error={error === undefined ? undefined : { message: error }}
            onInput={(value) => {
              change({ ...draft, models: { ...draft.models, [slot]: value } });
            }}
          />
        );
      })}
    </>
  );
}

// RF-639
export function PlanMethodModels(props: PlanMethodModelsProps): JSX.Element {
  const { draft, change, problems } = props;
  const nameError = problems['buildMethod.agentTool'];
  return (
    <>
      <div class="rst-plan-options" role="radiogroup" aria-labelledby="build-tool-label">
        <p id="build-tool-label" class="rst-plan-label">
          Which agent tool does the team build with?
        </p>
        {TOOL_CHOICES.map((choice) => (
          <PlanChoice
            key={choice.kind}
            id={`build-tool-${choice.kind}`}
            group="build-tool"
            title={choice.title}
            checked={draft.toolKind === choice.kind}
            onChoose={() => {
              change({ ...draft, toolKind: choice.kind });
            }}
          />
        ))}
      </div>
      {draft.toolKind === 'other' ? (
        <Field
          kind="text"
          id="build-tool-name"
          label="Name of the tool"
          help={`The model fields show once the tool has a name. At most ${String(MAX_NAME)} characters.`}
          value={draft.toolName}
          error={nameError === undefined ? undefined : { message: nameError }}
          onInput={(value) => {
            change({ ...draft, toolName: value });
          }}
        />
      ) : null}
      <Models {...props} />
    </>
  );
}
