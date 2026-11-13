import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  calibrationItems,
  limitItems,
  parseHandScored,
} from '../../../../../src/application/lab/judge/judge-check-set.js';
import { RUBRIC_FAMILIES } from '../../../../../src/application/lab/judge/rubric.js';
import { parseCalibrationSet } from '../../../../../src/application/eval/calibration-set-schema.js';

// RF-1405: the judge check reads the calibration claims and the hand-scored samples.

const root = fileURLToPath(new URL('../../../../../', import.meta.url));

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(`${root}${path}`, 'utf8')) as unknown;
}

describe('the calibration items of the judge check', () => {
  it('RF-1405 shows the verdict of the label and its opposite alternately, without the label', async () => {
    const set = parseCalibrationSet(await json('eval/calibration/webforms-shop.json'));
    if (!set.ok) throw new Error(set.error.join('; '));
    const files = { 'Catalog/Details.aspx.cs': 'line one\nline two\n' };

    const items = calibrationItems(set.value, files);

    expect(items).toHaveLength(12);
    items.forEach((item, index) => {
      expect(item.kind).toBe('calibration');
      expect(item.label).toBeNull();
      expect(item.followsLabel).toBe(index % 2 === 0);
      const claim = set.value.claims.find((each) => item.id === each.id);
      const shown = claim?.supported === item.followsLabel ? 'Supported' : 'Rejected';
      expect(item.answer).toContain(`Verdict: ${shown}`);
      expect(item.source).toContain(claim?.text ?? 'missing');
    });
  });
});

describe('the hand-scored samples', () => {
  it('RF-1405 hold at least three per family, each with its origin, licence and a score for every criterion', async () => {
    const parsed = parseHandScored(await json('eval/judge-check/hand-scored.json'));
    if (!parsed.ok) throw new Error(parsed.error);

    for (const family of RUBRIC_FAMILIES) {
      const mine = parsed.value.filter((sample) => sample.family === family);
      expect([family, mine.length >= 3]).toEqual([family, true]);
    }
    for (const sample of parsed.value) {
      expect(sample.origin.length).toBeGreaterThan(0);
      expect(sample.licence.length).toBeGreaterThan(0);
    }
  });

  it('RF-1405 refuses a sample with a score out of range or an unknown family', () => {
    const base = {
      id: 'a-1',
      family: 'reader',
      origin: 'x',
      licence: 'MIT',
      source: 's',
      answer: 'a',
      scores: { grounding: 3 },
    };
    const wrap = (sample: unknown) => ({ schemaVersion: 1, version: 'v', samples: [sample] });

    expect(parseHandScored(wrap(base)).ok).toBe(true);
    expect(parseHandScored(wrap({ ...base, scores: { grounding: 6 } })).ok).toBe(false);
    expect(parseHandScored(wrap({ ...base, family: 'poems' })).ok).toBe(false);
  });
});

describe('the limit of the judge check', () => {
  it('RF-1405 keeps the first n items of each kind and family', () => {
    const item = (id: string, kind: 'calibration' | 'hand-scored', family: string) => ({
      ...{ id, kind, family, source: 's', answer: 'a', label: null },
      ...{ followsLabel: null, scores: null },
    });
    const items = [
      item('c1', 'calibration', 'verifier'),
      item('c2', 'calibration', 'verifier'),
      item('h1', 'hand-scored', 'verifier'),
      item('h2', 'hand-scored', 'verifier'),
      item('r1', 'hand-scored', 'reader'),
    ];

    expect(limitItems(items, 1).map((each) => each.id)).toEqual(['c1', 'h1', 'r1']);
    expect(limitItems(items, undefined)).toHaveLength(5);
  });
});
