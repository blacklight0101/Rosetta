import type { FastifyInstance } from 'fastify';
import type { BuildReport } from '../../application/use-cases/build-report.js';
import type { ReadRunFile } from '../../application/use-cases/read-run-file.js';

// RF-504, RF-506, RF-1013, RF-1105: the run output routes.

/** The use cases behind the run output routes. */
export interface RunFileServices {
  readonly buildReport: BuildReport;
  readonly readRunFile: ReadRunFile;
}

export function registerRunFileRoutes(server: FastifyInstance, services: RunFileServices): void {
  void server;
  void services;
}
