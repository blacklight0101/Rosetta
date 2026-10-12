import type { LlmProvider, ProviderKind } from '../../application/ports/llm-provider.js';
import type { Logger } from '../../application/ports/logger.js';
import type { ContextSetting } from './ollama/ollama-context.js';
import { OllamaProvider } from './ollama/ollama-provider.js';
import { OpenAiProvider } from './openai/openai-provider.js';

// ADR-003, ADR-006, ADR-007, RNF-005: the one place that constructs the provider adapters of this
// release. Only the provider factory calls it (dependency-cruiser rule
// `adapters-only-via-adapter-builder`), and the factory wraps whatever it returns in the guards, so
// no adapter is ever held without them. The key is passed per call from the factory's key choice;
// an adapter never reads one, or a URL, from the environment.

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

export interface RealAdapterParts {
  /** `ROSETTA_TEST=1`: the adapters then refuse every host but a loopback fake server (RNF-005). */
  readonly testMode: boolean;
  /** The text of prompts/shared/text-tool-protocol.v1.md (RF-205). */
  readonly textProtocolPrompt: string;
  readonly logger: Logger;
}

// RF-401, RF-402
export function realAdapters(parts: RealAdapterParts): AdapterBuilder {
  const { testMode, textProtocolPrompt, logger } = parts;
  return (spec) => {
    const { baseUrl, timeoutSeconds, maxRetries } = spec;
    switch (spec.kind) {
      case 'ollama':
        return new OllamaProvider({
          ...{ baseUrl, timeoutSeconds, maxRetries, testMode, textProtocolPrompt, logger },
          toolMode: spec.toolMode,
          ...(spec.contextTokens === undefined ? {} : { contextTokens: spec.contextTokens }),
        });
      case 'openai':
        if (spec.apiKey === undefined) return undefined;
        return new OpenAiProvider({
          ...{ baseUrl, timeoutSeconds, maxRetries, testMode },
          apiKey: spec.apiKey,
        });
      case 'anthropic':
      case 'openai-compatible':
      case 'fake':
        return undefined;
    }
  };
}
