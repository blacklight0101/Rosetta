import { useRef } from 'preact/hooks';
import {
  approvedLineOf,
  approvedViewOf,
  lineAfter,
  type ApprovedView,
} from '../lib/live-run/approved-line.js';
import type { JourneyLoad } from './use-journey.js';
import { useJourney } from './use-journey.js';

// RF-1003, RF-434, RF-435, DEC-206 (P8-24): the approved amount of the journey a run belongs to, as the
// run page shows it. The journey is read again when the run changes state (`refresh`), and what the
// run spends in between is taken off what was left at that read, so the figure moves with the run.

interface Read {
  readonly load: JourneyLoad;
  readonly micros: number;
  readonly tokens: number;
}

export interface ApprovedViewInput {
  readonly projectId: string;
  readonly refresh: string;
  /** The run's spend so far; the journey read already counts what the run had spent when it was read. */
  readonly spent: { readonly micros: number; readonly tokens: number };
  readonly local: boolean;
}

// RF-1003
export function useApprovedView(input: ApprovedViewInput): ApprovedView | undefined {
  const { projectId, refresh, spent, local } = input;
  const load = useJourney({ projectId, runId: undefined }, refresh);
  const read = useRef<Read | undefined>(undefined);
  if (load.status === 'ready' && read.current?.load !== load) {
    read.current = { load, micros: spent.micros, tokens: spent.tokens };
  }
  const held = read.current;
  if (held?.load.status !== 'ready') return undefined;
  const line = approvedLineOf(held.load.facts.budget);
  if (line === undefined) return undefined;
  const since = {
    micros: Math.max(0, spent.micros - held.micros),
    tokens: Math.max(0, spent.tokens - held.tokens),
  };
  return approvedViewOf(lineAfter(line, since), local ? 'tokens' : 'micros');
}
