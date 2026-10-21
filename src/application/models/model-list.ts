// RF-405, DEC-156: the shipped list of models a role can be set to without typing its name
// (`prices/models.yaml`, versioned like the price table). Only providers that sell a fixed set of
// models appear here; Ollama lists what is installed on the server instead.

interface ListedModel {
  /** The provider kind, for example `anthropic`. */
  readonly provider: string;
  /** The model id sent to the provider. */
  readonly model: string;
  /** The name shown in the dropdown. */
  readonly label: string;
  /** The context window from the provider's model page, in tokens; absent when not confirmed (Q-57). */
  readonly contextTokens?: number | undefined;
  /** The maximum output from the provider's model page, in tokens; absent when not confirmed (Q-57). */
  readonly maxOutputTokens?: number | undefined;
}

export interface ModelList {
  /** The date the list was checked, `YYYY-MM-DD`. */
  readonly version: string;
  readonly models: readonly ListedModel[];
}

/** A list that gives no model any number: every hosted model keeps 128,000 tokens of context (Q-57). */
export const NO_LISTED_MODELS: ModelList = { version: '0000-00-00', models: [] };
