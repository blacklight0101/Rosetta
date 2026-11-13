import { z } from 'zod';
import { err, ok, type Result } from '../../../domain/errors/result.js';
import type { PromptFile } from '../../agent/prompt-file.js';
import { parseMergeAnswer } from '../../consolidate/merge-answer.js';
import { mergeListMessage } from '../../consolidate/merge-request.js';
import type { LabTarget, PreparedCase, TargetEnv, TargetOutcome } from '../lab-target.js';
import { askOnce, problemsOf } from './single-call.js';

// RF-1406, RF-250, ADR-029: the lab target of the summariser's merge of duplicate cards
// (`summariser/merge`). A case holds the cards of one type as the run lists them; they reach the
// model as the one data block the run builds. The domain's checks of the ids are not replayed.
// `detail` is `Merges` (the answer names at least one merge), `NoMerge` (a valid empty list) or
// `Unusable`.

const inputSchema = z.strictObject({
  type: z.enum(['BR', 'ENT', 'SCRN', 'FEAT']),
  cards: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(100),
        area: z.string().max(300),
        title: z.string().max(300),
        summary: z.string().max(2000),
        claims: z.array(z.string().max(2000)).max(50),
      }),
    )
    .min(2)
    .max(100),
});

function preparedOf(input: z.infer<typeof inputSchema>): PreparedCase {
  return {
    run: async (env: TargetEnv, prompt: PromptFile): Promise<TargetOutcome> => {
      const message = mergeListMessage(input.cards, env.ids.dataBlockTag());
      const task = `summariser-${input.type.toLowerCase()}`;
      const asked = await askOnce(env, {
        ...{ role: 'summariser', task, system: prompt.text },
        messages: [{ role: 'user', content: message }],
      });
      if (!asked.ok) return asked.error;
      const merges = parseMergeAnswer(asked.value.text);
      if (merges === undefined) return { usable: false, detail: 'Unusable' };
      return { usable: true, detail: merges.length > 0 ? 'Merges' : 'NoMerge' };
    },
  };
}

function parseCase(data: unknown): Result<PreparedCase, string> {
  const parsed = inputSchema.safeParse(data);
  return parsed.success ? ok(preparedOf(parsed.data)) : err(problemsOf(parsed.error.issues));
}

// RF-1406
export function mergeTarget(): LabTarget {
  return {
    id: 'summariser/merge',
    role: 'summariser',
    parseInput: parseCase,
    readsAnswer: (text) => parseMergeAnswer(text) !== undefined,
  };
}
