import { z } from 'zod';
import { CLAIM_STATUSES } from '../../domain/cards/card-vocabulary.js';
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

/** Which of the run folder's documents exist. */
export interface ReportDocuments {
  readonly spec: boolean;
  readonly coverage: boolean;
  readonly cost: boolean;
}

export interface ReportTotals {
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
  readonly replay: ReplayModel;
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
