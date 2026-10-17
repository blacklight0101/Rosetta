import { describe, expect, it } from 'vitest';
import type { LlmMessage } from '../../../../src/application/ports/llm-provider.js';
import { backslash, fakePassword, passwordOption } from '../../../support/continuation-breaks.js';
import { egressHarness, requestWith, toolResult } from '../../../support/egress-harness.js';

// RF-141, RNF-003, P2-42: what the carry of a continuation does to the pages that follow it: the
// rest of a page is never changed, a tail is used once, and the key forms are carried too.

function reads(pieces: readonly string[]): LlmMessage[] {
  return pieces.flatMap((text, index): LlmMessage[] => {
    const id = `call-${String(index)}`;
    return [
      { role: 'assistant', content: '', toolCalls: [{ id, name: 'read_file', arguments: {} }] },
      { role: 'tool', toolCallId: id, content: toolResult({ text }).content },
    ];
  });
}

async function pagesSent(pieces: readonly string[]): Promise<string[]> {
  const { guard, fake } = await egressHarness();
  await guard.complete(requestWith(reads(pieces)));
  return (fake.requests[0]?.messages ?? []).map((message) => message.content);
}

const keep = `  --header X-Keep-This-Intact ${backslash}\n  http://example.com`;

describe('EgressGuard and the pages after a continuation', () => {
  it('RF-141 keeps the next page whole when the tail holds a value', async () => {
    const [, , , second] = await pagesSent([
      `curl ${passwordOption} ${fakePassword}${fakePassword} ${backslash}\n`,
      keep,
    ]);

    expect(second).toContain(keep);
  });

  it('RF-141 keeps the next page whole when the tail has no line break', async () => {
    const [, , , second] = await pagesSent([`curl ${passwordOption} ${backslash}`, keep]);

    expect(second).toContain(keep);
  });

  it('RF-141 uses a tail once', async () => {
    const plain = 'Plain words of a third page';
    const pages = await pagesSent([`run ${passwordOption} ${backslash}\n`, '--verbose', plain]);

    expect(pages[5]).toContain(plain);
  });

  it.each([
    ['password:', 'password: ' + backslash],
    ['export PASSWORD=', 'export PASSWORD=' + backslash],
    ['pwd =', 'pwd = ' + backslash],
  ])('RF-141 masks a value on the next page after %s', async (_name, head) => {
    const sent = (await pagesSent([`${head}\n`, `  ${fakePassword}\n`])).join('\n');

    expect(sent).not.toContain(fakePassword);
  });
});
