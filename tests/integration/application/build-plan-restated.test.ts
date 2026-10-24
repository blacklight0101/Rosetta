import { readFile } from 'node:fs/promises';
import { loadPlannerPrompt } from '../../../src/infrastructure/prompts/prompt-files.js';
import { describe, expect, it } from 'vitest';
import { decisionsOf, packageOf, plain } from '../../support/plan-method-harness.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { draftTask } from '../../support/task-card-fixtures.js';

// RF-608, RF-609, RF-610: a decision the brief records is not written twice. Real packages written
// from planner answers the planner could give, replayed by the fake provider.

const usage = {
  inputTokens: 10,
  outputTokens: 10,
  cachedInputTokens: 0,
  usageSource: 'reported',
} as const;

function decision(title: string, sources: string[], text = 'It is decided.'): object {
  return { title, context: 'Why.', decision: text, consequences: 'So.', sources };
}

/** The planner's answer: these decisions, and one environment per position in `links`. */
function recordingWith(decisions: object[], links: number[] = []) {
  const text = JSON.stringify({
    summary: 'A web shop that replaces the legacy one.',
    requirements: [
      { title: 'Place an order', statement: 'A customer orders.', sources: ['FEAT-001'] },
    ],
    components: [{ name: 'Order service', responsibility: 'Stores orders.', dependsOn: [] }],
    decisions,
    phases: [{ name: 'Orders', goal: 'Orders move.', exitCriteria: ['Orders run.'] }],
    tasks: [draftTask({ title: 'Orders' })],
    technical: {
      environments: links.map((at, index) => ({
        ...{ name: `Environment ${String(index + 1)}`, purpose: 'Runs the build.' },
        decision: at,
      })),
    },
  });
  const reply = (answer: string) => ({
    retried: [],
    response: { text: answer, toolCalls: [], usage, finishReason: 'stop' as const },
  });
  return recordingOf(reply(text), reply('No PRD.'), reply('No data model.'), reply('No flows.'));
}

const layered = { architecture: { style: 'layered' }, migration: 'strangler-fig' } as const;

function titlesOf(files: Awaited<ReturnType<typeof packageOf>>): string[] {
  return decisionsOf(files).map(([, text]) => /^# (?:ADR-\d+: )?(.+)$/mu.exec(text)?.[1] ?? '');
}

describe('RF-608 a decision the brief records is written once', () => {
  it('RF-608 a recorded "Adopt layered architecture" with no source is left out of the records, links move and checks.md lists it', async () => {
    const files = await packageOf(
      layered,
      recordingWith(
        [
          decision('Adopt layered architecture', []),
          decision('Deliver email through a queue', []),
          decision('Keep prices in cents', ['BR-001']),
        ],
        [1, 2, 3],
      ),
    );

    expect(decisionsOf(files).map(([path]) => path)).toEqual([
      'decisions/ADR-001.md',
      'decisions/ADR-002.md',
      'decisions/ADR-003.md',
      'decisions/ADR-004.md',
    ]);
    const titles = titlesOf(files);
    expect(titles.join('\n')).not.toContain('Adopt layered architecture');
    expect(titles.join('\n')).toContain('Deliver email through a queue');
    expect(titles.join('\n')).toContain('Keep prices in cents');
    expect(titles.join('\n')).toContain('Architecture style: Layered (N-tier)');
    const checks = plain(files['checks.md']);
    expect(checks).toContain('## Decisions the brief already records');
    expect(checks).toContain('- Adopt layered architecture: see [ADR-003](decisions/ADR-003.md)');
    expect(checks).not.toContain('Deliver email');
    const trd = plain(files['trd.md']);
    expect(trd).toContain('Environment 1');
    expect(trd).toContain('[ADR-003](decisions/ADR-003.md)');
  });
});

describe('RF-608 a decision that is more than the brief says stays', () => {
  it('RF-608 a decision with sources that mentions the style and one on email delivery stay, and checks.md lists nothing', async () => {
    const files = await packageOf(
      layered,
      recordingWith([
        decision('Adopt layered architecture', ['BR-001']),
        decision('Deliver email by SMTP', []),
      ]),
    );

    const titles = titlesOf(files).join(' | ');
    expect(titles).toContain('Adopt layered architecture');
    expect(titles).toContain('Deliver email by SMTP');
    expect(plain(files['checks.md'])).not.toContain('Decisions the brief already records');
  });
});

describe('RF-610 RF-609 the migration and the stack are written once', () => {
  it('RF-610 RF-609 a restated migration strategy and a restated technology leave one record each', async () => {
    const stack = [{ layer: 'database', choice: 'PostgreSQL 17', custom: false }] as const;

    const files = await packageOf(
      { ...layered, stack },
      recordingWith([
        decision('Migration by strangler-fig', []),
        decision('Use PostgreSQL for storage', []),
      ]),
    );

    const titles = titlesOf(files);
    expect(titles.filter((title) => title.includes('Strangler'))).toHaveLength(1);
    expect(titles.join(' | ')).not.toContain('Use PostgreSQL for storage');
    const checks = plain(files['checks.md']);
    expect(checks).toContain('- Use PostgreSQL for storage: see [ADR-002]');
    expect(checks).toContain('- Migration by strangler-fig: see [ADR-003]');
  });
});

describe('RF-608 the planner prompt says the brief already has its records', () => {
  it('RF-608 RNF-004 the planner prompt the run loads is package.v9.md at version v9', async () => {
    const file = await loadPlannerPrompt('prompts');

    expect(file).toMatchObject({ name: 'planner/package.v9.md', version: 'v9' });
  });

  it('RF-608 package.v9.md tells the planner not to write the brief choices again', async () => {
    const prompt = await readFile('prompts/planner/package.v9.md', 'utf8');

    expect(prompt).toContain('already has a decision record');
    expect(prompt).toContain('architecture style');
    expect(prompt).toContain('migration strategy');
    expect(prompt).toContain('technology');
    expect(prompt).toContain('decisions the cards make necessary');
  });
});
