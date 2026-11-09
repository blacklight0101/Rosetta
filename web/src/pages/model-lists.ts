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
  /** DEC-163: the maximum output the shipped list gives the model, when it gives one. */
  readonly maxOutputTokens?: number | undefined;
  /** P3-130: the model cannot call tools on Chat Completions. */
  readonly noTools?: true | undefined;
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

/** The providers that sell a fixed set of models: their list is the shipped one (`prices/models.yaml`). */
const shippedListProviders: readonly string[] = ['anthropic', 'openai'];

/** Whether the provider's models are the shipped list; Ollama lists what is installed instead. */
export function hasShippedList(provider: string): boolean {
  return shippedListProviders.includes(provider);
}

/**
 * RF-436, P8-72: the model that choosing a provider selects for a role: the first model of the
 * shipped list, in the order of the file, that the role can use (a role that calls tools skips a
 * model marked as unable to). Undefined while the list is not ready, for a provider with no shipped
 * list and when no listed model suits the role.
 */
export function recommendedModel(
  provider: string,
  list: ModelListState | undefined,
  needsTools: boolean,
): string | undefined {
  if (!hasShippedList(provider) || list?.status !== 'ready') return undefined;
  return list.models.find((entry) => !(needsTools && entry.noTools === true))?.model;
}
