import { describe, expect, it } from 'vitest';
import { buildCaseSet } from '../../../../../src/application/lab/capture/build-case-set.js';
import { splitsOf } from '../../../../../src/application/lab/capture/held-back.js';
import { parseLabCaseSet } from '../../../../../src/application/lab/lab-case-set.js';
import { sha256Hex } from '../../../../../src/infrastructure/lab/run-folder.js';
import { block, capturedRun, message, taskOf } from '../../../../support/capture-fixtures.js';

// RF-1404, RF-1405: a case set from saved runs.

const source = {
  key: 'shop',
  name: 'Invented shop',
  url: 'https://example.invalid/shop',
  commit: 'abcdef1234567',
  licence: 'MIT',
};

const area = (name: string, extra = ''): ReturnType<typeof taskOf> =>
  taskOf(
    name,
    message('system', 'S'),
    message(
      'user',
      block('list_area_files', `area: a${extra}\nfiles: 1\nsrc/${name}.cs (csharp, 5 lines)`),
    ),
  );

const names = ['reader-001', 'reader-002', 'reader-003', 'reader-004', 'reader-005', 'reader-006'];
const tasks = names.map((name) => area(name));

const request = (maxPerRun: number, list = tasks) => ({
  prompt: 'reader/area',
  name: 'reader-area',
  description: 'test',
  maxPerRun,
  sha256: sha256Hex,
  mask: (text: string) => text,
  runs: [{ source, run: capturedRun('shop', 'run-1', list) }],
});

describe('building a case set', () => {
  it('RF-1405 writes a set the lab reads, with its source, run and the sides of the rule', () => {
    const built = buildCaseSet(request(6));

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const { set } = built.value;
    expect(parseLabCaseSet(JSON.parse(JSON.stringify(set))).ok).toBe(true);
    expect(set.sources).toEqual([{ ...source, runs: ['run-1'] }]);
    expect(set.cases.every((each) => each.from === 'shop' && each.expected === undefined)).toBe(
      true,
    );
    const splits = set.cases.map((each) => each.split);
    expect(splits).toEqual(
      splitsOf(
        set.cases.map((each) => each.input),
        sha256Hex,
      ),
    );
  });

  it('RF-1404 takes at most the most per run, chosen by the task name, not the input', () => {
    const built = buildCaseSet(request(3));
    const reversed = buildCaseSet(request(3, [...tasks].reverse()));

    if (!built.ok || !reversed.ok) throw new Error('not built');
    expect(built.value.set.cases).toHaveLength(3);
    expect(reversed.value.set.cases.map((each) => each.id)).toEqual(
      built.value.set.cases.map((each) => each.id),
    );
  });
});

describe('the inputs of a case set built from runs', () => {
  it('RF-1404 leaves out a task whose input holds personal data and says so', () => {
    const leaky = area('reader-007', ' mailto jane@example.com');

    const built = buildCaseSet(request(7, [...tasks, leaky]));

    if (!built.ok) throw new Error(built.error);
    expect(built.value.set.cases.some((each) => each.id.endsWith('reader-007'))).toBe(false);
    expect(built.value.leftOut).toEqual(['run-1/reader-007: an e-mail address']);
  });

  it('RF-1404 refuses a prompt id it has no rule for, and a run with no task for it', () => {
    const unknown = buildCaseSet({ ...request(3), prompt: 'planner/options' });
    const none = buildCaseSet({ ...request(3), prompt: 'planner/gap' });

    expect(unknown.ok ? '' : unknown.error).toContain('Prompts it can capture');
    expect(none.ok).toBe(false);
  });

  it('RF-1405 drops a case whose input another run already gave, before the split, and says so', () => {
    const twice = {
      ...request(6),
      runs: [
        { source, run: capturedRun('shop', 'run-1', tasks) },
        { source, run: capturedRun('shop', 'run-2', tasks.slice(0, 2)) },
      ],
    };

    const built = buildCaseSet(twice);

    if (!built.ok) throw new Error(built.error);
    expect(built.value.set.cases).toHaveLength(6);
    expect(built.value.set.cases.every((each) => each.id.includes('run-1'))).toBe(true);
    expect(built.value.repeated).toHaveLength(2);
    expect(built.value.repeated[0]).toMatch(/^run-2\/reader-00\d: the input of shop-run-1-/u);
  });

  it('RF-1404 masks every text of a captured input with the run masker before it is kept', () => {
    const leaky = area('reader-007', ' sqlcmd -U sa -P HIDE');
    const mask = (text: string): string => text.replaceAll('HIDE', '[MASKED:password]');

    const built = buildCaseSet({ ...request(7, [...tasks, leaky]), mask });

    if (!built.ok) throw new Error(built.error);
    const text = JSON.stringify(built.value.set);
    expect(text).not.toContain('HIDE');
    expect(text).toContain('-P [MASKED:password]');
  });
});

describe('the sides of a captured set', () => {
  const many = Array.from({ length: 30 }, (_, index) => area(`reader-${String(100 + index)}`));
  const sideOf = new Map(
    many.map((task) => {
      const built = buildCaseSet(request(1, [task]));
      return [task.name, built.ok ? built.value.set.cases[0]?.split : undefined];
    }),
  );
  const on = (side: string) => many.filter((task) => sideOf.get(task.name) === side).slice(0, 3);

  it('RF-1405 warns when a set has no held-back case: no version can be kept on it yet', () => {
    const built = buildCaseSet(request(3, on('tune')));

    if (!built.ok) throw new Error(built.error);
    expect(built.value.set.cases.every((each) => each.split === 'tune')).toBe(true);
    expect(built.value.warnings).toEqual([
      'The set has no held-back case, so no version can be kept on it (DEC-231): capture more runs.',
    ]);
  });

  it('RF-1405 warns when a set has no tune case, and not when it has both', () => {
    const held = buildCaseSet(request(3, on('held-back')));
    const both = buildCaseSet(request(6, [...on('tune'), ...on('held-back')]));

    if (!held.ok || !both.ok) throw new Error('not built');
    expect(held.value.warnings).toEqual([
      'The set has no tune case, so no version can be tuned on it: capture more runs.',
    ]);
    expect(both.value.warnings).toEqual([]);
  });
});
