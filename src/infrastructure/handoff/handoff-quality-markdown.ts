import type { PlanTask } from '../../domain/planning/plan-content.js';
import { riskClasses } from '../../domain/planning/task-card-quality.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { bullets } from './handoff-links.js';

// RF-630, RF-633, RF-635, DEC-135: what makes a task card buildable without guessing. The card
// states the invariant the work must make true, its risk class, the guards it adds and the review
// probes (hostile and edge inputs) the builder runs before asking for review; the build method
// (`AGENTS.md`) says how a guard is pinned by a test, how the probes are used and how the risk
// class sets the model tier. Model text is escaped by the escaper like every other card text.

// RF-635
export function riskLines(task: PlanTask): string[] {
  return [`Risk class: ${task.riskClass}`, ''];
}

// RF-630
export function invariantLines(task: PlanTask, esc: MarkdownEscaper): string[] {
  return [`Invariant: ${esc.inline(task.invariant)}`, ''];
}

/** The guards the card adds, its review probes and the guard test they call for (RF-630, RF-633). */
// RF-630, RF-633
export function probeLines(task: PlanTask, esc: MarkdownEscaper): string[] {
  const adds = task.adds.length === 0 ? [] : [`Adds: ${task.adds.join(', ')}`, ''];
  const guardTest =
    task.adds.length === 0
      ? []
      : [
          'Guard test: write a test for each guard above that fails when the guard is removed; the reviewer removes the guard to confirm it.',
          '',
        ];
  if (task.probes.length === 0) return adds;
  return [...adds, 'Review probes:', '', ...bullets(task.probes, esc, ''), '', ...guardTest];
}

// RF-633
function guardTestLines(): string[] {
  return [
    '## Guard tests',
    '',
    'The rule: each branch, check or guard a card adds has a test that fails when that guard is removed, even when the code already behaves correctly without it. The test is written first and named after the requirement. The reviewer confirms it with a mutation check: the reviewer removes the guard and confirms that the test fails; a test that stays green proves nothing.',
    '',
  ];
}

// RF-630
function probeRuleLines(): string[] {
  return [
    '## Review probes',
    '',
    'A card that adds a check, a filter, a limit or a parser lists review probes: concrete hostile or edge inputs such as other spellings and letter cases, encodings, neighbouring code paths that do the same thing, and values one step past a limit. Run the same list before asking for review and fix what it finds; the reviewer runs it again.',
    '',
  ];
}

// RF-635
function riskRuleLines(): string[] {
  return [
    '## Risk class',
    '',
    `Every task card has a risk class next to its difficulty: ${riskClasses.join(', ')}. A card with a risk class other than none is built by at least the middle model tier and reviewed with its probes, whatever its difficulty, because a small card at a trust boundary can still do the most harm.`,
    '',
  ];
}

/** The rules of the build method that come from the quality of the task cards. */
// RF-630, RF-633, RF-635
export function qualityRuleLines(): string[] {
  return [...guardTestLines(), ...probeRuleLines(), ...riskRuleLines()];
}
