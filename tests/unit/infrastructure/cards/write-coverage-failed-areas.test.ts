import { describe, expect, it } from 'vitest';
import type { AreaCoverage } from '../../../../src/domain/cards/area-coverage.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { writeCoverageOutputs } from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { cardLogger, cardTarget, fileOf } from '../../../support/card-output-harness.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-208, RF-230: an area whose task gave no usable card is named failed in `coverage.json` and
// `coverage.md`, with why; an area that gave cards, and a run without failures, are written
// exactly as before.

const read: AreaCoverage = {
  area: 'orders',
  files: [{ path: 'src/Orders/Checkout.cs', read: [{ startLine: 1, endLine: 14 }] }],
  tokens: 100,
  readTokens: 100,
  readTokenShare: 1,
};

const failed: AreaCoverage = {
  area: 'billing (old)',
  files: [{ path: 'src/Billing/Invoice.cs', read: [] }],
  tokens: 300,
  readTokens: 0,
  readTokenShare: 0,
  failure: 'invalid output (RST-1300)',
};

async function written(coverage: readonly AreaCoverage[]): Promise<MemoryOutputWriter> {
  const writer = new MemoryOutputWriter();
  const result = await writeCoverageOutputs(writer, cardTarget, {
    coverage,
    masker: new SecretMasker(),
    logger: cardLogger(),
  });
  expect(result.ok).toBe(true);
  return writer;
}

describe('coverage of failed areas', () => {
  it('RF-208 coverage.json gives the failure of a failed area and of no other', async () => {
    const writer = await written([read, failed]);

    const parsed: unknown = JSON.parse(fileOf(writer, 'coverage.json'));

    expect(parsed).toMatchObject({
      areas: [{ area: 'orders' }, { area: 'billing (old)', failure: 'invalid output (RST-1300)' }],
    });
    expect(fileOf(writer, 'coverage.json').match(/"failure"/gu)).toHaveLength(1);
  });

  it('RF-208 coverage.md lists the failed areas with why, after the run summary', async () => {
    const writer = await written([read, failed]);

    const markdown = fileOf(writer, 'coverage.md');

    expect(markdown).toContain('## Failed areas');
    expect(markdown).toContain('- billing \\(old\\): invalid output \\(RST\\-1300\\)');
    expect(markdown.indexOf('## Failed areas')).toBeGreaterThan(markdown.indexOf('## Run summary'));
    expect(markdown.indexOf('## Failed areas')).toBeLessThan(markdown.indexOf('## Area: orders'));
  });

  it('RF-208 a run without failed areas is written exactly as before: no failure key, no section', async () => {
    const writer = await written([read]);

    expect(fileOf(writer, 'coverage.json')).not.toContain('failure');
    expect(fileOf(writer, 'coverage.md')).not.toContain('Failed areas');
  });
});
