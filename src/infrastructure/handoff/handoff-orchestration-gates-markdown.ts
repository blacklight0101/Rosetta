import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { resolveBuildMethod } from '../../domain/planning/build-method.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { handoffFiles } from './handoff-links.js';

// RF-640, RF-643, P6-08: the sections of orchestration.md about the people and the limits of the
// build: the human gates taken from the plan, the usage throttle, escalation and stop conditions
// and the size budgets of living files. Phase names and exit criteria are the only model text and
// go through the escaper; every number is the team's default and is written as such.

export type SectionWriter = (handoff: HandoffPackage, esc: MarkdownEscaper) => string[];

function phaseRows(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { phases } = handoff.content;
  return phases.map((phase, index) => {
    const criteria =
      phase.exitCriteria.length === 0
        ? 'the person decides that the goal of the phase is met; the plan states no exit criterion'
        : phase.exitCriteria.map((each) => esc.inline(each)).join('; ');
    const blocks =
      index === phases.length - 1 ? 'the end of the build' : `phase ${String(phase.number + 1)}`;
    return `| Phase ${String(phase.number)} exit: ${esc.inline(phase.name)} | the person | ${criteria} | ${blocks} |`;
  });
}

// RF-640
export const gatesSection: SectionWriter = (handoff, esc) => [
  '## Human gates',
  '',
  'A gate is a point where only a person decides. The orchestrator never opens a gate and never works around one: a card behind a closed gate is `Blocked (<gate>)`, and the date and the name of the person who opened a gate are written down where the team keeps its progress. The gates are the ones the plan itself holds:',
  '',
  '| Gate | Held by | Opens when | Blocks |',
  '| ---- | ------- | ---------- | ------ |',
  `| Open questions | the person | each question in [open questions](${handoffFiles.openQuestions}) is answered or its default is accepted | the cards that list the question as waiting |`,
  ...phaseRows(handoff, esc),
  '',
  ...(handoff.content.phases.length === 0
    ? ['The plan names no phase, so it holds no phase exit gate.', '']
    : []),
  'A pull request labelled `needs-owner` is a gate of the same kind; see the merge rules.',
  '',
];

// RF-640
export const throttleSection: SectionWriter = (handoff) => {
  const claude = handoff.brief.buildMethod.agentTool?.kind === 'claude-code';
  return [
    '## Usage throttle',
    '',
    `The build must not stop because the usage of the agent plan ran out. Under these default bands the orchestrator launches one agent at a time; a team that builds the roadmap's groups in parallel raises this limit by a decision it records. The orchestrator reads the usage before every launch and after every finish: ${claude ? "the session's usage tool, a scheduled check that reads it, or the person (`/usage` works in a terminal session)" : 'the usage report of the agent tool, or the person if the tool reports none'}. The bands below are a default and the team's choice: change the percentages or the rules and record the change as a decision.`,
    '',
    `| ${claude ? '5-hour window' : 'Shortest usage window'} used | What may start |`,
    '| ------------------ | -------------- |',
    '| below 50% | any one agent (builder, verifier or fix round) |',
    '| 50% to 70% | only verifiers and fix rounds; no new card starts |',
    "| 70% to 85% | only the orchestrator's own cheap work (merges, rebases, status updates); no agent |",
    '| 85% or more | stop until the window resets; record the hold and the reset time, and resume just after it |',
    '',
    '- A running agent is not killed when a band is crossed; the next launch waits for the right band, and a paused agent is resumed, not restarted.',
    `- Above 70% of the ${claude ? 'weekly window' : 'longest usage window'}, at most one agent per hour.`,
    '- Verifiers of a second round and later probe only the changed code and the earlier findings.',
    '- When the usage cannot be read, keep to the 50% to 70% rules until it can.',
    '',
  ];
};

// RF-640
export const escalationSection: SectionWriter = (handoff) => [
  '## Escalation and stop conditions',
  '',
  resolveBuildMethod(handoff.brief.buildMethod, handoff.agentModels).models?.escalation ===
  undefined
    ? 'No escalation model is named: at the third failure of a card the owner decides what happens next, as the retry ladder says.'
    : "A card never gets the escalation model when the plan is made. The escalation model is used only at the third failure of a card, and only with the owner's approval in chat; the orchestrator records that approval on the card.",
  '',
  'Stop starting new work, write `Blocked (<reason>)` on the cards concerned and tell the person when:',
  '',
  '- a gate is needed;',
  '- a card reaches its third failure;',
  '- a builder reports a contradiction between documents;',
  '- the verifier finds a hard-rule violation that the builder says the card requires, which is a design question and not a build question;',
  '- continuous integration fails on the integration branch;',
  '- an environment, a credential or a person is needed that the agents cannot reach.',
  '',
  'Read success or failure from the exit code of a command, never from a search of its output.',
  '',
];

// RF-640
export const budgetsSection: SectionWriter = (handoff) => {
  const claude = handoff.brief.buildMethod.agentTool?.kind === 'claude-code';
  return [
    '## Size budgets of living files',
    '',
    `A living file is one the team edits for as long as the build lasts. These budgets are a default the team may change by a decision it records. The start-here index of [AGENTS.md](${handoffFiles.agents}) stays at about 60 lines; the rules after the index may be longer.${claude ? ' A `CLAUDE.md` the team adds stays at about 150 lines.' : ''} When a living file passes its budget, move the detail into a file it links to; do not let it grow.`,
    '',
  ];
};
