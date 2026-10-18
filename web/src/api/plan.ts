import type { ApiClient, ApiResult } from './client.js';
import {
  briefViewSchema,
  catalogueSchema,
  planEstimateSchema,
  planOptionsSchema,
  type BriefView,
  type Catalogue,
  type PlanEstimate,
  type PlanOptions,
} from './plan-schemas.js';
import { startedRunSchema, type StartedRun } from './estimate-schemas.js';

// RF-605, RF-606, RF-608, RF-613, RF-604: the calls of the Plan setup page. Every answer is parsed
// before use; another user's project answers 404 like an unknown one.

/** The planner call takes a model's time, longer than the client's default. */
const OPTIONS_TIMEOUT_MS = 130_000;

const projectPath = (projectId: string): string => `/api/projects/${encodeURIComponent(projectId)}`;

/** What a save sends: only the answered parts; a part left out takes its default (DEC-80). */
export interface BriefAnswers {
  readonly principles?: readonly string[];
  readonly architecture?: {
    readonly style: string;
    readonly recommended: readonly string[];
    readonly evidence: readonly string[];
  };
  readonly migration?: string;
  readonly stack?: readonly { layer: string; choice: string; custom: boolean }[];
  readonly context?: Readonly<Record<string, unknown>>;
  readonly buildMethod?: { readonly aiAssisted: boolean };
}

// RF-606
export function getCatalogue(
  client: ApiClient,
  signal: AbortSignal,
): Promise<ApiResult<Catalogue>> {
  return client.request({
    method: 'GET',
    path: '/api/plan/catalogue',
    schema: catalogueSchema,
    signal,
  });
}

// RF-605
export function getPlanningBrief(
  client: ApiClient,
  projectId: string,
  signal: AbortSignal,
): Promise<ApiResult<BriefView>> {
  return client.request({
    method: 'GET',
    path: `${projectPath(projectId)}/planning-brief`,
    schema: briefViewSchema,
    signal,
  });
}

// RF-605
export function savePlanningBrief(
  client: ApiClient,
  projectId: string,
  answers: BriefAnswers,
): Promise<ApiResult<BriefView>> {
  return client.request({
    method: 'PUT',
    path: `${projectPath(projectId)}/planning-brief`,
    body: answers,
    schema: briefViewSchema,
  });
}

// RF-608, RF-609, RF-143
export function getPlanOptions(
  client: ApiClient,
  projectId: string,
  cloudConsent: boolean,
): Promise<ApiResult<PlanOptions>> {
  return client.request({
    method: 'POST',
    path: `${projectPath(projectId)}/plan-options`,
    body: { cloudConsent },
    schema: planOptionsSchema,
    timeoutMs: OPTIONS_TIMEOUT_MS,
  });
}

// RF-613
export function getPlanEstimate(
  client: ApiClient,
  projectId: string,
  signal: AbortSignal,
): Promise<ApiResult<PlanEstimate>> {
  return client.request({
    method: 'GET',
    path: `${projectPath(projectId)}/plan-estimate`,
    schema: planEstimateSchema,
    signal,
  });
}

// RF-604, RF-143
export function startPlanRun(
  client: ApiClient,
  projectId: string,
  cloudConsent: boolean,
): Promise<ApiResult<StartedRun>> {
  return client.request({
    method: 'POST',
    path: `${projectPath(projectId)}/runs`,
    body: { stage: 'plan', cloudConsent },
    schema: startedRunSchema,
  });
}
