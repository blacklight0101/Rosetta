import { describe, expect, it } from 'vitest';
import { readPlanAnswer } from '../../../../src/application/plan/plan-answer.js';

// P5-24, P3-126, RF-601, RF-622, ADR-013: the shapes a small model sends for the `alternative` and
// `invariant` of a security control. Every shape with a safe reading keeps the control; only a
// control whose name or approach is unreadable is left out and listed. Synthetic answers (ADR-008).

const TEXT = 2000;
const base = {
  name: 'Upload filter',
  approach: 'denylist',
  description: 'Blocks forbidden file extensions.',
  sources: ['FEAT-001'],
};

function read(fields: object) {
  const answer = {
    requirements: [{ title: 'Order', statement: 'Order.', sources: ['FEAT-001'] }],
    technical: { security: [{ ...base, ...fields }] },
  };
  return readPlanAnswer(JSON.stringify(answer));
}

const onlyControl = (fields: object) => read(fields).draft?.technical.security[0];

describe('readPlanAnswer: the alternative of a security control', () => {
  it.each([
    ['null', { alternative: null }],
    ['missing', {}],
    ['empty text', { alternative: '' }],
    ['blank text', { alternative: '   ' }],
    ['an empty list', { alternative: [] }],
    ['false', { alternative: false }],
    ['an empty object', { alternative: {} }],
  ])('P5-24 %s reads as none and keeps the control', (_name, fields) => {
    const control = onlyControl(fields);
    expect(control?.name).toBe('Upload filter');
    expect(control?.alternative).toBe('');
    expect(read(fields).draft?.unreadableItems).toBeUndefined();
  });
});

describe('readPlanAnswer: the alternative of a security control, other shapes', () => {
  it('P5-24 a list of strings is joined', () => {
    const control = onlyControl({
      alternative: ['Allow images only.', ' Check the content type.'],
    });
    expect(control?.alternative).toBe('Allow images only. Check the content type.');
  });

  it('P5-24 a list with other things keeps its strings and numbers, and drops the rest', () => {
    const control = onlyControl({ alternative: ['Allow images only.', null, { x: 1 }, 7] });
    expect(control?.alternative).toBe('Allow images only. 7');
  });

  it('P5-24 an object of strings is joined by its values', () => {
    const control = onlyControl({ alternative: { rule: 'Allow images only.', note: 'Always.' } });
    expect(control?.alternative).toBe('Allow images only. Always.');
  });

  it('P5-24 a number is read as its text', () => {
    expect(onlyControl({ alternative: 3 })?.alternative).toBe('3');
  });

  it('P5-24 a text over its bound is cut at the bound with a marker', () => {
    const control = onlyControl({ alternative: 'x'.repeat(TEXT + 500) });
    expect(control?.alternative).toHaveLength(TEXT);
    expect(control?.alternative.endsWith('[cut]')).toBe(true);
    expect(read({ alternative: 'x'.repeat(TEXT + 500) }).draft?.unreadableItems).toBeUndefined();
  });

  it('P5-24 a joined list over the bound is cut too', () => {
    const control = onlyControl({ alternative: Array.from({ length: 80 }, () => 'y'.repeat(100)) });
    expect(control?.alternative).toHaveLength(TEXT);
    expect(control?.alternative.endsWith('[cut]')).toBe(true);
  });

  it('P5-24 a text at its bound is kept whole', () => {
    expect(onlyControl({ alternative: 'z'.repeat(TEXT) })?.alternative).toBe('z'.repeat(TEXT));
  });
});

describe('readPlanAnswer: the invariant of a security control', () => {
  it.each([
    ['null', { invariant: null }],
    ['an empty list', { invariant: [] }],
  ])('P5-24 %s reads as none', (_name, fields) => {
    expect(onlyControl(fields)?.invariant).toBe('');
  });

  it('P5-24 a list of strings is joined and an over-long text is cut', () => {
    expect(onlyControl({ invariant: ['No script runs.', 'Ever.'] })?.invariant).toBe(
      'No script runs. Ever.',
    );
    const cut = onlyControl({ invariant: 'q'.repeat(TEXT * 2) })?.invariant;
    expect(cut).toHaveLength(TEXT);
    expect(cut?.endsWith('[cut]')).toBe(true);
  });
});

describe('readPlanAnswer: a control that is still left out', () => {
  it.each([
    ['an approach that does not exist', { approach: 'magic' }],
    ['a missing name', { name: undefined }],
    ['an empty name', { name: '  ' }],
    ['a name that is a list', { name: ['a'] }],
    ['a missing description', { description: undefined }],
  ])('P3-126 P5-24 %s is left out and listed', (_name, fields) => {
    const { draft } = read(fields);
    expect(draft?.technical.security).toEqual([]);
    expect(draft?.unreadableItems).toEqual([
      expect.objectContaining({ list: 'technical.security', position: 1 }),
    ]);
  });
});
