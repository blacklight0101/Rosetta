import type { FastifyInstance } from 'fastify';
import type { StoreUpload } from '../../application/use-cases/store-upload.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// RF-128, RF-129, RF-1009, RF-1105: PUT /api/projects/:id/source takes the zip of an upload project.
// The body is the raw zip (`Content-Type: application/zip`), read as a stream and never held in memory;
// `X-File-Name` carries the file name, percent-encoded. It answers 201 with what was kept: the
// number of files, their size, what was left out, the snapshot hash, the file name and the instant.
// The size limit, the free space and the time bound are the store's (RF-129); every refusal is an
// error with its code, message and next step (error-mapper.ts). The Origin, session and CSRF
// checks are the hooks'; another user's project answers 404.

export interface SourceUploadServices {
  readonly storeUpload: StoreUpload;
}

interface IdParams {
  readonly id: string;
}

const ZIP_TYPE = /^application\/zip\s*(;|$)/iu;
const DIGITS = /^\d{1,15}$/u;

/** The `Content-Length` the client declared; undefined when it sent none or sent nonsense. */
function declaredBytesOf(header: string | undefined): number | undefined {
  return header !== undefined && DIGITS.test(header) ? Number(header) : undefined;
}

/** The name header when it is there once; a repeated header is no name at all. */
function fileNameOf(header: string | string[] | undefined): string | undefined {
  return typeof header === 'string' ? header : undefined;
}

// RF-128
export function registerSourceUploadRoutes(
  server: FastifyInstance,
  services: SourceUploadServices,
): void {
  // The body stays a stream: the store reads it under its own limit and time bound.
  server.addContentTypeParser('application/zip', (_request, payload, done) => {
    done(null, payload);
  });
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
      const outcome = await services.storeUpload.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
        fileName: fileNameOf(request.headers['x-file-name']),
        body: request.raw,
        declaredBytes: declaredBytesOf(request.headers['content-length']),
        ip: request.ip,
        signal: aborted.signal,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.status(201).send(outcome.value);
    },
  );
}
