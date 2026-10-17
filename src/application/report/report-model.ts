import { z } from 'zod';
import { CLAIM_STATUSES } from '../../domain/cards/card-vocabulary.js';
import type { Overview } from '../../domain/overview/overview.js';
import type { MapLevel } from '../../domain/code-map/map-level.js';
import type { ReplayModel } from './replay-model.js';

// RF-504, RF-506, data-model.md section 3.17: what the report writers need to know about a finished
// run. The cards come from `cards/index.json`; the documents are listed only when the run folder
// has them, so a link never points at a file that does not exist.

export interface ReportCard {
  readonly id: string;
  readonly type: string;
  /** Model text: untrusted. */
  readonly title: string;
  readonly area: string;
  /** Relative to the run folder: `cards/<TYPE>/<ID>.md`. */
  readonly path: string;
  /** The number of claims per status, every status listed. */
  readonly claimCounts: Readonly<Record<string, number>>;
}

/** An area of the code map and how deeply it is mapped (RF-112). */
export interface ReportArea {
  /** Repository text: untrusted. */
  readonly name: string;
  readonly mapLevel: MapLevel;
}

/** Which of the run folder's documents exist. */
export interface ReportDocuments {
  readonly spec: boolean;
  readonly coverage: boolean;
  readonly cost: boolean;
}

/** RF-500: how much of one area the agents read (data-model.md section 3.8, `coverage.json`). */
export interface ReportCoverageArea {
  /** Repository text: untrusted. */
  readonly area: string;
  readonly filesListed: number;
  /** The files of which at least one line was read. */
  readonly filesRead: number;
  /** 0 to 1: the estimated tokens of the lines read over the area's tokens. */
  readonly readTokenShare: number;
  /** RF-208: why the area gave no usable card. Model text: untrusted. */
  readonly failure?: string;
  /** RF-206: what to know about the area. Model text: untrusted. */
  readonly note?: string;
}

export interface ReportCoverage {
  readonly filesListed: number;
  readonly filesRead: number;
  readonly readTokenShare: number;
  readonly areas: readonly ReportCoverageArea[];
}

/** The figures of one line of the cost report (data-model.md section 3.12). */
export interface ReportCostLine {
  /** The role, the provider, or `provider model`. Untrusted: it names a model or a provider. */
  readonly key: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly calls: number;
  readonly costMicros: number;
}

/** RF-426: the cost report of the run, as `cost.json` holds it. */
export interface ReportCost {
  readonly currency: string;
  readonly priceTableVersion: string;
  readonly totals: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cachedInputTokens: number;
    readonly cacheWriteInputTokens: number;
    readonly calls: number;
    readonly costMicros: number;
    readonly cacheWriteCostMicros: number;
    /** RF-427: calls of a model without a price, whose cost is unknown. */
    readonly unpricedCalls: number;
  };
  readonly byRole: readonly ReportCostLine[];
  readonly byProvider: readonly ReportCostLine[];
  readonly byModel: readonly ReportCostLine[];
}

/** RF-1010: everything the project has spent, read from the ledger when the report is generated. */
export interface ReportProjectTotals {
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  /** The known cost per currency, in currency order. */
  readonly cost: readonly { readonly currency: string; readonly costMicros: number }[];
  /** Calls of an unpriced model, whose cost is unknown (RF-427). */
  readonly unknownCostCalls: number;
}

/** RF-500: an open question of the run and its answer (data-model.md section 3.16). */
export interface ReportQuestion {
  /** `OQ-003`. */
  readonly cardId: string;
  /** Model text: untrusted. */
  readonly question: string;
  /** Model text: untrusted. */
  readonly context: string;
  /** The owner's answer: untrusted; empty while the question is open. */
  readonly answer: string;
}

interface ReportTotals {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicros: number;
  readonly calls: number;
}

export interface ReportModel {
  readonly runKey: string;
  readonly stage: string;
  readonly endState: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly source: { readonly url: string; readonly commitSha: string | null } | null;
  readonly totals: ReportTotals | null;
  readonly documents: ReportDocuments;
  readonly cards: readonly ReportCard[];
  /** The areas of the project's newest completed scan; none when it has none or its output is gone. */
  readonly areas: readonly ReportArea[];
  readonly replay: ReplayModel;
  /** RF-264: the overview of the application; the report opens with it. */
  readonly overview?: Overview | undefined;
  /** The instant the report was generated (RF-1010); the project totals are those of this instant. */
  readonly generatedAt: string;
  /** RF-500: null when the run has no readable `coverage.json`. */
  readonly coverage: ReportCoverage | null;
  /** RF-500: null when the run has no readable `cost.json`. */
  readonly cost: ReportCost | null;
  /** RF-1010: null when the ledger was not read (the published sample). */
  readonly projectTotals: ReportProjectTotals | null;
  /** RF-500: the open questions the run raised, in file order. */
  readonly questions: readonly ReportQuestion[];
}

const CARD_FILE = /^cards\/[A-Z]+\/[A-Z]+-\d+\.md$/u;

const indexSchema = z.object({
  schemaVersion: z.literal(1),
  cards: z.array(
    z.object({
      id: z.string().min(1),
      type: z.string().min(1),
      title: z.string(),
      area: z.string(),
      path: z.string(),
      claimCounts: z.record(z.string(), z.number().int().min(0)),
    }),
  ),
});

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // A torn or foreign file is no index: the report then lists no cards.
    return undefined;
  }
}

/**
 * The cards of a `cards/index.json` text; none when it is missing or is not a version 1 index. A
 * card whose path is not the layout of a card file keeps its row and loses its path, so no link
 * is built from it.
 */
export function parseCardIndex(text: string | undefined): readonly ReportCard[] {
  if (text === undefined) return [];
  const parsed = indexSchema.safeParse(parsedJson(text));
  if (!parsed.success) return [];
  return parsed.data.cards.map((card) => ({
    ...card,
    path: CARD_FILE.test(card.path) ? card.path : '',
  }));
}

/** The claims of all cards, per status, every status listed. */
export function claimTotals(cards: readonly ReportCard[]): Readonly<Record<string, number>> {
  const totals = Object.fromEntries(CLAIM_STATUSES.map((status) => [status, 0]));
  for (const card of cards) {
    for (const status of CLAIM_STATUSES) {
      totals[status] = (totals[status] ?? 0) + (card.claimCounts[status] ?? 0);
    }
  }
  return totals;
}
