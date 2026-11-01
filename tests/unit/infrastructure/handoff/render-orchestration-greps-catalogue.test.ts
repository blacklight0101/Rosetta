import { beforeAll, describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { GrepRules } from '../../../../src/domain/planning/grep-rules.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { loadCatalogue } from '../../../../src/infrastructure/prompts/catalogue-files.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// P6-28, RF-640, DEC-190: the patterns and the language aliases of the hard-rule greps come from
// the catalogue file carried by the package, so a stack named by an alias gets its patterns, a rule
// a principle states with no pattern for the stack is "checked by reading", and nothing a pattern
// or an alias says is a literal in code. Text of the catalogue is escaped (ADR-013).

const masker = new SecretMasker();
let shipped: GrepRules;

beforeAll(async () => {
  shipped = (await loadCatalogue('prompts')).grepRules;
});

function packageOf(
  languages: readonly string[],
  principles: readonly string[],
  extra: Partial<HandoffPackage> = {},
): HandoffPackage {
  const base = handoffOf('Plain text.');
  const runtime = { layer: 'language-runtime', name: 'Language', decision: 'ADR-001' } as const;
  return {
    ...base,
    brief: { ...base.brief, buildMethod: { aiAssisted: true, agentTool: { kind: 'claude-code' } } },
    principles: principles.map((id) => ({
      ...{ id, title: `Title ${id}`, rule: 'Rule.', why: 'Why.' },
      ...{ check: `Check ${id}.`, group: undefined },
    })),
    choices: {
      ...base.choices,
      stack: languages.map((choice) => ({ ...runtime, choice })),
    },
    grepRules: shipped,
    ...extra,
  };
}

function orchestration(handoff: HandoffPackage): string {
  return renderHandoff(handoff, masker)['orchestration.md'] ?? '';
}

function greps(handoff: HandoffPackage): string {
  return orchestration(handoff).split('## Hard-rule greps')[1]?.split('\n## ')[0] ?? '';
}

const security = ['security-by-design', 'observability'];

describe('the grep table reads the aliases of the catalogue', () => {
  it.each(['dotnet 8', 'DotNet 9', 'ASP.NET Core 8', '.NET 8'])(
    'DEC-190 the stack answer "%s" gets the .NET patterns',
    (answer) => {
      const text = greps(packageOf([answer], security));

      expect(text).toContain('`Process.Start(`');
      expect(text).toContain('`Console.Write`');
      expect(text).not.toContain('No search pattern is listed');
    },
  );

  it.each(['JVM 21', 'jvm', 'Kotlin on the JVM'])(
    'DEC-190 the stack answer "%s" gets the Java patterns',
    (answer) => {
      const text = greps(packageOf([answer], security));

      expect(text).toContain('`ProcessBuilder`');
      expect(text).toContain('`System.out.print`');
      expect(text).not.toContain('`console.`');
      expect(text).not.toContain('No search pattern is listed');
    },
  );

  it('DEC-190 a dotnet alias also switches on the .NET lesson', () => {
    const text = orchestration(packageOf(['dotnet 8'], security));

    expect(text).toContain('A build locked by a running preview');
  });

  it('RF-640 the aliases and patterns are the package catalogue, not code', () => {
    const rules: GrepRules = {
      version: 7,
      languages: [{ id: 'golang', aliases: ['gopher'] }],
      rules: [
        {
          ...{ rule: 'No <b>raw</b> shell', stated: ['observability'], suggested: [], risks: [] },
          patterns: { golang: ['exec.Command('] },
        },
      ],
    };
    const text = greps(packageOf(['gopher 1.22'], security, { grepRules: rules }));

    expect(text).toContain(
      '| `exec.Command(` | No \\<b>raw\\</b> shell | stated by Title observability |',
    );
    expect(text).not.toContain('`console.`');
    expect(text).not.toContain('No search pattern is listed');
  });
});

describe('a stated rule with no pattern for the stack is checked by reading', () => {
  const reading = (rule: string, source: string): string =>
    `| checked by reading | ${rule} | ${source}`;
  const queries = 'Queries take parameters, never input joined into the text';

  it('DEC-190 a JavaScript stack lists the stated query rule as checked by reading', () => {
    const text = greps(packageOf(['TypeScript on Node.js'], ['owasp-top-10']));

    expect(text).toContain(reading(queries, 'stated by Title owasp-top-10'));
    expect(text).toMatch(/^A row whose pattern cell reads "checked by reading"/mu);
  });

  it('DEC-190 a stack that has patterns for the rule keeps its pattern row', () => {
    const text = greps(packageOf(['C# on .NET'], ['owasp-top-10']));

    expect(text).toContain('`FromSqlRaw(`');
    expect(text).not.toContain('| checked by reading |');
  });

  it('DEC-190 a rule that is only suggested and has no pattern is not listed', () => {
    const base = packageOf(['TypeScript on Node.js'], []);
    const handoff = {
      ...base,
      content: {
        ...base.content,
        tasks: base.content.tasks.map((task) => ({ ...task, riskClass: 'data loss' as const })),
      },
    };
    const text = greps(handoff);

    expect(text).toContain('`DROP TABLE`');
    expect(text).not.toContain('Queries take parameters');
    expect(text).not.toContain('| checked by reading |');
  });

  it('DEC-190 with no language chosen the stated rule is still listed as checked by reading', () => {
    const text = greps(packageOf([], ['owasp-top-10']));

    expect(text).toContain(reading(queries, 'stated by Title owasp-top-10'));
  });

  it('DEC-190 no sentence about reading appears when no row is checked by reading', () => {
    const text = greps(packageOf(['TypeScript on Node.js'], security));

    expect(text).not.toContain('A row whose pattern cell reads');
    expect(text).not.toContain('| checked by reading |');
  });
});
