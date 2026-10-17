import { describe, expect, it } from 'vitest';
import { parseCalibrationSet } from '../../../../src/application/eval/calibration-set-schema.js';

// RF-305, DEC-57: the calibration set is hand-written data, `unknown` until this schema has read
// it: strict objects, unique ids, citations that parse, a folder inside the repository, and both
// labels present (a set of only supported claims cannot show a verifier that agrees with anything).

function claim(id: string, supported: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id,
    text: `Claim ${id}.`,
    citations: ['Default.aspx.cs:11-11'],
    supported,
    note: 'Why it is labelled so.',
    ...overrides,
  };
}

function setOf(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    version: '2026-10-17.test',
    description: 'A test set.',
    source: { folder: 'tests/fixtures/repos/webforms-shop' },
    claims: [claim('cal-1', true), claim('cal-2', false)],
    ...overrides,
  };
}

describe('parseCalibrationSet', () => {
  it('RF-305 reads claims with their text, citations and label', () => {
    const parsed = parseCalibrationSet(setOf());

    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.value.source.folder).toBe('tests/fixtures/repos/webforms-shop');
    expect(parsed.value.claims[0]).toEqual({
      id: 'cal-1',
      text: 'Claim cal-1.',
      citations: [{ path: 'Default.aspx.cs', startLine: 11, endLine: 11 }],
      supported: true,
      note: 'Why it is labelled so.',
    });
  });
});

describe('parseCalibrationSet refusals', () => {
  it.each([
    ['a duplicate id', { claims: [claim('cal-1', true), claim('cal-1', false)] }, 'cal-1'],
    ['no supported claim', { claims: [claim('a', false), claim('b', false)] }, 'supported'],
    ['no unsupported claim', { claims: [claim('a', true), claim('b', true)] }, 'not supported'],
    ['no claim', { claims: [] }, 'claims'],
    [
      'a claim without a citation',
      { claims: [claim('a', true, { citations: [] }), claim('b', false)] },
      'citations',
    ],
    [
      'a citation that is not a range',
      { claims: [claim('a', true, { citations: ['x.cs'] }), claim('b', false)] },
      'citation',
    ],
    [
      'a reversed range',
      { claims: [claim('a', true, { citations: ['x.cs:9-3'] }), claim('b', false)] },
      'citation',
    ],
    [
      'a citation that leaves the folder',
      { claims: [claim('a', true, { citations: ['../x.cs:1-2'] }), claim('b', false)] },
      'citation',
    ],
    ['a folder that goes up', { source: { folder: '../outside' } }, 'folder'],
    ['an absolute folder', { source: { folder: '/etc' } }, 'folder'],
    ['an unknown key', { extra: 1 }, 'extra'],
    ['another schema version', { schemaVersion: 2 }, 'schemaVersion'],
    [
      'a label that is not a boolean',
      { claims: [claim('a', 'yes'), claim('b', false)] },
      'supported',
    ],
  ])('RF-305 refuses %s', (_name, overrides, word) => {
    const parsed = parseCalibrationSet(setOf(overrides));

    expect(parsed.ok ? '' : parsed.error.join('; ')).toContain(word);
  });

  it('RF-305 names every problem, not only the first', () => {
    const parsed = parseCalibrationSet(
      setOf({ claims: [claim('a', true, { citations: [] }), claim('a', true)], version: '' }),
    );

    expect(parsed.ok ? 0 : parsed.error.length).toBeGreaterThan(1);
  });
});
