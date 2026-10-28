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

function rowOf(text: string, pattern: string): string {
  return text.split('\n').find((line) => line.startsWith('| ') && line.includes(pattern)) ?? '';
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

describe('orchestration.md hard-rule greps stated or suggested', () => {
  it('RF-640 a rule a principle states is marked stated by that principle', () => {
    const text = grepsOf({
      principles: ['security-by-design', 'owasp-top-10', 'observability', 'containers'],
      language: 'C# on .NET',
      risk: 'none',
    });

    expect(rowOf(text, '`-----BEGIN`')).toContain('stated by Title security-by-design');
    expect(rowOf(text, '`USER root`')).toContain('stated by Title containers');
    expect(rowOf(text, '`Console.Write`')).toContain('stated by Title observability');
    expect(rowOf(text, '`FromSqlRaw(`')).toContain('stated by Title owasp-top-10');
  });

  it('RF-640 a rule a principle only motivates is marked suggested by that principle', () => {
    const text = grepsOf({
      principles: ['security-by-design', 'owasp-top-10', 'secure-sdlc'],
      language: 'TypeScript on Node.js',
      risk: 'none',
    });

    for (const pattern of ['`innerHTML`', '`eval(`', '`child_process`', '`rejectUnauthorized`']) {
      const row = rowOf(text, pattern);
      expect(row).toContain('suggested by Title security-by-design');
      expect(row).not.toContain('stated by');
    }
    expect(rowOf(text, '`innerHTML`')).toContain('suggested by Title owasp-top-10');
    expect(rowOf(text, '`rejectUnauthorized`')).toContain('suggested by Title secure-sdlc');
  });

  it.each([
    ['data loss', '`DROP TABLE`'],
    ['money', '`parseFloat(`'],
  ] as const)('RF-640 a row of the risk class %s is suggested by it', (risk, pattern) => {
    const text = grepsOf({ principles: [], language: 'TypeScript on Node.js', risk });
    const row = rowOf(text, pattern);

    expect(row).toContain(`suggested by the risk class ${risk}`);
    expect(row).not.toContain('stated by');
  });

  it('RF-640 the intro says the team may drop a suggested row', () => {
    const text = grepsOf({ principles: [], language: 'TypeScript on Node.js', risk: 'money' });

    expect(text).toMatch(/"suggested by" is a suggestion[^\n]*the team may drop it/u);
    expect(text).toContain('| Pattern | Rule | Source |');
  });
});

describe('orchestration.md hard-rule greps for a language the table does not know', () => {
  it('RF-640 a stack language the table does not know is named, not called unchosen', () => {
    const text = grepsOf({ principles: securityPrinciples, language: 'Go 1.22', risk: 'none' });

    expect(text).not.toMatch(/no language is chosen/iu);
    expect(text).toContain('No search pattern is listed for Go 1.22');
    expect(text).toContain('`-----BEGIN`');
  });

  it('RF-640 a known and an unknown language list the patterns of the known one', () => {
    const base = packageOf({ principles: securityPrinciples, language: 'Rust', risk: 'none' });
    const runtime = { layer: 'language-runtime', name: 'Language', decision: 'ADR-001' } as const;
    const both: HandoffPackage = {
      ...base,
      choices: {
        ...base.choices,
        stack: [
          { ...runtime, choice: 'Rust' },
          { ...runtime, choice: 'TypeScript on Node.js' },
        ],
      },
    };
    const text = renderHandoff(both, masker)['orchestration.md'] ?? '';

    expect(text).toContain('`console.`');
    expect(text).toContain('No search pattern is listed for Rust');
    expect(text).not.toMatch(/no language is chosen/iu);
  });
});
