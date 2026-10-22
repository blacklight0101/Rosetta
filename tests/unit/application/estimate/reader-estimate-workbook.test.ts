import { NO_LISTED_MODELS } from '../../../../src/application/models/model-list.js';
import { describe, expect, it } from 'vitest';
import {
  assumptionsOf,
  WORKBOOK_PROMPT_TOKENS,
} from '../../../../src/application/estimate/estimate-assumptions.js';
import { readerTokens } from '../../../../src/application/estimate/reader-estimate.js';
import { areaOf } from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';

// RF-155, RF-425: the run estimate counts the workbook guidance and the two card formats it brings
// for the areas that hold a rendered workbook, and nothing for any other area.

const base = settingsFor({ reader: { provider: 'openai', model: 'priced-model' } });
const reader = { ...base.roles.reader, maxTurns: 1, maxOutputTokens: 1000 };
const assumptions = assumptionsOf({ ...base, roles: { ...base.roles, reader } }, NO_LISTED_MODELS);
const area = areaOf('Pricing.xlsx', 10_000);

describe('the reader estimate with workbook guidance', () => {
  it('RF-155 states the guidance the estimate adds per turn', () => {
    expect(assumptions.workbookPromptTokens).toBe(WORKBOOK_PROMPT_TOKENS);
  });

  it('RF-155 an area without a workbook costs exactly what it cost before', () => {
    expect(readerTokens([area], assumptions, new Map(), new Set())).toEqual(
      readerTokens([area], assumptions),
    );
  });

  it('RF-155 a workbook area resends the guidance and both formats and answers their cards once', () => {
    const tokens = readerTokens([area], assumptions, new Map(), new Set(['Pricing.xlsx']));

    expect(tokens.likely).toMatchObject({
      inputTokens: 2000 + 2 * 900 + WORKBOOK_PROMPT_TOKENS,
      outputTokens: 300 + 2 * 800,
      cacheWriteTokens: 2000 + 2 * 900 + WORKBOOK_PROMPT_TOKENS,
    });
  });
});
