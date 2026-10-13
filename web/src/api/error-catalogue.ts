import { z } from 'zod';
import type { ApiClient, ApiResult } from './client.js';

// RF-007, RF-1108: the plain message and next step of one error code, from the server's catalogue.

const descriptionSchema = z.object({ message: z.string(), nextStep: z.string() });

export type ErrorDescription = z.output<typeof descriptionSchema>;

// RF-007
export function getErrorDescription(
  client: ApiClient,
  code: string,
  signal: AbortSignal,
): Promise<ApiResult<ErrorDescription>> {
  return client.request({
    method: 'GET',
    path: `/api/errors/${encodeURIComponent(code)}`,
    schema: descriptionSchema,
    signal,
  });
}
