import { z } from 'zod';
import type { GapDraft } from '../../domain/planning/plan-gap.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';
import { taskSchema } from './plan-answer.js';

// Q-45, Q-54, RF-627, RF-630, ADR-013: the planner's task cards for the items no card builds are
// untrusted text. They are read as one JSON object (fenced or inside prose, like the other planner
// answers) with every list and text bounded, a card being a card of the plan's own answer plus the
// ids it builds. A card that cannot be read is left out and the others stay, and what is left out
// is reported by position, field and a fixed reason, never with a word of the answer (the log and
// the repair attempt use it); which ids are gaps, and whether a card is a card an agent can build,
// is decided by the domain (plan-gap.ts), not here. An answer with no card (`"tasks": []`) is an
// answer; one without a `tasks` list is not.

const MAX_CARDS = 50;
const MAX_BUILDS = 500;
const ID = 300;

const gapTask = taskSchema
  .omit({ needs: true })
  .extend({ builds: z.array(z.string().max(ID)).max(MAX_BUILDS) });

const answer = z.object({ tasks: z.array(z.unknown()).max(MAX_CARDS) });

/** What a card that cannot be read still says: the ids it names, to see whether it named a gap. */
const named = z.object({ builds: z.array(z.unknown()) });

/** A card of the answer that could not be read: its position (from 1), the field and why. */
export interface GapProblem {
  readonly position: number;
  /** The first field that was wrong, or `card` when the card is not an object. */
  readonly field: string;
  /** A fixed phrase for the kind of fault; it holds no text of the answer. */
  readonly reason: string;
  /** The ids the card named in `builds`, when that list was readable. */
  readonly builds: readonly string[];
}

export interface GapAnswer {
  readonly drafts: GapDraft[];
  /** The position in the answer (from 1) of each draft, so a later fault names the right card. */
  readonly positions: number[];
  readonly problems: GapProblem[];
  /** RF-627: set when the single-item rule gave the one card that named no builds the one item. */
  readonly singleItemRule?: string;
}

function reasonOf(code: string): string {
  if (code === 'too_big') return 'is above its maximum';
  if (code === 'too_small') return 'is empty or below its minimum';
  if (code === 'invalid_type' || code === 'invalid_union') return 'has the wrong type or shape';
  return 'is not valid';
}

function namedIds(card: unknown): string[] {
  const parsed = named.safeParse(card);
  if (!parsed.success) return [];
  const texts = parsed.data.builds.flatMap((each) =>
    typeof each === 'string' && each.length <= ID ? [each] : [],
  );
  return texts.slice(0, MAX_BUILDS);
}

function problemOf(position: number, error: z.ZodError, card: unknown): GapProblem {
  const issue = error.issues[0];
  const first = issue?.path[0];
  const field = typeof first === 'string' ? first : 'card';
  return { position, field, reason: reasonOf(issue?.code ?? ''), builds: namedIds(card) };
}

/** RF-627: a card with no valid builds for the block: its list is missing, empty or names no item of the block (the one item given). */
function namesNoBuilds(card: unknown, item: string): boolean {
  if (typeof card !== 'object' || card === null) return false;
  return !('builds' in card) || !Array.isArray(card.builds) || !card.builds.includes(item);
}

/** The cards of the answer that read as cards and the ones that did not, or undefined when no JSON object reads as a list of them. */

/** RF-627: the card with the one item it builds in place of the builds it did not name. */
function buildingOnly(card: unknown, item: string): unknown {
  return typeof card === 'object' && card !== null ? { ...card, builds: [item] } : card;
}

// Q-45, Q-54, RF-627: `uncoveredItem` is the one item the block holds, when it holds exactly one.
export function parseGapAnswer(output: string, uncoveredItem?: string): GapAnswer | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const parsed = answer.safeParse(value);
    if (!parsed.success) continue;
    const cards = parsed.data.tasks;
    const single =
      uncoveredItem !== undefined && cards.length === 1 && namesNoBuilds(cards[0], uncoveredItem)
        ? uncoveredItem
        : undefined;
    const drafts: GapDraft[] = [];
    const positions: number[] = [];
    const problems: GapProblem[] = [];
    cards.forEach((each, index) => {
      const card = gapTask.safeParse(single === undefined ? each : buildingOnly(each, single));
      if (card.success) {
        drafts.push(card.data);
        positions.push(index + 1);
      } else problems.push(problemOf(index + 1, card.error, each));
    });
    return {
      drafts,
      positions,
      problems,
      ...(single === undefined ? {} : { singleItemRule: single }),
    };
  }
  return undefined;
}
