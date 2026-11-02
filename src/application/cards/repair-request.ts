import type { OutputProblem } from './output-problem.js';

// RF-202, RNF-004: the words of the repair request live in a versioned prompt file
// (`prompts/cards/repair.v6.md`); this fills in its one placeholder.

const placeholder = '{{problems}}';

function line(problem: OutputProblem): string {
  const where = problem.path === '' ? '(answer)' : problem.path;
  return `- ${where}: ${problem.message.replace(/\s+/g, ' ')}`;
}

export function renderRepairRequest(template: string, problems: readonly OutputProblem[]): string {
  return template.replace(placeholder, () => problems.map(line).join('\n'));
}
