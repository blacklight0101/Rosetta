import type { AdapterBuilder } from '../../src/infrastructure/providers/adapter-spec.js';
import type { Fetch } from './ollama-probe.js';

// P1-47 stub: the real script comes with the feat commit.
export const candidateModels: readonly string[] = [];
export const exitCodes = { ok: 0, usage: 2, unavailable: 3 } as const;

export interface SpikeIo {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fetch: Fetch;
  readonly write: (line: string) => void;
  readonly adapters?: AdapterBuilder;
  readonly now: () => number;
}

export function runScoreReader(io: SpikeIo): Promise<number> {
  return Promise.resolve(io.argv.length * 0 + exitCodes.ok);
}
