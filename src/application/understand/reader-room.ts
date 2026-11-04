import {
  leavesOverviewRoom,
  roomVerdict,
  type RoomFacts,
  type Spend,
} from '../../domain/budget/claim-room.js';
import { ApprovalPause } from '../../domain/budget/cap-stop.js';
import type { Card } from '../../domain/cards/card.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { LlmProvider, LlmRequest } from '../ports/llm-provider.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import { roleBudgetOf } from '../projects/role-budget.js';
import type { RoleProvider } from '../providers/provider-set.js';
import { awaitsJudgement } from '../verifier/awaits-judgement.js';
import type { RunExecution } from '../ports/run-executor.js';
import type { RunBudgetEvents } from '../runs/run-budget-events.js';
import { RULE_VERDICT_MODEL } from './claim-judgement.js';
import { announceReadersStopped, type ReadersStop } from './readers-stopped.js';

// RF-429, P5-20, DEC-170: the room check of the readers of an understand run. Before a reader task
// starts, and before a reader takes another turn, the run asks whether the readers' own share has
// room for one more call and whether the claims written and not yet judged could still be judged
// with what the caps leave. Once it says no it says no for good: no task starts, a task that is
// running ends at its next turn, and the run says once why.

/** Where the check reads the spend by role and of the whole run, and where it speaks. */
export interface ReaderRoomSources {
  readonly spend: (role: 'reader' | 'verifier') => Spend;
  /** DEC-193: what every role of the run has spent, as the verifier's line counts it. */
  readonly runSpend: () => Spend;
  /** DEC-193: whether the role's calls were refused only at its reserve line of the run cap. */
  readonly stoppedAtLine: (role: 'verifier') => boolean;
  readonly announce: (reason: ReadersStop, claims: number) => Promise<void>;
  /**
   * P8-03, RF-432: set when the run cap is the owner's approved amount. A stop of the readers then
   * pauses the run and asks, as a refused call does, instead of ending it `CapReached`.
   */
  readonly pause?: () => void;
  /**
   * P8-132: the worst case of a call, as the budget guard reserves it. With it the check counts the
   * calls in flight; without it the check holds only its own lines, as before.
   */
  readonly worstCaseOf?: (request: LlmRequest) => Spend;
}

/** The claims waiting for the verifier, and those it has judged (a rule's verdict is no judgement). */
function claimCountsOf(cards: readonly Card[]): RoomFacts['claims'] {
  const claims = cards.flatMap((card) => card.claims);
  const unjudged = claims.filter(awaitsJudgement).length;
  const judged = claims.filter(
    (claim) =>
      !awaitsJudgement(claim) &&
      claim.verdict?.step === 'judgement' &&
      claim.verdict.model !== RULE_VERDICT_MODEL,
  ).length;
  return { unjudged, judged };
}

/**
 * The caps the check holds the readers to: the run's, and a reader token cap of the project. Neither
 * the readers nor the verifier have a fixed share (DEC-193); a verifier cap of the project is the
 * owner's choice to cut judging short, not a reason to stop reading.
 */
function roomLimitsOf(settings: ProjectSettings, reader: RoleProvider): RoomFacts['limits'] {
  const { run } = settings.budget;
  const caps = reader.runCaps ?? {
    tokens: BigInt(run.maxTokens),
    micros: BigInt(run.maxCostMicros),
  };
  const readerCap = roleBudgetOf(settings, 'reader').maxTokens;
  return {
    runTokens: caps.tokens,
    runMicros: caps.micros,
    ...(readerCap === undefined ? {} : { readerTokens: readerCap }),
    callTokens: BigInt(reader.maxOutputTokens),
  };
}

const NO_SPEND: Spend = { tokens: 0n, micros: 0n };

export class ReaderRoom {
  private readonly sources: ReaderRoomSources;
  private readonly limits: RoomFacts['limits'];
  private stopped: ReadersStop | undefined;
  private cards: () => readonly Card[] = () => [];
  private pending: () => number = () => 0;
  private readonly refusedTasks = new Set<string>();
  /** P8-132: the worst case of each call in flight, which the budget guard holds as a reservation. */
  private readonly inFlight = new Set<Spend>();
  private waiting: (() => void)[] = [];

  constructor(sources: ReaderRoomSources, limits: RoomFacts['limits']) {
    this.sources = sources;
    this.limits = limits;
  }

  /**
   * The session tells the check where the cards written so far are, and how many claims were
   * drafted by ended tasks and are not in those cards yet (a Deepen round writes them at its end).
   */
  attach(cards: () => readonly Card[], pending: () => number = () => 0): void {
    this.cards = cards;
    this.pending = pending;
  }

  /** Why the readers stopped, or undefined while they may go on. */
  get reason(): ReadersStop | undefined {
    return this.stopped;
  }

  /** Whether a reader task of this id was ended by the check in the middle of its work. */
  endedBy(agentTaskId: string): boolean {
    return this.refusedTasks.has(agentTaskId);
  }

  /** True while the readers may start a task or take a turn. */
  // RF-429
  async admits(): Promise<boolean> {
    if (this.stopped !== undefined) return false;
    const { sources } = this;
    const counted = claimCountsOf(this.cards());
    const claims = { ...counted, unjudged: counted.unjudged + this.pending() };
    const facts = {
      ...{ limits: this.limits, claims, run: sources.runSpend() },
      readers: sources.spend('reader'),
      verifier: sources.spend('verifier'),
    };
    const verdict = roomVerdict(facts);
    if (verdict === 'open') return true;
    this.stopped = verdict === 'judging' ? 'judging' : 'share';
    await sources.announce(this.stopped, claims.unjudged);
    sources.pause?.();
    return false;
  }

  /** P7-26: whether the run token cap still has room for the overview after a merge call. */
  leavesOverview(): boolean {
    return leavesOverviewRoom(this.sources.runSpend(), {
      tokens: this.limits.runTokens,
      micros: this.limits.runMicros,
    });
  }

  /** DEC-193: whether the verifier was stopped only at its line of the run cap, not by a cap of its own. */
  verifierAtLine(): boolean {
    return this.sources.stoppedAtLine('verifier');
  }

  /** The reader's provider, which ends a task at its next turn once the check has said no. */
  guard(inner: LlmProvider, agentTaskId: string): LlmProvider {
    return {
      complete: async (request, observer) => {
        const held = await this.holdRoomFor(request, agentTaskId);
        try {
          return await inner.complete(request, observer);
        } finally {
          this.release(held);
        }
      },
    };
  }

  /**
   * P8-132, RF-429, Q-67: the call is let through when the check admits it and the caps can pay for
   * its worst case beside the calls in flight, as the budget guard reserves them; otherwise it waits
   * for one of them to end and asks again, so a tiny cap is spent on a call that is answered and
   * booked, not on two of which one is refused and the other cancelled. With no call in flight the
   * budget guard decides, and refuses what the cap cannot pay for (RF-422).
   */
  private async holdRoomFor(request: LlmRequest, agentTaskId: string): Promise<Spend> {
    for (;;) {
      if (!(await this.admits())) {
        this.refusedTasks.add(agentTaskId);
        throw new RosettaError(ERROR_CODES.budgetCapReached);
      }
      // A copy, so each call in flight is its own entry however the source hands the figures out.
      const worst = { ...(this.sources.worstCaseOf?.(request) ?? NO_SPEND) };
      if (request.signal.aborted || this.inFlight.size === 0 || this.fitsBesideCalls(worst)) {
        this.inFlight.add(worst);
        return worst;
      }
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
  }

  /** Whether the run caps can pay for the call's worst case beside what is spent and in flight. */
  private fitsBesideCalls(worst: Spend): boolean {
    const run = this.sources.runSpend();
    const held = [...this.inFlight].reduce(
      (sum, each) => ({ tokens: sum.tokens + each.tokens, micros: sum.micros + each.micros }),
      worst,
    );
    const { runTokens, runMicros } = this.limits;
    return (
      run.tokens + held.tokens <= runTokens &&
      (runMicros === 0n || run.micros + held.micros <= runMicros)
    );
  }

  private release(held: Spend): void {
    this.inFlight.delete(held);
    const waiting = this.waiting;
    this.waiting = [];
    for (const wake of waiting) wake();
  }
}

/**
 * How the tasks ended, without those the check ended to leave room for judging: they stopped by
 * choice, not at a cap, so they are neither a cap stop nor a failed area.
 */
export function endsWithoutRoomStops<T>(
  ends: ReadonlyMap<string, T>,
  room: ReaderRoom | undefined,
): T[] {
  return [...ends.entries()]
    .filter(([id]) => !(room?.reason === 'judging' && room.endedBy(id)))
    .map(([, end]) => end);
}

/** What the room check reads from the run's budget events. */
export type RoomBudget = Pick<RunBudgetEvents, 'roleSpend' | 'runSpend' | 'stoppedAtLine'>;

/** The parts of a session with the room check of the run, reading its spend by role (P5-20). */
export function withRoom<
  P extends { readonly settings: ProjectSettings; readonly role: RoleProvider },
>(
  execution: Pick<RunExecution, 'events' | 'stop'>,
  parts: P,
  budget: RoomBudget,
): P & { readonly room: ReaderRoom } {
  return { ...parts, room: readerRoomOf(execution, { ...parts, budget }) };
}

/** The room check of an understand run, reading the run's spend by role and speaking through its events. */
function readerRoomOf(
  execution: Pick<RunExecution, 'events' | 'stop'>,
  parts: {
    readonly budget: RoomBudget;
    readonly settings: ProjectSettings;
    readonly role: RoleProvider;
  },
): ReaderRoom {
  const sources = {
    spend: (role: 'reader' | 'verifier') => parts.budget.roleSpend(role),
    runSpend: () => parts.budget.runSpend(),
    stoppedAtLine: (role: 'verifier') => parts.budget.stoppedAtLine(role),
    announce: (reason: ReadersStop, claims: number) =>
      announceReadersStopped(execution, reason, claims),
    ...(parts.role.worstCaseOf === undefined ? {} : { worstCaseOf: parts.role.worstCaseOf }),
    ...(parts.role.runCaps?.approved === true
      ? {
          pause: () => {
            execution.stop(new ApprovalPause());
          },
        }
      : {}),
  };
  return new ReaderRoom(sources, roomLimitsOf(parts.settings, parts.role));
}
