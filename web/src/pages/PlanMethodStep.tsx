import type { JSX } from 'preact';
import { withAnswered } from '../lib/plan-setup/draft.js';
import { Field } from '../components/Field.js';
import { PlanStepCard } from './PlanStepCard.js';
import type { StepProps } from './PlanPrinciplesStep.js';

// RF-612, design-system.md section 14 (Plan setup): whether the team builds with AI agents.

// RF-612
export function PlanMethodStep({ draft, change }: StepProps): JSX.Element {
  return (
    <PlanStepCard step="method" defaultText="Default: without AI-assisted build.">
      <Field
        kind="checkbox"
        id="build-ai-assisted"
        label="The team builds the new system with AI agents (AI-assisted build)"
        help="The package adds AGENTS.md, task cards rated by difficulty and a human review on every pull request."
        checked={draft.aiAssisted}
        onChange={(checked) => {
          change(withAnswered({ ...draft, aiAssisted: checked }, ['buildMethod']));
        }}
      />
    </PlanStepCard>
  );
}
