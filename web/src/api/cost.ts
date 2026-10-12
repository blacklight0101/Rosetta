import type { ApiClient, ApiResult } from './client.js';
import {
  accountTotalsSchema,
  projectCostSchema,
  type AccountTotals,
  type ProjectCost,
} from './cost-schemas.js';

// RF-428, RF-1010, RF-1106: the cost calls of the totals pill and the cost page. Another user's
// project answers 404 like an unknown one.

// RF-1010
export function getAccountTotals(
  client: ApiClient,
  signal: AbortSignal,
): Promise<ApiResult<AccountTotals>> {
  return client.request({
    method: 'GET',
    path: '/api/account/totals',
    schema: accountTotalsSchema,
    signal,
  });
}

// RF-428
export function getProjectCost(
  client: ApiClient,
  projectId: string,
  signal: AbortSignal,
): Promise<ApiResult<ProjectCost>> {
  return client.request({
    method: 'GET',
    path: `/api/projects/${encodeURIComponent(projectId)}/cost`,
    schema: projectCostSchema,
    signal,
  });
}
