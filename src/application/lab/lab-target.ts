import type { PromptFile } from '../agent/prompt-file.js';
import type { Result } from '../../domain/errors/result.js';
import type { AgentRole } from '../ports/llm-provider.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { ToolTurn } from './lab-turns.js';
import type { RoleProvider } from '../providers/provider-set.js';

// RF-1401, ADR-029: a lab target turns the inputs of a case into the messages of one prompt id with
// the run's own builder, over any version of the prompt, and reads an answer with the run's parser.

export interface TargetEnv {
  /** The guarded provider of the target's role and its settings. */
  readonly role: Pick<RoleProvider, 'provider' | 'model' | 'maxOutputTokens' | 'temperature'>;
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
  readonly signal: AbortSignal;
  readonly traceId: string;
  /** Names the case in the agent task of its calls. */
  readonly caseKey: string;
  readonly nextCallId: () => string;
}

export interface TargetOutcome {
  /** The run would have used the final answer. */
  readonly usable: boolean;
  /** A short label of the result, compared with the case's `expected`. */
  readonly detail: string;
  /**
   * RF-1403 (P10-07): what a run would do after this answer (a repair call, a second round), each
   * true or false, counted apart from the label; absent for a target that names none.
   */
  readonly followUps?: Readonly<Record<string, boolean>>;
  /** RF-1403: the counts the check used (a name and a whole number), kept per case for an audit. */
  readonly counts?: Readonly<Record<string, number>>;
  /** RF-1410: what a reader turn that a run answers with tool calls did; such a case is not judged. */
  readonly turn?: ToolTurn;
  /** RF-1410: the label is usable only in a case whose `expected` label is this detail. */
  readonly usableWhenExpected?: boolean;
}

export interface PreparedCase {
  run(env: TargetEnv, prompt: PromptFile): Promise<TargetOutcome>;
}

export interface LabTarget {
  /** The prompt id: the folder and stem of its files, such as `verifier/claim`. */
  readonly id: string;
  readonly role: AgentRole;
  parseInput(data: unknown): Result<PreparedCase, string>;
  /**
   * Whether one raw answer is valid for the run's own parser; null when the target has no parser of
   * the answer (the first turn of a reader task, which may answer with tool calls the text does not
   * show), so first-try validity does not apply to it (RF-1403).
   */
  readsAnswer(text: string): boolean | null;
}
