import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import {
  continueAmountOf,
  raiseApprovedAmount,
  type Amount,
  type ApprovedAmount,
} from '../../domain/budget/approved-amount.js';
import type { Actor } from '../../domain/accounts/actor.js';
import { MAX_RUN_COST_MICROS, MAX_RUN_TOKENS } from '../projects/project-settings.js';

// RF-430, RF-432, ADR-026, DEC-196: the server, never the browser, sets a run's approved amount.
// At the start the server works the journey estimate out again; the figure the start button showed
// is only the user's confirmation and must match it within a small tolerance, else the start is
// refused (RST-2310) so the user sees the new figure. The stored amount is the server's worst-case
// total (DEC-205); Continue (+N) offers half of it and never adds more than the offered N,
// and no approved amount ever passes the administrator's run ceilings.

/** The likely and worst-case journey totals the server estimates now (RF-430). */
export interface JourneyFigures {
  readonly likely: Amount;
  readonly worstCase: Amount;
}

/** RF-430: the server's journey estimate for a start; undefined when it has none. */
export type JourneyLookup = (request: {
  readonly actor: Actor;
  readonly projectId: string;
  readonly areas?: readonly string[] | undefined;
}) => Promise<JourneyFigures | undefined>;

/** How far the shown figure may be from the server's: 2%, and never less than one unit. */
const TOLERANCE_PERCENT = 2;

function near(shown: number, server: number): boolean {
  return Math.abs(shown - server) <= Math.max(1, (server * TOLERANCE_PERCENT) / 100);
}

/** No approved amount passes the administrator's run ceilings (project-settings.ts). */
function ceiled(amount: Amount): Amount {
  return {
    tokens: Math.max(0, Math.min(amount.tokens, MAX_RUN_TOKENS)),
    costMicros: Math.max(0, Math.min(amount.costMicros, MAX_RUN_COST_MICROS)),
  };
}

/** RF-432: an approved amount held within the ceilings, its remainder too. */
// RF-432
export function withinCeilings(approved: ApprovedAmount): ApprovedAmount {
  const { remainder } = approved;
  return {
    ...ceiled(approved),
    ...(remainder === undefined ? {} : { remainder: ceiled(remainder) }),
  };
}

/** RF-430, RF-432: the approved amount the run records, from the server's figures. */
// RF-432
export function approvedJourneyOf(
  shown: Amount,
  journey: JourneyFigures | undefined,
): Result<ApprovedAmount, typeof ERROR_CODES.approvalChanged> {
  if (journey === undefined) return err(ERROR_CODES.approvalChanged);
  // DEC-205: the run is approved, and pauses, at the worst-case total the start button showed.
  const { worstCase } = journey;
  if (!near(shown.tokens, worstCase.tokens) || !near(shown.costMicros, worstCase.costMicros)) {
    return err(ERROR_CODES.approvalChanged);
  }
  return ok(withinCeilings({ tokens: worstCase.tokens, costMicros: worstCase.costMicros }));
}

/** RF-432: the amount after Continue (+N): N at most the offered one, the sum within the ceilings. */
// RF-432
export function continuedAmount(
  approved: ApprovedAmount,
  extra: Amount | undefined,
): ApprovedAmount {
  const offered = continueAmountOf(approved);
  const n =
    extra === undefined
      ? offered
      : {
          tokens: Math.min(extra.tokens, offered.tokens),
          costMicros: Math.min(extra.costMicros, offered.costMicros),
        };
  return withinCeilings(raiseApprovedAmount(approved, n));
}

/** RF-430: the journey figures of the server's run estimate (EstimateRun); none without a journey. */
export function journeyLookupOf(estimates: {
  execute(
    request: Parameters<JourneyLookup>[0],
  ): Promise<
    Result<{ readonly journey?: { readonly likely: Figure; readonly worstCase: Figure } }, unknown>
  >;
}): JourneyLookup {
  return async (request) => {
    const estimate = await estimates.execute(request);
    const journey = estimate.ok ? estimate.value.journey : undefined;
    if (journey === undefined) return undefined;
    return { likely: amountOf(journey.likely), worstCase: amountOf(journey.worstCase) };
  };
}

interface Figure {
  readonly tokens: number;
  readonly costMicros: bigint;
}

function amountOf(figure: Figure): Amount {
  return { tokens: figure.tokens, costMicros: Number(figure.costMicros) };
}
