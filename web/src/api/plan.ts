import type { ApiClient, ApiResult } from './client.js';
import {
  briefViewSchema,
  catalogueSchema,
  planEstimateSchema,
  planOptionsSchema,
  planSourceSchema,
  stackOfferSchema,
  type StackOffer,
  type BriefView,
  type Catalogue,
  type PlanEstimate,
  type PlanOptions,
  type PlanSource,
} from './plan-schemas.js';
import { startedRunSchema, type StartedRun } from './estimate-schemas.js';

// RF-605, RF-606, RF-608, RF-613, RF-604: the calls of the Plan setup page. Every answer is parsed
// before use; another user's project answers 404 like an unknown one.

/** The planner call takes a model's time, longer than the client's default. */
const OPTIONS_TIMEOUT_MS = 130_000;

const projectPath = (projectId: string): string => `/api/projects/${encodeURIComponent(projectId)}`;

/** RF-614: `?run=<run id>` names the understand run a plan route works from; none means the newest. */
const runQuery = (sourceRunId: string | undefined): string =>
  sourceRunId === undefined ? '' : `?run=${encodeURIComponent(sourceRunId)}`;

/** What a save sends: only the answered parts; a part left out takes its default (DEC-80). */
export interface BriefAnswers {
  readonly principles?: readonly string[];
  readonly architecture?: {
    readonly style: string;
    readonly recommended: readonly string[];
    readonly evidence: readonly string[];
  };
  readonly migration?: string;
  readonly stack?: readonly {
    layer: string;
    choice: string;
    custom: boolean;
    offered?: readonly string[] | undefined;
  }[];
  readonly context?: Readonly<Record<string, unknown>>;
  /** RF-645: the option that answered each question, or "typed". */
  readonly chosen?: Readonly<Record<string, string>>;
  /** RF-645: the text of a typed answer, by question id. */
  readonly typed?: Readonly<Record<string, string>>;
  readonly buildMethod?: {
    readonly aiAssisted: boolean;
    readonly agentTool?: { readonly kind: string; readonly name?: string | undefined };
    readonly models?: Readonly<Record<string, string>>;
    /** P6-22: the tier models that run locally; a key only when true. */
    readonly local?: Readonly<Record<string, boolean>>;
  };
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

// RF-614, RF-605
export function getPlanSource(
  client: ApiClient,
  projectId: string,
  sourceRunId: string | undefined,
  signal: AbortSignal,
): Promise<ApiResult<PlanSource>> {
  return client.request({
    method: 'GET',
    path: `${projectPath(projectId)}/plan-source${runQuery(sourceRunId)}`,
    schema: planSourceSchema,
    signal,
  });
}

// P7-29, RF-609, RF-645: the catalogue's options of each stack layer; no code is sent.
export function getStackOffer(
  client: ApiClient,
  projectId: string,
  sourceRunId: string | undefined,
  signal: AbortSignal,
): Promise<ApiResult<StackOffer>> {
  return client.request({
    method: 'GET',
    path: `${projectPath(projectId)}/stack-offer${runQuery(sourceRunId)}`,
    schema: stackOfferSchema,
    signal,
  });
}

/** The consent of the planner, the second confirmation of an upload (RF-132) and the source run. */
interface PlanRequest {
  readonly cloudConsent: boolean;
  readonly privateCodeConfirmed?: boolean | undefined;
  readonly sourceRunId?: string | undefined;
}

/** RF-132: sent only when given, so a GitHub project's request is what it always was. */
function privateField(request: PlanRequest): { readonly privateCodeConfirmed?: true } {
  return request.privateCodeConfirmed === true ? { privateCodeConfirmed: true } : {};
}

// RF-608, RF-609, RF-143, RF-614
export function getPlanOptions(
  client: ApiClient,
  projectId: string,
  request: PlanRequest,
): Promise<ApiResult<PlanOptions>> {
  const { cloudConsent, sourceRunId } = request;
  return client.request({
    method: 'POST',
    path: `${projectPath(projectId)}/plan-options`,
    body: {
      cloudConsent,
      ...privateField(request),
      ...(sourceRunId === undefined ? {} : { sourceRunId }),
    },
    schema: planOptionsSchema,
    timeoutMs: OPTIONS_TIMEOUT_MS,
  });
}

// RF-613, RF-614
export function getPlanEstimate(
  client: ApiClient,
  projectId: string,
  sourceRunId: string | undefined,
  signal: AbortSignal,
): Promise<ApiResult<PlanEstimate>> {
  return client.request({
    method: 'GET',
    path: `${projectPath(projectId)}/plan-estimate${runQuery(sourceRunId)}`,
    schema: planEstimateSchema,
    signal,
  });
}

// RF-604, RF-143, RF-614
export function startPlanRun(
  client: ApiClient,
  projectId: string,
  request: PlanRequest,
): Promise<ApiResult<StartedRun>> {
  const { cloudConsent, sourceRunId } = request;
  return client.request({
    method: 'POST',
    path: `${projectPath(projectId)}/runs`,
    body: {
      ...{ stage: 'plan', cloudConsent },
      ...privateField(request),
      ...(sourceRunId === undefined ? {} : { sourceRunId }),
    },
    schema: startedRunSchema,
  });
}
