import type { ApiClient, ApiResult } from './client.js';
import { sessionSchema, type Session } from './schemas.js';

// RF-1100: who is signed in. The answer carries the CSRF token for the state-changing requests
// that follow, which the client keeps in memory.

export async function loadSession(
  client: ApiClient,
  signal?: AbortSignal,
): Promise<ApiResult<Session>> {
  const result = await client.request({
    method: 'GET',
    path: '/api/session',
    schema: sessionSchema,
    ...(signal === undefined ? {} : { signal }),
  });
  if (result.ok) client.setCsrfToken(result.value.csrfToken);
  return result;
}
