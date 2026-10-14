import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Clock } from '../../application/ports/clock.js';
import type { Logger } from '../../application/ports/logger.js';
import type { Scheduler } from '../../application/ports/scheduler.js';
import type { SignedInSession } from '../../application/use-cases/resolve-session.js';
import type {
  RunEventSubscription,
  SubscribeRunEvents,
} from '../../application/use-cases/subscribe-run-events.js';
import { isSessionExpired } from '../../domain/accounts/session-rules.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { EventStream, type StreamRegistry } from './event-stream.js';
import { signedInOf } from './request-actor.js';

// RF-1006, RF-1101, RF-1105: GET /api/runs/:runId/events streams the run's events as server-sent
// events: the stored events after `Last-Event-ID` (or `?after=`), then the live ones, closing after
// `run.ended`. Another user's run id answers 404 like an unknown one. The stream ends with the
// session it was opened in (P1-160): it joins the registry before the subscription starts, so a
// sign-out, disable or reset that lands while it subscribes ends it too (the route then answers
// 401), and the keep-alive ends it once its session has expired.

export interface EventRouteServices {
  readonly subscribeRunEvents: SubscribeRunEvents;
  /** Drives the keep-alive comment of every open stream. */
  readonly heartbeat: Scheduler;
  /** The open event streams; a closing server ends them, and so does the end of their session. */
  readonly streams: StreamRegistry;
  /** RF-1101: the keep-alive ends a stream whose session has expired. */
  readonly clock: Clock;
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

/**
 * The keep-alive of a stream that is sending, which also ends it at the first tick after the
 * expiry its session had when it opened (a page whose session moved on since reconnects and goes
 * on); the subscription and the timer end when the stream closes, however it closes.
 */
function keepAlive(
  services: EventRouteServices,
  stream: EventStream,
  session: SignedInSession,
  close: () => void,
): void {
  stream.onClose(close);
  const expiresAt = session.expiresAt.getTime();
  const cancel = services.heartbeat.every(KEEP_ALIVE_MS, () => {
    if (isSessionExpired(expiresAt, services.clock.now().getTime())) stream.destroy();
    else stream.keepAlive();
    return Promise.resolve();
  });
  stream.onClose(cancel);
}

/**
 * RF-009, P1-160: a replay that failed, in the application log with its code, the run and the
 * error's name only: the text of a file error can hold a data-folder path or a secret. A log that
 * cannot be written never fails the request.
 */
function logReplayFailure(
  logger: Logger,
  request: FastifyRequest<EventsRequest>,
  error: unknown,
): void {
  const code = error instanceof RosettaError ? error.code : ERROR_CODES.runEventLogFailed;
  const name = error instanceof Error ? error.name : typeof error;
  void Promise.allSettled([
    logger.log({
      level: 'error',
      logger: 'http',
      message: 'The stored events of a run could not be sent; the stream was closed.',
      code,
      runId: request.params.runId,
      data: { requestId: request.id, error: name },
    }),
  ]);
}

/** Subscribes `stream` to the run; a failure destroys the stream, so nothing is left open. */
async function subscribe(
  services: EventRouteServices,
  request: FastifyRequest<EventsRequest>,
  stream: EventStream,
): Promise<Result<RunEventSubscription, 'not-found'>> {
  try {
    return await services.subscribeRunEvents.execute({
      actor: signedInOf(request).actor,
      runId: request.params.runId,
      afterSeq: lastSeen(request),
      onEvent: (event, stored) => {
        if (stored) stream.sendStored(event);
        else stream.send(event);
      },
      onEnd: () => {
        stream.finish();
      },
      drained: () => stream.drained(),
      // A page that stalls during the replay is dropped; it reconnects with `Last-Event-ID`.
      onDrop: () => {
        stream.destroy();
      },
    });
  } catch (error) {
    stream.destroy();
    throw error;
  }
}

// RF-1006, RF-1101
export function registerEventRoutes(
  server: FastifyInstance,
  services: EventRouteServices,
  logger: Logger,
): void {
  // A stream stays open for as long as its run, so closing the server ends the open ones first.
  server.addHook('preClose', () => {
    services.streams.finishAll();
  });
  server.get<EventsRequest>(
    '/api/runs/:runId/events',
    // A HEAD request would open a stream and close it at once; the route has no HEAD form.
    { exposeHeadRoute: false, config: { access: 'user' } },
    async (request, reply) => {
      const session = signedInOf(request);
      lastSeen(request); // An invalid Last-Event-ID answers 400 before anything is opened.
      const stream = new EventStream();
      services.streams.add(stream, { userId: session.actor.userId, sessionId: session.sessionId });
      const outcome = await subscribe(services, request, stream);
      if (!outcome.ok) {
        stream.destroy();
        throw new RosettaError(ERROR_CODES.notFound);
      }
      if (stream.destroyed) {
        outcome.value.close();
        throw new RosettaError(ERROR_CODES.notSignedIn);
      }
      keepAlive(services, stream, session, () => {
        outcome.value.close();
      });
      reply
        .header('content-type', 'text/event-stream; charset=utf-8')
        .header('cache-control', 'no-store')
        .header('x-accel-buffering', 'no')
        .send(stream);
      // The stored events go out after the stream is handed over, at the pace the page reads.
      outcome.value.replay().catch((error: unknown) => {
        logReplayFailure(logger, request, error);
        stream.destroy();
      });
      return reply;
    },
  );
}
