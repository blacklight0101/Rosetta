// RNF-004: run ids and every UUID come from this port (architecture section 7).
export interface IdGenerator {
  /** A run id in the form yyyyMMdd-HHmmss-<stage>, in UTC. */
  runId(stage: string): string;
  uuid(): string;
}
