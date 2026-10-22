import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { PlanTask } from '../../../../src/domain/planning/plan-content.js';
import type { PrdContent } from '../../../../src/domain/planning/prd-content.js';
import { emptyPrd } from '../../../../src/domain/planning/prd-content.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-627, RNF-003, RF-507: checks.md lists every item no task card builds, in a fixed order, with
// escaped names; a task card lists the items it builds, each with a link to its document.

const masker = new SecretMasker();

const prd: PrdContent = {
  ...emptyPrd,
  features: [
    { title: 'Order', description: 'Place an order.', priority: 'Must', sources: ['FEAT-001'] },
    { title: 'Export', description: 'Export a day.', priority: 'Could', sources: ['FEAT-001'] },
  ],
};

function withTasks(tasks: readonly PlanTask[], text = 'Plain text.', own = prd): HandoffPackage {
  const base = handoffOf(text, own);
  return { ...base, content: { ...base.content, tasks } };
}

function filesOf(tasks: readonly PlanTask[], text?: string, own?: PrdContent) {
  return renderHandoff(withTasks(tasks, text, own), masker);
}

/** The text as a reader sees it: the escaper's backslashes removed. */
const plain = (text: string | undefined): string => (text ?? '').replaceAll('\\', '');

const everything = [
  ...['feature:F-001', 'feature:F-002', 'table:customer', 'table:customer_order'],
  'flow:FLOW-001',
];

describe('checks.md: items no task card builds', () => {
  it('RF-627 lists every uncovered item once, kind by kind, and says the run is not complete', () => {
    const checks = plain(filesOf([planTask()])['checks.md']);

    expect(checks).toContain('# Package checks');
    expect(checks).toContain('## Plan coverage');
    const rows = [...checks.matchAll(/^\| (\w+) \| ([^|]+) \| ([^|]*) \|$/gmu)].map((match) => [
      match[1],
      match[2]?.trim(),
    ]);
    expect(rows.filter((row) => row[0] !== 'Kind')).toEqual([
      ['feature', 'feature:F-001'],
      ['feature', 'feature:F-002'],
      ['table', 'table:customer'],
      ['table', 'table:customer_order'],
      ['flow', 'flow:FLOW-001'],
    ]);
    expect(checks).toMatch(/5 items? .*not complete/su);
  });

  it('RF-627 an item a task builds is not listed, and the others still are', () => {
    const built = planTask({ builds: ['feature:F-001', 'table:customer'] });

    const checks = plain(filesOf([built])['checks.md']);

    expect(checks).not.toContain('feature:F-001');
    expect(checks).not.toContain('table:customer |');
    expect(checks).toContain('feature:F-002');
    expect(checks).toContain('table:customer_order');
  });

  it('RF-627 when every item is built it says so and lists nothing', () => {
    const checks = plain(filesOf([planTask({ builds: everything })])['checks.md']);

    expect(checks).toContain('Every item is built by at least one task card.');
    expect(checks).not.toMatch(/^\| feature/mu);
    expect(checks).not.toContain('not complete');
  });
});

describe('checks.md: the rest of the cases', () => {
  it('RF-627 a plan with no task lists every item', () => {
    const checks = plain(filesOf([])['checks.md']);

    for (const id of everything) expect(checks).toContain(id);
  });

  it('RF-627 the same package gives the same checks.md', () => {
    const tasks = [planTask({ builds: ['table:customer'] })];

    expect(filesOf(tasks)['checks.md']).toBe(filesOf(tasks)['checks.md']);
  });
});

describe('tasks.md: text that is not Rosetta', () => {
  it('RF-507 the name of an item a card builds shows as text', () => {
    const hostile = '<script>alert(1)</script> [x](https://evil.example)';
    const own = { ...prd, features: [{ ...(prd.features[0] ?? fail()), title: hostile }] };
    const built = planTask({ builds: ['feature:F-001'] });

    const tasks = filesOf([built], 'Plain text.', own)['tasks.md'] ?? '';

    expect(tasks).not.toContain('<script>');
    expect(tasks).not.toContain('](https://evil.example)');
    expect(tasks).toContain('&lt;script&gt;');
  });
});

describe('checks.md: text that is not Rosetta', () => {
  const hostile = '<script>alert(1)</script> [x](https://evil.example) | `tick`';

  it('RF-507 the name of an uncovered item shows as text', () => {
    const own = { ...prd, features: [{ ...(prd.features[0] ?? fail()), title: hostile }] };

    const checks = filesOf([], 'Plain text.', own)['checks.md'] ?? '';

    expect(checks).not.toContain('<script>');
    expect(checks).not.toContain('](https://evil.example)');
    expect(checks).toContain('&lt;script&gt;');
    expect(checks.split('\n').filter((line) => line.startsWith('| feature'))).toHaveLength(1);
  });

  it('RNF-003 a secret in the name of an item is masked', () => {
    const own = { ...prd, features: [{ ...(prd.features[0] ?? fail()), title: fakeOpenAiKey }] };

    const checks = filesOf([], 'Plain text.', own)['checks.md'] ?? '';

    expect(checks).not.toContain(fakeOpenAiKey.slice(8, 30));
  });
});

function fail(): never {
  throw new Error('The fixture has a feature');
}

describe('tasks.md: what a card builds', () => {
  const built = planTask({
    ...{ id: 'T-001', title: 'Orders' },
    builds: ['feature:F-001', 'table:customer_order', 'flow:FLOW-001'],
  });
  const files = filesOf([built, planTask({ id: 'T-002', title: 'Nothing' })]);
  const cards = plain(files['tasks.md']).split(/^## /mu);

  it('RF-627 a card lists each item it builds with its kind, its name and a link to its document', () => {
    const card = cards.find((each) => each.startsWith('T-001')) ?? '';

    expect(card).toContain('Builds:');
    expect(card).toContain('- [Feature](prd.md) F-001: Order');
    expect(card).toContain('- [Table](data-model.md) customer_order');
    expect(card).toContain('- [Flow](flows/FLOW-001.md) FLOW-001:');
  });

  it('RF-627 a card that builds nothing says so', () => {
    const card = cards.find((each) => each.startsWith('T-002')) ?? '';

    expect(card).toContain('Builds: none');
  });
});

describe('README with the checks', () => {
  it('RF-627 the reading order links checks.md, which the package holds', () => {
    const files = filesOf([planTask()]);

    expect(files['README.md']).toContain('[Package checks](checks.md)');
    expect(Object.keys(files)).toContain('checks.md');
  });
});

function withNotes(notes: NonNullable<HandoffPackage['content']['requirementNotes']>) {
  const base = withTasks([planTask()]);
  return renderHandoff({ ...base, content: { ...base.content, requirementNotes: notes } }, masker);
}

describe('checks.md: the requirements of the task cards', () => {
  it('RF-627 lists each change and each position outside the list', () => {
    const checks = plain(
      withNotes([
        { kind: 'position', card: 9, position: 14, count: 13 },
        { kind: 'added', task: 'T-008', requirement: 'REQ-011' },
        { kind: 'removed', task: 'T-008', requirement: 'REQ-012' },
        { kind: 'unmatched', task: 'T-009', requirement: 'REQ-013', kept: 1 },
      ])['checks.md'],
    );

    expect(checks).toContain('## Requirements of the task cards');
    expect(checks).toContain(
      'The task card at position 9 of the plan answer lists requirement position 14, but the plan has 13 requirements; that position was ignored.',
    );
    expect(checks).toContain(
      'T-008 gained REQ-011: its source cards are behind what the task builds.',
    );
    expect(checks).toContain(
      'T-008 lost REQ-012: its source cards share nothing with what the task builds, and another card builds an item behind them.',
    );
    expect(checks).toContain(
      'T-009 keeps REQ-013 although its source cards share nothing with what the task builds: it is the only requirement of the card.',
    );
  });

  it('RF-627 a package with no note has no such section', () => {
    expect(plain(filesOf([planTask()])['checks.md'])).not.toContain(
      'Requirements of the task cards',
    );
  });
});

describe('checks.md: a card whose requirements all fit nothing it builds', () => {
  it('RF-627 a card that keeps several requirements does not say each is the only one', () => {
    const checks = plain(
      withNotes([
        { kind: 'unmatched', task: 'T-009', requirement: 'REQ-013', kept: 3 },
        { kind: 'unmatched', task: 'T-009', requirement: 'REQ-014', kept: 3 },
      ])['checks.md'],
    );

    expect(checks).toContain(
      'T-009 keeps REQ-013 although its source cards share nothing with what the task builds: the card keeps all 3 of its requirements.',
    );
    expect(checks).toContain('T-009 keeps REQ-014 although');
    expect(checks).not.toContain('only requirement');
  });
});
