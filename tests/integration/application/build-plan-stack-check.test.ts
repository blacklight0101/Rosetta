import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { plain, seededApiPlan, withApiAnswer } from '../../support/api-plan-harness.js';

// RF-609, RF-624: the stack consistency check in a written package. The owner's choice is
// never changed; a clash is in checks.md, as one open question and as one line of the README.

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-stack-check-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

const noContract = JSON.stringify({
  applies: false,
  reason: 'Razor Pages is rendered by the server, so no API is public.',
  operations: [],
  notServed: [],
});

const eShop = {
  architecture: { style: 'layered' },
  migration: 'strangler-fig',
  stack: [
    { layer: 'backend-framework', choice: 'ASP.NET Core Minimal APIs', custom: false },
    { layer: 'front-end', choice: 'Razor Pages', custom: false },
  ],
} as const;

describe('BuildPlan: the stack check (RF-609)', () => {
  it('RF-609 the eShop brief gives one clash in checks.md, one open question and one README line', async () => {
    const h = await seededApiPlan(dataDir, {
      brief: eShop,
      recording: await withApiAnswer(noContract),
    });

    const files = await h.handoffOf(await h.plan());

    const checks = plain(files['checks.md']);
    expect(checks.match(/^## Stack clashes$/gmu)).toHaveLength(1);
    expect(checks).toContain('server-rendered-front-end-with-api-back-end');
    expect(checks).toContain('Razor Pages');
    const questions = plain(files['open-questions.md']);
    expect(questions.match(/stack-clash\./gu)).toHaveLength(1);
    expect(questions).toContain('Keep the legacy behaviour');
    const readme = plain(files['README.md']);
    expect(readme.match(/The stack has an open clash/gu)).toHaveLength(1);
    // the owner's choice is untouched
    const adrs = Object.entries(files)
      .filter(([path]) => path.startsWith('decisions/'))
      .map(([, text]) => plain(text))
      .join('\n');
    expect(adrs).toContain('Use ASP.NET Core Minimal APIs for the back-end framework layer.');
    expect(adrs).toContain('Use Razor Pages for the front end layer.');
  });
});

describe('BuildPlan: the stack check, no clash and the ADRs (RF-609)', () => {
  it('RF-609 a consistent brief has no clash anywhere', async () => {
    const h = await seededApiPlan(dataDir, {
      brief: {
        ...eShop,
        stack: [
          { layer: 'backend-framework', choice: 'ASP.NET Core Web API', custom: false },
          { layer: 'front-end', choice: 'React', custom: false },
        ],
      },
    });

    const files = await h.handoffOf(await h.plan());

    expect(plain(files['checks.md'])).not.toContain('Stack clashes');
    expect(plain(files['open-questions.md'])).not.toContain('stack-clash.');
    expect(plain(files['README.md'])).not.toContain('open clash');
  });

  it('RF-609 the stack ADRs list the catalogue options and no longer say source cards none for a layer the cards name', async () => {
    const h = await seededApiPlan(dataDir, {
      brief: eShop,
      recording: await withApiAnswer(noContract),
    });

    const files = await h.handoffOf(await h.plan());

    const adr = Object.entries(files)
      .filter(([path]) => path.startsWith('decisions/'))
      .map(([, text]) => plain(text))
      .find((text) => text.includes('Technology for the front end layer'));
    expect(adr).toBeDefined();
    expect(adr).toContain('## Options considered');
    expect(adr).toContain('React:');
    expect(adr).toContain('Razor Pages (chosen):');
    expect(adr).not.toContain('The package names a technology only where');
  });
});
