import type {
  JourneyFacts,
  JourneyRunFacts,
  JourneySourceFacts,
} from '../../../web/src/api/journey-schemas.js';
import type {
  JourneyStep,
  JourneyView,
  StepKey,
} from '../../../web/src/lib/journey/journey-steps.js';

// RF-615: the facts of a journey as the route answers them, and a way to read one step of the view.

export const projectId = 'p-1';
export const sourceId = '2f0c4b1e-0000-4000-8000-000000000001';
export const planId = '2f0c4b1e-0000-4000-8000-000000000002';

/** An understand run that ended `Completed` with four Supported claims and no open question. */
export function source(over: Partial<JourneySourceFacts> = {}): JourneySourceFacts {
  return {
    ...{ id: sourceId, runKey: '20261012-090000-understand', queueState: 'Ended' },
    ...{ endState: 'Completed', endedAt: '2026-10-12T09:41:00.000Z', costMicros: 120_000 },
    ...{ errorCode: null, supportedClaims: 4, openQuestions: 0 },
    // A Deepen has been made of it, so its questions are asked (RF-646); a test of Deepen first sets 0.
    ...{ deepens: 1, isDeepen: false, deepening: false },
    ...over,
  };
}

/** A plan run written from the source run, by default one that ended `Completed`. */
export function planRun(over: Partial<JourneyRunFacts> = {}): JourneyRunFacts {
  return {
    ...{ id: planId, runKey: '20261012-103000-plan', queueState: 'Ended' },
    ...{ endState: 'Completed', endedAt: '2026-10-12T10:31:00.000Z', costMicros: 310_000 },
    errorCode: null,
    ...over,
  };
}

/** A project whose understand run completed and whose brief is saved; nothing planned yet. */
export function facts(over: Partial<JourneyFacts> = {}): JourneyFacts {
  return {
    ...{ source: source(), scanRunId: null, briefSaved: true, plan: null, handoff: null },
    ...over,
  };
}

/** The package of a plan run that completed. */
function handoff(outOfDate = false): NonNullable<JourneyFacts['handoff']> {
  return { runId: planId, runKey: '20261012-103000-plan', outOfDate, gaps: false };
}

export function step(view: JourneyView, key: StepKey): JourneyStep {
  const found = view.steps.find((each) => each.key === key);
  if (found === undefined) throw new Error(`The journey has no ${key} step`);
  return found;
}

/** The facts of a project at each point of the road, from no run at all to a written package. */
export const roadSigns: Readonly<Record<string, JourneyFacts>> = {
  noRun: facts({ source: null, briefSaved: false }),
  running: facts({
    source: source({ queueState: 'Running', endState: null, endedAt: null }),
    briefSaved: false,
  }),
  queued: facts({
    source: source({ queueState: 'Queued', endState: null, endedAt: null }),
    briefSaved: false,
  }),
  capped: facts({
    source: source({ endState: 'CapReached', errorCode: 'RST-1403', supportedClaims: 0 }),
  }),
  cappedWithClaims: facts({
    source: source({ endState: 'CapReached', errorCode: 'RST-1403', supportedClaims: 3 }),
    briefSaved: false,
  }),
  noClaims: facts({ source: source({ supportedClaims: 0 }) }),
  asking: facts({ source: source({ openQuestions: 2 }), briefSaved: false }),
  noBrief: facts({ briefSaved: false }),
  estimate: facts(),
  planning: facts({ plan: planRun({ queueState: 'Running', endState: null, endedAt: null }) }),
  failed: facts({
    plan: planRun({ endState: 'Failed', errorCode: 'RST-1803', costMicros: 31_000 }),
  }),
  written: facts({ plan: planRun(), handoff: handoff() }),
  stale: facts({ plan: planRun(), handoff: handoff(true) }),
};
