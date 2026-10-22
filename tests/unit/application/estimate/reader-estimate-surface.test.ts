import { NO_LISTED_MODELS } from '../../../../src/application/models/model-list.js';
import { describe, expect, it } from 'vitest';
import { assumptionsOf } from '../../../../src/application/estimate/estimate-assumptions.js';
import { readerTokens } from '../../../../src/application/estimate/reader-estimate.js';
import type { AreaMarks } from '../../../../src/domain/code-map/area-surface.js';
import { loadReaderPrompts } from '../../../../src/infrastructure/prompts/prompt-files.js';
import { estimateTokens } from '../../../../src/infrastructure/scan/universal/file-facts.js';
import { areaOf } from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';

// RF-263, RF-427, Q-25: the run estimate counts the flow and screen fragments of the prompt and the
// cards they add, for the areas the code map marks and for no other. No new role is added.

function assumptionsFor(maxTurns: number) {
  const base = settingsFor({ reader: { provider: 'openai', model: 'priced-model' } });
  const reader = { ...base.roles.reader, maxTurns, maxOutputTokens: 1000 };
  return assumptionsOf({ ...base, roles: { ...base.roles, reader } }, NO_LISTED_MODELS);
}

const area = areaOf('Orders', 10_000);
const marks = (flows: boolean, screens: boolean): ReadonlyMap<string, AreaMarks> =>
  new Map([['Orders', { flows, screens }]]);

describe('the reader estimate with flows and screens', () => {
  it('RF-263 states what the estimate adds for a marked area', () => {
    const assumptions = assumptionsFor(10);

    expect(assumptions.surfacePromptTokens).toBe(900);
    expect(assumptions.surfaceOutputTokens).toEqual({ low: 300, likely: 800, high: 2000 });
  });

  it('Q-25 an area marked for neither costs exactly what it cost before', () => {
    const assumptions = assumptionsFor(1);

    const tokens = readerTokens([area], assumptions, marks(false, false));

    expect(tokens).toEqual(readerTokens([area], assumptions));
    expect(tokens.likely).toMatchObject({
      inputTokens: 2000,
      outputTokens: 300,
      cacheWriteTokens: 2000,
    });
  });

  it('RF-260 a flows area resends the fragment each turn and answers the extra cards once', () => {
    const assumptions = assumptionsFor(1);

    const tokens = readerTokens([area], assumptions, marks(true, false));

    const written = { cacheWriteTokens: 2900 };
    expect(tokens.low).toMatchObject({ inputTokens: 2900, outputTokens: 150 + 300, ...written });
    expect(tokens.likely).toMatchObject({ inputTokens: 2900, outputTokens: 300 + 800, ...written });
    expect(tokens.high).toMatchObject({ inputTokens: 2900, outputTokens: 600 + 2000, ...written });
  });

  it('RF-261 an area marked for both adds both fragments', () => {
    const assumptions = assumptionsFor(1);

    const tokens = readerTokens([area], assumptions, marks(true, true));

    expect(tokens.likely).toMatchObject({
      inputTokens: 3800,
      outputTokens: 300 + 1600,
      cacheWriteTokens: 3800,
    });
  });
});

describe('the reader estimate per turn', () => {
  it('RF-263 the fragment is resent on every turn of the area', () => {
    const assumptions = assumptionsFor(10);
    const plain = readerTokens([area], assumptions);

    const tokens = readerTokens([area], assumptions, marks(false, true));

    // Six likely turns, each with 900 tokens more in front of it.
    expect(tokens.likely.inputTokens - plain.likely.inputTokens).toBe(6 * 900);
  });

  it('RF-263 only the marked areas are charged, by name', () => {
    const assumptions = assumptionsFor(1);
    const other = areaOf('Services', 10_000);

    const tokens = readerTokens([area, other], assumptions, marks(true, false));

    expect(tokens.likely.inputTokens).toBe(2900 + 2000);
  });
});

describe('the reader estimate limits', () => {
  it('RF-425 a turn still never sends more than the context share of the model', () => {
    const base = settingsFor({ reader: { provider: 'ollama', model: 'gemma4:e4b' } });
    const assumptions = assumptionsOf(base, NO_LISTED_MODELS);

    const tokens = readerTokens([areaOf('Orders', 1_000_000)], assumptions, marks(true, true));

    const turns = assumptions.turnsPerArea.high;
    expect(tokens.high.inputTokens).toBeLessThanOrEqual(turns * assumptions.contextLimitTokens);
  });

  it('RF-263 the 900 tokens per fragment cover the real fragments, so the estimate does not under-count', async () => {
    const prompts = await loadReaderPrompts('prompts');

    expect(prompts.surface).toBeDefined();
    const sizes = [prompts.surface?.flows.text ?? '', prompts.surface?.screens.text ?? ''].map(
      estimateTokens,
    );
    expect(Math.max(...sizes)).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(assumptionsFor(1).surfacePromptTokens);
  });
});
