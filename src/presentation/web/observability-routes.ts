import type { FastifyInstance } from 'fastify';
import type { StoredLogEntry } from '../../application/ports/application-log-reader.js';
import type { StoredTranscriptEntry } from '../../application/ports/run-call-reader.js';
import type { GetCallTranscript } from '../../application/use-cases/get-call-transcript.js';
import type { ListRunCalls, RunCall } from '../../application/use-cases/list-run-calls.js';
import type { ListRunLogs } from '../../application/use-cases/list-run-logs.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// RF-1011, RF-408, RF-009, RF-1105: the routes behind the "API calls" and "Logs" panels of a run.
// - GET /api/runs/:runId/calls gives `{ runKey, runState, total, calls, summary }`: the attempts of
//   the run's provider call log (the newest 2000, each with its agent's area and whether it has a
//   transcript) and the summary per provider and role with P50 and P95 latency and time to first
//   token over all of them.
// - GET /api/runs/:runId/calls/:seq/transcript gives `{ entries }`: the masked messages that call
//   added to its agent task's transcript; a call number the log does not hold answers 404.
// - GET /api/runs/:runId/logs gives `{ runKey, runState, total, entries, counts, securityEvents }`:
//   the application log entries of the run (the newest 500), the number of each level and of
//   security events among all of them.
// The page reads all three again every few seconds while the run goes on. Another user's run id
// answers 404 like an unknown one, and nothing unmasked leaves the server: every line is masked
// again as it is read.

export interface ObservabilityServices {
  readonly listRunCalls: ListRunCalls;
  readonly getCallTranscript: GetCallTranscript;
  readonly listRunLogs: ListRunLogs;
}

/** A call number as the page writes it: a plain decimal from 1, no leading zero, at most 9 digits. */
const CALL_NUMBER = /^[1-9]\d{0,8}$/;

function callView(call: RunCall) {
  return {
    seq: call.seq,
    callId: call.callId,
    attempt: call.attempt,
    startedAt: call.startedAt,
    agentTaskId: call.agentTaskId,
    agent: call.agent,
    role: call.role,
    provider: call.provider,
    kind: call.kind,
    model: call.model,
    endpointHost: call.endpointHost,
    timeToFirstTokenMs: call.timeToFirstTokenMs,
    latencyMs: call.latencyMs,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    // Q-58: left out of the JSON when the provider reported none.
    reasoningTokens: call.reasoningTokens,
    // Q-60: true for a timed-out attempt, whose output counts only what arrived.
    outputUnknown: call.outputUnknown,
    cachedInputTokens: call.cachedInputTokens,
    costMicros: call.costMicros,
    currency: call.currency,
    finishReason: call.finishReason,
    status: call.status,
    ...(call.errorCode === undefined ? {} : { errorCode: call.errorCode }),
    ...(call.errorMessage === undefined ? {} : { errorMessage: call.errorMessage }),
    ...(call.httpStatus === undefined ? {} : { httpStatus: call.httpStatus }),
    ...(call.ollama === undefined ? {} : { ollama: call.ollama }),
    hasTranscript: call.transcriptRef !== undefined,
  };
}

function transcriptView(entry: StoredTranscriptEntry) {
  return {
    seq: entry.seq,
    at: entry.at,
    callId: entry.callId,
    role: entry.role,
    content: entry.content,
    ...(entry.toolCalls === undefined ? {} : { toolCalls: entry.toolCalls }),
  };
}

/** The run's own id and user are not sent: the page needs only what it shows. */
function logView(entry: StoredLogEntry) {
  return {
    at: entry.at,
    level: entry.level,
    logger: entry.logger,
    message: entry.message,
    ...(entry.code === undefined ? {} : { code: entry.code }),
    ...(entry.agentTaskId === undefined ? {} : { agentTaskId: entry.agentTaskId }),
    ...(entry.callId === undefined ? {} : { callId: entry.callId }),
  };
}

const options = { exposeHeadRoute: false, config: { access: 'user' } } as const;

function registerCalls(server: FastifyInstance, services: ObservabilityServices): void {
  server.get<{ Params: { runId: string } }>(
    '/api/runs/:runId/calls',
    options,
    async (request, reply) => {
      const outcome = await services.listRunCalls.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
      });
      if (!outcome.ok) throw new RosettaError(ERROR_CODES.notFound);
      const { calls, ...rest } = outcome.value;
      return reply
        .header('cache-control', 'no-store')
        .send({ ...rest, calls: calls.map(callView) });
    },
  );
}

function registerTranscript(server: FastifyInstance, services: ObservabilityServices): void {
  server.get<{ Params: { runId: string; seq: string } }>(
    '/api/runs/:runId/calls/:seq/transcript',
    options,
    async (request, reply) => {
      if (!CALL_NUMBER.test(request.params.seq)) throw new RosettaError(ERROR_CODES.notFound);
      const outcome = await services.getCallTranscript.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
        seq: Number(request.params.seq),
      });
      if (!outcome.ok) throw new RosettaError(ERROR_CODES.notFound);
      return reply
        .header('cache-control', 'no-store')
        .send({ entries: outcome.value.map(transcriptView) });
    },
  );
}

function registerLogs(server: FastifyInstance, services: ObservabilityServices): void {
  server.get<{ Params: { runId: string } }>(
    '/api/runs/:runId/logs',
    options,
    async (request, reply) => {
      const outcome = await services.listRunLogs.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
      });
      if (!outcome.ok) throw new RosettaError(ERROR_CODES.notFound);
      const { entries, ...rest } = outcome.value;
      return reply
        .header('cache-control', 'no-store')
        .send({ ...rest, entries: entries.map(logView) });
    },
  );
}

// RF-1011, RF-1105
export function registerObservabilityRoutes(
  server: FastifyInstance,
  services: ObservabilityServices,
): void {
  registerCalls(server, services);
  registerTranscript(server, services);
  registerLogs(server, services);
}
