import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { URL_REASONS } from '../../application/projects/url-reasons.js';
import type { Project } from '../../application/projects/project.js';
import type { CreateProject } from '../../application/use-cases/create-project.js';
import type { GetProject } from '../../application/use-cases/get-project.js';
import type { ListProjects } from '../../application/use-cases/list-projects.js';
import type { StoreUpload } from '../../application/use-cases/store-upload.js';
import type { WorkbookRendererCheck } from '../../application/use-cases/workbook-renderer-check.js';
import type { WorkbookBatches } from '../../application/use-cases/workbook-batches.js';
import type { OpenWorkspace } from '../../application/use-cases/open-workspace.js';
import type { UpdateProjectSettings } from '../../application/use-cases/update-project-settings.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { FieldProblemsError } from '../../domain/errors/field-problems.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { formatInstant } from '../../infrastructure/system/instant.js';
import type { CostServices } from './cost-routes.js';
import {
  registerPlanCatalogueRoutes,
  type PlanCatalogueServices,
} from './plan-catalogue-routes.js';
import { registerPlanSourceRoutes, type PlanSourceServices } from './plan-source-routes.js';
import { registerPlanEstimateRoutes, type PlanEstimateServices } from './plan-estimate-routes.js';
import {
  registerPlanningBriefRoutes,
  type PlanningBriefServices,
} from './planning-brief-routes.js';
import { signedInOf } from './request-actor.js';
import { registerSourceUploadRoutes } from './source-upload-routes.js';
import { registerWorkbookBatchRoutes } from './workbook-batch-routes.js';

// RF-010, RF-002, RF-1105, RF-1109: the projects API.
// - POST /api/projects creates a project from a GitHub URL (201), or answers the existing one (200).
// - GET /api/projects lists the signed-in user's projects.
// - GET /api/projects/:id shows one; another user's id answers 404 like an unknown one.
// - PUT /api/projects/:id/settings replaces the settings document; each problem comes back with its
//   field and error code (400). `If-Match: "<settingsVersion>"` (the ETag of a read) makes the save
//   apply only if the settings were not saved since; otherwise 409 with RST-1007 and nothing is
//   written (P1-106); a malformed value answers 400; without the header the save is unconditional.
// - GET and PUT /api/projects/:id/planning-brief: the planning brief (planning-brief-routes.ts).
// - GET /api/projects/:id/plan-estimate: the estimate of a plan run (plan-estimate-routes.ts).
// - GET /api/projects/:id/plan-source: the understand run Plan setup plans from (plan-source-routes.ts).
// - GET /api/plan/catalogue: the principle catalogue Plan setup lists (plan-catalogue-routes.ts).
// - GET /api/admin/users/:id/projects (administrator) reads another user's projects and writes an
//   audit row.
// The `userId` of a project never leaves the server.

/** The cost routes (RF-428, RF-1010) read the same projects, so they share these services. */
export interface ProjectServices
  extends
    CostServices,
    PlanningBriefServices,
    PlanEstimateServices,
    PlanSourceServices,
    PlanCatalogueServices {
  readonly createProject: CreateProject;
  readonly listProjects: ListProjects;
  readonly getProject: GetProject;
  readonly updateProjectSettings: UpdateProjectSettings;
  readonly openWorkspace: OpenWorkspace;
  /** RF-128: the zip of an upload project (source-upload-routes.ts). */
  readonly storeUpload: StoreUpload;
  /** RF-150: the batches of a workbook project (workbook-batch-routes.ts). */
  readonly workbookBatches: WorkbookBatches;
  /** P3-108: whether the workbooks a project holds were rendered by an older renderer. */
  readonly workbookRenderer: WorkbookRendererCheck;
}

const CREATE_BODY_LIMIT_BYTES = 4096;
const SETTINGS_BODY_LIMIT_BYTES = 262_144;
const MAX_URL_LENGTH = 2048;

const createBody = z.strictObject({ url: z.string().max(MAX_URL_LENGTH) });
// RF-128: a project that takes a zip; the name is checked by the use case, as the GitHub address is.
// RF-150: the same for a project of Excel workbooks.
const uploadBody = z.strictObject({
  sourceKind: z.enum(['upload', 'workbook']),
  name: z.string(),
});

interface IdParams {
  readonly id: string;
}

/** What the page shows of the zip or the workbooks of a sent source (RF-128, RF-150). */
function sourceView(project: Project): Record<string, unknown> | null {
  if (project.upload === undefined) return null;
  const { fileName, uploadedAt, workbooks } = project.upload;
  return {
    fileName,
    uploadedAt: formatInstant(uploadedAt),
    ...(workbooks === undefined ? {} : { workbooks }),
  };
}

/** RF-128: the zip is not the one the newest run analysed; false while no run has one. */
function codeChanged(project: Project): boolean {
  const { upload, lastRunSnapshotKey } = project;
  return upload !== undefined && lastRunSnapshotKey !== undefined
    ? upload.snapshotKey !== lastRunSnapshotKey
    : false;
}

export function projectView(project: Project): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    sourceKind: project.sourceKind,
    sourceUrl: project.sourceUrl,
    ref: project.ref,
    subpath: project.subpath,
    source: sourceView(project),
    // Absent for a GitHub project, which is pinned to a commit and cannot change (RF-128).
    ...(project.sourceKind === 'github' ? {} : { codeChangedSinceLastRun: codeChanged(project) }),
    settings: project.settings,
    settingsVersion: project.settingsVersion,
    createdAt: formatInstant(project.createdAt),
    updatedAt: formatInstant(project.updatedAt),
  };
}

/** The ETag of a project: the version of its settings, quoted. */
const etagOf = (project: Project): string => `"${String(project.settingsVersion)}"`;

const IF_MATCH = /^"([1-9]\d{0,8})"$/u;

/** The version a save names in `If-Match`; undefined when it names none; anything else is refused. */
function expectedVersionOf(header: string | undefined): number | undefined {
  if (header === undefined) return undefined;
  const match = IF_MATCH.exec(header);
  if (match?.[1] === undefined) throw new RosettaError(ERROR_CODES.requestInvalid);
  return Number(match[1]);
}

function versionOf(header: string | undefined): { readonly expectedVersion?: number } {
  const expectedVersion = expectedVersionOf(header);
  return expectedVersion === undefined ? {} : { expectedVersion };
}

function notFound(): RosettaError {
  return new RosettaError(ERROR_CODES.notFound);
}

function registerCreate(server: FastifyInstance, services: ProjectServices): void {
  server.post(
    '/api/projects',
    { bodyLimit: CREATE_BODY_LIMIT_BYTES, config: { access: 'user' } },
    async (request, reply) => {
      const upload = uploadBody.safeParse(request.body);
      if (upload.success) {
        const made = await services.createProject.createUpload({
          actor: signedInOf(request).actor,
          name: upload.data.name,
          sourceKind: upload.data.sourceKind,
        });
        if (!made.ok) throw new RosettaError(made.error);
        return reply.status(201).send(projectView(made.value.project));
      }
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
      // P3-108, EV-23: only the page of one project asks, so a list costs no snapshot read.
      const older = await services.workbookRenderer.isOlder(outcome.value);
      return reply
        .status(200)
        .header('etag', etagOf(outcome.value))
        .send({
          ...projectView(outcome.value),
          ...(older ? { renderedWithOlderRenderer: true } : {}),
        });
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
        ...versionOf(request.headers['if-match']),
      });
      if (outcome.ok) {
        return reply
          .status(200)
          .header('etag', etagOf(outcome.value))
          .send(projectView(outcome.value));
      }
      const { error } = outcome;
      if (error.code === ERROR_CODES.notFound) throw notFound();
      if (error.code === ERROR_CODES.settingsVersionStale) throw new RosettaError(error.code);
      throw new FieldProblemsError(error.code, error.problems);
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
  registerSourceUploadRoutes(server, services);
  registerWorkbookBatchRoutes(server, services);
  registerSettings(server, services);
  registerPlanningBriefRoutes(server, services);
  registerPlanEstimateRoutes(server, services);
  registerPlanSourceRoutes(server, services);
  registerPlanCatalogueRoutes(server, services);
  registerWorkspace(server, services);
}
