import type { ErrorCode, ErrorDescription } from './codes.js';

// RF-007, RF-404, RF-406: the plain message and the next step of the Anthropic adapter's permanent
// failures, in numeric order. descriptions.ts merges them with the rest; describeError there is
// the only way to read them.

export type AnthropicErrorCode = Extract<ErrorCode, 'RST-1518' | 'RST-1519' | 'RST-1520'>;

export const ANTHROPIC_ERROR_DESCRIPTIONS: Readonly<Record<AnthropicErrorCode, ErrorDescription>> =
  {
    'RST-1518': {
      message: 'Anthropic rejected the API key.',
      nextStep:
        'Check the Anthropic key in your account settings (or ANTHROPIC_API_KEY on the server), then start the run again.',
    },
    'RST-1519': {
      message: 'The configured model does not exist at Anthropic or this key cannot use it.',
      nextStep:
        'Choose a model the key can use (see docs/providers.md) in the project settings, then start the run again.',
    },
    'RST-1520': {
      message: 'The Anthropic account has no credit left.',
      nextStep: 'Add credit in the Anthropic Console billing settings, then start the run again.',
    },
  };
