import { z } from 'zod';
import { err, ok, type Result } from '../../../domain/errors/result.js';
import type { PromptFile } from '../../agent/prompt-file.js';
import { parseGapAnswer } from '../../plan/gap-answer.js';
import { gapMessage } from '../../plan/gap-message.js';
import type { LabTarget, PreparedCase, TargetEnv, TargetOutcome } from '../lab-target.js';
import { askOnce, problemsOf } from './single-call.js';

// RF-1406, RF-627, ADR-029: the lab target of the planner's task cards for the items no card builds
// (`planner/gap`). A case holds the items and the plan they join; they reach the model as the two
// data blocks the run builds (`gapMessage`). The lab makes the one call; the run's continuation and
// repair are not replayed. `detail` is `Cards` (the answer holds at least one card), `NoCards` (a
// valid answer with none) or `Unusable`.

/** RF-1406: the input of a gap case; the gap repair adds its problem lines to it. */
export const gapInputSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(300),
        kind: z.string().min(1).max(40),
        name: z.string().max(300),
        detail: z.string().max(2000),
      }),
    )
    .min(1)
    .max(200),
  phases: z
    .array(
      z.strictObject({
        number: z.number().int(),
        name: z.string().max(300),
        goal: z.string().max(1000),
      }),
    )
    .max(50),
  requirements: z.array(z.strictObject({ title: z.string().max(300) })).max(500),
  tasks: z.array(z.strictObject({ id: z.string().max(100), title: z.string().max(300) })).max(500),
});

type GapInput = z.infer<typeof gapInputSchema>;

/** The run's reading of a gap answer for the items of the case: `Cards`, `NoCards` or `Unusable`. */
export function gapOutcome(text: string, input: Pick<GapInput, 'items'>): TargetOutcome {
  const only = input.items.length === 1 ? input.items[0]?.id : undefined;
  const answer = parseGapAnswer(text, only);
  if (answer === undefined) return { usable: false, detail: 'Unusable' };
  return { usable: true, detail: answer.drafts.length > 0 ? 'Cards' : 'NoCards' };
}

function preparedOf(input: GapInput): PreparedCase {
  return {
    run: async (env: TargetEnv, prompt: PromptFile): Promise<TargetOutcome> => {
      const { items, ...content } = input;
      const message = gapMessage({ items, content }, () => env.ids.dataBlockTag());
      const asked = await askOnce(env, {
        ...{ role: 'planner', task: 'planner-gap', system: prompt.text },
        messages: [{ role: 'user', content: message }],
      });
      return asked.ok ? gapOutcome(asked.value.text, input) : asked.error;
    },
  };
}

function parseCase(data: unknown): Result<PreparedCase, string> {
  const parsed = gapInputSchema.safeParse(data);
  return parsed.success ? ok(preparedOf(parsed.data)) : err(problemsOf(parsed.error.issues));
}

// RF-1406
export function gapTarget(): LabTarget {
  return {
    id: 'planner/gap',
    role: 'planner',
    parseInput: parseCase,
    readsAnswer: (text) => parseGapAnswer(text) !== undefined,
  };
}
