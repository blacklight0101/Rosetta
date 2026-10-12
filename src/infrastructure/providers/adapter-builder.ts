import type { Logger } from '../../application/ports/logger.js';
import type { AdapterBuilder } from './adapter-spec.js';
import { AnthropicProvider } from './anthropic/anthropic-provider.js';
import { OllamaProvider } from './ollama/ollama-provider.js';
import { OpenAiProvider } from './openai/openai-provider.js';

// ADR-003, ADR-006, ADR-007, RNF-005: the one place that constructs the provider adapters of this
// release. It returns an adapter that is NOT wrapped in the guards; only the provider factory wraps
// one. What keeps it so: the dependency-cruiser rules `adapters-only-via-adapter-builder` (only this
// file imports an adapter class) and `adapter-builder-only-in-compose-providers` (only
// src/presentation/compose-providers.ts imports this file, and hands the builder to the factory as
// an `AdapterBuilder`), and a source-scan test that names every file mentioning this module.
// The key is passed per call from the factory's key choice; an adapter never reads one, or a URL,
// from the environment.

export interface RealAdapterParts {
  /** `ROSETTA_TEST=1`: the adapters then refuse every host but a loopback fake server (RNF-005). */
  readonly testMode: boolean;
  /** The text of prompts/shared/text-tool-protocol.v1.md (RF-205). */
  readonly textProtocolPrompt: string;
  readonly logger: Logger;
}

// RF-401, RF-402, RF-404
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
        if (spec.apiKey === undefined) return undefined;
        return new AnthropicProvider({
          ...{ baseUrl, timeoutSeconds, maxRetries, testMode },
          apiKey: spec.apiKey,
        });
      case 'openai-compatible':
      case 'fake':
        return undefined;
    }
  };
}
