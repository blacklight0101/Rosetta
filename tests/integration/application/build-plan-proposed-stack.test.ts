import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { plain, seededApiPlan } from '../../support/api-plan-harness.js';
import {
  oneStatement,
  ProposalScans,
  webFormsFiles,
  winFormsFiles,
} from '../../support/proposal-scans.js';

// P5-39, DEC-172, RF-609, RF-610: a plan run whose brief leaves the stack open proposes the stack for the
// kind of application the code map shows, writes a Proposed record per layer, tells the README and
// the TRD, and checks the migration strategy against the kind. The owner's choice always wins.

const webFormsRecording = 'planner-webforms-proposed.json';

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-proposed-stack-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

function decisionsOf(files: Readonly<Record<string, string>>): string[] {
  return Object.entries(files)
    .filter(([path]) => path.startsWith('decisions/'))
    .map(([, text]) => plain(text));
}

describe('BuildPlan: a WebForms application with no stack in the brief', () => {
  it('RF-609 writes a Proposed record per open layer, lists them and sends them to the planner', async () => {
    const h = await seededApiPlan(dataDir, {
      brief: {},
      recording: await loadRecording(join('tests', 'recordings', 'fake', webFormsRecording)),
      harness: { scans: new ProposalScans(webFormsFiles) },
    });
    await h.seedScan();

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const files = await h.handoffOf(run);
    const layerRecords = decisionsOf(files).filter((text) => text.includes('Technology for the'));
    expect(layerRecords).toHaveLength(7);
    for (const record of layerRecords) expect(record).toContain('Proposed');
    const razor = layerRecords.find((text) => text.includes('front end layer: Razor Pages'));
    expect(razor).toContain('Rosetta proposes');
    expect(razor).toContain('The task cards that touch the front end layer are T-');
    expect(plain(files['tasks.md'])).toContain('src/Web/Orders.cshtml');
    const readme = plain(files['README.md']);
    expect(readme.match(/Rosetta proposed the technology of 7 stack layers/gu)).toHaveLength(1);
    expect(readme).not.toContain('No technology was chosen');
    const trd = plain(files['trd.md']);
    expect(trd).toContain('Kind of application: web.');
    expect(trd).toContain('C# on .NET (proposed by Rosetta)');
    const questions = plain(files['open-questions.md']);
    expect(questions).toContain('Proposed by Rosetta, not chosen by the owner: SQL Server');
    const message = h.providers
      .requests()[0]
      ?.messages.map((each) => each.content)
      .join('\n');
    expect(message).toContain('"proposedByRosetta": true');
    expect(message).toContain('"choice": "Razor Pages"');
  });
});

describe('BuildPlan: a WebForms application whose brief answers every layer', () => {
  it('RF-609 a brief that answers every layer is written as before, with no Proposed stack record', async () => {
    const h = await seededApiPlan(dataDir, {
      brief: {
        stack: [
          { layer: 'language-runtime', choice: 'Java', custom: true },
          { layer: 'backend-framework', choice: 'Fastify', custom: true },
          { layer: 'front-end', choice: 'React', custom: false },
          { layer: 'database', choice: 'PostgreSQL', custom: false },
          { layer: 'data-access', choice: 'Dapper', custom: true },
          { layer: 'testing', choice: 'Vitest', custom: false },
          { layer: 'hosting', choice: 'Docker containers', custom: false },
        ],
      },
      harness: { scans: new ProposalScans(webFormsFiles) },
    });
    await h.seedScan();

    const files = await h.handoffOf(await h.plan());

    const layerRecords = decisionsOf(files).filter((text) => text.includes('Technology for the'));
    expect(layerRecords).toHaveLength(7);
    for (const record of layerRecords) expect(record).not.toContain('Rosetta proposes');
    expect(plain(files['README.md'])).not.toContain('Rosetta proposed');
    expect(plain(files['trd.md'])).not.toContain('(proposed by Rosetta)');
  });
});

describe('BuildPlan: layers answered with only a platform', () => {
  it('P7-30 a ".net" front end and back end and a "default" test tool are Proposed and listed', async () => {
    const h = await seededApiPlan(dataDir, {
      brief: {
        stack: [
          { layer: 'backend-framework', choice: '.net', custom: true },
          { layer: 'front-end', choice: '.net', custom: true },
          { layer: 'testing', choice: 'default', custom: true },
        ],
      },
      harness: { scans: new ProposalScans(webFormsFiles) },
    });
    await h.seedScan();

    const files = await h.handoffOf(await h.plan());

    const records = decisionsOf(files).filter((text) => text.includes('Technology for the'));
    expect(records).toHaveLength(7);
    for (const layer of ['front end', 'back end', 'testing']) {
      const record = records.find((text) => text.includes(`Technology for the ${layer} layer`));
      expect(record).toContain('Proposed');
      expect(record).toContain('Rosetta proposes');
      expect(record).not.toMatch(/layer: (\.net|default)\b/u);
    }
    const questions = plain(files['open-questions.md']);
    expect(questions).toContain('Proposed by Rosetta, not chosen by the owner: Razor Pages');
  });
});

describe('BuildPlan: a desktop application with the default strangler fig', () => {
  it('RF-610 keeps the strangler fig and writes the shared-database seam record when the client uses a database', async () => {
    const h = await seededApiPlan(dataDir, {
      brief: {},
      harness: { scans: new ProposalScans(winFormsFiles, oneStatement) },
    });
    await h.seedScan();

    const files = await h.handoffOf(await h.plan());

    const records = decisionsOf(files);
    const seam = records.find((text) => text.includes('the shared database'));
    expect(seam).toContain('Proposed');
    expect(seam).toContain('no request reaches it');
    expect(records.some((text) => text.includes('Migration strategy: Strangler Fig'))).toBe(true);
    const trd = plain(files['trd.md']);
    expect(trd).toContain('Kind of application: desktop.');
    expect(trd).toContain('Windows Forms on .NET (proposed by Rosetta)');
  });

  it('RF-610 changes the default strategy to a full rewrite, with its reason, when there is no shared database', async () => {
    const h = await seededApiPlan(dataDir, {
      brief: {},
      harness: { scans: new ProposalScans(winFormsFiles) },
    });
    await h.seedScan();

    const files = await h.handoffOf(await h.plan());

    const strategy = decisionsOf(files).find((text) => text.includes('Migration strategy:'));
    expect(strategy).toContain('Full rewrite');
    expect(strategy).toContain('Proposed');
    expect(strategy).toContain('single cut-over');
    const readme = plain(files['README.md']);
    expect(readme.match(/changed the default migration strategy/gu)).toHaveLength(1);
    expect(readme.match(/Rosetta proposed the technology of/gu)).toHaveLength(1);
  });
});

describe('BuildPlan: a desktop application with a strangler fig the owner chose', () => {
  it('RF-610 a strangler fig the owner chose is kept and checks.md lists the misfit', async () => {
    const h = await seededApiPlan(dataDir, {
      brief: { migration: 'strangler-fig' },
      harness: { scans: new ProposalScans(winFormsFiles) },
    });
    await h.seedScan();

    const files = await h.handoffOf(await h.plan());

    expect(plain(files['checks.md'])).toContain('## Migration strategy fit');
    const strategy = decisionsOf(files).find((text) => text.includes('Migration strategy:'));
    expect(strategy).toContain('Strangler Fig');
  });
});

describe('BuildPlan: no readable scan', () => {
  it('RF-609 proposes nothing and the README keeps its line that no technology was chosen', async () => {
    const h = await seededApiPlan(dataDir, { brief: {} });

    const files = await h.handoffOf(await h.plan());

    expect(plain(files['README.md'])).toContain('No technology was chosen');
    expect(plain(files['README.md'])).not.toContain('Rosetta proposed');
  });
});
