import type { ServerKeyPresence } from '../application/ports/server-key-presence.js';
import type { Environment } from '../infrastructure/config/environment.js';

// Architecture section 2 (composition root), RF-1104: which providers the server holds a key for,
// from its environment variables. Only the fact that a key is set leaves this function. In test
// mode the model double answers every role (ADR-008), so no key is needed.

/** The providers `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` stand for; none other has a server key. */
export function serverKeyPresence(
  environment: Pick<Environment, 'openaiApiKey' | 'anthropicApiKey'>,
  testDoubles: boolean,
): ServerKeyPresence {
  return {
    has: (provider) => {
      if (testDoubles) return true;
      if (provider === 'openai') return environment.openaiApiKey !== undefined;
      if (provider === 'anthropic') return environment.anthropicApiKey !== undefined;
      return false;
    },
  };
}
