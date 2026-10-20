import { z } from 'zod';
import type { ApiClient, ApiResult } from './client.js';

// RF-405, DEC-156: the models a role of a provider can be set to. `priced` is false for a model the
// price table has no price for (shown as "no price"); `reason` says why Ollama could not be asked.

const modelChoicesSchema = z.object({
  provider: z.string(),
  models: z.array(z.object({ model: z.string(), label: z.string(), priced: z.boolean() })),
  reason: z.string().optional(),
});

export type ModelChoices = z.output<typeof modelChoicesSchema>;

// RF-405
export function getModelChoices(
  client: ApiClient,
  provider: string,
  signal: AbortSignal,
): Promise<ApiResult<ModelChoices>> {
  return client.request({
    method: 'GET',
    path: `/api/models/${encodeURIComponent(provider)}`,
    schema: modelChoicesSchema,
    signal,
  });
}
