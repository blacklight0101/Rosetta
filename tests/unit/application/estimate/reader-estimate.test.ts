import { NO_LISTED_MODELS } from '../../../../src/application/models/model-list.js';
import { describe, expect, it } from 'vitest';
import { assumptionsOf } from '../../../../src/application/estimate/estimate-assumptions.js';
import { readerTokens } from '../../../../src/application/estimate/reader-estimate.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { areaOf, catalogAreas } from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';

// RF-425, DEC-117: the reader's tokens as a low, likely and high figure, from the code map's areas
// and the reader limits of the project settings. Fixed areas give fixed figures.

function readerSettings(change: {
  readonly maxTurns: number;
  readonly maxOutputTokens: number;
  readonly provider?: string;
}): ProjectSettings {
  const base = settingsFor({
    reader: { provider: change.provider ?? 'openai', model: 'priced-model' },
  });
  const reader = {
    ...base.roles.reader,
    maxTurns: change.maxTurns,
    maxOutputTokens: change.maxOutputTokens,
  };
  return { ...base, roles: { ...base.roles, reader } };
}

/** The assumptions of settings whose models the list gives no numbers for. */
const assumptionsFor = (settings: ProjectSettings) => assumptionsOf(settings, NO_LISTED_MODELS);

describe('assumptions of the estimate', () => {
  it('RF-425 states the turns, output per turn and shares the figures rest on', () => {
    const assumptions = assumptionsFor(readerSettings({ maxTurns: 10, maxOutputTokens: 1000 }));

    expect(assumptions.turnsPerArea).toEqual({ low: 3, likely: 6, high: 10 });
    expect(assumptions.outputTokensPerTurn).toEqual({ low: 150, likely: 300, high: 600 });
    expect(assumptions.readSharePercent).toEqual({ low: 50, likely: 80, high: 100 });
    expect(assumptions.verifierSharePercent).toEqual({ low: 15, likely: 30, high: 50 });
    expect(assumptions.promptOverheadTokens).toBe(2000);
    expect(assumptions.contextLimitTokens).toBe(102_400);
    expect(assumptions.cachedInputPercent).toBe(0);
  });

  it('DEC-117 takes parallelism and turns from the reader limits, inside their ranges', () => {
    const base = readerSettings({ maxTurns: 90, maxOutputTokens: 1000 });
    const many = { ...base, agents: { parallelism: 500 } };

    const assumptions = assumptionsFor(many);

    expect(assumptions.parallelism).toBe(8);
    expect(assumptions.turnsPerArea.high).toBe(50);
  });

  it('DEC-117 uses the reader default of 12 turns when the settings name none', () => {
    const base = readerSettings({ maxTurns: 10, maxOutputTokens: 1000 });
    const { provider, model, maxOutputTokens } = base.roles.reader;
    const reader = { provider, model, maxOutputTokens };

    const assumptions = assumptionsFor({ ...base, roles: { ...base.roles, reader } });

    expect(assumptions.turnsPerArea.high).toBe(12);
  });

  it('RF-425 an Ollama reader assumes the smaller context of a local model', () => {
    const settings = readerSettings({ maxTurns: 10, maxOutputTokens: 1000, provider: 'ollama' });

    expect(assumptionsFor(settings).contextLimitTokens).toBe(26_214);
  });
});

describe('reader tokens of the estimate', () => {
  it('RF-425 sums the resent context of every turn of every area (likely, two areas)', () => {
    const assumptions = assumptionsFor(readerSettings({ maxTurns: 10, maxOutputTokens: 1000 }));

    const tokens = readerTokens(catalogAreas, assumptions);

    // Catalog: 6 turns of 2,000 overhead + 80% of 10,000 read, spread over the turns, + 300 out.
    // Orders: the same with 80% of 4,000.
    // The tokens written to the cache are the conversation at the last turn: Catalog 2,000 + 6,666 +
    // 5 x 300 = 10,166 and Orders 2,000 + 2,666 + 1,500 = 6,166 (P2-37).
    expect(tokens.likely).toMatchObject({
      inputTokens: 60_996,
      outputTokens: 3600,
      cacheWriteTokens: 16_332,
    });
  });

  it('RF-425 one turn per area sends only the prompt overhead and answers the output share', () => {
    const assumptions = assumptionsFor(readerSettings({ maxTurns: 1, maxOutputTokens: 1000 }));

    const tokens = readerTokens([areaOf('Catalog', 10_000)], assumptions);

    expect(tokens.low).toMatchObject({
      inputTokens: 2000,
      outputTokens: 150,
      cacheWriteTokens: 2000,
    });
    expect(tokens.likely).toMatchObject({
      inputTokens: 2000,
      outputTokens: 300,
      cacheWriteTokens: 2000,
    });
    expect(tokens.high).toMatchObject({
      inputTokens: 2000,
      outputTokens: 600,
      cacheWriteTokens: 2000,
    });
  });

  it('RF-425 low is below likely is below high', () => {
    const assumptions = assumptionsFor(readerSettings({ maxTurns: 10, maxOutputTokens: 1000 }));

    const tokens = readerTokens(catalogAreas, assumptions);

    expect(tokens.low.inputTokens).toBeLessThan(tokens.likely.inputTokens);
    expect(tokens.likely.inputTokens).toBeLessThan(tokens.high.inputTokens);
    expect(tokens.low.outputTokens).toBeLessThan(tokens.likely.outputTokens);
    expect(tokens.likely.outputTokens).toBeLessThan(tokens.high.outputTokens);
  });
});

describe('reader tokens of the estimate at the limits', () => {
  it('RF-425 a turn never sends more than the context share of the model (high, huge area)', () => {
    const settings = readerSettings({ maxTurns: 10, maxOutputTokens: 1000, provider: 'ollama' });
    const assumptions = assumptionsFor(settings);

    const tokens = readerTokens([areaOf('Huge', 1_000_000)], assumptions);

    // Turn 1 sends 2,000; turns 2 to 10 are held at 26,214 (80% of Ollama's 32,768).
    expect(tokens.high.inputTokens).toBe(2000 + 9 * 26_214);
  });

  it('RF-425 no areas give no tokens', () => {
    const assumptions = assumptionsFor(readerSettings({ maxTurns: 10, maxOutputTokens: 1000 }));

    expect(readerTokens([], assumptions).high).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
    });
  });
});
