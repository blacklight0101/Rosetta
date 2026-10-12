import type { LlmProvider, ProviderKind } from '../../application/ports/llm-provider.js';
import type { ContextSetting } from './ollama/ollama-context.js';

// ADR-003: what the provider factory asks an adapter builder for. Kept apart from the builder, so
// the factory does not import the module that constructs the adapters.

/** Everything an adapter needs for one role, as the factory resolved it. */
export interface AdapterSpec {
  /** The provider's name in the project settings. */
  readonly name: string;
  readonly kind: ProviderKind;
  /** The URL the adapter connects to, from the one parse that also gave the guard its host. */
  readonly baseUrl: string;
  /** The key the factory chose for this role; undefined for a provider that takes none. */
  readonly apiKey: string | undefined;
  readonly timeoutSeconds: number;
  readonly maxRetries: number;
  readonly toolMode: 'native' | 'text';
  /** Ollama only. */
  readonly contextTokens: ContextSetting | undefined;
}

/** The adapter for the spec, or undefined for a kind this release has no adapter for. */
export type AdapterBuilder = (spec: AdapterSpec) => LlmProvider | undefined;
