import type { Run } from '../../domain/runs/run.js';
import type { RunEvent } from '../../domain/runs/run-event.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import {
  parseCardIndex,
  type ReportArea,
  type ReportCost,
  type ReportCoverage,
  type ReportDocuments,
  type ReportModel,
  type ReportProjectTotals,
  type ReportQuestion,
} from './report-model.js';
import type { ReportCardDetail } from './card-detail.js';
import type { ReportDiagram } from './report-diagrams.js';
import { parseOverview } from '../overview/overview-file.js';
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
  /** RF-264: the text of `overview.json`, when the run has one. */
  readonly overviewFile?: string | undefined;
  readonly documents: ReportDocuments;
  readonly areas: readonly ReportArea[];
  /** RF-1010: the instant the report is generated. */
  readonly generatedAt: string;
  /** RF-500: the figures read from `coverage.json`, `cost.json`, the answers file and the ledger. */
  readonly coverage: ReportCoverage | null;
  readonly cost: ReportCost | null;
  readonly projectTotals: ReportProjectTotals | null;
  readonly questions: readonly ReportQuestion[];
  /** RF-502: the cards with the cited lines read from the snapshot. */
  readonly cardDetails: readonly ReportCardDetail[];
  /** RF-508: the Mermaid diagrams of the run's documents. */
  readonly diagrams?: readonly ReportDiagram[] | undefined;
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
    overview: parseOverview(inputs.overviewFile),
    replay: buildReplay(run.runKey, inputs.events),
    generatedAt: inputs.generatedAt,
    coverage: inputs.coverage,
    cost: inputs.cost,
    projectTotals: inputs.projectTotals,
    questions: inputs.questions,
    cardDetails: inputs.cardDetails,
    diagrams: inputs.diagrams,
  };
}
