import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { shippedCatalogue } from '../../support/planning-brief-harness.js';

// RF-601..RF-604, RNF-004, ADR-005, ADR-008, DEC-80: a plan run over a seeded understand run, the
// planner replaying tests/recordings/fake/planner-package.json.

const briefAnswers = {
  architecture: { style: 'hexagonal' },
  migration: 'parallel-change',
  stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
} as const;

function holding(files: Readonly<Record<string, string>>, pattern: RegExp): string[] {
  return Object.entries(files)
    .filter(([, text]) => pattern.test(text))
    .map(([path]) => path);
}

function plain(text: string): string {
  return text.replaceAll('\\', '');
}

let dataDir: string;
let h: PlanHarness;

async function harness(recording?: Parameters<typeof createPlanHarness>[1]): Promise<PlanHarness> {
  const replayed =
    recording ?? (await loadRecording(join('tests', 'recordings', 'fake', 'planner-package.json')));
  return createPlanHarness(dataDir, replayed);
}

async function seeded(): Promise<void> {
  const run = await h.understandRun({ cards: planCards(), questions: planQuestions });
  await h.answer(run, [{ cardId: 'OQ-001', answer: 'Only a manager may cancel a paid order.' }]);
  await h.saveBrief(briefAnswers);
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-'));
  h = await harness();
});

afterEach(() => rm(dataDir, { recursive: true, force: true }));

describe('BuildPlan: what the planner is sent', () => {
  it('RF-604 sends the planner only the supported claims and the answered questions', async () => {
    await seeded();

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const [request] = h.providers.requests();
    const message = request?.messages.map((each) => each.content).join('\n') ?? '';
    expect(message).toContain('Checkout creates an order from the basket.');
    expect(message).toContain('Only a manager may cancel a paid order.');
    expect(message).toContain('src/Orders/Checkout.cs:3-9');
    for (const left of [
      'emails the warehouse',
      'keeps the card number',
      'Staff export',
      'refund',
    ]) {
      expect(message).not.toContain(left);
    }
    expect(request?.system).toBe(await readFile('prompts/planner/package.v9.md', 'utf8'));
    expect(request?.context.role).toBe('planner');
  });

  it('RF-621 RF-604 sends the PRD call the same supported claims and the PRD prompt', async () => {
    await seeded();

    await h.plan();

    const request = h.providers.requests()[1];
    const message = request?.messages.map((each) => each.content).join('\n') ?? '';
    expect(message).toContain('Checkout creates an order from the basket.');
    expect(message).toContain('Only a manager may cancel a paid order.');
    for (const left of ['emails the warehouse', 'keeps the card number', 'Staff export']) {
      expect(message).not.toContain(left);
    }
    expect(request?.system).toBe(await readFile('prompts/planner/prd.v4.md', 'utf8'));
    expect(request?.context).toMatchObject({ role: 'planner', agentTaskId: 'planner-prd' });
  });
});

describe('BuildPlan: the open questions of the package', () => {
  it('RF-604 lists the rejected, invalid and unverified claims as excluded with their ids', async () => {
    await seeded();
    const files = await h.handoffOf(await h.plan());

    const left = files['claims-left-out.md'] ?? '';
    expect(left).toMatch(/^\| FEAT-001\.c2 .*\| Rejected \|$/mu);
    expect(left).toMatch(/^\| ENT-001\.c2 .*\| CitationInvalid \|$/mu);
    expect(left).toMatch(/^\| FEAT-002\.c1 .*\| Unverified \|$/mu);
    expect(left).toMatch(/^\| OQ-002\.c1 .*\| Proposed \|$/mu);
    expect(left).not.toContain('FEAT-001.c1');
    expect(files['open-questions.md']).toContain('4 claims were left out');
  });

  it('RF-604 lists each brief question that took its default, with that default', async () => {
    await seeded();

    const files = await h.handoffOf(await h.plan());

    const questions = plain(files['open-questions.md'] ?? '');
    expect(questions).toContain(
      '| Which technology should the language and runtime layer use? | stack.language-runtime | None chosen; the package names no technology for this layer. |',
    );
    expect(questions).toContain(
      '| buildMethod | No; the package has no AI-assisted build method. |',
    );
    expect(questions).toContain(
      '| context.deadline | Not stated; the roadmap assumes nothing about it. |',
    );
    expect(questions).toMatch(/\| principles \| The catalogue defaults: .*SOLID/u);
    expect(questions).not.toContain('| migration |');
    expect(questions).not.toContain('| stack.database |');
    expect(questions).toContain('- OQ-002: Does a cancelled order refund the customer on its own?');
    expect(questions).not.toContain('- OQ-001');
  });
});

describe('BuildPlan: the run manifest', () => {
  it('RF-604 RNF-004 the manifest records the brief, the catalogue version and sha and the prompt versions', async () => {
    await seeded();

    const manifest = await h.manifestOf(await h.plan());
    expect(manifest.brief).toMatchObject({ ...briefAnswers, savedAt: '2026-10-12T09:30:00.000Z' });
    const { version, sha256 } = shippedCatalogue;
    expect(manifest.catalogue).toEqual({ version, sha256 });
    const sha = async (name: string): Promise<string> =>
      createHash('sha256')
        .update(await readFile(`prompts/planner/${name}`))
        .digest('hex');
    expect(manifest.promptVersions).toEqual({
      'planner/package.v9.md': { version: 'v9', sha256: await sha('package.v9.md') },
      'planner/continue.v1.md': { version: 'v1', sha256: await sha('continue.v1.md') },
      'planner/prd.v4.md': { version: 'v4', sha256: await sha('prd.v4.md') },
      'planner/data-model.v4.md': { version: 'v4', sha256: await sha('data-model.v4.md') },
      'planner/flows.v2.md': { version: 'v2', sha256: await sha('flows.v2.md') },
      'planner/api-contract.v1.md': { version: 'v1', sha256: await sha('api-contract.v1.md') },
      'planner/ux.v1.md': { version: 'v1', sha256: await sha('ux.v1.md') },
      'planner/coverage.v1.md': { version: 'v1', sha256: await sha('coverage.v1.md') },
      'planner/gap.v1.md': { version: 'v1', sha256: await sha('gap.v1.md') },
      'planner/gap-repair.v1.md': { version: 'v1', sha256: await sha('gap-repair.v1.md') },
      'planner/plan-repair.v1.md': { version: 'v1', sha256: await sha('plan-repair.v1.md') },
    });
    expect(manifest.roles['planner']?.modelVersion).toBe('fake-model-2026-10-01');
    expect(manifest.source.commitSha).toBe('3f786850e387550fdab836ed7e6dc881de23001b');
    expect(manifest.codemapHash).toBe(`sha256:${'ab'.repeat(32)}`);
  });
});

describe('BuildPlan: the parts of the package', () => {
  it('RF-601 the package holds every part, and the README reading order links each file', async () => {
    await seeded();

    const files = await h.handoffOf(await h.plan());

    expect(Object.keys(files).sort()).toEqual([
      'README.md',
      'architecture.md',
      'checks.md',
      'claims-left-out.md',
      'conventions.md',
      'data-model.md',
      ...[1, 2, 3, 4].map((n) => `decisions/ADR-00${String(n)}.md`),
      'entity-mapping.md',
      'fixtures.md',
      'flows/README.md',
      'open-questions.md',
      'prd.md',
      'requirements.md',
      'risks.md',
      'roadmap.md',
      'sources.md',
      'tasks.md',
      'trd.md',
      'ux/README.md',
    ]);
    const links = [...(files['README.md'] ?? '').matchAll(/\]\(([^)#]+)\)/gu)].map((m) => m[1]);
    expect(links).toHaveLength(Object.keys(files).length - 1);
    for (const link of links) expect(Object.keys(files)).toContain(link);
  });

  it('RF-601 the roadmap has phases with exit criteria and every task card has acceptance criteria', async () => {
    await seeded();

    const files = await h.handoffOf(await h.plan());

    const roadmap = plain(files['roadmap.md'] ?? '');
    expect(roadmap.match(/^## Phase \d+$/gmu)).toHaveLength(2);
    expect(roadmap.match(/^Exit criteria:$/gmu)).toHaveLength(2);
    const tasks = plain(files['tasks.md'] ?? '');
    const cards = tasks.split(/^## /mu).slice(1);
    expect(cards.map((card) => card.split('\n')[0])).toEqual(['T-001', 'T-002', 'T-003']);
    for (const card of cards) expect(card).toMatch(/Acceptance criteria:\n\n- Given /u);
    expect(tasks).toContain('Requirements: [REQ-001](requirements.md#req-001), [REQ-002]');
    expect(tasks).toContain('Requirements: [REQ-003](requirements.md#req-003)');
  });
});

describe('BuildPlan: traced and tool-agnostic', () => {
  it('RF-602 every requirement names supported source cards, and each lists its citations', async () => {
    await seeded();

    const files = await h.handoffOf(await h.plan());

    const requirements = plain(files['requirements.md'] ?? '')
      .split(/^## /mu)
      .slice(1);
    expect(requirements.map((each) => each.split('\n')[0])).toEqual([
      'REQ-001',
      'REQ-002',
      'REQ-003',
    ]);
    const sources = plain(files['sources.md'] ?? '');
    for (const requirement of requirements) {
      const cited = [...requirement.matchAll(/\[([A-Z]+-\d+)\]\(sources\.md#([a-z]+-\d+)\)/gu)];
      expect(cited.length).toBeGreaterThan(0);
      for (const [, id] of cited) expect(sources).toMatch(new RegExp(`^## ${String(id)}$`, 'mu'));
    }
    expect(plain(files['requirements.md'] ?? '')).not.toMatch(/FEAT-002|XYZ-999|Export orders/u);
    expect(sources).toContain(
      'FEAT-001.c1: Checkout creates an order from the basket. Citations: src/Orders/Checkout.cs:3-9',
    );
    expect(sources).not.toContain('## FEAT-002');
  });

  it('RF-603 the package is plain Markdown and Mermaid, with no HTML and no Rosetta syntax', async () => {
    await seeded();

    const files = await h.handoffOf(await h.plan());

    expect(Object.keys(files).filter((path) => !path.endsWith('.md'))).toEqual([]);
    expect(holding(files, /(?<!\\)<[A-Za-z!/?]/u)).toEqual([]);
    expect(holding(files, /(?<!\\)\]\((?!https:\/\/)[a-z]+:/u)).toEqual([]);
    expect(holding(files, /ROSETTA-DATA|\{\{|\[\[|^---$/mu)).toEqual([]);
    expect(holding(files, /^```(?!(mermaid)?$)/mu)).toEqual([]);
    expect(files['architecture.md']).toContain('```mermaid\nflowchart LR\n');
    expect(files['requirements.md']).toContain('\\<script>');
  });
});

describe('BuildPlan: runs that cannot plan', () => {
  it('RF-604 a project without a saved brief ends Failed with RST-1801 before any call', async () => {
    await h.understandRun({ cards: planCards(), questions: planQuestions });

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.providers.requests()).toHaveLength(0);
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1801' }));
    expect(await h.handoffOf(run)).toEqual({});
  });

  it('RF-604 a project without a completed understand run ends Failed with RST-1802', async () => {
    await h.understandRun({ cards: planCards(), endState: 'Interrupted' });
    await h.saveBrief(briefAnswers);

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.providers.requests()).toHaveLength(0);
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1802' }));
  });

  it('RF-602 an answer whose requirements name no supported card ends Failed with RST-1803', async () => {
    h = await harness(
      recordingOf({
        retried: [],
        response: {
          text: '{"requirements": [{"title": "Export", "statement": "Export a day.", "sources": ["FEAT-002"]}]}',
          toolCalls: [],
          usage: {
            inputTokens: 10,
            outputTokens: 10,
            cachedInputTokens: 0,
            usageSource: 'reported',
          },
          finishReason: 'stop',
        },
      }),
    );
    await seeded();
    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1803' }));
    expect(await h.handoffOf(run)).toEqual({});
  });
});
