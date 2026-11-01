import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-640, P5-39, P7-21: a language named only by a stack layer Rosetta proposed (the owner left it
// open) adds no pattern to the grep table, and the table says which proposed layer was left out.

const masker = new SecretMasker();

function greps(stack: HandoffPackage['choices']['stack']): string {
  const base = handoffOf('Plain text.');
  const pkg: HandoffPackage = {
    ...base,
    brief: { ...base.brief, buildMethod: { aiAssisted: true, agentTool: { kind: 'claude-code' } } },
    principles: [],
    choices: { ...base.choices, stack },
    content: {
      ...base.content,
      tasks: base.content.tasks.map((task) => ({ ...task, riskClass: 'security boundary' })),
    },
  };
  const text = renderHandoff(pkg, masker)['orchestration.md'] ?? '';
  return text.split('## Hard-rule greps')[1]?.split('\n## ')[0] ?? '';
}

const csharp = {
  layer: 'language-runtime',
  name: 'language and runtime',
  choice: 'C# on .NET',
  decision: 'ADR-001',
} as const;
const react = {
  layer: 'front-end',
  name: 'front end',
  choice: 'React with TypeScript',
  decision: 'ADR-002',
} as const;

describe('RF-640 grep rows of a proposed layer', () => {
  it('P7-21 a proposed front end on a C# stack adds no JavaScript row and is named as left out', () => {
    const text = greps([csharp, { ...react, proposed: true }]);

    expect(text).toContain('`Process.Start(`');
    expect(text).not.toContain('`innerHTML`');
    expect(text).not.toContain('`child_process`');
    expect(text).toMatch(/left out.*front end.*React with TypeScript/isu);
  });

  it('P7-21 a front end the owner chose keeps its JavaScript rows and no note', () => {
    const text = greps([csharp, react]);

    expect(text).toContain('`innerHTML`');
    expect(text).not.toMatch(/left out/iu);
  });

  it('P7-21 a language the owner also named through another layer is not left out', () => {
    const text = greps([
      { ...csharp, choice: 'TypeScript on Node.js' },
      { ...react, proposed: true },
    ]);

    expect(text).toContain('`innerHTML`');
    expect(text).not.toMatch(/left out/iu);
  });
});
