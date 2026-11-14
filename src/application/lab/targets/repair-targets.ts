import { z } from 'zod';
import type { PromptFile } from '../../agent/prompt-file.js';
import { gapRepairMessage } from '../../plan/gap-repair-message.js';
import { planRepairMessage } from '../../plan/plan-repair.js';
import type { LabTarget } from '../lab-target.js';
import { docTarget } from './doc-target.js';
import { gapInputSchema, gapOutcome } from './gap-target.js';
import { planInput, planMessageOf, readPlan } from './plan-doc-targets.js';

// RF-1406, RF-202, Q-54, P3-126, ADR-029: the lab targets of the planner's two repair prompts. A
// repair is the call it repairs sent again: the same user message, then the file under test and one
// line per problem, under the system prompt of that call (the run's gap prompt, the run's package
// prompt), which the lab does not vary here. A case is the input of a case of that call with the
// problem lines the run would write: positions, fields and fixed reasons, never a word of an answer.
// The run's own builders (`gapRepairMessage`, `planRepairMessage`) render it and the run's parser
// reads the one answer; the checks of the domain after the repair are not replayed.

const text = (max: number) => z.string().max(max);
const position = z.number().int().min(1).max(1000);

/** A card of the gap answer that could not be read: its position, the field and the reason. */
const gapProblem = z.strictObject({ position, field: text(100).min(1), reason: text(300).min(1) });

const gapRepairInput = gapInputSchema.extend({ problems: z.array(gapProblem).min(1).max(50) });

/** A failing path of the plan answer: the list, the position (none for a whole list), the field. */
const planProblem = z.strictObject({
  list: text(100).min(1),
  position: position.optional(),
  field: text(100).min(1),
  reason: text(600).optional(),
});

const planRepairInput = planInput.extend({ problems: z.array(planProblem).min(1).max(50) });

function gapRepair(gapPrompt: PromptFile): LabTarget {
  return docTarget({
    id: 'planner/gap-repair',
    task: 'planner-gap',
    schema: gapRepairInput,
    system: () => gapPrompt.text,
    message: ({ items, problems, ...content }, tags, prompt) =>
      gapRepairMessage(
        { items, content },
        { prompt, problems: problems.map((each) => ({ ...each, builds: [] })) },
        tags,
      ),
    read: (answer, input) => gapOutcome(answer, input ?? { items: [], phases: [], tasks: [] }),
  });
}

function planRepair(packagePrompt: PromptFile): LabTarget {
  return docTarget({
    id: 'planner/plan-repair',
    task: 'planner-package',
    schema: planRepairInput,
    system: () => packagePrompt.text,
    message: (input, tags, prompt) => {
      const problems = input.problems.map(({ position: at, reason, ...rest }) => ({
        ...rest,
        ...(at === undefined ? {} : { position: at }),
        ...(reason === undefined ? {} : { reason }),
      }));
      return planRepairMessage(planMessageOf(input, tags), prompt, problems);
    },
    read: readPlan,
  });
}

/** The two planner repair targets, over the run's current prompts of the calls they repair. */
// RF-1406
export function repairTargets(prompts: { gap: PromptFile; plan: PromptFile }): LabTarget[] {
  return [gapRepair(prompts.gap), planRepair(prompts.plan)];
}
