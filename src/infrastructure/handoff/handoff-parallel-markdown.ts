import type { PlanTask } from '../../domain/planning/plan-content.js';
import { parallelGroups } from '../../domain/planning/parallel-cards.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { bullets, handoffFiles, idLink } from './handoff-links.js';

// RF-634, RF-636, DEC-135: what lets several builders work at once. A card lists the files and
// folders it expects to change, the shared identifiers the plan allocated to it and the cards it
// waits for; the roadmap lists, per phase, the groups of cards that can run together; and the
// agent instructions have an operations section. Every id and value is made by code; the file
// names and the purposes come from the planner and go through the escaper.

function cardLinks(ids: readonly string[]): string {
  return ids.length === 0 ? 'none' : ids.map((id) => idLink(id, handoffFiles.tasks)).join(', ');
}

function identifierLines(task: PlanTask, esc: MarkdownEscaper): string[] {
  if (task.identifiers.length === 0) return ['Shared identifiers: none', ''];
  return [
    'Shared identifiers (allocated by the plan; use only these):',
    '',
    ...task.identifiers.map(
      (each) => `- ${each.kind} ${esc.inline(each.value)}: ${esc.inline(each.purpose)}`,
    ),
    '',
  ];
}

/** The files, the identifiers and the order of a card (RF-634). */
// RF-634
export function parallelCardLines(task: PlanTask, esc: MarkdownEscaper): string[] {
  return [
    'Expected files:',
    '',
    ...bullets(task.files, esc, 'None stated.'),
    '',
    ...identifierLines(task, esc),
    `Depends on: ${cardLinks(task.dependsOn)}`,
    '',
  ];
}

/** The groups of cards of a phase that can run together, in order (RF-634). */
// RF-634
export function groupLines(tasks: readonly PlanTask[], phase: number): string[] {
  const groups = parallelGroups(tasks, phase);
  if (groups.length === 0) return [];
  return [
    'Parallel groups:',
    '',
    ...groups.map((ids, at) => `- Group ${String(at + 1)}: ${cardLinks(ids)}`),
    '',
  ];
}

/** The operations section of the agent instructions (RF-636). */
// RF-636
export function operationsLines(): string[] {
  return [
    '## Operations',
    '',
    'Rules for a session in which several agents build at the same time.',
    '',
    '- Merge one pull request at a time, from a branch that is up to date with main. Fixes for failing continuous integration go first in the queue.',
    '- A check that is shown as running long after its workflow finished is re-run, not waited on.',
    '- Never skip git hooks. After a rejected push, fetch and push again.',
    '- Never edit a script while it is running.',
    "- Reserve a port range for each agent, and check the machine's excluded port ranges before you choose a port.",
    '- Keep a register of known flaky tests, each with an owner card.',
    '- A pull request that changes the specification, the decisions or the agent files is labelled `needs-owner` and a person merges it. A builder never edits the task list on a task branch: the orchestrator records status in one batched pull request. Both are the default; a team without a status pull request replaces them by a decision it records.',
    `- Take shared identifiers (error codes, migration numbers, configuration keys, ports) only from the card; never choose one yourself. Cards that list the same file are never built at the same time: the roadmap lists the groups of cards that can run together (see [the roadmap](${handoffFiles.roadmap})).`,
    '',
  ];
}
