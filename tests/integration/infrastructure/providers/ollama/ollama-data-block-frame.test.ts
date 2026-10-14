import { describe, expect, it } from 'vitest';
import type { LlmRequest } from '../../../../../src/application/ports/llm-provider.js';
import { footerOf, tagOf } from '../../../../support/data-block-tags.js';
import {
  egressHarness,
  readConversation,
  requestWith,
  toolResult,
} from '../../../../support/egress-harness.js';
import { useFakeOllama } from '../../../../support/ollama-harness.js';
import { useFakeOpenAi } from '../../../../support/openai-harness.js';

// RF-145, RF-205, ADR-013, DEC-129: a tool result reaches the model as the lines of its data-block
// frame, the opening and closing markers with their random tag each alone on a line, never as one
// JSON string with escaped line breaks (ADR-008: fake servers).

const startOllama = useFakeOllama();
const startOpenAi = useFakeOpenAi();

const fileText = 'class Catalog\n{\n    int Count;\n}';

function frameRequest(): LlmRequest {
  return requestWith(readConversation(toolResult({ text: fileText })));
}

/** The tag of the one data block the request holds. */
function frameTag(request: LlmRequest): string {
  const result = request.messages.at(-1);
  return tagOf(result?.content ?? '');
}

/** The `content` of every message of a chat body that is not the system prompt. */
function contents(bodies: unknown[]): string[] {
  const [body] = bodies;
  const messages: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'messages') : [];
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(1)
    .map((message: unknown): unknown =>
      typeof message === 'object' && message !== null ? Reflect.get(message, 'content') : '',
    )
    .filter((content): content is string => typeof content === 'string');
}

/** What the model reads of a frame: whether each marker stands alone and the content lines. */
function frameOf(sent: string, tag: string) {
  const lines = sent.split('\n');
  return {
    footerAlone: lines.includes(footerOf(tag)),
    headerAlone: lines.some((line) => line.startsWith(`<<<ROSETTA-DATA ${tag} {`)),
    content: lines.filter((line) => fileText.split('\n').includes(line)),
    escapedBreaks: sent.includes(String.raw`\n`),
  };
}

const wanted = {
  footerAlone: true,
  headerAlone: true,
  content: fileText.split('\n'),
  escapedBreaks: false,
};

describe('data-block frames reach Ollama on separate lines', () => {
  it('RF-145 a text-mode tool result holds each marker alone on its line', async () => {
    const { provider, server } = await startOllama('contract-text', { toolMode: 'text' });
    const harness = await egressHarness({ inner: provider });
    const request = frameRequest();

    await harness.guard.complete(request);

    const sent = contents(server.chatBodies()).at(-1) ?? '';
    expect(frameOf(sent, frameTag(request))).toEqual(wanted);
  });

  it('RF-145 a native-mode tool message holds each marker alone on its line', async () => {
    const { provider, server } = await startOllama('contract-text', { toolMode: 'native' });
    const harness = await egressHarness({ inner: provider });
    const request = frameRequest();

    await harness.guard.complete(request);

    const sent = contents(server.chatBodies()).at(-1) ?? '';
    expect(frameOf(sent, frameTag(request))).toEqual(wanted);
  });

  it('RF-145 the egress guard still passes the request and logs the excerpt', async () => {
    const { provider } = await startOllama('contract-text', { toolMode: 'text' });
    const harness = await egressHarness({ inner: provider });

    const response = await harness.guard.complete(frameRequest());

    expect(response.text).toBe('The Catalog area lists products from the database.');
    expect(await harness.egressLines()).not.toHaveLength(0);
  });
});

describe('data-block frames reach OpenAI on separate lines', () => {
  it('RF-145 a tool message holds each marker alone on its line', async () => {
    const { provider, server } = await startOpenAi('contract-text');
    const harness = await egressHarness({ inner: provider, kind: 'openai', cloudConsent: true });
    const request = frameRequest();

    await harness.guard.complete(request);

    const sent = contents(server.chatBodies()).at(-1) ?? '';
    expect(frameOf(sent, frameTag(request))).toEqual(wanted);
  });
});
