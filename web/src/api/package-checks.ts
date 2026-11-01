import { z } from 'zod';
import type { ApiClient, ApiResult } from './client.js';

// RF-1015, run-routes.ts: the sections of the checks.md of the package a plan run wrote, split by the
// server. The text comes from the package and the model: shown as text, never as HTML.

const checksSchema = z.looseObject({
  sections: z.array(z.looseObject({ title: z.string(), text: z.string() })),
});

export type PackageChecks = z.output<typeof checksSchema>;
export type CheckSection = PackageChecks['sections'][number];

// RF-1015
export function getPackageChecks(
  client: ApiClient,
  runId: string,
  signal: AbortSignal,
): Promise<ApiResult<PackageChecks>> {
  return client.request({
    method: 'GET',
    path: `/api/runs/${encodeURIComponent(runId)}/checks`,
    schema: checksSchema,
    signal,
  });
}
