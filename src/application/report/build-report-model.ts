import type { Run } from '../../domain/runs/run.js';
import type { RunEvent } from '../../domain/runs/run-event.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import {
  parseCardIndex,
  type ReportArea,
  type ReportDocuments,
  type ReportModel,
} from './report-model.js';
import { buildReplay } from './replay-timeline.js';

// RF-504, RF-506: what the report of a finished run says, from the run row, the manifest (when the
// run has one), the events, the card index text and which documents the run folder holds. The run
// row is the truth for the stage and the end state; the manifest adds the times, the source and the
// totals.

export interface ReportInputs {
  readonly run: Run;
  readonly manifest: RunManifest | undefined;
  readonly events: readonly RunEvent[];
  readonly cardIndex: string | undefined;
  readonly documents: ReportDocuments;
  readonly areas: readonly ReportArea[];
}

// RF-504, RF-506
export function buildReportModel(inputs: ReportInputs): ReportModel {
  const { run, manifest } = inputs;
  return {
    runKey: run.runKey,
    stage: run.stage,
    endState: run.endState,
    startedAt: manifest?.startedAt ?? null,
    endedAt: manifest?.endedAt ?? null,
    source:
      manifest === undefined
        ? null
        : { url: manifest.source.url, commitSha: manifest.source.commitSha },
    totals:
      manifest === undefined
        ? null
        : {
            inputTokens: manifest.totals.inputTokens,
            outputTokens: manifest.totals.outputTokens,
            costMicros: manifest.totals.costMicros,
            calls: manifest.totals.calls,
          },
    documents: inputs.documents,
    cards: parseCardIndex(inputs.cardIndex),
    areas: inputs.areas,
    replay: buildReplay(run.runKey, inputs.events),
  };
}
