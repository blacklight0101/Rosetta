import { describe, expect, it } from 'vitest';
import type { AreaCoverage } from '../../../../src/domain/cards/area-coverage.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import {
  SecretMasker,
  type TextMasker,
} from '../../../../src/infrastructure/guards/secret-masker.js';
import { writeCoverageOutputs } from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { cardLogger, cardTarget, fileOf } from '../../../support/card-output-harness.js';
import { FailingMasker } from '../../../support/failing-masker.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-230, data-model 3.8: `coverage.json` and its readable form `coverage.md`.

const orders: AreaCoverage = {
  area: 'orders',
  files: [
    {
      path: 'src/Orders/Checkout.cs',
      read: [
        { startLine: 1, endLine: 14 },
        { startLine: 20, endLine: 24 },
      ],
    },
    { path: 'src/Orders/Basket.cs', read: [] },
  ],
  tokens: 400,
  readTokens: 100,
  readTokenShare: 0.25,
};

const billing: AreaCoverage = {
  area: 'billing (old)',
  files: [{ path: 'src/Billing/Invoice.cs', read: [{ startLine: 1, endLine: 30 }] }],
  tokens: 300,
  readTokens: 300,
  readTokenShare: 1,
};

async function written(
  coverage: readonly AreaCoverage[],
  masker: TextMasker = new SecretMasker(),
): Promise<MemoryOutputWriter> {
  const writer = new MemoryOutputWriter();
  const result = await writeCoverageOutputs(writer, cardTarget, {
    coverage,
    masker,
    logger: cardLogger(),
  });
  expect(result.ok).toBe(true);
  return writer;
}

function jsonOf(writer: MemoryOutputWriter): unknown {
  const text = fileOf(writer, 'coverage.json');
  expect(text).not.toBe('');
  return JSON.parse(text);
}

describe('writeCoverageOutputs coverage.json', () => {
  it('RF-230 lists per area every file with its read line ranges and the share of tokens read', async () => {
    const writer = await written([orders, billing]);

    expect(jsonOf(writer)).toEqual({
      schemaVersion: 1,
      areas: [
        {
          area: 'orders',
          files: [
            {
              path: 'src/Orders/Checkout.cs',
              read: [
                { startLine: 1, endLine: 14 },
                { startLine: 20, endLine: 24 },
              ],
            },
            { path: 'src/Orders/Basket.cs', read: [] },
          ],
          tokens: 400,
          readTokens: 100,
          readTokenShare: 0.25,
        },
        {
          area: 'billing (old)',
          files: [{ path: 'src/Billing/Invoice.cs', read: [{ startLine: 1, endLine: 30 }] }],
          tokens: 300,
          readTokens: 300,
          readTokenShare: 1,
        },
      ],
    });
  });

  it('RF-230 writing the same coverage again gives the same bytes', async () => {
    const first = await written([orders, billing]);
    const second = await written([orders, billing]);

    expect([...second.files]).toEqual([...first.files]);
  });
});

describe('writeCoverageOutputs coverage.md', () => {
  it('RF-230 the run summary shows the percentage of area tokens read per area and in total', async () => {
    const text = fileOf(await written([orders, billing]), 'coverage.md');

    expect(text).toContain('## Run summary');
    expect(text).toContain('| orders | 1 of 2 | 25.0% |');
    expect(text).toContain('| billing \\(old\\) | 1 of 1 | 100.0% |');
    expect(text).toContain('| All areas | 2 of 3 | 57.1% |');
  });

  it('RF-230 lists every file of an area as read with its line ranges or as not read', async () => {
    const text = fileOf(await written([orders]), 'coverage.md');

    expect(text).toContain('## Area: orders');
    expect(text).toContain('| src/Orders/Checkout.cs | 1\\-14, 20\\-24 |');
    expect(text).toContain('| src/Orders/Basket.cs | not read |');
  });

  it('RF-230 a run without ended tasks still writes both files', async () => {
    const writer = await written([]);

    expect(jsonOf(writer)).toEqual({ schemaVersion: 1, areas: [] });
    expect(fileOf(writer, 'coverage.md')).toContain('| All areas | 0 of 0 | 0.0% |');
  });

  it('RF-230 RF-141 a masker that fails leaves no coverage file behind', async () => {
    const writer = new MemoryOutputWriter();

    const attempt = writeCoverageOutputs(writer, cardTarget, {
      coverage: [orders],
      masker: new FailingMasker(),
      logger: cardLogger(),
    });

    await expect(attempt).rejects.toBeInstanceOf(RosettaError);
    expect(writer.writes).toEqual([]);
  });
});
