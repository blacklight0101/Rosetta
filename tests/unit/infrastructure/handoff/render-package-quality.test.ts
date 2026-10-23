import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import { workbookFormulasOf } from '../../../../src/domain/planning/workbook-formulas.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// P5-08: package quality candidates of the 2026-10-21 build trials, one probe per item the owner
// kept (RF-601, RF-603, RF-630, RF-632, RF-637, DEC-135).

const masker = new SecretMasker();

function plain(text: string | undefined): string {
  return (text ?? '').replaceAll(String.fromCharCode(92), '');
}

function filesOf(extra: Partial<HandoffPackage> = {}): Record<string, string> {
  return { ...renderHandoff(handoffOf('Plain text.', undefined, extra), masker) };
}

function withTasks(tasks: ReturnType<typeof planTask>[]): Partial<HandoffPackage> {
  const base = handoffOf('Plain text.');
  return { content: { ...base.content, tasks } };
}

const shapes = {
  ...{ files: 3, totalBytes: 3000, unreadable: 0, beyondTotal: 0 },
  largest: [{ path: 'Invoice.xlsm/Invoice/sheet.md', kind: 'doc' as const, bytes: 2000 }],
  byKind: [{ kind: 'doc' as const, files: 3, bytes: 3000 }],
  deepest: [{ path: 'Invoice.xlsm/Invoice/sheet.md', depth: 3 }],
  unusualNames: [],
  encodings: [{ name: 'utf-8' as const, files: 3 }],
  lineEndings: [{ name: 'lf' as const, files: 3 }],
};

describe('P5-08 item 1: fixtures of a workbook point at workbook data', () => {
  const workbook = { workbookFormulas: workbookFormulasOf([], { unread: 0 }), shapes };

  it('RF-632 fixtures.md of a workbook project lists no repository file and names sheets, rows and cells', () => {
    const text = plain(filesOf(workbook)['fixtures.md']);

    expect(text).not.toContain('Largest files');
    expect(text).not.toContain('Invoice.xlsm/Invoice/sheet.md');
    expect(text).toMatch(/sheets, rows and cells/u);
  });

  it('RF-632 a limit or parser card of a workbook project links workbook data, not file shapes', () => {
    const card = plain(filesOf(workbook)['tasks.md']).split(/^## /mu)[1] ?? '';

    expect(card).toContain('Data shapes to handle:');
    expect(card).not.toMatch(/fixtures\.md#(largest-files|encodings|deepest-paths)/u);
    expect(card).toContain('fixtures.md#data-volumes-stated-by-the-cards');
  });

  it('RF-632 a project that is not a workbook keeps the measured file shapes', () => {
    expect(plain(filesOf({ shapes })['fixtures.md'])).toContain('Largest files');
  });
});

describe('P5-08 item 2: the planner describes the layout cells of a template sheet', () => {
  it('RF-155 the workbook guidance asks for the layout cells of a template sheet by sheet and cell address', async () => {
    const text = await readFile('prompts/planner/workbook.v1.md', 'utf8');

    expect(text).toMatch(/template sheet/iu);
    expect(text).toMatch(/layout cells/iu);
    expect(text).toMatch(/fixed label/iu);
    expect(text).toMatch(/cell address/iu);
  });
});

describe('P5-08 item 3: a probe states its expected outcome', () => {
  const task = (probes: string[]) => planTask({ riskClass: 'data loss', adds: ['parser'], probes });

  it('RF-630 checks.md lists a probe that states no expected outcome, by card and position', () => {
    const files = filesOf(
      withTasks([task(['A total of 50.', 'A total of 50.01 => rejected with the code RST-9'])]),
    );

    const checks = plain(files['checks.md']);
    expect(checks).toContain('## Probes without an expected outcome');
    expect(checks).toContain('T-001, probe 1');
    expect(checks).not.toContain('probe 2');
  });

  it('RF-630 checks.md has no such section when every probe states its outcome', () => {
    const files = filesOf(
      withTasks([task(['A total of 50 -> accepted', 'Expected: refused for 51'])]),
    );

    expect(plain(files['checks.md'])).not.toContain('Probes without an expected outcome');
  });

  it.each(['planner/package.v7.md', 'planner/gap.v1.md'])(
    'RF-630 %s asks for the expected outcome of every probe',
    async (name) => {
      const text = await readFile(`prompts/${name}`, 'utf8');

      expect(text).toMatch(/expected outcome/iu);
    },
  );
});

describe('P5-08 item 4: only a card that depends on a question is marked as waiting', () => {
  const two = withTasks([planTask(), planTask({ id: 'T-002', requirements: [] })]);

  it('RF-637 the roadmap marks the card of the analysis question and not the others', () => {
    const roadmap = plain(filesOf(two)['roadmap.md']);

    expect(roadmap).toMatch(/- \[T-001\]\(tasks\.md#t-001\): OQ-001/u);
    expect(roadmap).not.toContain('[T-002](tasks.md#t-002):');
  });

  it('RF-637 a question of the brief marks no card and the open questions say it covers the whole build', () => {
    const files = filesOf(two);

    expect(plain(files['roadmap.md'])).not.toContain('migration');
    expect(plain(files['open-questions.md'])).toMatch(/whole build/u);
  });
});

describe('P5-08 item 5: the text every card shares is written once', () => {
  const cards = (files: Record<string, string>) =>
    plain(files['tasks.md']).split(/^## /mu).slice(1);

  it('RF-607 RF-609 RF-633 the checklist, technology and guard test are stated once before the cards', () => {
    const files = filesOf(
      withTasks([planTask({ adds: ['check'] }), planTask({ id: 'T-002', adds: ['check'] })]),
    );

    const text = plain(files['tasks.md']);
    for (const shared of ['Review checklist:', 'Technology:', 'Guard test:']) {
      expect(text.split(shared)).toHaveLength(2);
      expect(text.indexOf(shared)).toBeLessThan(text.indexOf('## T-001'));
    }
    for (const card of cards(files)) {
      expect(card).not.toMatch(/Review checklist|Technology:|Guard test:/u);
    }
  });
});
