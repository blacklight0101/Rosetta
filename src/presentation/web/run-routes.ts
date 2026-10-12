import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { EstimateRun } from '../../application/estimate/estimate-run.js';
import { Readable } from 'node:stream';
import type { ArchivePart } from '../../application/ports/archive-writer.js';
import type { Scheduler } from '../../application/ports/scheduler.js';
import type { ExportZip } from '../../application/use-cases/export-zip.js';
import type { StartRun } from '../../application/use-cases/start-run.js';
import type { StopRun } from '../../application/use-cases/stop-run.js';
import type { SubscribeRunEvents } from '../../application/use-cases/subscribe-run-events.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { RUN_STAGES } from '../../domain/runs/run-states.js';
import { EventStream, type StreamRegistry } from './event-stream.js';
import { registerRunFileRoutes, type RunFileServices } from './run-file-routes.js';
import { signedInOf } from './request-actor.js';
import { estimateView } from './estimate-view.js';
import { runView } from './run-view.js';

// RF-1006, RF-1108, RF-1105: the run routes.
// - POST /api/projects/:id/runs starts a run of one stage of the user's project: 202 with the run
//   and its queue position (null when it started); a stage that cannot be started yet answers 409
//   (RST-2305), another user's project 404. An understand run takes `areas` and `cloudConsent`;
//   one whose roles need the consent and lack it answers 400 (RST-1515, RF-143).
// - GET /api/projects/:id/estimate gives the estimate of an understand run (RF-425): tokens and cost
//   per role as low, likely and high, with the assumptions. `areas` (repeated) names the areas to
//   estimate; one the code map does not have answers 400 (RST-1307), a project without a completed
//   scan 409 (RST-1203), another user's project 404.
// - GET /api/runs/:runId/events streams the run's events as server-sent events: the stored events
//   after `Last-Event-ID` (or `?after=`), then the live ones, closing after `run.ended`. Another
//   user's run id answers 404 like an unknown one.
// - GET /api/runs/:runId/zip and /api/runs/:runId/handoff.zip stream the run folder, or only its
//   handoff/ folder, as a zip download (RF-008): 409 (RST-1700) while the run is queued or
//   running, 404 for another user's run id, an unknown id and a run without that folder.
// - POST /api/runs/:runId/stop aborts a running run (202, it ends as Interrupted when its work
//   stops) or cancels a queued one (200); a run that has ended answers 409.

export interface RunServices extends RunFileServices {
  readonly startRun: StartRun;
  readonly estimateRun: EstimateRun;
  readonly subscribeRunEvents: SubscribeRunEvents;
  readonly stopRun: StopRun;
  readonly exportZip: ExportZip;
  /** Drives the keep-alive comment of every open stream. */
  readonly heartbeat: Scheduler;
  /** The open event streams; a closing server ends them. */
  readonly streams: StreamRegistry;
}

const START_BODY_LIMIT_BYTES = 1024;
const KEEP_ALIVE_MS = 15_000;
const SEQ = /^\d{1,15}$/;

const MAX_AREAS = 200;
const MAX_AREA_NAME = 1024;

const areaName = z.string().min(1).max(MAX_AREA_NAME);

/** RF-200, RF-143: the stage, and for understand the areas to read and the cloud consent. */
const startBody = z.strictObject({
  stage: z.enum(RUN_STAGES),
  areas: z.array(areaName).max(MAX_AREAS).optional(),
  cloudConsent: z.boolean().optional(),
});

/** RF-425: `?areas=A&areas=B`; a single `areas=A` arrives as a string. */
const estimateQuery = z.object({
  areas: z
    .union([areaName, z.array(areaName).max(MAX_AREAS)])
    .optional()
    .transform((areas) => (typeof areas === 'string' ? [areas] : areas)),
});

interface EventsRequest {
  readonly Params: { readonly runId: string };
  readonly Querystring: { readonly after?: string };
}

/** The `seq` of the last event the page has: `Last-Event-ID` of a reconnect, else `?after=`. */
function lastSeen(request: FastifyRequest<EventsRequest>): number {
  const header = request.headers['last-event-id'];
  const given = typeof header === 'string' ? header : request.query.after;
  if (given === undefined || given === '') return 0;
  if (!SEQ.test(given)) throw new RosettaError(ERROR_CODES.requestInvalid);
  return Number(given);
}

/** The stream of a subscription that is sending: closes with its page, ends with its run. */
function openStream(services: RunServices, close: () => void): EventStream {
  const stream = new EventStream();
  services.streams.add(stream);
  stream.onClose(close);
  const cancel = services.heartbeat.every(KEEP_ALIVE_MS, () => {
    stream.keepAlive();
    return Promise.resolve();
  });
  stream.onClose(cancel);
  return stream;
}

function registerEvents(server: FastifyInstance, services: RunServices): void {
  // A stream stays open for as long as its run, so closing the server ends the open ones first.
  server.addHook('preClose', () => {
    services.streams.finishAll();
  });
  server.get<EventsRequest>(
    '/api/runs/:runId/events',
    // A HEAD request would open a stream and close it at once; the route has no HEAD form.
    { exposeHeadRoute: false, config: { access: 'user' } },
    async (request, reply) => {
      // The stream exists once the subscription does, so a failure before that leaks nothing.
      const holder: { stream?: EventStream } = {};
      const outcome = await services.subscribeRunEvents.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
        afterSeq: lastSeen(request),
        onEvent: (event, stored) => {
          if (stored) holder.stream?.sendStored(event);
          else holder.stream?.send(event);
        },
        onEnd: () => {
          holder.stream?.finish();
        },
        drained: () => holder.stream?.drained() ?? Promise.resolve(),
      });
      if (!outcome.ok) throw new RosettaError(ERROR_CODES.notFound);
      const stream = openStream(services, () => {
        outcome.value.close();
      });
      holder.stream = stream;
      reply
        .header('content-type', 'text/event-stream; charset=utf-8')
        .header('cache-control', 'no-store')
        .header('x-accel-buffering', 'no')
        .send(stream);
      // The stored events go out after the stream is handed over, at the pace the page reads.
      outcome.value.replay().catch((error: unknown) => {
        request.log.error({ err: error }, 'The stored events of a run could not be sent');
        stream.destroy();
      });
      return reply;
    },
  );
}

/** Streams one part of a run as an attachment; the file name comes from the run key, cleaned. */
function registerDownload(
  server: FastifyInstance,
  services: RunServices,
  route: { readonly url: string; readonly part: ArchivePart },
): void {
  server.get<{ Params: { runId: string } }>(
    route.url,
    // A HEAD request would build the whole archive to throw it away; the route has no HEAD form.
    { exposeHeadRoute: false, config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.exportZip.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
        part: route.part,
      });
      if (!outcome.ok) {
        throw new RosettaError(
          outcome.error === 'in-progress' ? ERROR_CODES.runInProgress : ERROR_CODES.notFound,
        );
      }
      const { fileName, body } = outcome.value;
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', `attachment; filename="${fileName}"`)
        .header('cache-control', 'no-store')
        .send(Readable.from(body));
    },
  );
}

function registerStop(server: FastifyInstance, services: RunServices): void {
  server.post<{ Params: { runId: string } }>(
    '/api/runs/:runId/stop',
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.stopRun.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
      });
      if (!outcome.ok) {
        const code = outcome.error === 'not-found' ? ERROR_CODES.notFound : ERROR_CODES.conflict;
        throw new RosettaError(code);
      }
      const { kind, run } = outcome.value;
      const stopping = kind === 'stopping';
      return reply.status(stopping ? 202 : 200).send({ ...runView(run), stopRequested: stopping });
    },
  );
}

function registerStart(server: FastifyInstance, services: RunServices): void {
  server.post<{ Params: { id: string } }>(
    '/api/projects/:id/runs',
    { bodyLimit: START_BODY_LIMIT_BYTES, config: { access: 'user' } },
    async (request, reply) => {
      const body = startBody.safeParse(request.body);
      if (!body.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const { stage, areas, cloudConsent } = body.data;
      const outcome = await services.startRun.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
        stage,
        ...(areas === undefined ? {} : { areas }),
        ...(cloudConsent === undefined ? {} : { cloudConsent }),
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      const { run, position } = outcome.value;
      return reply.status(202).send({ ...runView(run), position: position ?? null });
    },
  );
}

function registerEstimate(server: FastifyInstance, services: RunServices): void {
  server.get<{ Params: { id: string } }>(
    '/api/projects/:id/estimate',
    { config: { access: 'user' } },
    async (request, reply) => {
      const query = estimateQuery.safeParse(request.query);
      if (!query.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const { areas } = query.data;
      const outcome = await services.estimateRun.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
        ...(areas === undefined ? {} : { areas }),
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.status(200).send(estimateView(outcome.value));
    },
  );
}

// RF-1006, RF-1108, RF-1105
export function registerRunRoutes(server: FastifyInstance, services: RunServices): void {
  registerEvents(server, services);
  registerDownload(server, services, { url: '/api/runs/:runId/zip', part: 'run' });
  registerDownload(server, services, { url: '/api/runs/:runId/handoff.zip', part: 'handoff' });
  registerRunFileRoutes(server, services);
  registerStop(server, services);
  registerStart(server, services);
  registerEstimate(server, services);
}
