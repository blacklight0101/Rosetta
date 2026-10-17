import { describe, expect, it } from 'vitest';
import type { AreaCoverage } from '../../../../src/domain/cards/area-coverage.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { writeCoverageOutputs } from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { cardLogger, cardTarget, fileOf } from '../../../support/card-output-harness.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-261, RF-263, RF-230: coverage.json and coverage.md count the flow and screen cards of each
// area; an area the code map found no entry points or pages in says "no flows found" or "no
// screens found" instead of showing a gap. A run from before flows and screens is written as before.

const base = {
  files: [{ path: 'src/Orders/Checkout.aspx', read: [{ startLine: 1, endLine: 4 }] }],
  tokens: 100,
  readTokens: 100,
  readTokenShare: 1,
};

const orders: AreaCoverage = {
  ...base,
  area: 'Orders',
  surface: { flowsMarked: true, screensMarked: true, flowCards: 2, screenCards: 3 },
};

const services: AreaCoverage = {
  ...base,
  area: 'Services',
  surface: { flowsMarked: false, screensMarked: false, flowCards: 0, screenCards: 0 },
};

const quiet: AreaCoverage = {
  ...base,
  area: 'Reports',
  surface: { flowsMarked: true, screensMarked: true, flowCards: 0, screenCards: 0 },
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

describe('coverage of flows and screens', () => {
  it('RF-263 coverage.json gives the marks and the card counts of every area', async () => {
    const writer = await written([orders, services]);

    expect(JSON.parse(fileOf(writer, 'coverage.json'))).toMatchObject({
      areas: [
        {
          area: 'Orders',
          surface: { flowsMarked: true, screensMarked: true, flowCards: 2, screenCards: 3 },
        },
        {
          area: 'Services',
          surface: { flowsMarked: false, screensMarked: false, flowCards: 0, screenCards: 0 },
        },
      ],
    });
  });

  it('RF-261 coverage.md says "no screens found" and "no flows found" for a library area', async () => {
    const markdown = fileOf(await written([orders, services]), 'coverage.md');

    expect(markdown).toContain('- Services: no flows found; no screens found');
  });

  it('RF-263 coverage.md counts the cards of an area that gave them', async () => {
    const markdown = fileOf(await written([orders, services]), 'coverage.md');

    expect(markdown).toContain('- Orders: 2 flow cards; 3 screen cards');
    expect(markdown).not.toContain('- Orders: no');
  });

  it('RF-261 an area marked for screens that wrote none is not reported as "no screens found"', async () => {
    const markdown = fileOf(await written([quiet]), 'coverage.md');

    expect(markdown).toContain('- Reports: 0 flow cards; 0 screen cards');
    expect(markdown).not.toContain('no screens found');
  });
});

describe('coverage of flows and screens: layout', () => {
  it('RF-261 the section sits after the run summary and before the area tables', async () => {
    const markdown = fileOf(await written([orders, services]), 'coverage.md');

    expect(markdown.indexOf('## Flows and screens')).toBeGreaterThan(
      markdown.indexOf('## Run summary'),
    );
    expect(markdown.indexOf('## Flows and screens')).toBeLessThan(
      markdown.indexOf('## Area: Orders'),
    );
  });

  it('RF-230 coverage from before flows and screens is written as before: no key, no section', async () => {
    const writer = await written([{ ...base, area: 'Orders' }]);

    expect(fileOf(writer, 'coverage.json')).not.toContain('surface');
    expect(fileOf(writer, 'coverage.md')).not.toContain('Flows and screens');
  });
});
