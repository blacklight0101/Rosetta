import type { z } from 'zod';
import { err, ok, type Result } from '../../../domain/errors/result.js';
import type { PromptFile } from '../../agent/prompt-file.js';
import type { LabTarget, PreparedCase, TargetEnv, TargetOutcome } from '../lab-target.js';
import { askOnce, problemsOf } from './single-call.js';

// RF-1401, RF-1406: a target of one planner call that sends one user message and reads one answer.
// The definition holds what differs between the plan documents: the schema of the case input, the
// run's own message builder over it and the run's own answer parser with the label it gives.

export interface DocTargetDefinition<T> {
  readonly id: string;
  /** The agent task the call is logged under, without the case key. */
  readonly task: string;
  readonly schema: z.ZodType<T>;
  /** The user message; a repair prompt is part of it, so the file under test is given too. */
  readonly message: (input: T, tags: () => string, prompt: PromptFile) => string;
  /** The result of one raw answer: the run's parser, and the label of what it read. */
  readonly read: (text: string, input?: T) => TargetOutcome;
  /** The system prompt for the file under test; the file's own text by default. */
  readonly system?: (prompt: PromptFile) => string;
}

function preparedOf<T>(definition: DocTargetDefinition<T>, input: T): PreparedCase {
  return {
    run: async (env: TargetEnv, prompt: PromptFile): Promise<TargetOutcome> => {
      const content = definition.message(input, () => env.ids.dataBlockTag(), prompt);
      const asked = await askOnce(env, {
        role: 'planner',
        task: definition.task,
        system: definition.system?.(prompt) ?? prompt.text,
        messages: [{ role: 'user', content }],
      });
      return asked.ok ? definition.read(asked.value.text, input) : asked.error;
    },
  };
}

// RF-1406
export function docTarget<T>(definition: DocTargetDefinition<T>): LabTarget {
  const parseInput = (data: unknown): Result<PreparedCase, string> => {
    const parsed = definition.schema.safeParse(data);
    return parsed.success
      ? ok(preparedOf(definition, parsed.data))
      : err(problemsOf(parsed.error.issues));
  };
  return {
    id: definition.id,
    role: 'planner',
    parseInput,
    readsAnswer: (text) => definition.read(text).usable,
  };
}

/** The outcome of a parsed answer: unusable when nothing read, else the label of what it held. */
export function labelled(
  read: unknown,
  held: number,
  labels: readonly [string, string],
  usableWhenEmpty = true,
): TargetOutcome {
  if (read === undefined) return { usable: false, detail: 'Unusable' };
  return held > 0
    ? { usable: true, detail: labels[0] }
    : { usable: usableWhenEmpty, detail: labels[1] };
}
