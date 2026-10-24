import { roomVerdict, type RoomFacts, type Spend } from '../../domain/budget/claim-room.js';
import { READER_SHARE_PERCENT, VERIFIER_SHARE_PERCENT } from '../../domain/budget/budget.js';
import type { Card } from '../../domain/cards/card.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { LlmProvider } from '../ports/llm-provider.js';
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

/** Where the check reads the spend by role, and where it speaks. */
export interface ReaderRoomSources {
  readonly spend: (role: 'reader' | 'verifier') => Spend;
  readonly announce: (reason: ReadersStop, claims: number) => Promise<void>;
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

function percentOf(value: bigint, percent: number): bigint {
  return (value * BigInt(percent)) / 100n;
}

/** The caps the check holds the readers to: the run's, and the shares or role caps of the roles. */
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
    readerTokens: readerCap ?? percentOf(caps.tokens, READER_SHARE_PERCENT),
    // A verifier cap of the project is the owner's choice to cut judging short, not a reason to stop reading.
    verifierTokens: percentOf(caps.tokens, VERIFIER_SHARE_PERCENT),
    callTokens: BigInt(reader.maxOutputTokens),
  };
}

export class ReaderRoom {
  private readonly sources: ReaderRoomSources;
  private readonly limits: RoomFacts['limits'];
  private stopped: ReadersStop | undefined;
  private cards: () => readonly Card[] = () => [];
  private pending: () => number = () => 0;
  private readonly refusedTasks = new Set<string>();

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
      ...{ limits: this.limits, claims },
      readers: sources.spend('reader'),
      verifier: sources.spend('verifier'),
    };
    const verdict = roomVerdict(facts);
    if (verdict === 'open') return true;
    this.stopped = verdict === 'judging' ? 'judging' : 'share';
    await sources.announce(this.stopped, claims.unjudged);
    return false;
  }

  /** The reader's provider, which ends a task at its next turn once the check has said no. */
  guard(inner: LlmProvider, agentTaskId: string): LlmProvider {
    return {
      complete: async (request, observer) => {
        if (!(await this.admits())) {
          this.refusedTasks.add(agentTaskId);
          throw new RosettaError(ERROR_CODES.budgetCapReached);
        }
        return inner.complete(request, observer);
      },
    };
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

/** The parts of a session with the room check of the run, reading its spend by role (P5-20). */
export function withRoom<
  P extends { readonly settings: ProjectSettings; readonly role: RoleProvider },
>(
  execution: Pick<RunExecution, 'events'>,
  parts: P,
  budget: Pick<RunBudgetEvents, 'roleSpend'>,
): P & { readonly room: ReaderRoom } {
  return { ...parts, room: readerRoomOf(execution, { ...parts, budget }) };
}

/** The room check of an understand run, reading the run's spend by role and speaking through its events. */
function readerRoomOf(
  execution: Pick<RunExecution, 'events'>,
  parts: {
    readonly budget: Pick<RunBudgetEvents, 'roleSpend'>;
    readonly settings: ProjectSettings;
    readonly role: RoleProvider;
  },
): ReaderRoom {
  const sources = {
    spend: (role: 'reader' | 'verifier') => parts.budget.roleSpend(role),
    announce: (reason: ReadersStop, claims: number) =>
      announceReadersStopped(execution, reason, claims),
  };
  return new ReaderRoom(sources, roomLimitsOf(parts.settings, parts.role));
}
