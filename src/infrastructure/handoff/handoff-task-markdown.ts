import type { HandoffPackage, PackagePrinciple } from '../../application/plan/handoff-package.js';
import type { PlanPhase, PlanTask } from '../../domain/planning/plan-content.js';
import {
  difficultyOfTask,
  methodPrinciples,
  reviewGroup,
  sizeOfTask,
} from '../../domain/planning/task-method.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { behaviourLines, shapeLines } from './handoff-behaviour-markdown.js';
import { buildsLines } from './handoff-builds-markdown.js';
import { formulaLines } from './handoff-formulas-markdown.js';
import { bullets, decisionLink, handoffFiles, idLink } from './handoff-links.js';
import { parallelCardLines } from './handoff-parallel-markdown.js';
import { invariantLines, probeLines, riskLines } from './handoff-quality-markdown.js';

// RF-601, RF-607, RF-609, RF-611, RF-612, RF-630, RF-634, RF-635, DEC-75: the task cards. Each is in one
// phase, names the requirements it builds, the invariant it makes true and its acceptance criteria,
// and carries its size, its risk class and, where it adds a guard or sits at a risk, its probes.
// What the chosen principles add: given TDD the tests to write first, given SDD the specification check, given a
// design principle (SOLID, KISS, ...) a review checklist that names the principle and what a
// reviewer looks for. A principle that was not chosen adds nothing. Given a chosen stack the card
// names the technologies and their decision records, and given an AI-assisted build its rating. Every
// card lists the files it expects to change, its allocated shared identifiers and the cards it
// waits for (RF-634).

/** The phase's link in the roadmap (its heading is `## Phase <n>`), then its name as text. */
function phaseLink(phase: PlanPhase | undefined, number: number, esc: MarkdownEscaper): string {
  const name = phase === undefined ? '' : ` ${esc.inline(phase.name)}`;
  return `[Phase ${String(number)}](${handoffFiles.roadmap}#phase-${String(number)})${name}`;
}

function principle(handoff: HandoffPackage, id: string): PackagePrinciple | undefined {
  return handoff.principles.find((each) => each.id === id);
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

function sizeLines(task: PlanTask, handoff: HandoffPackage): string[] {
  const { size, points } = sizeOfTask(task);
  const lines = [`Size: ${size} (${plural(points, 'point')})`, ''];
  if (!handoff.brief.buildMethod.aiAssisted) return lines;
  const { rating, tier } = difficultyOfTask(task);
  return [...lines, `Difficulty: ${String(rating)} (${tier} model tier)`, ''];
}

function technologyLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { stack } = handoff.choices;
  if (stack.length === 0) return [];
  const used = stack.map(
    (each) =>
      `${esc.inline(each.name)}: ${esc.inline(each.choice)} (${decisionLink(each.decision)})`,
  );
  return [`Technology: ${used.join('; ')}`, ''];
}

function testLines(task: PlanTask, handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  if (principle(handoff, methodPrinciples.tdd) === undefined) return [];
  return [
    'Tests to write first:',
    '',
    ...task.acceptanceCriteria.map((criterion) => `- Test: ${esc.inline(criterion)}`),
    '',
  ];
}

function specificationLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const sdd = principle(handoff, methodPrinciples.sdd);
  return sdd === undefined ? [] : [`Specification check: ${esc.inline(sdd.check)}`, ''];
}

function checklistLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const checked = handoff.principles.filter((each) => each.group === reviewGroup);
  if (checked.length === 0) return [];
  return [
    'Review checklist:',
    '',
    ...checked.map((each) => `- ${esc.inline(each.title)}: ${esc.inline(each.check)}`),
    '',
  ];
}

function cardLines(task: PlanTask, handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const requirements = task.requirements.map((id) => idLink(id, handoffFiles.requirements));
  return [
    `## ${task.id}`,
    '',
    `**${esc.inline(task.title)}**`,
    '',
    `Phase: ${phaseLink(handoff.content.phases[task.phase - 1], task.phase, esc)}`,
    '',
    ...sizeLines(task, handoff),
    ...riskLines(task),
    `Requirements: ${requirements.length === 0 ? 'none' : requirements.join(', ')}`,
    '',
    ...buildsLines(task, handoff, esc),
    ...formulaLines(task, handoff),
    ...invariantLines(task, esc),
    ...behaviourLines(task, handoff, esc),
    ...specificationLines(handoff, esc),
    ...technologyLines(handoff, esc),
    'Acceptance criteria:',
    '',
    ...bullets(task.acceptanceCriteria, esc, 'None stated.'),
    '',
    ...probeLines(task, esc),
    ...shapeLines(task),
    ...parallelCardLines(task, esc),
    ...testLines(task, handoff, esc),
    ...checklistLines(handoff, esc),
  ];
}

// RF-601, RF-607, RF-609, RF-611, RF-612
export function tasksMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  return [
    '# Task cards',
    '',
    'Work a developer can pick up, each in one phase of the roadmap with its acceptance criteria.',
    '',
    ...handoff.content.tasks.flatMap((task) => cardLines(task, handoff, esc)),
  ].join('\n');
}
