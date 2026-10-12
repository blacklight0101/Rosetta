import type { CardDraft } from '../../domain/cards/card-ids.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { agentCardsSchema } from './card-schema.js';
import { cardLimits } from './card-limits.js';
import { jsonCandidates } from './extract-json.js';

// RF-202: parses an agent's final answer into card drafts. Invalid output gets one repair attempt
// with the located validation errors; a second failure ends the task as `InvalidOutput` and the
// raw outputs are kept for the user (the task state itself belongs to the orchestrator).

/** One validation problem; `path` is dotted (`cards.0.claims.1.citations`), empty for the answer. */
export interface OutputProblem {
  readonly path: string;
  readonly message: string;
}

const noJson: OutputProblem = {
  path: '',
  message: 'No JSON found in the answer. Reply with one JSON object {"cards": [ ... ]}.',
};

const tooLong: OutputProblem = {
  path: '',
  message: `The answer is larger than the limit of ${String(cardLimits.maxOutputChars)} characters.`,
};

function bounded(problems: readonly OutputProblem[]): readonly OutputProblem[] {
  return problems.slice(0, cardLimits.maxProblems).map((problem) => ({
    path: problem.path,
    message: problem.message.slice(0, cardLimits.maxProblemChars),
  }));
}

function validate(value: unknown): Result<readonly CardDraft[], readonly OutputProblem[]> {
  const parsed = agentCardsSchema.safeParse(Array.isArray(value) ? { cards: value } : value);
  if (parsed.success) return ok(parsed.data.cards);
  return err(
    bounded(
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    ),
  );
}

/** The first JSON value of the answer that is a valid card list, else the first one's problems. */
export function parseCardOutput(
  raw: string,
): Result<readonly CardDraft[], readonly OutputProblem[]> {
  if (raw.length > cardLimits.maxOutputChars) return err([tooLong]);
  let firstProblems: readonly OutputProblem[] | undefined;
  for (const value of jsonCandidates(raw)) {
    const checked = validate(value);
    if (checked.ok) return checked;
    firstProblems ??= checked.error;
  }
  return err(firstProblems ?? [noJson]);
}

export interface ParsedCards {
  readonly drafts: readonly CardDraft[];
  readonly repaired: boolean;
}

/** The task ends `InvalidOutput`; the raw outputs are saved by `writeInvalidOutput`. */
export interface InvalidCardOutput {
  readonly state: 'InvalidOutput';
  readonly code: ErrorCode;
  readonly problems: readonly OutputProblem[];
  readonly rawOutputs: readonly string[];
}

/** Asks the model to correct its answer; `undefined` when no repair can be requested. */
export type RequestRepair = (problems: readonly OutputProblem[]) => Promise<string | undefined>;

export async function parseCardsWithRepair(
  raw: string,
  requestRepair: RequestRepair,
): Promise<Result<ParsedCards, InvalidCardOutput>> {
  const first = parseCardOutput(raw);
  if (first.ok) return ok({ drafts: first.value, repaired: false });
  const invalid = (problems: readonly OutputProblem[], rawOutputs: readonly string[]) =>
    err<InvalidCardOutput>({
      state: 'InvalidOutput',
      code: ERROR_CODES.cardOutputInvalid,
      problems,
      rawOutputs,
    });
  const repairedRaw = await requestRepair(first.error);
  if (repairedRaw === undefined) return invalid(first.error, [raw]);
  const second = parseCardOutput(repairedRaw);
  if (second.ok) return ok({ drafts: second.value, repaired: true });
  return invalid(second.error, [raw, repairedRaw]);
}
