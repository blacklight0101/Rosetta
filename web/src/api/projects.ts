import type { ApiClient, ApiResult } from './client.js';
import { projectOverviewSchema, type ProjectOverviewRow } from './overview-schemas.js';
import { projectSchema, type Project, type ProjectSettings } from './project-schemas.js';

// RF-010, RF-002, RF-1105: the project calls of the projects and project settings pages. Every
// answer is parsed before use; another user's project answers 404 like an unknown one.

export interface CreatedProject {
  readonly project: Project;
  /** False when the address was already a project of this user: the existing one comes back. */
  readonly created: boolean;
}

/** The project in an answer body, or undefined when the body is not a project. */
export function parseProject(body: unknown): Project | undefined {
  const parsed = projectSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
}

/** The user's projects with their run count, totals and latest run (RF-1008, RF-1108). */
// RF-1008
export async function listProjectOverview(
  client: ApiClient,
  signal: AbortSignal,
): Promise<
  ApiResult<{ readonly rows: readonly ProjectOverviewRow[]; readonly truncated: boolean }>
> {
  const result = await client.request({
    method: 'GET',
    path: '/api/projects/overview',
    schema: projectOverviewSchema,
    signal,
  });
  return result.ok
    ? { ok: true, value: { rows: result.value.projects, truncated: result.value.truncated } }
    : result;
}

// RF-010
export async function createProject(
  client: ApiClient,
  url: string,
): Promise<ApiResult<CreatedProject>> {
  let status = 0;
  const result = await client.request({
    method: 'POST',
    path: '/api/projects',
    body: { url },
    schema: projectSchema,
    onStatus: (answered) => {
      status = answered;
    },
  });
  return result.ok
    ? { ok: true, value: { project: result.value, created: status === 201 } }
    : result;
}

// RF-010
export function getProject(
  client: ApiClient,
  projectId: string,
  signal: AbortSignal,
): Promise<ApiResult<Project>> {
  return client.request({
    method: 'GET',
    path: `/api/projects/${encodeURIComponent(projectId)}`,
    schema: projectSchema,
    signal,
  });
}

/**
 * Replaces the whole settings document of the project (RF-002). The save names the version of the
 * settings it started from, so the server refuses it (RST-1007) when they were saved since.
 */
// RF-002
export function saveProjectSettings(
  client: ApiClient,
  project: Pick<Project, 'id' | 'settingsVersion'>,
  settings: ProjectSettings,
): Promise<ApiResult<Project>> {
  return client.request({
    method: 'PUT',
    path: `/api/projects/${encodeURIComponent(project.id)}/settings`,
    ifMatch: `"${String(project.settingsVersion)}"`,
    body: settings,
    schema: projectSchema,
  });
}
