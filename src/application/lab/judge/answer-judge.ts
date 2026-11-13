import { REFUSED_BEFORE_SENDING, type LabCallMeter } from '../lab-meter.js';
import type { TargetEnv } from '../lab-target.js';
import type { PromptFile } from '../../agent/prompt-file.js';
import type { IdGenerator } from '../../ports/id-generator.js';
import { judgeMessage, judgeSystem } from './judge-message.js';
import type { JudgeInfo, Judgement } from './judge-results.js';
import { overallOf, parseJudgeReply } from './judgement.js';
import type { Rubric } from './rubric.js';

// RF-1407, RF-1402, ADR-029: one judge call per answer. The call goes through the provider the
// composition root built for the judge model (the ledger gate over the guarded provider), so it is
// held, settled and capped like every lab call. The judge never raises: a call that fails or a
// reply that cannot be read is a state of the judgement, and a refusal stops the invocation.

export interface JudgedCase {
  /** The prompt family, the folder of the prompt id: it picks the rubric. */
  readonly family: string;
  readonly caseKey: string;
  readonly source: string;
  readonly answer: string;
  readonly label: string | null;
}

/** What the run needs of a judge. */
export interface CaseJudge {
  score(judged: JudgedCase): Promise<Judgement>;
  /** Why the ledger stopped the invocation, once it did. */
  stopped(): string | undefined;
  /** The judge, its prompt and the rubric of the family, as the results record them. */
  infoFor(family: string): JudgeInfo | undefined;
}

/** Why a judge call that failed or was refused ends what is running (`what`); null for any other. */
export function judgeStopReason(judged: Judgement | undefined, what: string): string | null {
  if (judged?.state !== 'refused' && judged?.state !== 'failed') return null;
  const how = judged.state === 'failed' ? 'failed' : 'was refused';
  return `The judge call ${how} (${judged.rstCode ?? 'no code'}), so the ${what} stops.`;
}

export interface AnswerJudgeOptions {
  readonly role: TargetEnv['role'];
  readonly meter: LabCallMeter;
  readonly model: { readonly provider: string; readonly model: string };
  readonly prompt: PromptFile;
  readonly rubrics: ReadonlyMap<string, Rubric>;
  readonly ids: Pick<IdGenerator, 'dataBlockTag' | 'uuid'>;
}

const NOTHING: Judgement = {
  ...{ state: 'failed', criteria: [], overall: null, vetoed: false, rstCode: null },
  ...{ calls: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 },
};

export class AnswerJudge implements CaseJudge {
  private readonly options: AnswerJudgeOptions;
  private readonly traceId: string;
  private calls = 0;
  private modelVersion: string | null = null;

  constructor(options: AnswerJudgeOptions) {
    this.options = options;
    this.traceId = options.ids.uuid().replaceAll('-', '').padEnd(32, '0').slice(0, 32);
  }

  stopped(): string | undefined {
    return this.options.meter.stopped();
  }

  infoFor(family: string): JudgeInfo | undefined {
    const rubric = this.options.rubrics.get(family);
    if (rubric === undefined) return undefined;
    const { prompt, model } = this.options;
    const { name, version, sha256 } = prompt;
    return {
      ...model,
      modelVersion: this.modelVersion,
      prompt: { name, version, sha256 },
      rubric: { family, sha256: rubric.sha256 },
    };
  }

  // RF-1407
  async score(judged: JudgedCase): Promise<Judgement> {
    const rubric = this.options.rubrics.get(judged.family);
    if (rubric === undefined) return NOTHING;
    const { meter } = this.options;
    meter.begin();
    await this.send(judged, rubric).catch(() => undefined);
    const metered = meter.end();
    const text = metered.calls.at(-1)?.text;
    this.modelVersion = metered.calls.at(-1)?.modelVersion ?? this.modelVersion;
    const spent = {
      rstCode: metered.failures[0] ?? null,
      // Every call that was sent counts, answered or not; only one refused before sending does not.
      calls:
        metered.calls.length +
        metered.failures.filter((code) => !REFUSED_BEFORE_SENDING.has(code)).length,
      inputTokens: metered.calls.reduce((sum, call) => sum + call.inputTokens, 0),
      outputTokens: metered.calls.reduce((sum, call) => sum + call.outputTokens, 0),
      costMicros:
        metered.calls.reduce((sum, call) => sum + call.costMicros, 0) +
        metered.unansweredCostMicros,
    };
    if (text === undefined) {
      const refused = metered.failures.some((code) => REFUSED_BEFORE_SENDING.has(code));
      return { ...NOTHING, ...spent, state: refused ? 'refused' : 'failed' };
    }
    const parsed = parseJudgeReply(text, rubric);
    if (!parsed.ok) return { ...NOTHING, ...spent, state: 'unreadable' };
    return {
      ...spent,
      state: 'scored',
      criteria: parsed.value,
      ...overallOf(parsed.value, rubric),
    };
  }

  private async send(judged: JudgedCase, rubric: Rubric): Promise<void> {
    const { role, prompt, ids, model } = this.options;
    this.calls += 1;
    await role.provider.complete({
      context: {
        ...{ runId: 'lab', agentTaskId: `judge-${judged.caseKey}`, role: 'planner' },
        ...{ callId: `lab-judge-${model.model}#${String(this.calls)}`, traceId: this.traceId },
        parentSpanId: `${this.traceId.slice(0, 12)}f001`,
      },
      ...{ model: role.model, system: judgeSystem(prompt, rubric), tools: [] },
      messages: [{ role: 'user', content: judgeMessage(judged, () => ids.dataBlockTag()) }],
      maxOutputTokens: role.maxOutputTokens,
      ...(role.temperature === undefined ? {} : { temperature: role.temperature }),
      signal: new AbortController().signal,
    });
  }
}
