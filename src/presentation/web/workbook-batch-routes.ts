import type { FastifyInstance } from 'fastify';
import type { WorkbookBatches } from '../../application/use-cases/workbook-batches.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { batchStateBody } from './workbook-batch-body.js';
import { signedInOf } from './request-actor.js';
import { chunksOf, declaredBytesOf, discard, fileNameOf } from './upload-body.js';

// RF-150, RF-151, RF-1009, RF-1105, RFC-005 section 4.2: the batch routes of a workbook project.
// - POST   /api/projects/:id/source/batches                      opens a batch: 201 `{ batchId }`.
// - PUT    /api/projects/:id/source/batches/:batchId/files       takes one workbook: the raw body
//   (`Content-Type: application/octet-stream`), read as a stream and never held in memory, and
//   `X-File-Name`, percent-encoded. 201 `{ name, size }`.
// - POST   /api/projects/:id/source/batches/:batchId/finish      accepts the batch at once: 202 with its
//   state. The server then reads, renders and publishes every workbook or none (RF-159, DEC-183);
//   closing the tab does not cancel it.
// - GET    /api/projects/:id/source/batches/:batchId             the state: 200 `{ batchId, phase, files,
//   elapsedMs, progress? | summary? | refusal? }`, `phase` being open, processing, stored or refused;
//   a refusal has the status, code, message, next step and files of the error it would have been.
// - GET    /api/projects/:id/source/batches/current              the same for the batch of the project,
//   for a page that was reloaded; the outcome stays 30 minutes after the work ended.
// - DELETE /api/projects/:id/source/batches/:batchId             cancels the batch: 204, so a user
//   who chose other files does not wait 30 minutes for the batch to expire. A batch whose work already
//   ended (stored or refused) is not cancelled: 409 with its state.
// The size limit, the count, the free space and the time bound are the staging area's; every
// refusal is an error with its code, message and next step (error-mapper.ts), also naming the file
// when it is about one. The Origin, session and CSRF checks are the hooks'; another user's project,
// and a batch of another project or user, answer 404.

export interface WorkbookBatchServices {
  readonly workbookBatches: WorkbookBatches;
}

interface ProjectParams {
  readonly id: string;
}

interface BatchParams extends ProjectParams {
  readonly batchId: string;
}

const OCTET_STREAM = /^application\/octet-stream\s*(;|$)/iu;
const BASE = '/api/projects/:id/source/batches';

function registerOpen(server: FastifyInstance, services: WorkbookBatchServices): void {
  server.post<{ Params: ProjectParams }>(
    BASE,
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.workbookBatches.open({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.status(201).send(outcome.value);
    },
  );
}

function registerFile(server: FastifyInstance, services: WorkbookBatchServices): void {
  // The body stays a stream: the staging area reads it under its own limit and time bound.
  server.addContentTypeParser('application/octet-stream', (_request, payload, done) => {
    done(null, payload);
  });
  server.put<{ Params: BatchParams }>(
    `${BASE}/:batchId/files`,
    { config: { access: 'user' } },
    async (request, reply) => {
      if (!OCTET_STREAM.test(request.headers['content-type'] ?? '')) {
        throw new RosettaError(ERROR_CODES.requestInvalid);
      }
      // A client that goes away before the answer is out stops the file.
      const aborted = new AbortController();
      reply.raw.once('close', () => {
        if (!reply.raw.writableFinished) aborted.abort();
      });
      try {
        const outcome = await services.workbookBatches.receive({
          ...{ actor: signedInOf(request).actor, projectId: request.params.id },
          ...{ batchId: request.params.batchId, signal: aborted.signal },
          fileName: fileNameOf(request.headers['x-file-name']),
          body: chunksOf(request.raw),
          declaredBytes: declaredBytesOf(request.headers['content-length']),
        });
        if (!outcome.ok) throw new RosettaError(outcome.error);
        return await reply.status(201).send(outcome.value);
      } catch (error) {
        // A refusal can come before the whole body is read: the rest is thrown away, for a while, so
        // the sender can still read the answer instead of meeting a reset connection.
        discard(request.raw);
        throw error;
      }
    },
  );
}

function registerFinish(server: FastifyInstance, services: WorkbookBatchServices): void {
  server.post<{ Params: BatchParams }>(
    `${BASE}/:batchId/finish`,
    { config: { access: 'user' } },
    async (request, reply) => {
      // The work does not belong to the request: a client that goes away does not stop it.
      const outcome = await services.workbookBatches.finish({
        ...{ actor: signedInOf(request).actor, projectId: request.params.id },
        ...{ batchId: request.params.batchId, ip: request.ip },
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.status(202).send(batchStateBody(outcome.value));
    },
  );
}

function registerState(server: FastifyInstance, services: WorkbookBatchServices): void {
  server.get<{ Params: ProjectParams }>(
    `${BASE}/current`,
    { config: { access: 'user' } },
    async (request) => {
      const outcome = await services.workbookBatches.current({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return batchStateBody(outcome.value);
    },
  );
  server.get<{ Params: BatchParams }>(
    `${BASE}/:batchId`,
    { config: { access: 'user' } },
    async (request) => {
      const outcome = await services.workbookBatches.state({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
        batchId: request.params.batchId,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return batchStateBody(outcome.value);
    },
  );
}

function registerCancel(server: FastifyInstance, services: WorkbookBatchServices): void {
  server.delete<{ Params: BatchParams }>(
    `${BASE}/:batchId`,
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.workbookBatches.cancel({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
        batchId: request.params.batchId,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      // RF-159: the work had already ended; the batch stays and the page is told how it ended.
      if (!outcome.value.cancelled) {
        return reply.status(409).send(batchStateBody(outcome.value.state));
      }
      return reply.status(204).send();
    },
  );
}

// RF-150
export function registerWorkbookBatchRoutes(
  server: FastifyInstance,
  services: WorkbookBatchServices,
): void {
  // Registered as a plugin of its own, so the raw-body parser reaches these routes only.
  void server.register((instance, _options, done) => {
    registerOpen(instance, services);
    registerFile(instance, services);
    registerFinish(instance, services);
    registerState(instance, services);
    registerCancel(instance, services);
    done();
  });
}
