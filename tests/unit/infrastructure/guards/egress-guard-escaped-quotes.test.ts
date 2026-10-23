import { describe, expect, it } from 'vitest';
import {
  egressHarness,
  requestWith,
  toolResult,
  readConversation,
} from '../../../support/egress-harness.js';

// P3-128 (RF-141, RF-145): a setting between backslash-escaped quotes does not reach a provider.
// Synthetic values only (RNF-003).

const bs = String.fromCharCode(92);
const eq = `${bs}"`;
const fakePassword = 'FAKE-pw-0000';
const text = `Password=${eq}${fakePassword}${eq} and ${eq}x${eq}`;

describe('EgressGuard masks a value between escaped quotes', () => {
  it('RF-141 masks it in the system prompt, a message and a tool result', async () => {
    const { guard, fake } = await egressHarness();
    const messages = [
      { role: 'user' as const, content: `Read this: ${text}` },
      ...readConversation(toolResult({ text })).slice(1),
    ];

    await guard.complete(requestWith(messages, `System ${text}`));

    const sent = JSON.stringify(fake.requests);
    expect(sent).not.toContain(fakePassword);
    expect(sent).toContain('MASKED:password');
  });
});
