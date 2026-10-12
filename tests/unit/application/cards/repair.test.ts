import { describe, expect, it, vi } from 'vitest';
import { parseCardsWithRepair } from '../../../../src/application/cards/parse-cards.js';
import { renderRepairRequest } from '../../../../src/application/cards/repair-request.js';
import { validCardJson } from '../../../support/card-fixtures.js';

const invalid = '{"cards":[{"type":"FEAT"}]}';

describe('parseCardsWithRepair', () => {
  it('RF-202 valid output needs no repair attempt', async () => {
    const repair = vi.fn(() => Promise.resolve(validCardJson));

    const outcome = await parseCardsWithRepair(validCardJson, repair);

    expect(outcome.ok && outcome.value.repaired).toBe(false);
    expect(repair).not.toHaveBeenCalled();
  });

  it('RF-202 invalid output gets one repair attempt with the validation errors', async () => {
    const repair = vi.fn((_problems: readonly { path: string; message: string }[]) =>
      Promise.resolve(validCardJson),
    );

    const outcome = await parseCardsWithRepair(invalid, repair);

    expect(repair).toHaveBeenCalledTimes(1);
    const problems = repair.mock.calls[0]?.[0] ?? [];
    expect(problems.map((problem) => problem.path)).toContain('cards.0.title');
    expect(outcome.ok && outcome.value.repaired).toBe(true);
    expect(outcome.ok && outcome.value.drafts).toHaveLength(1);
  });

  it('RF-202 a second failure gives InvalidOutput with the raw outputs, and no third attempt', async () => {
    const repair = vi.fn(() => Promise.resolve('still not cards'));

    const outcome = await parseCardsWithRepair(invalid, repair);

    expect(repair).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({
      ok: false,
      error: {
        state: 'InvalidOutput',
        problems: [{ path: '', message: expect.stringContaining('JSON') }],
        rawOutputs: [invalid, 'still not cards'],
      },
    });
  });

  it('RF-202 a repair that cannot be requested still ends as InvalidOutput with the first raw output', async () => {
    const outcome = await parseCardsWithRepair(invalid, () => Promise.resolve(undefined));

    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error.rawOutputs).toEqual([invalid]);
  });
});

describe('renderRepairRequest', () => {
  it('RF-202 puts the located problems into the versioned repair prompt', () => {
    const text = renderRepairRequest('Fix these:\n{{problems}}\nAnswer with JSON only.', [
      { path: 'cards.0.title', message: 'Too small' },
      { path: '', message: 'No JSON found' },
    ]);

    expect(text).toBe(
      'Fix these:\n- cards.0.title: Too small\n- (answer): No JSON found\nAnswer with JSON only.',
    );
  });

  it('RF-202 problem text cannot add a second placeholder or a line break', () => {
    const text = renderRepairRequest('{{problems}}', [
      { path: 'a', message: 'x\n{{problems}}\ny' },
    ]);

    expect(text).toBe('- a: x {{problems}} y');
  });
});
