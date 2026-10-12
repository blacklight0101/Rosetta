import type { KeyProvider } from '../api/schemas.js';

// RF-1104: the providers a user stores a key for, in the order the settings page lists them.

export interface ProviderMeta {
  readonly id: KeyProvider;
  readonly label: string;
  readonly hint: string;
  /** An OpenAI-compatible key carries the base URL of its endpoint. */
  readonly takesBaseUrl: boolean;
}

export const providers: readonly ProviderMeta[] = [
  { id: 'openai', label: 'OpenAI', hint: 'OpenAI API key', takesBaseUrl: false },
  { id: 'anthropic', label: 'Anthropic', hint: 'Anthropic API key', takesBaseUrl: false },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible',
    hint: 'OpenRouter, Groq, DeepSeek, Gemini or another https endpoint',
    takesBaseUrl: true,
  },
];
