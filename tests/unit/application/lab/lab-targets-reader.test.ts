import { beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { ReaderPrompts } from '../../../../src/application/agent/reader-prompts.js';
import type { LabTarget } from '../../../../src/application/lab/lab-target.js';
import { readerTargets } from '../../../../src/application/lab/targets/reader-targets.js';
import { loadReaderPrompts } from '../../../../src/infrastructure/prompts/prompt-files.js';
import { draftFile, environment, type Answer } from '../../../support/lab-target-env.js';

// RF-1406, ADR-029: the reader targets measure one turn with the run's own prompt builders.

const promptsFolder = fileURLToPath(new URL('../../../../prompts/', import.meta.url));

const input = {
  area: 'shop',
  files: [
    { path: 'shop/Orders.cs', language: 'csharp', lines: 120 },
    { path: 'shop/logo.bin', language: 'unknown', skipped: 'binary' },
  ],
  turns: 6,
  reads: [{ path: 'shop/Orders.cs', startLine: 10, lines: ['class Orders {', '}'] }],
};

const readCall = {
  id: 'c1',
  name: 'read_file',
  arguments: { path: 'shop/Orders.cs', startLine: 1, endLine: 20 },
};

let prompts: ReaderPrompts;
let targets: Map<string, LabTarget>;

beforeAll(async () => {
  prompts = await loadReaderPrompts(promptsFolder);
  targets = new Map(readerTargets(prompts).map((each) => [each.id, each]));
});

async function run(id: string, answer: Answer, text = 'Draft {{area}} {{files}} {{turns}}') {
  const parsed = targets.get(id)?.parseInput(input);
  if (parsed?.ok !== true) throw new Error('not parsed');
  const { env, requests } = environment([answer]);
  const outcome = await parsed.value.run(env, draftFile('x.v9.md', text));
  return { outcome, request: requests[0] };
}

describe('the reader targets', () => {
  it('RF-1406 has one target for each of the four prompts', () => {
    expect([...targets.keys()]).toEqual([
      'reader/task',
      'reader/area',
      'reader/read-first',
      'cards/card-format',
    ]);
  });

  it('RF-1406 puts the task under test in the first message, with the area as a data block and the reader tools', async () => {
    const { outcome, request } = await run('reader/task', { text: '', toolCalls: [readCall] });

    expect(outcome).toEqual({ usable: true, detail: 'ReadsFiles' });
    expect(request?.messages).toHaveLength(1);
    const content = request?.messages[0]?.content ?? '';
    expect(content).toContain('Draft ');
    expect(content).toContain('shop/Orders.cs (csharp, 120 lines)');
    expect(request?.system).toContain(prompts.system.text.slice(0, 40));
    expect(request?.tools.map((tool) => tool.name)).toContain('read_file');
    expect(request?.context.role).toBe('reader');
  });

  it('RF-1406 puts the system prompt under test in the system prompt', async () => {
    const { request } = await run('reader/area', { text: 'x' }, 'The reader under test.');

    expect(request?.system.startsWith('The reader under test.')).toBe(true);
    expect(request?.messages[0]?.content).toContain('shop/Orders.cs');
  });
});

describe('the reader first turn', () => {
  it('RF-1406 classifies a first turn: reads files, bad tool call, answered, empty', async () => {
    const bad = { id: 'c1', name: 'read_file', arguments: { path: 5 } };

    const detail = async (answer: Answer) => (await run('reader/task', answer)).outcome.detail;

    expect(await detail({ text: '', toolCalls: [readCall] })).toBe('ReadsFiles');
    expect(await detail({ text: '', toolCalls: [readCall, bad] })).toBe('BadToolCall');
    expect(await detail({ text: '{"cards":[]}' })).toBe('Answered');
    expect(await detail({ text: '  ' })).toBe('Empty');
  });

  it('RF-1406 refuses a task draft that lost the area placeholder before any call', async () => {
    const { outcome, request } = await run('reader/task', { text: '' }, 'No placeholder.');

    expect(outcome).toEqual({ usable: false, detail: 'BadPrompt' });
    expect(request).toBeUndefined();
  });

  it('RF-1406 builds the read-first turn: task, a fixed premature answer, then the refusal under test', async () => {
    const { outcome, request } = await run('reader/read-first', {
      text: '',
      toolCalls: [readCall],
    });

    expect(outcome.detail).toBe('ReadsFiles');
    const roles = request?.messages.map((message) => message.role);
    expect(roles).toEqual(['user', 'assistant', 'user']);
    const refusal = request?.messages[2]?.content ?? '';
    expect(refusal).toContain('Draft ');
    expect(refusal).toContain('shop/Orders.cs');
    expect(refusal).not.toContain('logo.bin');
    expect(refusal).toContain('5');
  });
});

describe('the reader card format turn', () => {
  it('RF-1406 replays the reads of the case before the card format answer', async () => {
    const cards = JSON.stringify({ cards: [] });
    const { request } = await run('cards/card-format', { text: cards }, 'The format under test.');

    const roles = request?.messages.map((message) => message.role);
    expect(roles).toEqual(['user', 'assistant', 'tool', 'user']);
    const assistant = request?.messages[1];
    expect(assistant?.role === 'assistant' ? assistant.toolCalls?.[0]?.name : '').toBe('read_file');
    expect(request?.messages[2]?.content).toContain('10: class Orders {');
    expect(request?.system).toContain('The format under test.');
  });

  it('RF-1406 reads a final answer with the run card parser', async () => {
    const valid = {
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
    };

    const good = await run('cards/card-format', { text: JSON.stringify(valid) });
    const none = await run('cards/card-format', { text: 'Sorry.' });
    const more = await run('cards/card-format', { text: '', toolCalls: [readCall] });

    expect(good.outcome.detail).toBe('Valid');
    expect(none.outcome).toEqual({ usable: false, detail: 'Unusable' });
    expect(more.outcome).toEqual({ usable: false, detail: 'ReadsMore' });
    expect(targets.get('cards/card-format')?.readsAnswer(JSON.stringify(valid))).toBe(true);
    expect(targets.get('cards/card-format')?.readsAnswer('Sorry.')).toBe(false);
  });

  it('RF-1406 refuses a card-format case with no reads and a case with an unknown key', () => {
    const bare = { ...input, reads: undefined };

    expect(targets.get('cards/card-format')?.parseInput(bare).ok).toBe(false);
    expect(targets.get('reader/task')?.parseInput({ ...input, stray: 1 }).ok).toBe(false);
    expect(targets.get('reader/task')?.parseInput(bare).ok).toBe(true);
  });
});
