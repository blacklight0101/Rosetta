import { beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  readerSystemPrompt,
  type ReaderPrompts,
} from '../../../../src/application/agent/reader-prompts.js';
import type { LabTarget } from '../../../../src/application/lab/lab-target.js';
import {
  sharedTargets,
  type SharedKit,
} from '../../../../src/application/lab/targets/shared-targets.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  maskedKindPlaceholder,
  maskedValueReplacement,
} from '../../../../src/infrastructure/prompts/masked-value-prompt.js';
import { loadReaderPrompts } from '../../../../src/infrastructure/prompts/prompt-files.js';
import {
  parseTextAnswer,
  textProtocolSystem,
  toolsPlaceholder,
  toolCallBlock,
  toolResultBlock,
} from '../../../../src/infrastructure/providers/ollama/text-tool-protocol.js';
import { draftFile, environment, type Answer } from '../../../support/lab-target-env.js';

// RF-1406, ADR-029, P10-10: the targets of the shared prompts a model reads (masked-value, text
// protocol), fragments of a reader turn; secret-risk is never sent, so it has none. Values are invented.

const promptsFolder = fileURLToPath(new URL('../../../../prompts/', import.meta.url));

const kit: SharedKit = {
  maskerOf: (file) =>
    file.text.split(maskedKindPlaceholder).length === 2
      ? new SecretMasker(undefined, maskedValueReplacement(file))
      : undefined,
  protocol: {
    toolsPlaceholder,
    systemOf: textProtocolSystem,
    parse: parseTextAnswer,
    toolCallBlock,
    toolResultBlock,
  },
};

const files = [{ path: 'shop/App.config', language: 'xml', lines: 40 }];
const maskedInput = {
  area: 'shop',
  files,
  turns: 6,
  secret: 'FakeSecret1',
  reads: [
    {
      path: 'shop/App.config',
      startLine: 3,
      lines: ['<add name="Main" connectionString="Server=db;Password={secret};" />', '<x a="1" />'],
    },
  ],
};
const protocolInput = { area: 'shop', files, turns: 6 };
const withReads = {
  ...protocolInput,
  reads: [{ path: 'shop/App.config', startLine: 3, lines: ['<x a="1" />', '<y />'] }],
};

const card = {
  type: 'BR',
  title: 'Order total',
  area: 'shop',
  confidence: 'high',
  summary: 'An order has a total.',
  claims: [{ text: 'An order has a total.', citations: ['shop/App.config:3-4'] }],
};
const validCards = JSON.stringify({ cards: [card] });
const readCall =
  '```tool_call\n{"name": "read_file", "arguments": {"path": "shop/App.config", "startLine": 1, "endLine": 20}}\n```';
const PROTOCOL = 'PROTOCOL {{tools}}';
let prompts: ReaderPrompts;
let targets: Map<string, LabTarget>;

beforeAll(async () => {
  prompts = await loadReaderPrompts(promptsFolder);
  targets = new Map(sharedTargets(prompts, kit).map((each) => [each.id, each]));
});

async function run(id: string, data: unknown, answer: Answer, text = '[MASKED:{{kind}}] NOTE') {
  const parsed = targets.get(id)?.parseInput(data);
  if (parsed?.ok !== true) throw new Error(`not parsed: ${id}`);
  const { env, requests } = environment([answer]);
  const outcome = await parsed.value.run(env, draftFile('x.v9.md', text));
  return { outcome, requests };
}

describe('the shared targets', () => {
  it('RF-1406 has a reader target for masked-value and one for text-tool-protocol, none for secret-risk', () => {
    expect([...targets.keys()]).toEqual(['shared/masked-value', 'shared/text-tool-protocol']);
    expect(sharedTargets(prompts, kit).every((each) => each.role === 'reader')).toBe(true);
  });
});

describe('the masked-value target', () => {
  it('RF-1406 masks the reads with the file under test, so the model sees its note and no value', async () => {
    const { outcome, requests } = await run('shared/masked-value', maskedInput, {
      text: validCards,
    });

    expect(outcome).toEqual({ usable: true, detail: 'Valid' });
    expect(requests).toHaveLength(1);
    const sent = JSON.stringify(requests[0]?.messages);
    expect(sent).toContain('Password=[MASKED:connection-string] NOTE;');
    expect(sent).not.toContain('FakeSecret1');
    expect(sent).not.toContain('{secret}');
    expect(requests[0]?.system).toBe(readerSystemPrompt(prompts));
    expect(requests[0]?.tools.map((tool) => tool.name)).toContain('read_file');
  });

  it('RF-1406 keeps the lines where they were, so the citations stay valid', async () => {
    const { requests } = await run('shared/masked-value', maskedInput, { text: validCards });
    const tool = requests[0]?.messages.find((each) => each.role === 'tool');

    expect(tool?.content).toContain('3: <add name="Main"');
    expect(tool?.content).toContain('4: <x a="1" />');
  });

  it('RF-1406 calls a missed secret Leaked before any call when the masker leaves the value', async () => {
    const lax: SharedKit = { ...kit, maskerOf: () => ({ mask: (text) => ({ text }) }) };
    const parsed = sharedTargets(prompts, lax)[0]?.parseInput(maskedInput);
    if (parsed?.ok !== true) throw new Error('not parsed');
    const { env, requests } = environment([{ text: validCards }]);

    const outcome = await parsed.value.run(env, draftFile('x.v9.md', '[MASKED:{{kind}}]'));

    expect(outcome).toEqual({ usable: false, detail: 'Leaked' });
    expect(requests).toHaveLength(0);
  });

  it('RF-1406 calls an answer that repeats the value Leaked, whatever else it holds', async () => {
    const echoed = JSON.stringify({
      cards: [{ ...card, summary: 'The password is FakeSecret1.' }],
    });

    const { outcome } = await run('shared/masked-value', maskedInput, { text: echoed });

    expect(outcome).toEqual({ usable: false, detail: 'Leaked' });
  });
});

describe('the masked-value target, refusals', () => {
  it('RF-1406 refuses a note that does not start with the marker as BadPrompt, with no call', async () => {
    const { outcome, requests } = await run(
      'shared/masked-value',
      maskedInput,
      { text: validCards },
      'NOTE [MASKED:{{kind}}]',
    );

    expect(outcome).toEqual({ usable: false, detail: 'BadPrompt' });
    expect(requests).toHaveLength(0);
  });

  it('RF-1406 calls an answer that repeats the value in a tool call Leaked', async () => {
    const call = {
      id: 'c',
      name: 'read_file',
      arguments: { path: 'shop/FakeSecret1.cs', startLine: 1, endLine: 2 },
    };

    const { outcome } = await run('shared/masked-value', maskedInput, {
      text: '',
      toolCalls: [call],
    });

    expect(outcome).toEqual({ usable: false, detail: 'Leaked' });
  });
});

describe('the masked-value target, drafts and cases', () => {
  it('RF-1406 refuses a draft without the kind placeholder as BadPrompt, with no call', async () => {
    const { outcome, requests } = await run(
      'shared/masked-value',
      maskedInput,
      { text: validCards },
      'no placeholder',
    );

    expect(outcome).toEqual({ usable: false, detail: 'BadPrompt' });
    expect(requests).toHaveLength(0);
  });

  it('RF-1406 refuses a case without reads or without a secret', () => {
    const target = targets.get('shared/masked-value');
    const bare = { ...maskedInput, reads: undefined };
    const quiet = { ...maskedInput, secret: undefined };

    const problems = [bare, quiet].map((each) => {
      const parsed = target?.parseInput(each);
      return parsed?.ok === false ? parsed.error : '';
    });

    expect(problems[0]).toContain('reads');
    expect(problems[1]).toContain('secret');
  });

  it('RF-1406 refuses a case whose lines do not hold the secret token', () => {
    const plain = { ...maskedInput, reads: [{ path: 'a', startLine: 1, lines: ['x'] }] };

    const parsed = targets.get('shared/masked-value')?.parseInput(plain);

    expect(parsed?.ok === false ? parsed.error : '').toContain('{secret}');
  });
});

describe('the text-tool-protocol target', () => {
  it('RF-1406 puts the protocol with the tools after the system prompt and sends no native tools', async () => {
    const { outcome, requests } = await run(
      'shared/text-tool-protocol',
      protocolInput,
      { text: readCall },
      PROTOCOL,
    );

    expect(outcome).toEqual({ usable: true, detail: 'ReadsFiles' });
    expect(requests[0]?.tools).toEqual([]);
    expect(requests[0]?.system.startsWith(readerSystemPrompt(prompts))).toBe(true);
    expect(requests[0]?.system).toContain('PROTOCOL [');
    expect(requests[0]?.system).toContain('"name": "read_file"');
    expect(requests[0]?.messages.map((each) => each.role)).toEqual(['user']);
  });

  it('RF-1406 reads a first turn as ReadsFiles, BadToolCall, Answered or Empty', async () => {
    const id = 'shared/text-tool-protocol';
    const bad = '```tool_call\n{"name": "read_file", "arguments": {"path": 5}}\n```';

    const details = await Promise.all(
      [readCall, bad, 'I will answer now.', ''].map(
        async (answer) => (await run(id, protocolInput, { text: answer }, PROTOCOL)).outcome.detail,
      ),
    );

    expect(details).toEqual(['ReadsFiles', 'BadToolCall', 'Answered', 'Empty']);
  });
});

describe('the text-tool-protocol target, after the reads', () => {
  it('RF-1406 takes the placeholder rule of the run: one or more tools placeholders', async () => {
    const { outcome } = await run(
      'shared/text-tool-protocol',
      protocolInput,
      { text: readCall },
      'A {{tools}} B {{tools}}',
    );

    expect(outcome).toEqual({ usable: true, detail: 'ReadsFiles' });
  });
});

describe('the text-tool-protocol target, replay', () => {
  it('RF-1406 sends the replay of the reads as text, since the protocol has no tool role', async () => {
    const { outcome, requests } = await run(
      'shared/text-tool-protocol',
      withReads,
      { text: validCards },
      PROTOCOL,
    );

    expect(outcome).toEqual({ usable: true, detail: 'Valid' });
    const messages = requests[0]?.messages ?? [];
    expect(messages.map((each) => each.role)).toEqual(['user', 'assistant', 'user', 'user']);
    expect(messages[1]?.content).toContain('```tool_call');
    expect(messages[2]?.content).toContain('```tool_result');
    expect(messages[2]?.content).toContain('3: <x a="1" />');
  });

  it('RF-1406 reads a tool call after the reads as ReadsMore', async () => {
    const { outcome } = await run(
      'shared/text-tool-protocol',
      withReads,
      { text: readCall },
      PROTOCOL,
    );

    expect(outcome).toEqual({ usable: false, detail: 'ReadsMore' });
  });

  it('RF-1406 refuses a draft without the tools placeholder as BadPrompt, with no call', async () => {
    const { outcome, requests } = await run(
      'shared/text-tool-protocol',
      protocolInput,
      { text: readCall },
      'no tools here',
    );

    expect(outcome).toEqual({ usable: false, detail: 'BadPrompt' });
    expect(requests).toHaveLength(0);
  });

  it('RF-1406 has no parser of a first answer, so first-try validity is not applicable', () => {
    expect(targets.get('shared/text-tool-protocol')?.readsAnswer(readCall)).toBeNull();
  });
});
