import type { HandoffPackage, PackagePrinciple } from '../../application/plan/handoff-package.js';
import {
  modelForTier,
  resolveBuildMethod,
  type BuildMethod,
} from '../../domain/planning/build-method.js';
import type { PlanPhase, PlanTask } from '../../domain/planning/plan-content.js';
import {
  difficultyOfTask,
  methodPrinciples,
  reviewGroup,
  sizeOfTask,
  type TaskDifficulty,
} from '../../domain/planning/task-method.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { behaviourLines, shapeLines } from './handoff-behaviour-markdown.js';
import { buildsLines } from './handoff-builds-markdown.js';
import { formulaLines } from './handoff-formulas-markdown.js';
import { bullets, decisionLink, handoffFiles, idLink } from './handoff-links.js';
import { parallelCardLines } from './handoff-parallel-markdown.js';
import {
  guardTestRule,
  invariantLines,
  probeLines,
  riskLines,
} from './handoff-quality-markdown.js';

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

/** RF-639: the tier with the model the brief names for it; the tier alone when it names none. */
function tierText(method: BuildMethod, tier: TaskDifficulty['tier'], esc: MarkdownEscaper): string {
  const model = modelForTier(method, tier);
  return model === undefined ? `${tier} model tier` : `${tier} tier, model: ${esc.inline(model)}`;
}

function sizeLines(task: PlanTask, handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { size, points } = sizeOfTask(task);
  const lines = [`Size: ${size} (${plural(points, 'point')})`, ''];
  const method = resolveBuildMethod(handoff.brief.buildMethod, handoff.agentModels);
  if (!method.aiAssisted) return lines;
  const { rating, tier } = difficultyOfTask(task, method);
  return [...lines, `Difficulty: ${String(rating)} (${tierText(method, tier, esc)})`, ''];
}

/** RF-639: the verifier tier of the card's band, written after its risk class. */
function verifierLines(task: PlanTask, handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const method = resolveBuildMethod(handoff.brief.buildMethod, handoff.agentModels);
  if (!method.aiAssisted) return [];
  return [`Verifier: ${tierText(method, difficultyOfTask(task).verifier, esc)}`, ''];
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
    ...sizeLines(task, handoff, esc),
    ...riskLines(task),
    ...verifierLines(task, handoff, esc),
    `Requirements: ${requirements.length === 0 ? 'none' : requirements.join(', ')}`,
    '',
    ...buildsLines(task, handoff, esc),
    ...formulaLines(task, handoff),
    ...invariantLines(task, esc),
    ...behaviourLines(task, handoff, esc),
    'Acceptance criteria:',
    '',
    ...bullets(task.acceptanceCriteria, esc, 'None stated.'),
    '',
    ...probeLines(task, esc),
    ...shapeLines(task, handoff.workbookFormulas !== undefined),
    ...parallelCardLines(task, esc),
    ...testLines(task, handoff, esc),
  ];
}

/** P5-08: the guard test rule, stated once for every card that adds a guard. */
function guardTestLines(handoff: HandoffPackage): string[] {
  if (!handoff.content.tasks.some((task) => task.adds.length > 0)) return [];
  return [guardTestRule, ''];
}

/** P5-08: what every card shares (checklist, specification check, technology, guard test), written once. */
function sharedLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const lines = [
    ...specificationLines(handoff, esc),
    ...technologyLines(handoff, esc),
    ...checklistLines(handoff, esc),
    ...guardTestLines(handoff),
  ];
  return lines.length === 0 ? [] : ['**Applies to every card**', '', ...lines];
}

// RF-601, RF-607, RF-609, RF-611, RF-612
export function tasksMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  return [
    '# Task cards',
    '',
    'Work a developer can pick up, each in one phase of the roadmap with its acceptance criteria.',
    '',
    ...sharedLines(handoff, esc),
    ...handoff.content.tasks.flatMap((task) => cardLines(task, handoff, esc)),
  ].join('\n');
}
