// RF-405, DEC-156: the models a role can be set to, as the pages hold them while they load.

/** One model of a provider's list. */
export interface ModelOption {
  /** The model id that is saved. */
  readonly model: string;
  /** The name shown in the dropdown. */
  readonly label: string;
  /** False when the price table has no price for it: the dropdown says "no price". */
  readonly priced: boolean;
  /** Ollama only (Q-44): the context the model was trained for, when Ollama named one. */
  readonly trainedContext?: number | undefined;
}

export type ModelListState =
  | { readonly status: 'loading' }
  /** The server could not be asked at all (network, session, server error). */
  | { readonly status: 'failed' }
  | {
      readonly status: 'ready';
      readonly models: readonly ModelOption[];
      /** Why Ollama could not be asked, when it could not. */
      readonly reason: string | undefined;
    };
