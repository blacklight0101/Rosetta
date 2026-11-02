import { describe, expect, it } from 'vitest';
import { serverKeyOf } from '../../../src/presentation/compose-start-caps.js';
import { serverKeyPresence } from '../../../src/presentation/server-key-presence.js';

// RF-431, EV-44: an empty server key variable (`ANTHROPIC_API_KEY=`) is no key, so a run on it is
// refused before it is queued instead of failing RST-2302 at $0.

describe('RF-431 an empty server key is no key', () => {
  it('RF-431 an empty or blank variable counts as absent', () => {
    expect(serverKeyOf('')).toBeUndefined();
    expect(serverKeyOf('   ')).toBeUndefined();
    expect(serverKeyOf(undefined)).toBeUndefined();
    expect(serverKeyOf('sk-held')).toBe('sk-held');
  });

  it('RF-431 the presence check says the server holds no key for an empty variable', () => {
    const presence = serverKeyPresence({ openaiApiKey: 'sk-held', anthropicApiKey: '' }, false);

    expect(presence.has('openai')).toBe(true);
    expect(presence.has('anthropic')).toBe(false);
  });
});
