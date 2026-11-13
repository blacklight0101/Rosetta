import { beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  readerPromptsFor,
  readerSystemPrompt,
  type ReaderPrompts,
} from '../../../../src/application/agent/reader-prompts.js';
import type { LabTarget } from '../../../../src/application/lab/lab-target.js';
import { cardSurfaceTargets } from '../../../../src/application/lab/targets/card-surface-targets.js';
import { loadReaderPrompts } from '../../../../src/infrastructure/prompts/prompt-files.js';
import { draftFile, environment, type Answer } from '../../../support/lab-target-env.js';

// RF-1406, ADR-029: the lab targets of the card prompts that are not the card format: the flows and
// screens fragments and the continuation of a cut answer. One turn, the run's own builders.

const promptsFolder = fileURLToPath(new URL('../../../../prompts/', import.meta.url));

const input = {
  area: 'shop',
  files: [{ path: 'shop/Orders.cs', language: 'csharp', lines: 120 }],
  turns: 6,
  reads: [{ path: 'shop/Orders.cs', startLine: 10, lines: ['class Orders {', '}'] }],
};

const card = {
  type: 'BR',
  title: 'Order total',
  area: 'shop',
  confidence: 'high',
  summary: 'An order has a total.',
  claims: [{ text: 'An order has a total.', citations: ['shop/Orders.cs:10-11'] }],
};
const validCards = JSON.stringify({ cards: [card] });
/** Cut inside a claim about the first read of the case: the model has the lines to finish it. */
const CUT =
  '{"cards": [{"type": "FEAT", "title": "Reads Orders.cs", "area": "shop", "summary": "The code in shop/Orders.cs is read here.", "confidence": "High", "claims": [{"text": "The file shop/Orders.cs holds the code at lines 10-11, which is';
/** What a model would send to finish the cut answer: the rest of the claim and the cards. */
const rest = ' the Orders class.", "citations": ["shop/Orders.cs:10-11"]}]}]}';

let prompts: ReaderPrompts;
let targets: Map<string, LabTarget>;

beforeAll(async () => {
  prompts = await loadReaderPrompts(promptsFolder);
  targets = new Map(cardSurfaceTargets(prompts).map((each) => [each.id, each]));
});

async function run(id: string, answer: Answer, data: unknown = input) {
  const parsed = targets.get(id)?.parseInput(data);
  if (parsed?.ok !== true) throw new Error(`not parsed: ${id}`);
  const { env, requests } = environment([answer]);
  const outcome = await parsed.value.run(env, draftFile('x.v9.md', 'DRAFT-TEXT'));
  return { outcome, request: requests[0] };
}

describe('the card surface targets', () => {
  it('RF-1406 has one reader target for each of the three prompts', () => {
    expect([...targets.keys()]).toEqual(['cards/continue', 'cards/flows', 'cards/screens']);
    expect(cardSurfaceTargets(prompts).every((each) => each.role === 'reader')).toBe(true);
  });
});

function withFragment(base: ReaderPrompts, part: 'flows' | 'screens'): ReaderPrompts {
  const none = { flows: draftFile('f.v9.md', ''), screens: draftFile('s.v9.md', '') };
  const surface = { ...(base.surface ?? none), [part]: draftFile('x.v9.md', 'DRAFT-TEXT') };
  return { ...base, surface };
}

describe('the surface fragments', () => {
  it.each([
    ['cards/flows', 'flows', { flows: true, screens: false }, 'Screens: pages'],
    ['cards/screens', 'screens', { flows: false, screens: true }, 'Flows: journeys'],
  ] as const)(
    'RF-1406 adds the %s file under test to the card format of the system prompt, alone',
    async (id, part, marks, other) => {
      const { outcome, request } = await run(id, { text: validCards });

      expect(outcome).toEqual({ usable: true, detail: 'Valid' });
      const tested = withFragment(prompts, part);
      expect(request?.system).toBe(readerSystemPrompt(readerPromptsFor(tested, marks)));
      expect(request?.system).toContain('DRAFT-TEXT');
      expect(request?.system).not.toContain(other);
      expect(request?.tools).toEqual([]);
    },
  );

  it('RF-1406 sends the task, the replay of the reads and the turns-left message', async () => {
    const { request } = await run('cards/flows', { text: validCards });

    expect(request?.messages.map((each) => each.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'user',
    ]);
  });

  it('RF-1406 reads a surface answer with the run card parser', async () => {
    const partial = JSON.stringify({ cards: [card, { type: 'BR' }] });
    const call = { id: 'c', name: 'read_file', arguments: { path: 'a', startLine: 1, endLine: 2 } };

    expect((await run('cards/screens', { text: partial })).outcome).toEqual({
      usable: true,
      detail: 'Partial',
    });
    expect((await run('cards/screens', { text: 'no json' })).outcome).toEqual({
      usable: false,
      detail: 'Unusable',
    });
    expect((await run('cards/flows', { text: '', toolCalls: [call] })).outcome).toEqual({
      usable: false,
      detail: 'ReadsMore',
    });
  });
});

describe('the continue target', () => {
  it('RF-1406 continues a fixed cut answer with the continue file as the last message', async () => {
    const { outcome, request } = await run('cards/continue', { text: rest });

    expect(outcome).toEqual({ usable: true, detail: 'Valid' });
    const messages = request?.messages ?? [];
    const roles = ['user', 'assistant', 'tool', 'user', 'assistant', 'user'];
    expect(messages.map((each) => each.role)).toEqual(roles);
    expect(messages[4]?.content).toBe(CUT);
    expect(messages[5]?.content).toBe('DRAFT-TEXT');
    expect(request?.system).toBe(readerSystemPrompt(prompts));
  });

  it('RF-1406 joins the fragment the way the run does, so a fence is stripped', async () => {
    const fenced = `\`\`\`json\n${rest}\n\`\`\``;

    expect((await run('cards/continue', { text: fenced })).outcome.usable).toBe(true);
    expect((await run('cards/continue', { text: 'so far so good' })).outcome).toEqual({
      usable: false,
      detail: 'Unusable',
    });
  });
});

describe('the last turn of the card surface targets', () => {
  it.each(['cards/flows', 'cards/screens'])(
    'RF-1406 makes %s the last turn: one turn left, whatever the case holds',
    async (id) => {
      const { request } = await run(id, { text: validCards });

      expect(request?.messages.at(-1)?.content).toContain('Turns left: 1.');
      expect(request?.messages.at(-1)?.content).not.toContain('Turns left: 5.');
    },
  );

  it('RF-1406 keeps the tools on a continuation, as a run does, with one turn left', async () => {
    const { request } = await run('cards/continue', { text: rest });

    expect(request?.messages[3]?.content).toContain('Turns left: 1.');
    expect(request?.tools.map((tool) => tool.name)).toContain('read_file');
  });
});

describe('the cut of a continuation', () => {
  it('RF-1406 is made from the first read of each case and ends inside a claim', async () => {
    const other = {
      ...{ area: 'bank "main"', files: [{ path: 'bank/Pay.cs', language: 'csharp', lines: 9 }] },
      reads: [{ path: 'bank/Pay.cs', startLine: 3, lines: ['class Pay {', '  int x;', '}'] }],
    };
    const { request } = await run('cards/continue', { text: rest }, other);

    const cut = String(request?.messages.at(-2)?.content);
    expect(cut).toContain('bank/Pay.cs');
    expect(cut).toContain('lines 3-5');
    expect(cut).toContain('"area": "bank \\"main\\""');
    expect(cut).not.toContain('Orders.cs');
    expect(cut.endsWith('which is')).toBe(true);
  });
});

describe('a continuation that starts again', () => {
  const again = `Here is the whole answer.\n${validCards}`;
  const fence = '```';
  const fenced = [`${fence}json`, validCards, fence].join('\n');

  it('RF-1406 is Restarted, not usable, when the fragment is a new answer and not the rest', async () => {
    const prose = await run('cards/continue', { text: again });
    const inFence = await run('cards/continue', { text: fenced });

    expect(prose.outcome).toEqual({ usable: false, detail: 'Restarted' });
    expect(inFence.outcome).toEqual({ usable: false, detail: 'Restarted' });
  });

  it('RF-1406 is not valid on the first try either, and the rest of the cut is', () => {
    expect(targets.get('cards/continue')?.readsAnswer(again)).toBe(false);
    expect(targets.get('cards/continue')?.readsAnswer(rest)).toBe(true);
  });
});

describe('the cases of the card surface targets', () => {
  it('RF-1406 refuses a case without reads, as every case replays them', () => {
    const bare = { area: input.area, files: input.files, turns: input.turns };

    for (const target of targets.values()) {
      const parsed = target.parseInput(bare);
      expect(parsed.ok ? '' : parsed.error).toContain('reads');
    }
  });

  it('RF-1406 reads one raw answer: a fragment for continue, cards for the others', () => {
    expect(targets.get('cards/continue')?.readsAnswer(rest)).toBe(true);
    expect(targets.get('cards/continue')?.readsAnswer('x')).toBe(false);
    expect(targets.get('cards/flows')?.readsAnswer(validCards)).toBe(true);
    expect(targets.get('cards/screens')?.readsAnswer('x')).toBe(false);
  });
});
