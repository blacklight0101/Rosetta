import { describe, expect, it } from 'vitest';
import { buildCaseSet } from '../../../../../src/application/lab/capture/build-case-set.js';
import { heldBackIds } from '../../../../../src/application/lab/capture/held-back.js';
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
  runs: [{ source, run: capturedRun('shop', 'run-1', list) }],
});

describe('building a case set', () => {
  it('RF-1405 writes a set the lab reads, with its source, run and a third held back', () => {
    const built = buildCaseSet(request(6));

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const { set } = built.value;
    expect(parseLabCaseSet(JSON.parse(JSON.stringify(set))).ok).toBe(true);
    expect(set.sources).toEqual([{ ...source, runs: ['run-1'] }]);
    expect(set.cases.every((each) => each.from === 'shop' && each.expected === undefined)).toBe(
      true,
    );
    const ids = set.cases.map((each) => each.id);
    const held = set.cases.filter((each) => each.split === 'held-back').map((each) => each.id);
    expect(new Set(held)).toEqual(heldBackIds('reader/area', ids, sha256Hex));
    expect(held).toHaveLength(2);
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

  it('RF-1404 leaves out a task whose input holds personal data and says so', () => {
    const leaky = area('reader-007', ' mailto jane@example.com');

    const built = buildCaseSet(request(7, [...tasks, leaky]));

    if (!built.ok) throw new Error(built.error);
    expect(built.value.set.cases.some((each) => each.id.endsWith('reader-007'))).toBe(false);
    expect(built.value.leftOut).toEqual(['run-1/reader-007: an e-mail address']);
  });

  it('RF-1404 refuses a prompt id it has no rule for, and a run with no task for it', () => {
    const unknown = buildCaseSet({ ...request(3), prompt: 'planner/prd' });
    const none = buildCaseSet({ ...request(3), prompt: 'planner/gap' });

    expect(unknown.ok ? '' : unknown.error).toContain('Prompts it can capture');
    expect(none.ok).toBe(false);
  });
});
