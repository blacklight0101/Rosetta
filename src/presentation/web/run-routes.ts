import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Scheduler } from '../../application/ports/scheduler.js';
import type { StopRun } from '../../application/use-cases/stop-run.js';
import type { SubscribeRunEvents } from '../../application/use-cases/subscribe-run-events.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { EventStream, type StreamRegistry } from './event-stream.js';
import { signedInOf } from './request-actor.js';
import { runView } from './run-view.js';

// RF-1006, RF-1108, RF-1105: the run routes.
// - GET /api/runs/:runId/events streams the run's events as server-sent events: the stored events
//   after `Last-Event-ID` (or `?after=`), then the live ones, closing after `run.ended`. Another
//   user's run id answers 404 like an unknown one.
// - POST /api/runs/:runId/stop aborts a running run (202, it ends as Interrupted when its work
//   stops) or cancels a queued one (200); a run that has ended answers 409.

export interface RunServices {
  readonly subscribeRunEvents: SubscribeRunEvents;
  readonly stopRun: StopRun;
  /** Drives the keep-alive comment of every open stream. */
  readonly heartbeat: Scheduler;
  /** The open event streams; a closing server ends them. */
  readonly streams: StreamRegistry;
}

const KEEP_ALIVE_MS = 15_000;
const SEQ = /^\d{1,15}$/;

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

// RF-1006, RF-1108, RF-1105
export function registerRunRoutes(server: FastifyInstance, services: RunServices): void {
  registerEvents(server, services);
  registerStop(server, services);
}
