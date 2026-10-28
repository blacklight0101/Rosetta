import { describe, expect, it } from 'vitest';
import type {
  HandoffPackage,
  PackagePrinciple,
} from '../../../../src/application/plan/handoff-package.js';
import type { RiskClass } from '../../../../src/domain/planning/task-card-quality.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-640, P6-07: the hard-rule greps of orchestration.md come from the package's own rules: the
// chosen principles, the style, the risk classes of its cards, and the stack answers decide which
// language's patterns apply. A rule the package does not state has no row, and a pattern of one
// language never reaches a package built in another.

const masker = new SecretMasker();

interface Shape {
  readonly principles?: readonly string[];
  readonly language?: string;
  readonly risk?: RiskClass;
}

function principleOf(id: string): PackagePrinciple {
  return {
    id,
    title: `Title ${id}`,
    rule: 'Rule.',
    why: 'Why.',
    check: `Check ${id}.`,
    group: undefined,
  };
}

function packageOf(shape: Shape): HandoffPackage {
  const base = handoffOf('Plain text.');
  const language = shape.language;
  return {
    ...base,
    brief: { ...base.brief, buildMethod: { aiAssisted: true, agentTool: { kind: 'claude-code' } } },
    principles:
      shape.principles === undefined ? base.principles : shape.principles.map(principleOf),
    choices: {
      ...base.choices,
      stack:
        language === undefined
          ? base.choices.stack
          : [
              {
                layer: 'language-runtime',
                name: 'Language',
                choice: language,
                decision: 'ADR-001',
              },
            ],
    },
    content: {
      ...base.content,
      tasks: base.content.tasks.map((task) => ({
        ...task,
        riskClass: shape.risk ?? task.riskClass,
      })),
    },
  };
}

function grepsOf(shape: Shape): string {
  const text = renderHandoff(packageOf(shape), masker)['orchestration.md'] ?? '';
  return text.split('## Hard-rule greps')[1]?.split('\n## ')[0] ?? '';
}

const securityPrinciples = ['security-by-design', 'owasp-top-10', 'observability'];
const jsPatterns = ['`Date.now(`', '`console.`', '`child_process`', '`innerHTML`'];

describe('orchestration.md hard-rule greps', () => {
  it('RF-640 a different principle changes the table', () => {
    const kiss = grepsOf({ principles: ['kiss'], language: 'TypeScript on Node.js', risk: 'none' });
    const observed = grepsOf({
      principles: ['observability'],
      language: 'TypeScript on Node.js',
      risk: 'none',
    });

    expect(kiss).not.toContain('`console.`');
    expect(observed).toContain('`console.`');
    expect(observed).toContain('Title observability');
    expect(observed).not.toEqual(kiss);
  });

  it('RF-640 a risk class of the cards adds its rows', () => {
    const none = grepsOf({ principles: [], language: 'TypeScript on Node.js', risk: 'none' });
    const boundary = grepsOf({
      principles: [],
      language: 'TypeScript on Node.js',
      risk: 'security boundary',
    });

    expect(none).not.toContain('`child_process`');
    expect(boundary).toContain('`child_process`');
    expect(boundary).toContain('security boundary');
  });

  it.each(['C# on .NET', 'Java', 'PHP 8 with Laravel'])(
    'RF-640 a %s stack gets no JavaScript pattern',
    (language) => {
      const text = grepsOf({ principles: securityPrinciples, language, risk: 'security boundary' });

      for (const pattern of jsPatterns) expect(text).not.toContain(pattern);
      expect(text).toMatch(/^\| `/mu);
    },
  );
});

describe('orchestration.md hard-rule greps by stack', () => {
  it('RF-640 a .NET stack gets its own patterns', () => {
    const text = grepsOf({
      principles: securityPrinciples,
      language: 'C# on .NET',
      risk: 'security boundary',
    });

    expect(text).toContain('`Process.Start(`');
    expect(text).toContain('`Console.Write`');
  });

  it('RF-640 a JavaScript or TypeScript stack gets the JavaScript patterns', () => {
    const text = grepsOf({
      principles: securityPrinciples,
      language: 'TypeScript on Node.js',
      risk: 'security boundary',
    });

    expect(text).toContain('`console.`');
    expect(text).toContain('`child_process`');
    expect(text).toContain('`innerHTML`');
    expect(text).not.toContain('`Process.Start(`');
  });

  it('RF-640 with no language chosen only the patterns of any language are listed', () => {
    const text = grepsOf({ principles: securityPrinciples, risk: 'security boundary' });

    for (const pattern of jsPatterns) expect(text).not.toContain(pattern);
    expect(text).toContain('`-----BEGIN`');
    expect(text).toMatch(/no language/iu);
  });

  it('RF-640 a package that states no searchable rule says so in one line', () => {
    const text = grepsOf({ principles: [], language: 'TypeScript on Node.js', risk: 'none' });

    expect(text).not.toContain('| Pattern |');
    expect(text).toMatch(/states no rule a search can check/iu);
  });

  it('RF-640 the chosen principles are still checked by reading', () => {
    const text = grepsOf({ principles: ['kiss'], risk: 'none' });

    expect(text).toContain('Title kiss: Check kiss.');
  });
});
