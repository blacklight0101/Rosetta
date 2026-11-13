import { z } from 'zod';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { err, ok, type Result } from '../../../domain/errors/result.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import type { PromptFile } from '../../agent/prompt-file.js';
import { parseOverviewAnswer } from '../../overview/overview-answer.js';
import { overviewMessage, type OverviewCard } from '../../overview/overview-request.js';
import type { LabTarget, PreparedCase, TargetEnv, TargetOutcome } from '../lab-target.js';

// RF-1401, RF-264, ADR-029: the lab target of the summariser's overview (`summariser/overview`).
// A case holds the cards the overview is written from; they reach the model as the one data block
// the run builds (`overviewMessage`), under the prompt file under test. The run makes one call and
// does not repair, so a case is valid on its first try or it is not. `detail` is `Written` for an
// answer the run's parser reads, `Unusable` for one it cannot.

const cardSchema = z.strictObject({
  id: z.string().min(1).max(100),
  type: z.string().min(1).max(40),
  area: z.string().min(1).max(200),
  title: z.string().max(300),
  summary: z.string().max(2000),
  claims: z.array(z.string().max(2000)).max(50),
});

const inputSchema = z.strictObject({ cards: z.array(cardSchema).min(1).max(100) });

function preparedOf(cards: readonly OverviewCard[]): PreparedCase {
  return {
    run: async (env: TargetEnv, prompt: PromptFile): Promise<TargetOutcome> => {
      const { role } = env;
      try {
        const response = await role.provider.complete({
          context: {
            ...{
              runId: 'lab',
              agentTaskId: `summariser-overview-${env.caseKey}`,
              role: 'summariser',
            },
            ...{ callId: env.nextCallId(), traceId: env.traceId },
            parentSpanId: `${env.traceId.slice(0, 12)}f000`,
          },
          ...{ model: role.model, system: prompt.text, tools: [] },
          messages: [{ role: 'user', content: overviewMessage(cards, env.ids.dataBlockTag()) }],
          maxOutputTokens: role.maxOutputTokens,
          ...(role.temperature === undefined ? {} : { temperature: role.temperature }),
          signal: env.signal,
        });
        const usable = parseOverviewAnswer(response.text) !== undefined;
        return { usable, detail: usable ? 'Written' : 'Unusable' };
      } catch (error) {
        const code = error instanceof RosettaError ? error.code : ERROR_CODES.providerCallFailed;
        return {
          usable: false,
          detail: code === ERROR_CODES.budgetCapReached ? 'Capped' : 'Failed',
        };
      }
    },
  };
}

function parseCase(data: unknown): Result<PreparedCase, string> {
  const parsed = inputSchema.safeParse(data);
  if (!parsed.success) {
    const where = parsed.error.issues.map(
      (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
    );
    return err(where.join('; '));
  }
  const cards = parsed.data.cards.map((card) => ({
    ...card,
    claims: card.claims.map((text) => ({ text })),
  }));
  return ok(preparedOf(cards));
}

// RF-1401
export function overviewTarget(): LabTarget {
  return {
    id: 'summariser/overview',
    role: 'summariser',
    parseInput: parseCase,
    readsAnswer: (text) => parseOverviewAnswer(text) !== undefined,
  };
}
