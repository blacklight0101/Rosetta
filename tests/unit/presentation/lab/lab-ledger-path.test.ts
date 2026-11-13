import { describe, expect, it } from 'vitest';
import { holdLifetimeProblem } from '../../../../src/presentation/lab/lab-ledger-path.js';

// RF-1402: a hold must outlive the longest call, except where a call costs nothing.

const slow = { timeoutSeconds: 600, maxRetries: 5 } as const;

describe('the hold lifetime check', () => {
  it('RF-1402 refuses a provider whose call could outlive the hold', () => {
    expect(holdLifetimeProblem('openai', { kind: 'openai', ...slow })).toContain('30 minutes');
  });

  it('RF-1402 lets a local Ollama provider start: its calls cost nothing, so a hold that expires loses nothing', () => {
    expect(holdLifetimeProblem('ollama', { kind: 'ollama', ...slow })).toBeUndefined();
  });
});
