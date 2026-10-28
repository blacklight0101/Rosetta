import type { JSX } from 'preact';
import { TOOL_CHOICES } from '../lib/plan-setup/build-method.js';
import { shownMethod, withAnswered, type Draft } from '../lib/plan-setup/draft.js';
import { PlanChoice } from './PlanChoice.js';
import { PlanMethodModels } from './PlanMethodModels.js';
import { PlanStepCard } from './PlanStepCard.js';
import type { StepProps } from './PlanPrinciplesStep.js';

// RF-612, RF-639, DEC-176 (Q-A, Q-B), design-system.md section 14 (Plan setup): the build method.
// A required two-way choice with no default, each answer saying what the package gives and what it
// leaves out; the agent tool comes next and the models only after the tool, so a model is never
// named without its tool. The same radio cards take more options later (RF-645).

const AGENTS_GIVES =
  'The package adds AGENTS.md as a start-here file, a build protocol (roles, the model of each difficulty, verifier, merge rules, gates), agent definitions for your tool and the model to use on every task card.';
const PEOPLE_LEAVES =
  'Leaves out: AGENTS.md, the build protocol, agent definitions, and the difficulty and model on task cards. Answer again at any time to add them.';

function Why({ draft }: { readonly draft: Draft }): JSX.Element | null {
  if (draft.answered.includes('buildMethod')) return null;
  if (draft.askedBefore) {
    return (
      <p class="rst-callout__message" role="status">
        Your brief was saved before this question was answered. Answer it now, so the package knows
        how you build.
      </p>
    );
  }
  const shown = shownMethod(draft);
  const tool = TOOL_CHOICES.find((choice) => choice.kind === shown.toolKind);
  if (shown === draft || tool === undefined) return null;
  const name = shown.toolKind === 'other' ? shown.toolName : tool.title;
  return (
    <p class="rst-plan-note" role="status">
      {`Your project context names ${name}, so this opens on Agents will build. Change it if that is not so.`}
    </p>
  );
}

// RF-612
export function PlanMethodStep({ draft, change, problems }: StepProps): JSX.Element {
  const shown = shownMethod(draft);
  const choose = (next: Draft): void => {
    change(withAnswered(next, ['buildMethod']));
  };
  const answered = shown.answered.includes('buildMethod') || shown !== draft;
  return (
    <PlanStepCard
      step="method"
      defaultText="No default: leave it unanswered and the package assumes people will build."
    >
      <Why draft={draft} />
      <div class="rst-plan-options" role="radiogroup" aria-labelledby="build-method-label">
        <p id="build-method-label" class="rst-plan-label">
          How will the team build the new system?
        </p>
        <PlanChoice
          id="build-method-agents"
          group="build-method"
          title="Agents will build"
          checked={answered && shown.aiAssisted}
          onChoose={() => {
            choose({ ...shown, aiAssisted: true });
          }}
        >
          <p class="rst-plan-note">{AGENTS_GIVES} Leaves out: nothing.</p>
        </PlanChoice>
        <PlanChoice
          id="build-method-people"
          group="build-method"
          title="People will build"
          checked={answered && !shown.aiAssisted}
          onChoose={() => {
            choose({ ...shown, aiAssisted: false });
          }}
        >
          <p class="rst-plan-note">
            The package is the plan and the specification, as for any team. {PEOPLE_LEAVES}
          </p>
        </PlanChoice>
      </div>
      {answered && shown.aiAssisted ? (
        <PlanMethodModels draft={shown} change={choose} problems={problems} />
      ) : null}
    </PlanStepCard>
  );
}
