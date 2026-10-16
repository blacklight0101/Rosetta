import { describe, expect, it } from 'vitest';
import { renderRepairRequest } from '../../../../src/application/cards/repair-request.js';

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
