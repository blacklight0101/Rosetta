import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { migrationStrategyInfo } from '../../domain/planning/migration-strategy.js';
import type { PlanPhase } from '../../domain/planning/plan-content.js';
import { sizeOfPhase } from '../../domain/planning/task-method.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { groupLines } from './handoff-parallel-markdown.js';
import { bullets, decisionLink, handoffFiles, idLink } from './handoff-links.js';
import { waitingLines, waitingNote, waitingOf } from './handoff-waiting-markdown.js';

// RF-601, RF-610, RF-611, RF-634, DEC-76, DEC-79: the roadmap. It states the migration strategy and
// the order its phases follow (linking the decision record), the project context the owner gave
// (what was not stated says so; the open questions hold its default), and each phase with its goal,
// its size, its exit criteria, its task cards and the groups of those cards that can run together.
// The size of a phase is the sum of the points of its cards; given a team size, the points a person
// carries.

const notStated = 'not stated';

function strategyLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const info = migrationStrategyInfo[handoff.brief.migration];
  return [
    '## Migration strategy',
    '',
    `**${esc.inline(info.title)}** (${decisionLink(handoff.choices.migration)})`,
    '',
    esc.inline(info.ordering),
    '',
  ];
}

function contextLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { context } = handoff.brief;
  const text = (value: string | null): string => (value === null ? notStated : esc.inline(value));
  const integrations = context.keepIntegrations.map((each) => esc.inline(each)).join(', ');
  const team = context.teamSize === null ? notStated : String(context.teamSize);
  const lines = [
    `Team size: ${team}`,
    `Experience: ${text(context.experience)}`,
    `Deadline: ${text(context.deadline)}`,
    `Integrations that stay: ${integrations === '' ? notStated : integrations}`,
    `Data migration: ${text(context.dataMigration)}`,
  ];
  const missing = handoff.briefQuestions.some((question) => question.id.startsWith('context.'));
  const pointer = `What is not stated is listed with its default in [open questions](${handoffFiles.openQuestions}).`;
  return [
    '## Project context',
    '',
    ...lines.map((line) => `- ${line}`),
    '',
    ...(missing ? [pointer, ''] : []),
  ];
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

function phaseLines(phase: PlanPhase, handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { tasks } = handoff.content;
  const own = tasks.filter((task) => task.phase === phase.number);
  const size = sizeOfPhase(phase, tasks, handoff.brief.context.teamSize);
  const share =
    size.perPerson === undefined ? '' : `; about ${plural(size.perPerson, 'point')} per person`;
  return [
    `## Phase ${String(phase.number)}`,
    '',
    `**${esc.inline(phase.name)}**: ${esc.inline(phase.goal)}`,
    '',
    `Size: ${plural(size.points, 'point')} in ${plural(size.cards, 'task card')}${share}`,
    '',
    'Exit criteria:',
    '',
    ...bullets(phase.exitCriteria, esc, 'None stated.'),
    '',
    `Task cards: ${own.length === 0 ? 'none' : own.map((task) => idLink(task.id, handoffFiles.tasks)).join(', ')}`,
    '',
    ...groupLines(tasks, phase.number),
    ...waitingLines(waitingOf(handoff), own, esc),
  ];
}

// RF-601, RF-610, RF-611
export function roadmapMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  return [
    '# Roadmap',
    '',
    'The phases of the move, in order, each with its size and its exit criteria. Cards in one group can be built at the same time; a card waits for the cards of the groups before it in its phase, and for the cards it depends on in the task cards.',
    '',
    ...strategyLines(handoff, esc),
    ...contextLines(handoff, esc),
    ...(waitingOf(handoff).byCard.size === 0 ? [] : [waitingNote, '']),
    ...handoff.content.phases.flatMap((phase) => phaseLines(phase, handoff, esc)),
  ].join('\n');
}
