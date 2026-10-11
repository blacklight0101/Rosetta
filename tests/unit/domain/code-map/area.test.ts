import { describe, expect, it } from 'vitest';
import { createArea } from '../../../../src/domain/code-map/area.js';
import { entry } from '../../../support/code-map-builders.js';

describe('Area', () => {
  it('RF-104 sorts its files, sums their tokens and keeps the origin', () => {
    const area = createArea(
      { name: 'Web', origin: 'folder', members: [entry('Web/b.cs', 30), entry('Web/a.cs', 20)] },
      100,
    );

    expect(area).toEqual({
      ok: true,
      value: {
        name: 'Web',
        files: ['Web/a.cs', 'Web/b.cs'],
        estimatedTokens: 50,
        mapLevel: 'coarse',
        origin: 'folder',
      },
    });
  });

  it('RF-112 the map level is symbols as soon as one file was mapped by a pack', () => {
    const area = createArea(
      {
        name: 'Web',
        origin: 'folder',
        members: [entry('Web/a.cs', 1, { mapLevel: 'symbols' }), entry('Web/b.cfg', 1)],
      },
      100,
    );

    expect(area.ok && area.value.mapLevel).toBe('symbols');
  });
});

describe('Area (limits)', () => {
  it('RF-104 an area is not empty and has a name', () => {
    expect(createArea({ name: 'X', origin: 'folder', members: [] }, 10)).toEqual({
      ok: false,
      error: 'empty-area',
    });
    expect(createArea({ name: '', origin: 'folder', members: [entry('a')] }, 10)).toEqual({
      ok: false,
      error: 'empty-name',
    });
  });

  it('RF-104 an area over the token budget is refused', () => {
    const members = [entry('a', 60), entry('b', 60)];

    expect(createArea({ name: 'X', origin: 'folder', members }, 100)).toEqual({
      ok: false,
      error: 'over-budget',
    });
  });

  it('RF-104 a single file larger than the budget is the one allowed exception', () => {
    const area = createArea({ name: 'X', origin: 'folder', members: [entry('a', 500)] }, 100);

    expect(area.ok && area.value.estimatedTokens).toBe(500);
  });

  it('RF-104 refuses a file listed twice and a budget that is not a positive whole number', () => {
    expect(
      createArea({ name: 'X', origin: 'folder', members: [entry('a'), entry('a')] }, 100),
    ).toEqual({ ok: false, error: 'duplicate-file' });
    expect(createArea({ name: 'X', origin: 'folder', members: [entry('a')] }, 0)).toEqual({
      ok: false,
      error: 'invalid-budget',
    });
  });
});
