import type { ApiClient, ApiResult } from './client.js';
import { journeySchema, type JourneyFacts } from './journey-schemas.js';

// RF-615: the call behind the journey strip. Another user's project or run answers 404 like an
// unknown one.

/** The facts of the journey of an understand or a plan run, or of the project's newest when none is named. */
// RF-615
export function getJourney(
  client: ApiClient,
  request: { readonly projectId: string; readonly runId?: string | undefined },
  signal: AbortSignal,
): Promise<ApiResult<JourneyFacts>> {
  const { projectId, runId } = request;
  const query = runId === undefined ? '' : `?run=${encodeURIComponent(runId)}`;
  return client.request({
    method: 'GET',
    path: `/api/projects/${encodeURIComponent(projectId)}/journey${query}`,
    schema: journeySchema,
    signal,
  });
}
