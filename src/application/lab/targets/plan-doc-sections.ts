import { z } from 'zod';
import { architectureStyleIds } from '../../../domain/planning/catalogue.js';
import type { SourceCard } from '../../../domain/planning/plan-sources.js';
import { parseApiContractAnswer } from '../../plan/api-contract-answer.js';
import { apiContractMessage } from '../../plan/api-contract-message.js';
import { parseDataModelAnswer } from '../../plan/data-model-answer.js';
import { dataModelMessageFor } from '../../plan/data-model-message.js';
import { parseFlowsAnswer } from '../../plan/flows-answer.js';
import { flowsMessage } from '../../plan/flows-message.js';
import { parseUxAnswer } from '../../plan/ux-answer.js';
import { uxMessage } from '../../plan/ux-message.js';
import type { LabTarget } from '../lab-target.js';
import { docTarget, labelled } from './doc-target.js';
import {
  bareCardOf,
  cardShape,
  citationShape,
  nullableText,
  plainCardShape,
  sourceCardOf,
  stackOf,
} from './plan-doc-input.js';

// RF-1406, RF-623..RF-626: the targets of the planner's data model, API contract, screens and flows.
// Each renders the run's own message builder over the case and reads the answer with the run's own
// parser; the checks of the domain that follow in a run are not replayed.

const text = (max: number) => z.string().max(max);
const bareShape = z.strictObject({ id: text(100), title: text(300) });
const style = z.enum(architectureStyleIds);

const dataModelInput = z.strictObject({
  entities: z.array(plainCardShape).min(1).max(30),
  /** The entities another call writes: present only when the run split the entities into batches. */
  otherEntities: z.array(bareShape).max(200).optional(),
  rules: z
    .array(
      z.strictObject({
        ...bareShape.shape,
        claims: z.array(z.strictObject({ claimId: text(100), text: text(2000) })).max(50),
      }),
    )
    .max(30)
    .optional(),
  database: nullableText,
  dataAccess: nullableText,
  dataMigration: text(2000).nullable(),
});

function dataModel(): LabTarget {
  return docTarget({
    id: 'planner/data-model',
    task: 'planner-data-model',
    schema: dataModelInput,
    message: (input, tags) => {
      const entities = input.entities.map((card) => sourceCardOf(card, 'ENT'));
      const others = (input.otherEntities ?? []).map(bareCardOf);
      const rules: SourceCard[] = (input.rules ?? []).map((rule) => {
        const claims = rule.claims.map((claim) => ({ ...claim, citations: [] }));
        return sourceCardOf({ ...rule, summary: '', claims }, 'BR');
      });
      const stack = stackOf([
        ['database', input.database],
        ['data-access', input.dataAccess],
      ]);
      const brief = { stack, context: { dataMigration: input.dataMigration } };
      const batch = input.otherEntities === undefined ? undefined : entities;
      return dataModelMessageFor({ cards: [...entities, ...others], brief, batch }, rules, tags);
    },
    read: (answer) => {
      const read = parseDataModelAnswer(answer);
      // RF-623: no table, no refused table and a reason for a dropped claim is a reasoned answer.
      const reasoned = read?.problems.every((problem) => !problem.field.startsWith('table'));
      return labelled(read, read?.draft.tables.length ?? 0, ['Tables', 'NoTables'], reasoned);
    },
  });
}

const apiInput = z.strictObject({
  featureCards: z.array(cardShape).max(30),
  entities: z.array(z.strictObject({ ...bareShape.shape, summary: text(2000) })).max(60),
  frontEnd: nullableText,
  backEnd: nullableText,
  database: nullableText,
  style,
});

function apiContract(): LabTarget {
  return docTarget({
    id: 'planner/api-contract',
    task: 'planner-api-contract',
    schema: apiInput,
    message: (input, tags) => {
      const features = input.featureCards.map((card) => sourceCardOf(card, card.type));
      const cards = [...features, ...input.entities.map(bareCardOf)];
      const stack = stackOf([
        ['front-end', input.frontEnd],
        ['backend-framework', input.backEnd],
        ['database', input.database],
      ]);
      return apiContractMessage({ cards, brief: { stack }, style: input.style }, tags);
    },
    read: (answer) => {
      const read = parseApiContractAnswer(answer);
      return labelled(read, read?.operations.length ?? 0, ['Operations', 'NoOperations']);
    },
  });
}

const screenShape = z.strictObject({
  route: text(300),
  roles: z.array(text(100)).max(30),
  fields: z
    .array(z.strictObject({ name: text(200), inputKind: text(60), required: z.boolean() }))
    .max(80),
  actions: z
    .array(
      z.strictObject({
        label: text(300),
        handler: text(300).optional(),
        flow: text(300).optional(),
      }),
    )
    .max(60),
  leadsTo: z.array(text(300)).max(40),
});
const uxInput = z.strictObject({
  screenCards: z.array(plainCardShape.extend({ screen: screenShape.nullable() })).max(20),
  frontEnd: nullableText,
  style,
});

function ux(): LabTarget {
  return docTarget({
    id: 'planner/ux',
    task: 'planner-ux',
    schema: uxInput,
    message: (input, tags) => {
      const screenCards = input.screenCards.map(({ screen, ...card }) =>
        sourceCardOf(card, 'SCRN', screen === null ? {} : { screen }),
      );
      const brief = { stack: stackOf([['front-end', input.frontEnd]]) };
      return uxMessage({ screenCards, brief, style: input.style }, tags);
    },
    read: (answer) => {
      const read = parseUxAnswer(answer);
      return labelled(read, read?.screens.length ?? 0, ['Screens', 'NoScreens']);
    },
  });
}

const flowShape = z.strictObject({
  id: text(100),
  title: text(300),
  summary: text(2000),
  trigger: text(1000).nullable(),
  outcome: text(1000).nullable(),
  steps: z
    .array(
      z.strictObject({
        claimId: text(100),
        text: text(2000),
        touches: text(100).nullable(),
        citations: z.array(citationShape).max(20),
      }),
    )
    .max(60),
});
const flowsInput = z.strictObject({
  flowCards: z.array(flowShape).max(20),
  components: z.array(z.strictObject({ name: text(300), responsibility: text(300) })).max(60),
});

type FlowCase = z.infer<typeof flowShape>;

function flowCardOf(flow: FlowCase): SourceCard {
  const { trigger, outcome, steps, ...card } = flow;
  const claims = steps.map(({ claimId, text: step, citations }) => ({
    ...{ claimId, text: step, citations },
  }));
  const own = sourceCardOf({ ...card, claims }, 'FLOW');
  const withTargets = own.claims.map((claim, index) => {
    const touches = steps[index]?.touches;
    return touches === null || touches === undefined ? claim : { ...claim, target: touches };
  });
  const journey = trigger === null || outcome === null ? {} : { flow: { trigger, outcome } };
  return { ...own, claims: withTargets, ...journey };
}

function flows(): LabTarget {
  return docTarget({
    id: 'planner/flows',
    task: 'planner-flows',
    schema: flowsInput,
    message: (input, tags) => {
      const flowCards = input.flowCards.map(flowCardOf);
      const touched = input.flowCards.flatMap((card) => card.steps.map((step) => step.touches));
      const named = touched.flatMap((id) => (id === null ? [] : [{ id }]));
      const cards = [...flowCards, ...named];
      return flowsMessage({ flowCards, cards, components: input.components }, tags);
    },
    read: (answer) => {
      const read = parseFlowsAnswer(answer);
      return labelled(read, read?.flows.length ?? 0, ['Flows', 'NoFlows']);
    },
  });
}

/** RF-1406: the targets of the data model, the API contract, the screens and the flows. */
export function sectionTargets(): LabTarget[] {
  return [dataModel(), apiContract(), ux(), flows()];
}
