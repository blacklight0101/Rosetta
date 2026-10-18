import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import type { Recording } from '../../../src/infrastructure/providers/fake/recording.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';

// RF-620, RF-621, RF-602, DEC-80: the documentation set of a plan run and its PRD, over a seeded
// understand run, real files and the planner replaying tests/recordings/fake/planner-package.json
// (its second call is the PRD). The package is checked by its structure.

let dataDir: string;
let h: PlanHarness;

const recordingPath = join('tests', 'recordings', 'fake', 'planner-package.json');

async function planned(recording?: Recording): Promise<Readonly<Record<string, string>>> {
  h = await createPlanHarness(dataDir, recording ?? (await loadRecording(recordingPath)));
  const run = await h.understandRun({ cards: planCards(), questions: planQuestions });
  await h.answer(run, [{ cardId: 'OQ-001', answer: 'Only a manager may cancel a paid order.' }]);
  await h.saveBrief({ architecture: { style: 'hexagonal' }, migration: 'parallel-change' });
  return h.handoffOf(await h.plan());
}

/** The text as a reader sees it: the escaper's backslashes removed. */
function plain(text: string | undefined): string {
  return (text ?? '').replaceAll('\\', '');
}

/** The sections of prd.md by their heading. */
function sectionsOf(prd: string | undefined): Record<string, string> {
  const parts = plain(prd).split(/^## /mu).slice(1);
  return Object.fromEntries(parts.map((part) => [part.split('\n')[0] ?? '', part]));
}

/** The anchors a viewer gives the headings of a file. */
function anchorsOf(text: string): string[] {
  return [...text.matchAll(/^#+ (.+)$/gmu)].map((match) =>
    (match[1] ?? '')
      .toLowerCase()
      .replaceAll(/[^\w\s-]/gu, '')
      .replaceAll(' ', '-'),
  );
}

/** The links of a file that point at no file of the package or at a heading it lacks. */
function brokenLinks(
  files: Readonly<Record<string, string>>,
  path: string,
  text: string,
): string[] {
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  return [...text.matchAll(/\]\(([^)#:]+)(?:#([^)]+))?\)/gu)].flatMap(([, target, anchor]) => {
    const resolved = join(folder, target ?? '').replaceAll('\\', '/');
    const file = files[resolved];
    const found = file !== undefined && (anchor === undefined || anchorsOf(file).includes(anchor));
    return found ? [] : [`${path} -> ${resolved}#${anchor ?? ''}`];
  });
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-prd-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('BuildPlan: the product requirements document', () => {
  it('RF-621 prd.md holds the features by priority, each linked to its FEAT cards', async () => {
    const files = await planned();

    const features = sectionsOf(files['prd.md'])['Features'] ?? '';
    const lines = features.split('\n').filter((line) => line.startsWith('- '));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('**Must**');
    expect(lines[0]).toContain('Place an order');
    expect(lines[0]).toContain('[FEAT-001](sources.md#feat-001)');
    expect(lines[0]).not.toContain('BR-001');
    expect(lines[1]).toContain('**Should**');
    expect(features).not.toContain('Export orders');
    expect(features).not.toContain('FEAT-002');
  });

  it('RF-621 the business rules keep only BR cards and are linked to them', async () => {
    const files = await planned();

    const rules = sectionsOf(files['prd.md'])['Business rules to keep'] ?? '';
    const lines = rules.split('\n').filter((line) => line.startsWith('- '));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Orders over 50 ship free.');
    expect(lines[0]).toContain('[BR-001](sources.md#br-001)');
    expect(rules).not.toContain('Every order is audited');
  });

  it('RF-621 the problem and the goal come from the cards and the out-of-scope item cites its card', async () => {
    const sections = sectionsOf((await planned())['prd.md']);

    expect(sections['Problem']).toContain('[BR-001](sources.md#br-001)');
    expect(sections['Goal']).toContain('beside the old one');
    expect(sections['Out of scope']).toContain('[OQ-001](sources.md#oq-001)');
  });
});

describe('BuildPlan: the PRD placeholders', () => {
  it('RF-621 DEC-80 a section the cards cannot fill holds a marked placeholder and an open question with its default', async () => {
    const files = await planned();

    const sections = sectionsOf(files['prd.md']);
    for (const name of ['Users and roles', 'Non-functional expectations', 'Success measures']) {
      expect(sections[name]).toContain('To be confirmed');
    }
    const questions = plain(files['open-questions.md']);
    expect(questions).toContain('## Product requirements document questions');
    for (const id of ['prd.roles', 'prd.non-functional', 'prd.success-measures']) {
      expect(questions).toMatch(
        new RegExp(`\\| ${id.replace('.', '\\.')} \\| [^|]+ \\| [^|]+ \\|`, 'u'),
      );
    }
    expect(questions).not.toContain('| prd.goal |');
    expect(questions).not.toContain('| prd.features |');
  });

  it('RF-602 RF-621 no statement of the PRD lacks a source card link or a placeholder marker', async () => {
    const files = await planned();

    const statements = plain(files['prd.md'])
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'));
    expect(statements.length).toBeGreaterThan(5);
    for (const line of statements) {
      expect(line).toMatch(/\]\(sources\.md#[a-z]+-\d+\)|To be confirmed/u);
    }
  });
});

describe('BuildPlan: untrusted and unreadable PRD answers', () => {
  it('RF-603 hostile PRD text shows as text', async () => {
    const files = await planned();

    const prd = files['prd.md'] ?? '';
    expect(prd).not.toMatch(/<[A-Za-z!/?]/u);
    expect(prd).not.toContain('](javascript');
    expect(prd).not.toMatch(/^# Title/mu);
    expect(prd).toContain('&lt;script&gt;');
  });

  it('RF-621 an unreadable PRD answer still completes the run, with every section a placeholder', async () => {
    const base = await loadRecording(recordingPath);
    const unreadable = recordingOf({
      retried: [],
      response: {
        text: 'No PRD today.',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 10, cachedInputTokens: 0, usageSource: 'reported' },
        finishReason: 'stop',
      },
    });
    const recording = { ...base, calls: [...base.calls.slice(0, 1), ...unreadable.calls] };

    const files = await planned(recording);

    const sections = sectionsOf(files['prd.md']);
    expect(Object.keys(sections)).toHaveLength(8);
    for (const section of Object.values(sections)) expect(section).toContain('To be confirmed');
    expect(h.s.logger.entries).toContainEqual(
      expect.objectContaining({ level: 'warn', logger: 'plan' }),
    );
    expect(plain(files['open-questions.md'])).toContain('| prd.goal |');
  });
});

describe('BuildPlan: the documentation set', () => {
  it('RF-408 RF-621 the plan call and the PRD call carry distinct call ids', async () => {
    await planned();

    const ids = h.providers.requests().map((request) => request.context.callId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('RF-620 the README reading order starts with the PRD, then the parts of RF-601', async () => {
    const files = await planned();

    const order = (files['README.md'] ?? '').split('## Reading order')[1]?.split('\n## ')[0] ?? '';
    const links = [...order.matchAll(/\]\(([^)#]+)\)/gu)].map((match) => match[1]);
    expect(links.slice(0, 4)).toEqual([
      'prd.md',
      'requirements.md',
      'architecture.md',
      'decisions/ADR-001.md',
    ]);
    expect(links.slice(-5)).toEqual([
      'roadmap.md',
      'tasks.md',
      'risks.md',
      'open-questions.md',
      'sources.md',
    ]);
  });

  it('RF-620 every listed file exists and every link of every file resolves to a file and a heading', async () => {
    const files = await planned();

    expect(Object.keys(files)).toContain('prd.md');
    const broken = Object.entries(files).flatMap(([path, text]) => brokenLinks(files, path, text));
    expect(broken).toEqual([]);
  });

  it('RF-620 RF-602 a feature states the package requirement and the source card it comes from', async () => {
    const files = await planned();

    const features = sectionsOf(files['prd.md'])['Features'] ?? '';
    const placed = features.split('\n').find((line) => line.includes('Place an order')) ?? '';
    expect(placed).toContain('[REQ-001](requirements.md#req-001)');
    expect(placed).toContain('[FEAT-001](sources.md#feat-001)');
  });
});
