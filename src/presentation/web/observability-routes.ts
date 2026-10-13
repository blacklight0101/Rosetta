import type { FastifyInstance } from 'fastify';
import type { GetCallTranscript } from '../../application/use-cases/get-call-transcript.js';
import type { ListRunCalls } from '../../application/use-cases/list-run-calls.js';
import type { ListRunLogs } from '../../application/use-cases/list-run-logs.js';

// RF-1011, RF-408, RF-009, RF-1105: the routes behind the "API calls" and "Logs" panels.

export interface ObservabilityServices {
  readonly listRunCalls: ListRunCalls;
  readonly getCallTranscript: GetCallTranscript;
  readonly listRunLogs: ListRunLogs;
}

// RF-1011, RF-1105
export function registerObservabilityRoutes(
  server: FastifyInstance,
  services: ObservabilityServices,
): void {
  void server;
  void services;
}
