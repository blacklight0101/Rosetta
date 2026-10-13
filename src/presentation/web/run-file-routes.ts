import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import type { BuildReport } from '../../application/use-cases/build-report.js';
import type { ReadRunFile } from '../../application/use-cases/read-run-file.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// RF-504, RF-506, RF-507, RF-1013, RF-1105: the run output routes.
// - GET /runs/:runId/files/* answers one file of the run folder of the signed-in user's run: text
//   as text, the pages of `report/` as pages, anything else as a download. Another user's run id,
//   an unknown id, a missing file and every path that is not a plain relative path inside the
//   folder (`..`, encoded `..`, absolute, backslashes, links) answer 404. Every answer carries the
//   content security policy, nosniff and no-referrer of every response (RF-1013).
// - POST /api/runs/:runId/report builds the report of a finished run (200 with the files written;
//   409 while the run is queued or running; 404 for another user's run).

/** The use cases behind the run output routes. */
export interface RunFileServices {
  readonly buildReport: BuildReport;
  readonly readRunFile: ReadRunFile;
}

interface FileRequest {
  readonly Params: { readonly runId: string; readonly '*': string };
}

function registerFiles(server: FastifyInstance, services: RunFileServices): void {
  server.get<FileRequest>(
    '/runs/:runId/files/*',
    // A HEAD request would open the file to throw it away; the route has no HEAD form.
    { exposeHeadRoute: false, config: { access: 'user' } },
    async (request, reply) => {
      // Set first, so the 404 of a refused path carries it too.
      reply.header('cache-control', 'no-store');
      const outcome = await services.readRunFile.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
        path: request.params['*'],
      });
      if (!outcome.ok) throw new RosettaError(ERROR_CODES.notFound);
      const { contentType, disposition, fileName, size, body } = outcome.value;
      reply.header('content-type', contentType).header('content-length', size);
      if (disposition === 'attachment') {
        reply.header('content-disposition', `attachment; filename="${fileName}"`);
      }
      return reply.send(Readable.from(body));
    },
  );
}

function registerReport(server: FastifyInstance, services: RunFileServices): void {
  server.post<{ Params: { runId: string } }>(
    '/api/runs/:runId/report',
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.buildReport.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
      });
      if (!outcome.ok) {
        const inProgress = outcome.error === 'in-progress';
        throw new RosettaError(inProgress ? ERROR_CODES.runInProgress : ERROR_CODES.notFound);
      }
      return reply.status(200).send({ files: outcome.value.files });
    },
  );
}

// RF-504, RF-506, RF-1105
export function registerRunFileRoutes(server: FastifyInstance, services: RunFileServices): void {
  registerFiles(server, services);
  registerReport(server, services);
}
