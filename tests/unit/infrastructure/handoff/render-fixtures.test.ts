import { describe, expect, it } from 'vitest';
import { dangerousIn } from '../../../support/render-markdown.js';
import { measureScan } from '../../../../src/application/plan/measure-scan.js';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import type { ScanShapes } from '../../../../src/domain/planning/scan-shapes.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { fakeOpenAiKey as secret } from '../../../support/secret-fixture.js';
import { demoScan, scanOf } from '../../../support/scan-shape-fixtures.js';

// RF-632, RF-603, RNF-003, DEC-135: `fixtures.md` as it is written. Its numbers are measured by code
// from the scan, never by a model; the names in it come from the repository, so they show as text.

const masker = new SecretMasker();

const headings = [
  '# Realistic data shapes',
  '## Largest files',
  '## Size by kind',
  '## Deepest paths',
  '## Unusual file names',
  '## Encodings',
  '## Line endings',
  '## Data volumes stated by the cards',
];

async function demoShapes(): Promise<ScanShapes> {
  const scan = demoScan();
  return measureScan(scan.codeMap, scan.reader);
}

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

describe('fixtures.md', () => {
  it('RF-632 is part of every package, with the sections of the requirement in order', async () => {
    const text = fixturesOf({ shapes: await demoShapes() });

    expect(text.match(/^#+ .*$/gmu)).toEqual(headings);
  });

  it('RF-632 names the volume of the generated maps and the bundled scripts of the demo', async () => {
    const text = plain(fixturesOf({ shapes: await demoShapes() }));

    expect(text).toMatch(/\| generated map \| 3 \| 234\.9 KiB \|/u);
    expect(text).toMatch(/\| bundled third-party script \| 2 \| \d+\.\d KiB \|/u);
  });

  it('RF-632 names the reserved device names it found', async () => {
    const text = plain(fixturesOf({ shapes: await demoShapes() }));

    expect(text).toContain('Orders/aux.c: reserved device name');
    expect(text).toContain('Orders/Con.txt: reserved device name');
  });

  it('RF-632 lists the largest file first, the deepest path, the encodings and the line endings', async () => {
    const text = plain(fixturesOf({ shapes: await demoShapes() }));

    expect(text).toMatch(
      /## Largest files\n\n\|[^\n]*\n\|[^\n]*\n\| Archive\/old-export\.csv \| other \| 11\.8 MiB \|/u,
    );
    expect(text).toContain('| Orders/Legacy/Archive/2009/Q4/Regional/North/Totals.cs | 8 |');
    expect(text).toContain('| UTF-8 with BOM | 1 |');
    expect(text).toContain('| legacy 8-bit | 1 |');
    expect(text).toContain('| CRLF | ');
  });
});

describe('fixtures.md when a scan is missing or hostile', () => {
  it('RF-632 says how many files could not be read', async () => {
    const scan = scanOf({ 'a.cs': 'x\n', 'b.cs': 'y\n' }, { unreadable: ['b.cs'] });
    const shapes = await measureScan(scan.codeMap, scan.reader);

    expect(fixturesOf({ shapes })).toContain('1 file could not be read and is not counted.');
  });

  it('RF-632 says so, and keeps every section, when the scan could not be read', () => {
    const text = fixturesOf({ shapes: undefined });

    expect(text.match(/^#+ .*$/gmu)).toEqual(headings);
    expect(text).toContain('The scan of the analysed commit could not be read');
    expect(text).toContain('Not measured.');
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
});

describe('fixtures.md in the package', () => {
  it('RF-603 shows a repository name as text: no HTML, no extra cell, no secret', async () => {
    const hostile = 'src/<img src=x onerror=alert(1)>|[x](javascript:alert(1)).cs';
    const scan = scanOf({ [hostile]: 'x\n', [`keys/${secret}.cs`]: 'y\n' });
    const shapes = await measureScan(scan.codeMap, scan.reader);

    const text = fixturesOf({ shapes });

    expect(dangerousIn(text)).toBeUndefined();
    expect(text).not.toContain(secret);
    const row = text.split('\n').find((line) => line.includes('onerror')) ?? '';
    expect(row.replaceAll('\\|', '').split('|')).toHaveLength(5);
  });

  it('RF-632 gives the same bytes for the same scan', async () => {
    const first = fixturesOf({ shapes: await demoShapes() });
    const second = fixturesOf({ shapes: await demoShapes() });

    expect(second).toBe(first);
  });

  it('RF-632 is linked from the README reading order', () => {
    const files = renderHandoff(handoffOf('Plain text.'), masker);

    expect(files['README.md']).toContain('[Realistic data shapes](fixtures.md)');
  });

  it('RF-632 the demo fixtures.md matches its snapshot', async () => {
    expect(fixturesOf({ shapes: await demoShapes() })).toMatchSnapshot();
  });
});

describe('fixtures.md names that cannot be seen', () => {
  it('RF-632 shows a space or a control character that makes a name unusual', async () => {
    const scan = scanOf({ 'src/dir /file.txt': 'x\n', 'src/a\u0007b.txt': 'y\n' });
    const shapes = await measureScan(scan.codeMap, scan.reader);

    const text = plain(fixturesOf({ shapes }));

    expect(text).toContain('src/dir[U+0020]/file.txt: character or ending some systems refuse');
    expect(text).toContain('src/a[U+0007]b.txt: character or ending some systems refuse');
  });

  it('RF-632 says how many files were sized but not read for the total limit', async () => {
    const scan = scanOf({ 'a.cs': 'x\n' });
    const shapes = { ...(await measureScan(scan.codeMap, scan.reader)), beyondTotal: 2 };

    expect(fixturesOf({ shapes })).toContain(
      '2 files were sized but their content was not read: the total read limit was reached.',
    );
  });
});
