import { beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  readerPromptsFor,
  readerSystemPrompt,
  type ReaderPrompts,
} from '../../../../src/application/agent/reader-prompts.js';
import type { LabTarget } from '../../../../src/application/lab/lab-target.js';
import { readerPartTargets } from '../../../../src/application/lab/targets/reader-part-targets.js';
import { loadReaderPrompts } from '../../../../src/infrastructure/prompts/prompt-files.js';
import { draftFile, environment, type Answer } from '../../../support/lab-target-env.js';

// RF-1406, ADR-029: the lab targets of the other reader prompts: the parts of the first message a
// re-run adds, the refusal after a short read, the turns-left message and the workbook guidance.

const promptsFolder = fileURLToPath(new URL('../../../../prompts/', import.meta.url));

const input = {
  area: 'shop',
  files: [
    { path: 'shop/Orders.cs', language: 'csharp', lines: 120 },
    { path: 'shop/Pay.cs', language: 'csharp', lines: 40 },
  ],
  turns: 6,
  reads: [{ path: 'shop/Orders.cs', startLine: 10, lines: ['class Orders {', '}'] }],
  answers: "Question OQ-005 (Area: shop): Which store?\nOwner's answer: Redis.",
  rejected: '{\n  "rejected": [{ "claimId": "BR-001.c1", "text": "A claim." }]\n}',
  parentCards: '{\n  "cards": [{ "id": "ENT-001", "type": "ENT", "title": "Order" }]\n}',
  readMore: { percent: 12, readTokens: 2488, tokens: 20390, unread: ['shop/Pay.cs'] },
  workbook: true,
};

const readCall = {
  id: 'c1',
  name: 'read_file',
  arguments: { path: 'shop/Orders.cs', startLine: 1, endLine: 20 },
};

const validCards = JSON.stringify({
  cards: [
    {
      type: 'ENT',
      title: 'Order',
      area: 'shop',
      confidence: 'high',
      summary: 'An order.',
      claims: [{ text: 'An order has a total.', citations: ['shop/Orders.cs:10-11'] }],
    },
  ],
});

const ALL_PLACEHOLDERS = 'Draft {{answers}}{{rejected}}{{parentCards}}{{files}}{{turns}}';

let prompts: ReaderPrompts;
let targets: Map<string, LabTarget>;

beforeAll(async () => {
  prompts = await loadReaderPrompts(promptsFolder);
  targets = new Map(readerPartTargets(prompts).map((each) => [each.id, each]));
});

async function run(id: string, answer: Answer, text = ALL_PLACEHOLDERS) {
  const parsed = targets.get(id)?.parseInput(input);
  if (parsed?.ok !== true) throw new Error(`not parsed: ${id}`);
  const { env, requests } = environment([answer]);
  const outcome = await parsed.value.run(env, draftFile('x.v9.md', text));
  return { outcome, request: requests[0] };
}

const reads: Answer = { text: '', toolCalls: [readCall] };

describe('the other reader targets', () => {
  it('RF-1406 has one target for each of the six prompts', () => {
    expect([...targets.keys()]).toEqual([
      'reader/answers',
      'reader/parent-cards',
      'reader/read-more',
      'reader/reread',
      'reader/turns-left',
      'reader/workbook',
    ]);
    expect(readerPartTargets(prompts).every((each) => each.role === 'reader')).toBe(true);
  });

  it.each([
    ['reader/answers', 'Redis.', 'owner_answers'],
    ['reader/reread', 'BR-001.c1', 'cards'],
    ['reader/parent-cards', 'ENT-001', 'cards'],
  ])(
    'RF-1406 puts the %s file after the task with its own data block',
    async (id, fact, source) => {
      const { outcome, request } = await run(id, reads);

      expect(outcome).toEqual({ usable: true, detail: 'ReadsFiles' });
      expect(request?.messages).toHaveLength(1);
      const content = request?.messages[0]?.content ?? '';
      expect(content).toContain('shop/Orders.cs (csharp, 120 lines)');
      expect(content).toContain('Draft ');
      expect(content).toContain(fact);
      expect(content).toContain(`"source":"${source}"`);
      const marks = { flows: false, screens: false };
      expect(request?.system).toBe(readerSystemPrompt(readerPromptsFor(prompts, marks, true)));
      expect(request?.tools.map((tool) => tool.name)).toContain('read_file');
    },
  );

  it('RF-1406 adds only the part under test to the first message', async () => {
    const { request } = await run('reader/reread', reads);

    const content = request?.messages[0]?.content ?? '';
    expect(content).toContain('BR-001.c1');
    expect(content).not.toContain('Redis.');
    expect(content).not.toContain('ENT-001');
  });
});

describe('the first turn after a part', () => {
  it('RF-1406 classifies a first turn after a part: reads files, bad tool call, answered, empty', async () => {
    const bad = { id: 'c1', name: 'read_file', arguments: { path: 5 } };

    const detail = async (answer: Answer) => (await run('reader/answers', answer)).outcome.detail;

    expect(await detail(reads)).toBe('ReadsFiles');
    expect(await detail({ text: '', toolCalls: [bad] })).toBe('BadToolCall');
    expect(await detail({ text: validCards })).toBe('Answered');
    expect(await detail({ text: ' ' })).toBe('Empty');
  });

  it('RF-1406 refuses a draft that lost its placeholder before any call', async () => {
    const { outcome, request } = await run('reader/answers', reads, 'No placeholder.');

    expect(outcome).toEqual({ usable: false, detail: 'BadPrompt' });
    expect(request).toBeUndefined();
  });

  it('RF-1406 refuses a case that lacks what the prompt needs, and a case with an unknown key', () => {
    const without = (key: string) => ({ ...input, [key]: undefined });
    const refuses = (id: string, data: object) => targets.get(id)?.parseInput(data).ok === false;

    expect(refuses('reader/answers', without('answers'))).toBe(true);
    expect(refuses('reader/reread', without('rejected'))).toBe(true);
    expect(refuses('reader/parent-cards', without('parentCards'))).toBe(true);
    expect(refuses('reader/read-more', without('readMore'))).toBe(true);
    expect(refuses('reader/read-more', without('reads'))).toBe(true);
    expect(refuses('reader/turns-left', without('reads'))).toBe(true);
    expect(refuses('reader/workbook', without('workbook'))).toBe(true);
    expect(refuses('reader/answers', { ...input, stray: 1 })).toBe(true);
  });
});

describe('the read-more turn', () => {
  it('RF-1406 builds the turn after a short read: the reads, a fixed answer, then the refusal under test', async () => {
    const draft = 'Only {{percent}}% ({{read}} of {{total}}), {{turns}} left:\n{{files}}';
    const { outcome, request } = await run('reader/read-more', reads, draft);

    expect(outcome).toEqual({ usable: true, detail: 'ReadsFiles' });
    expect(request?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'user',
      'assistant',
      'user',
    ]);
    const refusal = request?.messages[5]?.content ?? '';
    expect(refusal).toContain('Only 12% (2488 of 20390), 5 left:');
    expect(refusal).toContain('shop/Pay.cs');
    expect(request?.messages[4]?.content).toBe('{"cards": []}');
  });

  it('RF-1406 refuses a refusal draft without the files placeholder, and reads an answer as a turn', async () => {
    const bad = await run('reader/read-more', reads, 'No files.');
    const answered = await run('reader/read-more', { text: validCards }, '{{files}}');

    expect(bad.outcome.detail).toBe('BadPrompt');
    expect(answered.outcome).toEqual({ usable: false, detail: 'Answered' });
  });
});

describe('the turns-left turn', () => {
  it('RF-1406 puts the message under test last, after the replay of the reads', async () => {
    const draft = 'Turns left: {{turns}}.';
    const { request } = await run('reader/turns-left', { text: validCards }, draft);

    expect(request?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'user',
    ]);
    expect(request?.messages[3]?.content).toBe('Turns left: 5.');
  });

  it('RF-1406 reads the answer with the run card parser, as for the card format', async () => {
    const valid = await run('reader/turns-left', { text: validCards }, '{{turns}}');
    const none = await run('reader/turns-left', { text: 'Sorry.' }, '{{turns}}');
    const more = await run('reader/turns-left', reads, '{{turns}}');
    const lost = await run('reader/turns-left', reads, 'No turns.');

    expect(valid.outcome).toEqual({ usable: true, detail: 'Valid' });
    expect(none.outcome).toEqual({ usable: false, detail: 'Unusable' });
    expect(more.outcome).toEqual({ usable: false, detail: 'ReadsMore' });
    expect(lost.outcome.detail).toBe('BadPrompt');
    expect(targets.get('reader/turns-left')?.readsAnswer(validCards)).toBe(true);
    expect(targets.get('reader/turns-left')?.readsAnswer('Sorry.')).toBe(false);
  });
});

describe('the workbook guidance', () => {
  it('RF-1406 puts the guidance under test last in the system prompt, after the card format and both fragments', async () => {
    const { outcome, request } = await run('reader/workbook', { text: validCards }, 'Guidance X.');

    expect(outcome).toEqual({ usable: true, detail: 'Valid' });
    const system = request?.system ?? '';
    expect(system).toContain(prompts.system.text.slice(0, 40));
    expect(system.trimEnd().endsWith('Guidance X.')).toBe(true);
    expect(system).toContain(prompts.surface?.screens.text.trim().slice(0, 40));
    expect(system).not.toContain(prompts.workbook?.text.trim().slice(0, 60));
    expect(request?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'user',
    ]);
  });
});
