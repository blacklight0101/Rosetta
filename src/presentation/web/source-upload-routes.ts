import type { FastifyInstance } from 'fastify';
import type { StoreUpload } from '../../application/use-cases/store-upload.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';
import { chunksOf, declaredBytesOf, discard, fileNameOf } from './upload-body.js';

// RF-128, RF-129, RF-1009, RF-1105: PUT /api/projects/:id/source takes the zip of an upload project.
// The body is the raw zip (`Content-Type: application/zip`), read as a stream and never held in memory;
// `X-File-Name` carries the file name, percent-encoded. It answers 201 with what was kept: the
// number of files, their size, what was left out, the snapshot hash, the file name and the instant.
// The size limit, the free space and the time bound are the store's (RF-129); every refusal is an
// error with its code, message and next step (error-mapper.ts). The Origin, session and CSRF
// checks are the hooks'; another user's project answers 404.
// RF-159: GET /api/projects/:id/source/progress answers 200 `{ elapsedMs, progress }` while the zip of the
// project is being stored (`progress` is null until the zip holds workbooks to render) and 404 otherwise.

export interface SourceUploadServices {
  readonly storeUpload: StoreUpload;
}

interface IdParams {
  readonly id: string;
}

// Windows browsers report a zip as application/x-zip-compressed; the first bytes decide either way.
const ZIP_TYPES = ['application/zip', 'application/x-zip-compressed'];
const ZIP_TYPE = /^application\/(zip|x-zip-compressed)\s*(;|$)/iu;
function registerProgress(server: FastifyInstance, services: SourceUploadServices): void {
  server.get<{ Params: IdParams }>(
    '/api/projects/:id/source/progress',
    { config: { access: 'user' } },
    (request) => {
      const { actor } = signedInOf(request);
      const progress = services.storeUpload.progressOf(actor, request.params.id);
      if (progress === undefined) throw new RosettaError(ERROR_CODES.notFound);
      return progress;
    },
  );
}

// RF-128
export function registerSourceUploadRoutes(
  server: FastifyInstance,
  services: SourceUploadServices,
): void {
  // The body stays a stream: the store reads it under its own limit and time bound.
  server.addContentTypeParser(ZIP_TYPES, (_request, payload, done) => {
    done(null, payload);
  });
  registerProgress(server, services);
  server.put<{ Params: IdParams }>(
    '/api/projects/:id/source',
    { config: { access: 'user' } },
    async (request, reply) => {
      if (!ZIP_TYPE.test(request.headers['content-type'] ?? '')) {
        throw new RosettaError(ERROR_CODES.requestInvalid);
      }
      // A client that goes away before the answer is out stops the upload.
      const aborted = new AbortController();
      reply.raw.once('close', () => {
        if (!reply.raw.writableFinished) aborted.abort();
      });
      try {
        const outcome = await services.storeUpload.execute({
          actor: signedInOf(request).actor,
          projectId: request.params.id,
          fileName: fileNameOf(request.headers['x-file-name']),
          body: chunksOf(request.raw),
          declaredBytes: declaredBytesOf(request.headers['content-length']),
          ip: request.ip,
          signal: aborted.signal,
        });
        if (!outcome.ok) throw new RosettaError(outcome.error);
        return await reply.status(201).send(outcome.value);
      } catch (error) {
        // A refusal can come before the whole body is read: the rest is thrown away, for a while, so the
        // sender can still read the answer instead of meeting a reset connection.
        discard(request.raw);
        throw error;
      }
    },
  );
}
