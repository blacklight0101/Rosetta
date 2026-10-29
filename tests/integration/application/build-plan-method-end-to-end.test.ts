import type { BuildMethod } from '../../../src/domain/planning/build-method.js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  brokenLinks,
  cardModels,
  frontMatterOf,
  headingsOf,
  readingOrderTargets,
} from '../../support/package-reading.js';
import {
  claudeCodeMethod,
  codexMethod,
  singleFileRun,
  type MethodRun,
} from '../../support/single-file-method-run.js';

// RF-612, RF-635, RF-636, RF-639..RF-643, ADR-008, P6-12: the method end to end. A plan run of a
// single-file application (a bill splitter that is one script) with agents building, once for
// Claude Code and once for Codex, then the package read the way a new agent reads it: AGENTS.md
// first, then orchestration.md, a model on every card, a clean model check and the agent files.
// The understand run is seeded and the planner replays tests/recordings/fake/planner-single-file.json;
// no provider is called.

const tools = [
  {
    name: 'Claude Code',
    method: claudeCodeMethod,
    models: { smallest: 'haiku', middle: 'sonnet', largest: 'opus' },
  },
  {
    name: 'Codex',
    method: codexMethod,
    models: { smallest: 'gpt-small', middle: 'gpt-mid', largest: 'gpt-large' },
  },
] as const;

const agentRoles = [
  'builder-largest',
  'builder-middle',
  'builder-smallest',
  'orchestrator',
  'verifier',
  'verifier-largest',
];

const runs = new Map<string, Promise<MethodRun>>();
function runOf(name: string, method: BuildMethod): Promise<MethodRun> {
  const known = runs.get(name) ?? singleFileRun(method);
  runs.set(name, known);
  return known;
}

describe.each(tools)('the package read first: $name', ({ name, method }) => {
  let run: MethodRun;
  beforeAll(async () => {
    run = await runOf(name, method);
  }, 60_000);

  it('RF-612 ADR-008 the run completes from recorded planner answers only', () => {
    expect(run.endState).toBe('Completed');
    expect(run.providers.length).toBeGreaterThan(0);
    expect(run.providers.every((task) => task.startsWith('planner'))).toBe(true);
  });

  it('RF-640 the README reading order starts with AGENTS.md, then orchestration.md', () => {
    expect(readingOrderTargets(run.files).slice(0, 3)).toEqual([
      'AGENTS.md',
      'orchestration.md',
      'prd.md',
    ]);
  });

  it('RF-640 AGENTS.md starts with the start-here index that sends the agent to orchestration.md and the cards', () => {
    const headings = headingsOf(run.files['AGENTS.md']);
    expect(headings[0]).toBe('AGENTS.md');
    expect(headings[1]).toBe('Start here');
    const start = (run.files['AGENTS.md'] ?? '').split('\n## ')[1] ?? '';
    expect(start).toContain('](orchestration.md)');
    expect(start).toContain('](tasks.md)');
  });

  it('RF-640 orchestration.md holds the roles, bands, retry ladder, gates, throttle, escalation and budgets', () => {
    const headings = headingsOf(run.files['orchestration.md']);
    expect(headings).toEqual(
      expect.arrayContaining([
        'Roles',
        'Bands and models',
        'Retry ladder',
        'Merge rules',
        'Human gates',
        'Usage throttle',
        'Escalation and stop conditions',
        'Size budgets of living files',
      ]),
    );
    expect(headings.indexOf('Roles')).toBeLessThan(headings.indexOf('Bands and models'));
    expect(headings.indexOf('Bands and models')).toBeLessThan(headings.indexOf('Retry ladder'));
    // RF-644 (P6-13): when the lessons section exists it comes after the build protocol.
    const lessons = headings.indexOf('Lessons from running a build');
    expect(lessons < 0 || lessons > headings.indexOf('Roles')).toBe(true);
  });
});

describe.each(tools)('the models of each card: $name', ({ name, method, models }) => {
  let run: MethodRun;
  beforeAll(async () => {
    run = await runOf(name, method);
  }, 60_000);

  it(`RF-639 the band table of orchestration.md names the models of ${name}`, () => {
    const text = run.files['orchestration.md'] ?? '';
    for (const model of Object.values(models)) expect(text).toContain(model);
  });

  it('RF-639 RF-635 every card carries a model of its tier and a verifier line', () => {
    const cards = cardModels(run.files);
    expect(cards.length).toBeGreaterThanOrEqual(3);
    const allowed = new Set<string>(Object.values(models));
    for (const card of cards) {
      expect(allowed.has(card.model), `${card.id} names ${card.model}`).toBe(true);
      expect(card.model).toBe(models[card.tier as keyof typeof models]);
    }
    const tasks = run.files['tasks.md'] ?? '';
    expect(tasks.match(/^Verifier: /gmu)).toHaveLength(cards.length);
    expect(tasks.match(/^Risk class: /gmu)).toHaveLength(cards.length);
  });

  it('RF-635 the money card is rated 9 and built by the largest tier; no risky card is below the middle tier', () => {
    const cards = cardModels(run.files);
    const money = cards.find((card) => card.rating === 9 && card.tier === 'largest');
    expect(money).toBeDefined();
    expect(cards.every((card) => card.tier !== 'smallest')).toBe(true);
  });

  it('RF-641 the model check is clean: checks.md lists no finding about the model of a card', () => {
    const checks = run.files['checks.md'] ?? '';
    expect(checks).not.toContain('## Model of each card');
    expect(checks).not.toContain('model is not one of');
    expect(checks).not.toContain('no model is named');
  });
});

describe.each(tools)('operations, agent files and links: $name', ({ name, method }) => {
  let run: MethodRun;
  beforeAll(async () => {
    run = await runOf(name, method);
  }, 60_000);

  it('RF-636 AGENTS.md operations section holds the needs-owner and task-list rules', () => {
    const agents = (run.files['AGENTS.md'] ?? '').replaceAll('\\', '');
    expect(headingsOf(agents)).toContain('Operations');
    const operations = agents.split('## Operations')[1]?.split('\n## ')[0] ?? '';
    expect(operations).toContain('`needs-owner`');
    expect(operations).toMatch(/never edits? the task list/iu);
  });

  it('RF-642 DEC-60 the agents folder holds no hook, command or plugin file', () => {
    const paths = Object.keys(run.files).filter((path) => path.startsWith('agents/'));
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path).toMatch(/^agents\/[A-Za-z-]+\.md$/u);
      expect(path).not.toMatch(/hook|command|plugin|settings/iu);
    }
    expect(Object.keys(run.files).some((path) => /^\.claude|^\.codex/u.test(path))).toBe(false);
  });

  it('RF-612 every link between the files of the package resolves', () => {
    expect(brokenLinks(run.files)).toEqual([]);
  });

  it('RF-642 no escalation definition without a named escalation model', () => {
    expect(Object.keys(run.files)).not.toContain('agents/escalation.md');
  });
});

describe('the agent files of Claude Code', () => {
  const roles = agentRoles;

  it('RF-642 Claude Code: one definition per role with front matter and the model of its tier', async () => {
    const { files } = await runOf('Claude Code', claudeCodeMethod);

    expect(
      Object.keys(files)
        .filter((path) => path.startsWith('agents/'))
        .sort(),
    ).toEqual(['agents/README.md', ...roles.map((role) => `agents/${role}.md`).sort()]);
    const modelOf = (role: string): string | undefined =>
      frontMatterOf(files[`agents/${role}.md`])
        ?.find((line) => line.startsWith('model:'))
        ?.replace(/^model:\s*"?|"?$/gu, '');
    expect(modelOf('builder-smallest')).toBe('haiku');
    expect(modelOf('builder-middle')).toBe('sonnet');
    expect(modelOf('builder-largest')).toBe('opus');
    expect(modelOf('verifier')).toBe('sonnet');
    expect(modelOf('verifier-largest')).toBe('opus');
    expect(modelOf('orchestrator')).toBe('opus');
    expect(files['agents/README.md']).toContain('.claude/agents/');
  });
});

describe('the agent files of Codex and the reading order', () => {
  const roles = agentRoles;

  it('RF-642 Codex: plain role prompts with no front matter, the models listed in the note', async () => {
    const { files } = await runOf('Codex', codexMethod);

    for (const role of roles) {
      const text = files[`agents/${role}.md`];
      expect(text).toBeDefined();
      expect(frontMatterOf(text)).toBeUndefined();
      expect(text).toContain('orchestration.md');
    }
    const note = files['agents/README.md'] ?? '';
    for (const model of ['gpt-small', 'gpt-mid', 'gpt-large']) expect(note).toContain(model);
    expect(note).toMatch(/nothing here installs/iu);
  });

  it('RF-642 the role prompts read the package in the order AGENTS.md, orchestration.md, conventions.md, the card', async () => {
    const { files } = await runOf('Claude Code', claudeCodeMethod);

    const builder = (files['agents/builder-middle.md'] ?? '').split('\n---\n').at(-1) ?? '';
    const order = ['AGENTS.md', 'orchestration.md', 'conventions.md', 'tasks.md'].map((name) =>
      builder.indexOf(name),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
