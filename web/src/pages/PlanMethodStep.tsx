import type { JSX } from 'preact';
import { TOOL_CHOICES } from '../lib/plan-setup/build-method.js';
import { chooseOption } from '../lib/plan-setup/choices.js';
import { shownMethod, type Draft } from '../lib/plan-setup/draft.js';
import { TYPED } from '../lib/plan-setup/own-answers.js';
import { PlanChoice } from './PlanChoice.js';
import { PlanOwnChoice } from './PlanOwnChoice.js';
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

interface ChoicesProps {
  readonly draft: Draft;
  readonly shown: Draft;
  readonly change: (next: Draft) => void;
  readonly choose: (next: Draft, option: string) => void;
  readonly problem: string | undefined;
}

const CARDS = [
  {
    option: 'agents',
    title: 'Agents will build',
    aiAssisted: true,
    note: `${AGENTS_GIVES} Leaves out: nothing.`,
  },
  {
    option: 'people',
    title: 'People will build',
    aiAssisted: false,
    note: `The package is the plan and the specification, as for any team. ${PEOPLE_LEAVES}`,
  },
  {
    option: 'both',
    title: 'Agents and people together',
    aiAssisted: true,
    note: `${AGENTS_GIVES} People lead and review every change; agents build the routine cards.`,
  },
] as const;

function MethodChoices({ draft, shown, change, choose, problem }: ChoicesProps): JSX.Element {
  const kept = draft.chosen['buildMethod'];
  const answered = shown.answered.includes('buildMethod') || shown !== draft;
  const on = (aiAssisted: boolean, option: string): boolean =>
    answered &&
    kept !== TYPED &&
    shown.aiAssisted === aiAssisted &&
    (!aiAssisted || (option === 'both') === (kept === 'both'));
  return (
    <div class="rst-plan-options" role="radiogroup" aria-labelledby="build-method-label">
      <p id="build-method-label" class="rst-plan-label">
        How will the team build the new system?
      </p>
      {CARDS.map((card) => (
        <PlanChoice
          key={card.option}
          id={`build-method-${card.option}`}
          group="build-method"
          title={card.title}
          checked={on(card.aiAssisted, card.option)}
          onChoose={() => {
            choose({ ...shown, aiAssisted: card.aiAssisted }, card.option);
          }}
        >
          <p class="rst-plan-note">{card.note}</p>
        </PlanChoice>
      ))}
      <PlanOwnChoice
        question="buildMethod"
        group="build-method"
        draft={draft}
        change={change}
        problem={problem}
      />
    </div>
  );
}

// RF-612
export function PlanMethodStep({ draft, change, problems }: StepProps): JSX.Element {
  const shown = shownMethod(draft);
  const kept = draft.chosen['buildMethod'];
  const choose = (next: Draft, option = kept ?? ''): void => {
    change(chooseOption(next, 'buildMethod', option));
  };
  const answered = shown.answered.includes('buildMethod') || shown !== draft;
  const agentsOn = answered && shown.aiAssisted && kept !== TYPED;
  return (
    <PlanStepCard
      step="method"
      defaultText="No default: leave it unanswered and the package assumes people will build."
    >
      <Why draft={draft} />
      <MethodChoices
        draft={draft}
        shown={shown}
        change={change}
        choose={choose}
        problem={problems['typed.buildMethod']}
      />
      {agentsOn ? <PlanMethodModels draft={shown} change={choose} problems={problems} /> : null}
    </PlanStepCard>
  );
}
