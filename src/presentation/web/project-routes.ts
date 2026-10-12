import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { URL_REASONS } from '../../application/projects/url-reasons.js';
import type { Project } from '../../application/projects/project.js';
import type { CreateProject } from '../../application/use-cases/create-project.js';
import type { GetProject } from '../../application/use-cases/get-project.js';
import type { ListProjects } from '../../application/use-cases/list-projects.js';
import type { OpenWorkspace } from '../../application/use-cases/open-workspace.js';
import type { UpdateProjectSettings } from '../../application/use-cases/update-project-settings.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { FieldProblemsError } from '../../domain/errors/field-problems.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { formatInstant } from '../../infrastructure/system/instant.js';
import { signedInOf } from './request-actor.js';

// RF-010, RF-002, RF-1105, RF-1109: the projects API.
// - POST /api/projects creates a project from a GitHub URL (201), or answers the existing one (200).
// - GET /api/projects lists the signed-in user's projects.
// - GET /api/projects/:id shows one; another user's id answers 404 like an unknown one.
// - PUT /api/projects/:id/settings replaces the settings document; each problem comes back with its
//   field and error code (400).
// - GET /api/admin/users/:id/projects (administrator) reads another user's projects and writes an
//   audit row.
// The `userId` of a project never leaves the server.

export interface ProjectServices {
  readonly createProject: CreateProject;
  readonly listProjects: ListProjects;
  readonly getProject: GetProject;
  readonly updateProjectSettings: UpdateProjectSettings;
  readonly openWorkspace: OpenWorkspace;
}

const CREATE_BODY_LIMIT_BYTES = 4096;
const SETTINGS_BODY_LIMIT_BYTES = 262_144;
const MAX_URL_LENGTH = 2048;

const createBody = z.strictObject({ url: z.string().max(MAX_URL_LENGTH) });

interface IdParams {
  readonly id: string;
}

function projectView(project: Project): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    sourceUrl: project.sourceUrl,
    ref: project.ref,
    subpath: project.subpath,
    settings: project.settings,
    createdAt: formatInstant(project.createdAt),
    updatedAt: formatInstant(project.updatedAt),
  };
}

function notFound(): RosettaError {
  return new RosettaError(ERROR_CODES.notFound);
}

function registerCreate(server: FastifyInstance, services: ProjectServices): void {
  server.post(
    '/api/projects',
    { bodyLimit: CREATE_BODY_LIMIT_BYTES, config: { access: 'user' } },
    async (request, reply) => {
      const body = createBody.safeParse(request.body);
      if (!body.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const outcome = await services.createProject.execute({
        actor: signedInOf(request).actor,
        url: body.data.url,
      });
      if (!outcome.ok) {
        const { code, reason } = outcome.error;
        throw new FieldProblemsError(code, [{ field: 'url', code, reason: URL_REASONS[reason] }]);
      }
      const { project, created } = outcome.value;
      return reply.status(created ? 201 : 200).send(projectView(project));
    },
  );
}

function registerRead(server: FastifyInstance, services: ProjectServices): void {
  server.get('/api/projects', { config: { access: 'user' } }, async (request, reply) => {
    const projects = await services.listProjects.execute({ actor: signedInOf(request).actor });
    return reply.status(200).send({ projects: projects.map(projectView) });
  });

  server.get<{ Params: IdParams }>(
    '/api/projects/:id',
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.getProject.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
      });
      if (!outcome.ok) throw notFound();
      return reply.status(200).send(projectView(outcome.value));
    },
  );
}

function registerSettings(server: FastifyInstance, services: ProjectServices): void {
  server.put<{ Params: IdParams }>(
    '/api/projects/:id/settings',
    { bodyLimit: SETTINGS_BODY_LIMIT_BYTES, config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.updateProjectSettings.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
        settings: request.body,
      });
      if (outcome.ok) return reply.status(200).send(projectView(outcome.value));
      if (outcome.error.code === ERROR_CODES.notFound) throw notFound();
      throw new FieldProblemsError(outcome.error.code, outcome.error.problems);
    },
  );
}

function registerWorkspace(server: FastifyInstance, services: ProjectServices): void {
  server.get<{ Params: IdParams }>(
    '/api/admin/users/:id/projects',
    { config: { access: 'admin' } },
    async (request, reply) => {
      const outcome = await services.openWorkspace.execute({
        actor: signedInOf(request).actor,
        ownerId: request.params.id,
        ip: request.ip,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      const { owner, projects } = outcome.value;
      return reply.status(200).send({ owner, projects: projects.map(projectView) });
    },
  );
}

// RF-010, RF-002, RF-1105
export function registerProjectRoutes(server: FastifyInstance, services: ProjectServices): void {
  registerCreate(server, services);
  registerRead(server, services);
  registerSettings(server, services);
  registerWorkspace(server, services);
}
