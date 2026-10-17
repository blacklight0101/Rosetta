import { describe, expect, it } from 'vitest';
import { parseGoldenSet } from '../../../../src/application/eval/golden-set-schema.js';

// RNF-006, RNF-015, DEC-57: the golden set file is hand-written data, so it is `unknown` until the
// schema has read it. Anything malformed is refused with every problem named, never half-read.

const commit = 'a'.repeat(40);

function validSet(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    version: '2026-10-17.1',
    description: 'A small golden set.',
    source: { url: 'https://github.com/octo/demo', commit, subpath: 'app' },
    cases: [
      {
        id: 'catalog-item',
        title: 'The catalog item',
        paths: ['app/Models/Item.cs'],
        findings: [
          {
            id: 'rule-price',
            kind: 'rule',
            statement: 'The price has at most two decimals.',
            cardTypes: ['BR', 'ENT'],
            evidence: ['app/Models/Item.cs:20-24'],
            keywords: ['price'],
          },
        ],
        absences: [
          {
            id: 'absent-auto-reorder',
            statement: 'Nothing reorders an item by itself.',
            claimPatterns: [['reorder', 'automatic']],
            unless: ['no code'],
          },
        ],
      },
    ],
  };
}

/** The valid set with its one case changed. */
function withCase(change: (entry: Record<string, unknown>) => void): Record<string, unknown> {
  const entry = firstCase();
  change(entry);
  return { ...validSet(), cases: [entry] };
}

function problemsOf(data: unknown): readonly string[] {
  const parsed = parseGoldenSet(data);
  return parsed.ok ? [] : parsed.error;
}

describe('the golden set file', () => {
  it('RNF-006 reads a valid set with its citations parsed', () => {
    const parsed = parseGoldenSet(validSet());

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.source).toEqual({
      url: 'https://github.com/octo/demo',
      owner: 'octo',
      repo: 'demo',
      commit,
      subpath: 'app',
    });
    expect(parsed.value.cases[0]?.findings[0]?.evidence).toEqual([
      { path: 'app/Models/Item.cs', startLine: 20, endLine: 24 },
    ]);
  });

  it.each([
    ['not an object', 'the golden set'],
    [null, 'the golden set'],
    [[], 'the golden set'],
  ])('RNF-006 refuses %j', (data, expected) => {
    expect(problemsOf(data).join(' ')).toContain(expected);
  });

  it('RNF-006 refuses a newer schema version, a missing field, a wrong type and an unknown key', () => {
    expect(problemsOf({ ...validSet(), schemaVersion: 2 }).length).toBeGreaterThan(0);
    const withoutVersion = validSet();
    Reflect.deleteProperty(withoutVersion, 'version');
    expect(problemsOf(withoutVersion).join(' ')).toContain('version');
    expect(problemsOf({ ...validSet(), cases: 'all' }).join(' ')).toContain('cases');
    expect(problemsOf({ ...validSet(), extra: true }).join(' ')).toContain('extra');
  });

  it('RNF-006 refuses a source that is not a pinned public GitHub commit', () => {
    const source = (value: Record<string, unknown>) => problemsOf({ ...validSet(), source: value });

    expect(source({ url: 'https://example.com/octo/demo', commit, subpath: '' })).not.toEqual([]);
    expect(
      source({ url: 'https://github.com/octo/demo', commit: 'main', subpath: '' }),
    ).not.toEqual([]);
    expect(source({ url: 'https://github.com/octo/demo', commit, subpath: '../up' })).not.toEqual(
      [],
    );
  });
});

describe('the golden set file: paths and citations', () => {
  it.each([
    ['a parent folder', '../secrets.txt'],
    ['an absolute path', '/etc/passwd'],
    ['a Windows path', 'C:\\Windows\\win.ini'],
    ['a dot segment', 'app/./Models/Item.cs'],
  ])('RNF-006 refuses %s in the paths of a case', (_name, path) => {
    const set = withCase((entry) => {
      entry['paths'] = [path];
    });

    expect(problemsOf(set).join(' ')).toContain('paths');
  });

  it('RNF-006 refuses evidence outside the paths of its case, and a citation that does not parse', () => {
    const outside = withCase((entry) => {
      entry['findings'] = [{ ...firstFinding(), evidence: ['app/Other.cs:1-2'] }];
    });
    const broken = withCase((entry) => {
      entry['findings'] = [{ ...firstFinding(), evidence: ['app/Models/Item.cs:9-3'] }];
    });

    expect(problemsOf(outside).join(' ')).toContain('app/Other.cs:1-2');
    expect(problemsOf(broken).join(' ')).toContain('app/Models/Item.cs:9-3');
  });

  it('RNF-006 refuses an unknown card type, an unknown kind and an empty keyword', () => {
    const typed = withCase((entry) => {
      entry['findings'] = [{ ...firstFinding(), cardTypes: ['STORY'] }];
    });
    const kind = withCase((entry) => {
      entry['findings'] = [{ ...firstFinding(), kind: 'wish' }];
    });
    const blank = withCase((entry) => {
      entry['findings'] = [{ ...firstFinding(), keywords: ['  '] }];
    });

    expect(problemsOf(typed)).not.toEqual([]);
    expect(problemsOf(kind)).not.toEqual([]);
    expect(problemsOf(blank)).not.toEqual([]);
  });
});

describe('the golden set file: ids and limits', () => {
  it('RNF-006 refuses an id used twice in the set', () => {
    const twice = withCase((entry) => {
      entry['findings'] = [firstFinding(), firstFinding()];
    });

    expect(problemsOf(twice).join(' ')).toContain('rule-price');
  });

  it('RNF-015 DEC-57 refuses a set without a "not in the code" case', () => {
    const none = withCase((entry) => {
      entry['absences'] = [];
    });

    expect(problemsOf(none).join(' ')).toContain('not in the code');
  });

  it('RNF-006 refuses more cases than the limit and a statement longer than the limit', () => {
    const cases = Array.from({ length: 101 }, (_, n) => ({
      ...firstCase(),
      id: `case-${String(n)}`,
      findings: [],
    }));

    expect(problemsOf({ ...validSet(), cases }).join(' ')).toContain('cases');
    const long = withCase((entry) => {
      entry['findings'] = [{ ...firstFinding(), statement: 'x'.repeat(2001) }];
    });
    expect(problemsOf(long)).not.toEqual([]);
  });
});

function firstCase(): Record<string, unknown> {
  const cases = validSet()['cases'];
  if (!Array.isArray(cases)) throw new Error('no cases');
  const first: unknown = cases[0];
  if (typeof first !== 'object' || first === null) throw new Error('no case');
  return Object.fromEntries(Object.entries(first));
}

function firstFinding(): Record<string, unknown> {
  const findings = firstCase()['findings'];
  if (!Array.isArray(findings)) throw new Error('no findings');
  const first: unknown = findings[0];
  if (typeof first !== 'object' || first === null) throw new Error('no finding');
  return Object.fromEntries(Object.entries(first));
}
