import { describe, expect, it } from 'vitest';
import { parsePlanOptionsAnswer } from '../../../../src/application/planning/plan-options-answer.js';
import { buildPlanOptions, splitOption } from '../../../../src/domain/planning/plan-options.js';
import { stackOptions } from '../../../../src/domain/planning/stack-adr.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';
import { validDraft, verifiedIds, withStack } from '../../../support/plan-options-fixtures.js';

// RF-609, EV-53, EV-65: an option is a name and a description. A pick saves the name as offered, so
// the stack record marks it as chosen; an older answer with both in one line is split the same way.

describe('splitOption', () => {
  it('RF-609 gives the name with the description apart', () => {
    expect(
      splitOption('SQL Server 2019 - Keeping compatible RDBMS for minimal data migration risk'),
    ).toEqual({
      name: 'SQL Server 2019',
      description: 'Keeping compatible RDBMS for minimal data migration risk',
    });
    expect(splitOption('xUnit/NUnit \u2013 Standardized unit testing framework')).toEqual({
      name: 'xUnit/NUnit',
      description: 'Standardized unit testing framework',
    });
  });

  it('RF-609 keeps a plain name, and a hyphen inside a word, as the name', () => {
    expect(splitOption('PostgreSQL 17')).toEqual({ name: 'PostgreSQL 17', description: '' });
    expect(splitOption('ASP.NET Core Razor-Pages')).toEqual({
      name: 'ASP.NET Core Razor-Pages',
      description: '',
    });
  });
});

describe('the options of a layer with descriptions', () => {
  const stack = [
    {
      layer: 'database',
      options: [
        { name: 'PostgreSQL 17', description: 'Open source and close to the legacy SQL.' },
        'SQL Server 2019 - Keeping compatible RDBMS for minimal data migration risk',
      ],
    },
  ];

  it('RF-609 keeps the names as the options and the descriptions beside them', () => {
    const draft = validDraft();
    const built = buildPlanOptions(
      withStack(draft, [...stack, ...draft.stack.filter((each) => each.layer !== 'database')]),
      verifiedIds,
    );

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const database = built.value.stack.find((each) => each.layer === 'database');
    expect(database?.options).toEqual(['PostgreSQL 17', 'SQL Server 2019']);
    expect(database?.descriptions).toEqual([
      'Open source and close to the legacy SQL.',
      'Keeping compatible RDBMS for minimal data migration risk',
    ]);
  });

  it('RF-609 reads an answer whose options are objects', () => {
    const draft = { ...validDraft(), stack };

    const parsed = parsePlanOptionsAnswer(JSON.stringify(draft));

    expect(parsed?.stack[0]?.options[0]).toEqual({
      name: 'PostgreSQL 17',
      description: 'Open source and close to the legacy SQL.',
    });
  });
});

describe('the stack record of a pick', () => {
  it('RF-609 marks a picked name as chosen when the offer is a long line', () => {
    const lines = stackOptions(shippedCatalogue.stack.technologies, {
      layer: 'database',
      choice: 'SQL Server 2019',
      offered: ['SQL Server 2019 - Keeping compatible RDBMS', 'PostgreSQL 17'],
    });

    expect(lines[0]).toContain('SQL Server 2019 (chosen)');
    expect(lines.join('\n')).not.toContain('typed by the owner');
  });
});

describe('names that hold a dash (P7-10)', () => {
  it('RF-609 never splits the name of an option that came with its own description', () => {
    const draft = validDraft();
    const stack = [
      {
        layer: 'front-end',
        options: [
          { name: 'Blazor - Server', description: 'Renders on the server.' },
          { name: 'Blazor - WebAssembly', description: 'Runs in the browser.' },
        ],
      },
      ...draft.stack.filter((each) => each.layer !== 'front-end'),
    ];

    const built = buildPlanOptions(withStack(draft, stack), verifiedIds);

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const frontEnd = built.value.stack.find((each) => each.layer === 'front-end');
    expect(frontEnd?.options).toEqual(['Blazor - Server', 'Blazor - WebAssembly']);
    expect(frontEnd?.descriptions).toEqual(['Renders on the server.', 'Runs in the browser.']);
  });

  it('RF-609 reads an option object with no description', () => {
    const draft = {
      ...validDraft(),
      stack: [{ layer: 'database', options: [{ name: 'PostgreSQL 17' }] }],
    };

    expect(parsePlanOptionsAnswer(JSON.stringify(draft))?.stack[0]?.options[0]).toEqual({
      name: 'PostgreSQL 17',
    });
  });

  it('RF-609 does not mark a typed "Blazor - WebAssembly with offline" as the offered "Blazor - Server"', () => {
    const lines = stackOptions(shippedCatalogue.stack.technologies, {
      layer: 'front-end',
      choice: 'Blazor - WebAssembly with offline',
      offered: ['Blazor - Server', 'Razor Pages'],
    });

    expect(lines[0]).toContain('typed by the owner');
    expect(lines.join('\n')).not.toContain('(chosen): Offered');
    expect(lines.filter((line) => line.includes('(chosen)'))).toHaveLength(1);
  });
});
