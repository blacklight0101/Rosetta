import type { HandoffPackage } from '../../src/application/plan/handoff-package.js';
import type { RiskClass } from '../../src/domain/planning/task-card-quality.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from './handoff-package-fixture.js';

// RF-640, P6-28: the "Hard-rule greps" section of orchestration.md for a grid of stacks, principle
// sets and risk classes. `tests/fixtures/handoff/grep-table-before.json` holds what the section
// read before the patterns moved to the catalogue; the before/after test compares against it.

const masker = new SecretMasker();

export const stacks: Readonly<Record<string, readonly string[]>> = {
  none: [],
  typescript: ['TypeScript on Node.js'],
  dotnet: ['C# on .NET'],
  java: ['Java'],
  python: ['Python 3.12 with FastAPI'],
  php: ['PHP 8 with Laravel'],
  mixed: ['TypeScript on Node.js', 'C# on .NET'],
  unknown: ['Go 1.22'],
};

export const principleSets: Readonly<Record<string, readonly string[]>> = {
  none: [],
  kiss: ['kiss'],
  security: ['security-by-design', 'secure-sdlc'],
  owasp: ['owasp-top-10'],
  logs: ['observability', 'containers'],
  all: [
    'security-by-design',
    'owasp-top-10',
    'observability',
    'containers',
    'secure-sdlc',
    'stride',
  ],
};

export const risks: readonly RiskClass[] = ['none', 'security boundary', 'data loss', 'money'];

function packageOf(languages: readonly string[], principles: readonly string[], risk: RiskClass) {
  const base = handoffOf('Plain text.');
  const runtime = { layer: 'language-runtime', name: 'Language', decision: 'ADR-001' } as const;
  const stack =
    languages.length === 0
      ? base.choices.stack
      : languages.map((choice) => ({ ...runtime, choice }));
  const handoff: HandoffPackage = {
    ...base,
    brief: { ...base.brief, buildMethod: { aiAssisted: true, agentTool: { kind: 'claude-code' } } },
    principles: principles.map((id) => ({
      id,
      title: `Title ${id}`,
      rule: 'Rule.',
      why: 'Why.',
      check: `Check ${id}.`,
      group: undefined,
    })),
    choices: { ...base.choices, stack },
    content: {
      ...base.content,
      tasks: base.content.tasks.map((task) => ({ ...task, riskClass: risk })),
    },
  };
  return handoff;
}

/** The "Hard-rule greps" section of one package built from these answers. */
export function grepSection(
  languages: readonly string[],
  principles: readonly string[],
  risk: RiskClass,
): string {
  const text = renderHandoff(packageOf(languages, principles, risk), masker)['orchestration.md'];
  return (text ?? '').split('## Hard-rule greps')[1]?.split('\n## ')[0] ?? '';
}

/** Every case of the grid, keyed `stack/principles/risk`. */
export function grepCases(): Record<string, string> {
  const cases: Record<string, string> = {};
  for (const [stack, languages] of Object.entries(stacks)) {
    for (const [set, principles] of Object.entries(principleSets)) {
      for (const risk of risks)
        cases[`${stack}/${set}/${risk}`] = grepSection(languages, principles, risk);
    }
  }
  return cases;
}
