import type { JSX } from 'preact';
import { chosen } from '../lib/plan-setup/choices.js';
import { withAnswered } from '../lib/plan-setup/draft.js';
import { TYPED } from '../lib/plan-setup/own-answers.js';
import { PlanContextChoices } from './PlanContextChoices.js';
import { MAX_TEXT } from '../lib/plan-setup/draft.js';
import type { ContextField } from '../lib/plan-setup/steps.js';
import { Field } from '../components/Field.js';
import { PlanStepCard } from './PlanStepCard.js';
import type { StepProps } from './PlanPrinciplesStep.js';

// RF-611, design-system.md section 14 (Plan setup): the optional questions about the team and the
// constraints. Every one can stay blank: it is then listed as an open question in the package.

const FIELDS: readonly {
  readonly field: ContextField;
  readonly label: string;
  readonly help: string;
  readonly multiline: boolean;
}[] = [
  {
    field: 'teamSize',
    label: 'Team size',
    help: 'How many people will build it.',
    multiline: false,
  },
  {
    field: 'experience',
    label: 'Team experience',
    help: 'What the team already knows well, in a few words.',
    multiline: false,
  },
  {
    field: 'deadline',
    label: 'Deadline',
    help: 'A date or a time frame, if one exists.',
    multiline: false,
  },
  {
    field: 'keepIntegrations',
    label: 'Integrations that must stay',
    help: 'One per line.',
    multiline: true,
  },
  {
    field: 'dataMigration',
    label: 'Data migration approach',
    help: `How the data should move, if you know. At most ${String(MAX_TEXT)} characters.`,
    multiline: false,
  },
];

// RF-611
export function PlanContextStep({ draft, catalogue, change, problems }: StepProps): JSX.Element {
  const set = (field: ContextField, value: string): void => {
    change(
      withAnswered(
        chosen(
          { ...draft, context: { ...draft.context, [field]: value } },
          `context.${field}`,
          TYPED,
        ),
        [`context.${field}`],
      ),
    );
  };
  return (
    <PlanStepCard
      step="context"
      defaultText="Default: no answers; each one is listed as an open question."
    >
      {FIELDS.map(({ field, label, help, multiline }) => {
        const error = problems[`context.${field}`];
        const common = {
          id: `context-${field}`,
          label,
          help,
          value: draft.context[field],
          error: error === undefined ? undefined : { message: error },
          onInput: (value: string) => {
            set(field, value);
          },
        };
        return (
          <div key={field} class="rst-plan-question">
            <PlanContextChoices
              field={field}
              label={label}
              draft={draft}
              catalogue={catalogue}
              change={change}
            />
            {multiline ? (
              <Field kind="textarea" rows={4} {...common} />
            ) : (
              <Field kind="text" {...common} />
            )}
          </div>
        );
      })}
    </PlanStepCard>
  );
}
