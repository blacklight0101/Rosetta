import { z } from 'zod';
import type { PromptFile } from '../../agent/prompt-file.js';
import { parseAdrModelAnswer } from '../../plan/adr-model-answer.js';
import { adrModelMessage } from '../../plan/adr-model-message.js';
import { parseCoverageAnswer } from '../../plan/coverage-answer.js';
import { coverageMessage } from '../../plan/coverage-message.js';
import { parsePlanAnswer } from '../../plan/plan-answer.js';
import { planBlocks, planCardsText, planOwnerText } from '../../plan/plan-message.js';
import { withWorkbookGuidance } from '../../plan/plan-workbook.js';
import { parsePrdAnswer } from '../../plan/prd-answer.js';
import type { LabTarget } from '../lab-target.js';
import { docTarget, labelled, type DocTargetDefinition } from './doc-target.js';
import { cardShape, sourceCardOf } from './plan-doc-input.js';
import { sectionTargets } from './plan-doc-sections.js';

// RF-1406, RF-604, RF-621, RF-627, ADR-029: the lab targets of the planner's plan documents. The PRD,
// the package (the plan itself) and the workbook guidance share the message of the plan call; the
// others are the calls the run makes after it. The run's own builder renders the case and the run's
// own parser reads the answer; the checks of the domain and the repairs are not replayed.

const text = (max: number) => z.string().max(max);

/** RF-1406: the input of a case of the plan call; the plan repair adds its problem lines to it. */
export const planInput = z.strictObject({
  cards: z.array(cardShape).min(1).max(30),
  /** The owner's block as the run sent it: the brief, the typed answers and the answered questions. */
  owner: z.record(z.string(), z.unknown()).refine((value) => JSON.stringify(value).length < 40_000),
});
type PlanCase = z.infer<typeof planInput>;

/** The plan message of a case, from the text of its two blocks as the run wrote them. */
export const planMessageOf = (
  input: Pick<PlanCase, 'cards' | 'owner'>,
  tags: () => string,
): string =>
  planBlocks(
    {
      cards: planCardsText({ cards: input.cards.map((card) => sourceCardOf(card, card.type)) }),
      owner: planOwnerText(input.owner),
    },
    tags,
  );

function planTarget(
  id: string,
  read: DocTargetDefinition<PlanCase>['read'],
  system?: DocTargetDefinition<PlanCase>['system'],
): LabTarget {
  const own = system === undefined ? {} : { system };
  return docTarget({
    id,
    task: 'planner-package',
    schema: planInput,
    message: planMessageOf,
    read,
    ...own,
  });
}

function prd(): LabTarget {
  return docTarget({
    id: 'planner/prd',
    task: 'planner-prd',
    schema: planInput,
    message: planMessageOf,
    read: (answer) => {
      const read = parsePrdAnswer(answer);
      return labelled(read, read?.features.length ?? 0, ['Features', 'NoFeatures']);
    },
  });
}

export const readPlan: DocTargetDefinition<PlanCase>['read'] = (answer) => {
  const read = parsePlanAnswer(answer);
  return labelled(read, read?.tasks.length ?? 0, ['Tasks', 'NoTasks']);
};

const coverageInput = z.strictObject({
  tasks: z
    .array(z.strictObject({ title: text(300), acceptanceCriteria: z.array(text(1000)).max(30) }))
    .max(100),
  items: z
    .array(z.strictObject({ id: text(200), kind: text(40), name: text(300), detail: text(300) }))
    .max(200),
});

function coverage(): LabTarget {
  return docTarget({
    id: 'planner/coverage',
    task: 'planner-coverage',
    schema: coverageInput,
    message: (input, tags) => coverageMessage(input, tags),
    read: (answer) => {
      const read = parseCoverageAnswer(answer);
      return labelled(read, read?.links.length ?? 0, ['Links', 'NoLinks']);
    },
  });
}

const adrInput = z.strictObject({
  decisions: z
    .array(
      z.strictObject({
        ...{ id: text(100), title: text(300), context: text(1500) },
        ...{ decision: text(1500), consequences: text(1500) },
      }),
    )
    .max(60),
  tables: z
    .array(
      z.strictObject({
        name: text(200),
        purpose: text(1500),
        columns: z.array(text(200)).max(200),
      }),
    )
    .max(100),
});

function adrModel(): LabTarget {
  return docTarget({
    id: 'planner/adr-model',
    task: 'planner-adr-model',
    schema: adrInput,
    message: (input, tags) => {
      const tables = input.tables.map((table) => ({
        ...table,
        columns: table.columns.map((name) => ({ name })),
      }));
      return adrModelMessage({ decisions: input.decisions, tables }, tags);
    },
    read: (answer) => {
      const read = parseAdrModelAnswer(answer);
      return labelled(read, read?.missing.length ?? 0, ['Missing', 'NoMissing']);
    },
  });
}

/**
 * Every plan document target. The workbook guidance is a file the run appends to the package
 * prompt, so its target sends the run's package prompt with the file under test after it.
 */
// RF-1406
export function planDocTargets(packagePrompt: PromptFile): LabTarget[] {
  const workbook = (guidance: PromptFile): string =>
    withWorkbookGuidance(packagePrompt, guidance).text;
  return [
    prd(),
    planTarget('planner/package', readPlan),
    planTarget('planner/workbook', readPlan, workbook),
    ...sectionTargets(),
    coverage(),
    adrModel(),
  ];
}
