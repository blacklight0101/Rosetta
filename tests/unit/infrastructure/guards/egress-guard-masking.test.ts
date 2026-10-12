import { describe, expect, it } from 'vitest';
import type { LlmMessage } from '../../../../src/application/ports/llm-provider.js';
import { scanDataBlocks } from '../../../../src/domain/egress/data-block-scan.js';
import { DATA_BLOCK_FOOTER } from '../../../../src/domain/egress/data-block.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  egressHarness,
  readConversation,
  requestWith,
  toolResult,
} from '../../../support/egress-harness.js';
import { FailingMasker } from '../../../support/failing-masker.js';
import { failureOf } from '../../../support/failure-of.js';
import { keyedSecretCases, secretCases } from '../../../support/secret-fixture.js';

// RF-141, DEC-57: the egress guard masks every part of every message before a call leaves, adds
// the counts to the run record and blocks the call when the masker fails.

const allSecrets = secretCases.flatMap((secretCase) => secretCase.secrets);
const keyedSecrets = keyedSecretCases.flatMap((keyed) => keyed.secrets);

/** A conversation that carries every fixture secret in every kind of message part. */
function everyPart(): { readonly system: string; readonly messages: LlmMessage[] } {
  const texts = secretCases.map((secretCase) => secretCase.text).join('\n');
  return {
    system: `You describe one area.\n${texts}`,
    messages: [
      { role: 'user', content: `Describe the area.\n${texts}` },
      {
        role: 'assistant',
        content: `I will read the file.\n${texts}`,
        toolCalls: keyedSecretCases.map((keyed, index) => ({
          id: `call-${String(index)}`,
          name: 'read_file',
          arguments: keyed.arguments,
        })),
      },
      toolResult({ text: texts }),
    ],
  };
}

describe('EgressGuard masks before egress', () => {
  it.each(secretCases)('RF-141 masks $name in a tool result before it is sent', async (secret) => {
    const { guard, fake } = await egressHarness();

    await guard.complete(requestWith(readConversation(toolResult({ text: secret.text }))));

    const sent = fake.requests[0]?.messages[2]?.content ?? '';
    expect(sent).toContain(secret.masked);
    for (const value of secret.secrets) expect(sent).not.toContain(value);
  });

  it('RF-141 masks the system prompt, every message and the tool-call arguments', async () => {
    const { guard, fake } = await egressHarness();
    const { system, messages } = everyPart();

    await guard.complete(requestWith(messages, system));

    const sent = JSON.stringify(fake.requests);
    expect(fake.requests).toHaveLength(1);
    for (const value of [...allSecrets, ...keyedSecrets]) expect(sent).not.toContain(value);
    expect(sent).toContain('[MASKED:');
  });

  it('RF-141 keeps every line where it was, so citations stay valid', async () => {
    const { guard, fake } = await egressHarness();
    const block = secretCases.find((secret) => secret.name === 'a multi-line private key block');
    const result = toolResult({ text: block?.text ?? '' });

    await guard.complete(requestWith(readConversation(result)));

    const sent = fake.requests[0]?.messages[2]?.content ?? '';
    expect(sent.split('\n')).toHaveLength(result.content.split('\n').length);
    expect(sent.split('\n')[7]).toBe('line seven');
  });

  it('RF-145 keeps the block footer when a private key in the excerpt has no end line', async () => {
    const { guard, fake } = await egressHarness();
    const cut = secretCases.find((secret) => secret.name.includes('cut off before its end line'));

    await guard.complete(requestWith(readConversation(toolResult({ text: cut?.text ?? '' }))));

    const sent = fake.requests[0]?.messages[2]?.content ?? '';
    expect(sent.endsWith(`\n${DATA_BLOCK_FOOTER}`)).toBe(true);
    expect(scanDataBlocks(sent)).toMatchObject({ ok: true, value: { blocks: 1 } });
  });

  it('RF-141 adds the count per kind to the run record', async () => {
    const { guard, manifest } = await egressHarness();
    const { system, messages } = everyPart();

    await guard.complete(requestWith(messages, system));

    const counts = (await manifest())?.masking ?? {};
    // The texts travel in four parts: the system prompt, the user, the assistant and the tool result.
    const texts = secretCases.map((secret) => secret.text).join('\n');
    const once = new SecretMasker().mask(texts).counts;
    expect(counts['api-key']).toBe(once['api-key'] * 4);
    expect(counts['bearer-token']).toBe(once['bearer-token'] * 4);
    expect(counts['connection-string']).toBe(once['connection-string'] * 4);
    expect(counts['private-key']).toBe(once['private-key'] * 4);
    expect(counts['password']).toBe(once.password * 4 + keyedSecretCases.length);
  });

  it('RF-141 counts a secret once per agent task although every call repeats it', async () => {
    const { guard, manifest } = await egressHarness();
    const [secret] = secretCases;
    const first = readConversation(toolResult({ text: secret?.text ?? '' }));
    const second: LlmMessage[] = [...first, { role: 'assistant', content: 'Done reading.' }];

    await guard.complete(requestWith(first));
    await guard.complete(requestWith([...second, { role: 'user', content: 'Write the card.' }]));

    expect((await manifest())?.masking['api-key']).toBe(1);
  });
});

describe('EgressGuard with a failing masker', () => {
  it('RF-141 does not make the call and stops the task with the code', async () => {
    const { guard, fake } = await egressHarness({ masker: new FailingMasker() });

    const failure = await failureOf(
      guard.complete(requestWith(readConversation(toolResult({ text: 'x' })))),
    );

    expect(failure).toMatchObject({ code: ERROR_CODES.secretMaskingFailed });
    expect(fake.requests).toEqual([]);
  });

  it('RF-141 logs the masking failure as a security event with its code', async () => {
    const { guard, logger } = await egressHarness({ masker: new FailingMasker() });

    await failureOf(guard.complete(requestWith(readConversation(toolResult({ text: 'x' })))));

    expect(logger.entries).toEqual([
      expect.objectContaining({
        level: 'warn',
        logger: 'security',
        code: ERROR_CODES.secretMaskingFailed,
        runId: '20261011-090503-understand',
        agentTaskId: 'task-1',
        callId: '20261011-090503-understand#1',
      }),
    ]);
  });

  it('RF-141 counts the blocked call and writes no egress line', async () => {
    const { guard, manifest, egressLines } = await egressHarness({ masker: new FailingMasker() });

    await failureOf(guard.complete(requestWith(readConversation(toolResult({ text: 'x' })))));

    expect((await manifest())?.security.blockedCalls).toBe(1);
    expect(await egressLines()).toEqual([]);
  });
});
