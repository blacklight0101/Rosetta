import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadRecording,
  type Recording,
} from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { fakeOpenAiKey } from '../../support/secret-fixture.js';
import {
  customerCard,
  entityCardSaying,
  planCards,
  planQuestions,
} from '../../support/plan-cards.js';

// RF-623, RF-603, RF-601, ADR-008: the data model of the hand-off package from a plan run over a
// seeded understand run with two ENT cards, real files in a temporary data folder and the real
// provider factory. The planner's second call replays the data model in
// tests/recordings/fake/planner-package.json.

const recordingPath = join('tests', 'recordings', 'fake', 'planner-package.json');
const briefAnswers = {
  architecture: { style: 'hexagonal' },
  migration: 'parallel-change',
  stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
} as const;

/** The text as a reader sees it: the escaper's backslashes removed. */
function plain(text: string): string {
  return text.replaceAll('\\', '');
}

let dataDir: string;

async function seeded(
  recording?: Recording,
  options: Parameters<typeof createPlanHarness>[2] = {},
): Promise<PlanHarness> {
  const replayed = recording ?? (await loadRecording(recordingPath));
  const h = await createPlanHarness(dataDir, replayed, options);
  await h.understandRun({ cards: [...planCards(), customerCard()], questions: planQuestions });
  await h.saveBrief(briefAnswers);
  return h;
}

async function modelFile(h: PlanHarness): Promise<string> {
  const files = await h.handoffOf(await h.plan());
  return plain(files['data-model.md'] ?? '');
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-model-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('BuildPlan: what the data model call is sent', () => {
  it('RF-623 sends the supported ENT claims with their ids, the entity mapping and the database', async () => {
    const h = await seeded();

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const request = h.providers.requests()[2];
    const message = request?.messages.map((each) => each.content).join('\n') ?? '';
    for (const sent of [
      'ENT-001.c1',
      'An order has lines and a status.',
      'ENT-002.c2',
      'A customer has a loyalty tier.',
      '"database": "PostgreSQL"',
      'src/Orders/Customer.cs:3-9',
    ]) {
      expect(message).toContain(sent);
    }
    for (const left of ['keeps the card number', 'Checkout creates', 'Staff export']) {
      expect(message).not.toContain(left);
    }
    expect(request?.system).toBe(await readFile('prompts/planner/data-model.v3.md', 'utf8'));
    expect(request?.context).toMatchObject({ role: 'planner', agentTaskId: 'planner-data-model' });
    const callIds = h.providers.requests().map((each) => each.context.callId);
    expect(new Set(callIds).size).toBe(3);
  });

  it('RF-623 without a supported ENT claim the data model is not asked for and the file says so', async () => {
    const h = await createPlanHarness(dataDir, await loadRecording(recordingPath));
    await h.understandRun({
      cards: planCards().filter((card) => card.type !== 'ENT'),
      questions: planQuestions,
    });
    await h.saveBrief(briefAnswers);

    const text = await modelFile(h);

    expect(h.providers.requests()).toHaveLength(2);
    expect(text).toContain('no legacy entity');
  });
});

describe('BuildPlan: data-model.md', () => {
  it('RF-623 lists each table with columns, types, keys, constraints and indexes', async () => {
    const text = await modelFile(await seeded());

    expect(text).toContain('Database: **PostgreSQL**');
    expect(text.match(/^### /gmu)).toHaveLength(2);
    expect(text).toContain('### customer\n');
    expect(text).toContain('### customer_order\n');
    expect(text).toContain(
      '| email | varchar(200) | no | [ENT-002](sources.md#ent-002) ENT-002.c1: Email |',
    );
    expect(text).toContain('| total | numeric(10,2) | no | new |');
    expect(text).toContain('- Primary key: id\n');
    expect(text).toContain('- Unique: email\n');
    expect(text).toContain('- Foreign key: customer_id references customer (id)\n');
    expect(text).toContain('- Check: total is zero or more\n');
    expect(text).toContain('- Index on customer_id: Orders are listed by customer.\n');
  });
});

describe('BuildPlan: data-model.md and the legacy fields', () => {
  it('RF-623 every supported ENT claim is mapped to a column or listed as dropped', async () => {
    const text = await modelFile(await seeded());

    const mentioned = new Set(text.match(/ENT-\d+\.c\d+/gu));
    expect([...mentioned].sort()).toEqual([
      'ENT-001.c1',
      'ENT-002.c1',
      'ENT-002.c2',
      'ENT-002.c3',
      'ENT-002.c4',
    ]);
    const dropped = text.split('## Dropped legacy fields\n')[1]?.split('## ')[0] ?? '';
    expect(dropped).toContain('| Fax | ENT-002.c3 |');
    expect(dropped).toContain('The new system contacts customers by email only.');
    expect(dropped).toMatch(/\| not named \| ENT-002\.c4 \| .* no target column/u);
    expect(dropped).not.toContain('Ghost');
  });

  it('RF-623 a column whose legacy claim the verifier did not support is new, not claimed', async () => {
    const text = await modelFile(await seeded());

    expect(text).toContain('| card_number | varchar(19) | yes | new |');
    expect(text).not.toContain('ENT-001.c2');
  });

  it('RF-623 lists the type changes that can lose data as migration risks', async () => {
    const text = await modelFile(await seeded());

    const risks = text.split('## Migration risks\n')[1] ?? '';
    expect(risks).toContain('- customer.loyalty_tier ([ENT-002](sources.md#ent-002) ENT-002.c2)');
    expect(risks).toContain('- customer_order.status ([ENT-001](sources.md#ent-001) ENT-001.c1)');
    expect(risks.match(/^- /gmu)).toHaveLength(2);
  });
});

describe('BuildPlan: data-model.md diagram and safety', () => {
  it('RF-623 the diagram is generated by code from the checked tables', async () => {
    const text = await modelFile(await seeded());

    const diagram = text.split('```mermaid\n')[1]?.split('```')[0] ?? '';
    expect(diagram.split('\n')[0]).toBe('erDiagram');
    expect(diagram).toContain('e1["customer"]');
    expect(diagram).toMatch(/^ {2}e2 \}o--\|\| e1 : "customer#95;id"$/mu);
    expect(diagram).not.toContain('ghost');
  });

  it('RF-603 holds no executable DDL, nothing from the hostile recording and only the diagram fence', async () => {
    const h = await seeded();
    const files = await h.handoffOf(await h.plan());

    const text = files['data-model.md'] ?? '';
    expect(text.match(/^```.*$/gmu)).toEqual(['```mermaid', '```']);
    expect(Object.values(files).join('\n')).not.toMatch(
      /\b(?:create|alter|drop)\s+(?:table|index|database)\b/iu,
    );
    expect(text).toContain('| note | to confirm | yes | new |');
    expect(text).not.toContain('bad name');
    expect(text).not.toContain('ghost');
    expect(text).not.toMatch(/<script|\]\(javascript/u);
  });

  it('RF-601 the entity mapping and the README link the data model', async () => {
    const files = await (async () => {
      const h = await seeded();
      return h.handoffOf(await h.plan());
    })();

    expect(files['entity-mapping.md']).toContain('](data-model.md)');
    expect(files['README.md']).toContain('](data-model.md)');
  });
});

async function withSecondAnswer(text: string): Promise<Recording> {
  const base = await loadRecording(recordingPath);
  const [first, second, third] = base.calls;
  const attempt = third?.attempts[0];
  if (
    first === undefined ||
    second === undefined ||
    attempt === undefined ||
    !('response' in attempt)
  ) {
    throw new Error('The recording has three calls');
  }
  return {
    ...base,
    calls: [first, second, { attempts: [{ response: { ...attempt.response, text } }] }],
  };
}

async function degraded(answer: string): Promise<{ text: string; h: PlanHarness }> {
  const h = await seeded(await withSecondAnswer(answer));
  return { text: await modelFile(h), h };
}

describe('BuildPlan: an unusable data model answer', () => {
  it('RF-623 an answer without a usable table still completes, listing every legacy field as dropped', async () => {
    const { text, h } = await degraded('{"tables": []}');

    expect(text).toContain('The planner wrote no usable table');
    expect(text).not.toContain('### ');
    expect([...new Set(text.match(/ENT-\d+\.c\d+/gu))].sort()).toHaveLength(5);
    expect(text.match(/\| not named \|/gu)).toHaveLength(5);
    const warned = h.s.logger.entries.filter((entry) => entry.level === 'warn');
    expect(warned.map((entry) => entry.message).join(' ')).toContain('no usable table');
  });

  it('RF-623 one over-long legacy field keeps every table, writes the migrations card and logs the drop (EV-02)', async () => {
    const answer = await readFile('tests/fixtures/planner/data-model-long-field.json', 'utf8');
    const h = await seeded(await withSecondAnswer(answer));
    const run = await h.plan();
    const files = await h.handoffOf(run);

    const model = files['data-model.md'] ?? '';
    expect(model).not.toContain('The planner wrote no usable table');
    for (const table of ['record', 'entry', 'item']) expect(model).toContain(`### ${table}`);
    expect(files['tasks.md'] ?? '').toContain('Write the database migrations in the chosen stack');
    const checks = files['checks.md'] ?? '';
    expect(checks).toContain('### Data model');
    expect(checks).toContain('- range\\_note: the field "table entry columns 3".');
    const warned = h.s.logger.entries.filter((entry) => entry.level === 'warn');
    const messages = warned.map((entry) => entry.message).join(' ');
    expect(messages).toContain('dropped parts that failed their schema');
    expect(messages).not.toContain('no usable table');
  });

  it('RF-623 an answer whose tables the checks all refuse is treated the same way', async () => {
    const table = { name: 'bad name;', columns: [{ name: 'id', type: 'uuid' }] };
    const { text } = await degraded(JSON.stringify({ tables: [table] }));

    expect(text).toContain('The planner wrote no usable table');
    expect(text).not.toContain('bad name');
  });
});

describe('BuildPlan: a stop during the data model call', () => {
  it('RF-1108 a run stopped during the data model call ends Interrupted with no package', async () => {
    let calls = 0;
    const h = await seeded(undefined, {
      beforeCall: async (harness) => {
        calls += 1;
        if (calls === 3) await harness.stopRunning();
      },
    });

    const run = await h.plan();

    expect(run.endState).toBe('Interrupted');
    expect(await h.handoffOf(run)).toEqual({});
  });
});

describe('BuildPlan: a secret in an ENT card', () => {
  it('RNF-003 RF-623 never reaches the data model call or the file', async () => {
    const h = await createPlanHarness(dataDir, await loadRecording(recordingPath));
    const card = entityCardSaying('ENT-002', `A customer has a token ${fakeOpenAiKey}.`);
    await h.understandRun({ cards: [...planCards(), card], questions: planQuestions });
    await h.saveBrief(briefAnswers);

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const sent = h.providers
      .requests()[2]
      ?.messages.map((each) => each.content)
      .join(' ');
    expect(sent).toContain('A customer has a token');
    expect(sent).not.toContain(fakeOpenAiKey.slice(8, 30));
    const files = Object.values(await h.handoffOf(run)).join(' ');
    expect(files).not.toContain(fakeOpenAiKey.slice(8, 30));
  });
});
