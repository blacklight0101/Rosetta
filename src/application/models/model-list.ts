// RF-405, DEC-156: the shipped list of models a role can be set to without typing its name
// (`prices/models.yaml`, versioned like the price table). Only providers that sell a fixed set of
// models appear here; Ollama lists what is installed on the server instead.

export interface ListedModel {
  /** The provider kind, for example `anthropic`. */
  readonly provider: string;
  /** The model id sent to the provider. */
  readonly model: string;
  /** The name shown in the dropdown. */
  readonly label: string;
}

export interface ModelList {
  /** The date the list was checked, `YYYY-MM-DD`. */
  readonly version: string;
  readonly models: readonly ListedModel[];
}
