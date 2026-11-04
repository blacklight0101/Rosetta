import { z } from 'zod';
import type { ApiClient, ApiResult } from './client.js';

// RF-230, RF-1005, run-routes.ts: the files of every area of a run with the lines read of each, from
// the run's `coverage.json`. Paths and notes come from the repository and a model: shown as text.

const lines = z.object({ startLine: z.number().int(), endLine: z.number().int() });

const listingSchema = z.looseObject({
  areas: z.array(
    z.looseObject({
      area: z.string(),
      files: z.array(z.looseObject({ path: z.string(), read: z.array(lines) })),
      /** P8-93: the share of the area's first-party tokens read (0 to 1); absent in older files. */
      firstPartyShare: z.number().optional(),
      note: z.string().optional(),
      failure: z.string().optional(),
    }),
  ),
});

export type CoverageListing = z.output<typeof listingSchema>;

// RF-230
export function getRunCoverage(
  client: ApiClient,
  runId: string,
  signal: AbortSignal,
): Promise<ApiResult<CoverageListing>> {
  return client.request({
    method: 'GET',
    path: `/api/runs/${encodeURIComponent(runId)}/coverage`,
    schema: listingSchema,
    signal,
  });
}
