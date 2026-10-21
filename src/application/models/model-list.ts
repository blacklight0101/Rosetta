// RF-405, DEC-156: the shipped list of models a role can be set to without typing its name
// (`prices/models.yaml`, versioned like the price table). Only providers that sell a fixed set of
// models appear here; Ollama lists what is installed on the server instead.

import type { ProviderKind } from '../ports/llm-provider.js';

interface ListedModel {
  /** The provider kind, for example `anthropic`. */
  readonly provider: string;
  /** The model id sent to the provider. */
  readonly model: string;
  /** The name shown in the dropdown. */
  readonly label: string;
  /** Q-58: the model takes a reasoning effort on the provider's API. */
  readonly reasoning?: true;
}

export interface ModelList {
  /** The date the list was checked, `YYYY-MM-DD`. */
  readonly version: string;
  readonly models: readonly ListedModel[];
}

/** Q-58: whether the shipped list marks a model of this provider kind as a reasoning model. */
export type ReasoningModels = (kind: ProviderKind, model: string) => boolean;

// Q-58 (skeleton: the marker is read by the next commit)
export function reasoningModelsOf(list: ModelList): ReasoningModels {
  return () => list.models.length < 0;
}
