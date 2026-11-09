import { z } from 'zod';
import type { ApiClient, ApiResult } from './client.js';

// RF-143, DEC-209 (P8-81): the consent of a project that holds for the roles a page starts, which
// the page shows as one line instead of the boxes, and withdrawing it. Another user's project
// answers 404 like an unknown one.

/** The start a page makes: an understand run or a Deepen (`understand`), or a plan (`plan`). */
export type ConsentStart = 'understand' | 'plan';

const heldConsentSchema = z.object({
  id: z.string(),
  givenAt: z.string(),
  endsAt: z.string(),
  providers: z.array(z.string()),
  kinds: z.array(z.string()),
});

export type HeldConsent = z.infer<typeof heldConsentSchema>;

const readSchema = z.object({ consent: heldConsentSchema.nullable() });

const consentPath = (projectId: string): string =>
  `/api/projects/${encodeURIComponent(projectId)}/consent`;

// RF-143
export async function readConsent(
  client: ApiClient,
  request: { readonly projectId: string; readonly start: ConsentStart },
  signal: AbortSignal,
): Promise<ApiResult<HeldConsent | undefined>> {
  const result = await client.request({
    method: 'GET',
    path: `${consentPath(request.projectId)}?for=${request.start}`,
    schema: readSchema,
    signal,
  });
  return result.ok ? { ok: true, value: result.value.consent ?? undefined } : result;
}

// RF-143
export function withdrawConsent(
  client: ApiClient,
  projectId: string,
): Promise<ApiResult<{ readonly withdrawn: number }>> {
  return client.request({
    method: 'DELETE',
    path: consentPath(projectId),
    schema: z.object({ withdrawn: z.number() }),
  });
}
