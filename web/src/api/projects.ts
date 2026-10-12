import type { ApiClient, ApiResult } from './client.js';
import {
  projectListSchema,
  projectSchema,
  type Project,
  type ProjectSettings,
} from './project-schemas.js';

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

// RF-010
export async function listProjects(
  client: ApiClient,
  signal: AbortSignal,
): Promise<ApiResult<readonly Project[]>> {
  const result = await client.request({
    method: 'GET',
    path: '/api/projects',
    schema: projectListSchema,
    signal,
  });
  return result.ok ? { ok: true, value: result.value.projects } : result;
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

/** Replaces the whole settings document of the project (RF-002). */
// RF-002
export function saveProjectSettings(
  client: ApiClient,
  projectId: string,
  settings: ProjectSettings,
): Promise<ApiResult<Project>> {
  return client.request({
    method: 'PUT',
    path: `/api/projects/${encodeURIComponent(projectId)}/settings`,
    body: settings,
    schema: projectSchema,
  });
}
