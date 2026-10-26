import { describe, expect, it } from 'vitest';
import { dangerousIn } from '../../../support/render-markdown.js';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { fakeOpenAiKey as secret } from '../../../support/secret-fixture.js';

// P5-42, RF-632, RF-603, RNF-003, DEC-135: `fixtures.md` as it is written. It is built from the seed
// data and test data the supported claims state, never from statistics of the repository files.

const masker = new SecretMasker();

const headings = [
  '# Realistic data shapes',
  '## Seed data stated by the cards',
  '## Test data stated by the cards',
  '## Data volumes stated by the cards',
];

function fixturesOf(extra: Partial<HandoffPackage> = {}): string {
  return renderHandoff(handoffOf('Plain text.', undefined, extra), masker)['fixtures.md'] ?? '';
}

/** The text as a reader sees it: the escaper's backslashes removed. */
function plain(text: string): string {
  return text.replaceAll('\\', '');
}

const volumeCard: SourceCard = {
  ...{ id: 'ENT-001', type: 'ENT', title: 'Order', summary: 'An order.', area: 'orders' },
  claims: [
    {
      claimId: 'ENT-001.c1',
      text: 'The Orders table holds about 2000000 rows.',
      citations: [{ path: 'db/schema.sql', startLine: 3, endLine: 9 }],
      status: 'Supported',
    },
  ],
};

function claimCard(...texts: string[]): SourceCard {
  return {
    ...{ id: 'ENT-002', type: 'ENT', title: 'Login', summary: 'Logins.', area: 'login' },
    claims: texts.map((text, at) => ({
      claimId: `ENT-002.c${String(at + 1)}`,
      text,
      citations: [{ path: 'Database Files/Insertions.sql', startLine: 16, endLine: 16 }],
      status: 'Supported' as const,
    })),
  };
}

describe('fixtures.md', () => {
  it('RF-632 is part of every package, with the sections of the requirement in order', () => {
    expect(fixturesOf().match(/^#+ .*$/gmu)).toEqual(headings);
  });

  it('P5-42 a schema script with inserts => fixtures.md lists those rows', () => {
    const text = plain(
      fixturesOf({ sources: [claimCard("INSERT INTO Dept VALUES (1, 'Surgery')")] }),
    );

    expect(text).toContain(
      "- [ENT-002](sources.md#ent-002) ENT-002.c1: INSERT INTO Dept VALUES (1, 'Surgery') Citations: Database Files/Insertions.sql:16",
    );
  });

  it('P5-42 an insert of a login is listed with its values masked', () => {
    const text = plain(
      fixturesOf({
        sources: [claimCard("INSERT INTO LoginTable VALUES ('admin@clinic.com','hunter2',3)")],
      }),
    );

    expect(text).toContain('(values masked: the claim tells of a secret)');
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('admin@clinic.com');
  });

  it('P5-42 test data is listed apart from seed data', () => {
    const text = plain(
      fixturesOf({ sources: [claimCard('The suite uses test data of 3 doctors')] }),
    );

    expect(text).toMatch(/## Test data stated by the cards\n\n- \[ENT-002\]/u);
    expect(text).toContain('The cards state no seed data.');
  });

  it('P5-42 mutation guard: file statistics are never written, whatever the scan measured', () => {
    const text = plain(fixturesOf());

    for (const word of ['Largest files', 'Size by kind', 'Deepest paths', 'Line endings']) {
      expect(text).not.toContain(word);
    }
    expect(text).not.toContain('Not measured.');
  });
});

describe('fixtures.md in the package', () => {
  it('RF-603 shows a claim of the repository as text: no HTML, no extra secret', () => {
    const hostile = `<img src=x onerror=alert(1)>|[x](javascript:alert(1)) seed ${secret}`;
    const text = fixturesOf({ sources: [claimCard(hostile)] });

    expect(dangerousIn(text)).toBeUndefined();
  });

  it('RF-632 lists the data volumes the cards state, each with its card and citation', () => {
    const text = plain(fixturesOf({ sources: [volumeCard] }));

    expect(text).toContain(
      '- [ENT-001](sources.md#ent-001) ENT-001.c1: The Orders table holds about 2000000 rows. Citations: db/schema.sql:3-9',
    );
  });

  it('RF-632 says when the cards state no data volume', () => {
    expect(fixturesOf()).toContain('The cards state no data volume.');
  });

  it('RF-632 gives the same bytes for the same cards', () => {
    expect(fixturesOf({ sources: [volumeCard] })).toBe(fixturesOf({ sources: [volumeCard] }));
  });

  it('RF-632 is linked from the README reading order', () => {
    const files = renderHandoff(handoffOf('Plain text.'), masker);

    expect(files['README.md']).toContain('[Realistic data shapes](fixtures.md)');
  });

  it('RF-632 the fixtures.md of a package with seeds matches its snapshot', () => {
    const seeds = claimCard("INSERT INTO Dept VALUES (1, 'Surgery')", 'Test data: 3 doctors');
    expect(fixturesOf({ sources: [seeds, volumeCard] })).toMatchSnapshot();
  });
});
