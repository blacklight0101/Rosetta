import { describe, expect, it } from 'vitest';
import { capturePlanDocInput } from '../../../../../src/application/lab/capture/capture-plan-docs.js';
import { captureInput } from '../../../../../src/application/lab/capture/capture-rules.js';
import type { TranscriptTask } from '../../../../../src/application/lab/capture/capture-types.js';
import { planDocTargets } from '../../../../../src/application/lab/targets/plan-doc-targets.js';
import { adrModelMessage } from '../../../../../src/application/plan/adr-model-message.js';
import { apiContractMessage } from '../../../../../src/application/plan/api-contract-message.js';
import { coverageMessage } from '../../../../../src/application/plan/coverage-message.js';
import { dataModelMessage } from '../../../../../src/application/plan/data-model-message.js';
import { flowsMessage } from '../../../../../src/application/plan/flows-message.js';
import { planMessage } from '../../../../../src/application/plan/plan-message.js';
import { uxMessage } from '../../../../../src/application/plan/ux-message.js';
import { buildBrief } from '../../../../../src/domain/planning/planning-brief.js';
import { draftFile, environment } from '../../../../support/lab-target-env.js';
import { shippedCatalogue } from '../../../../support/planning-brief-harness.js';
import { SequenceIdGenerator } from '../../../../support/sequence-id-generator.js';
import {
  brief,
  claimOf,
  entity,
  entityTwo,
  feature,
  flowCard,
  rule,
  screenCard,
} from './plan-doc-fixtures.js';

// RF-1404, RF-1406: the message a plan run built is captured back from its saved task and rendered
// again by the lab target of the same prompt id: the model gets the very message the run sent.

const context = { maxTurns: 9 };
const tags = (): (() => string) => {
  const ids = new SequenceIdGenerator();
  return () => ids.dataBlockTag();
};

const ownBrief = buildBrief(
  { stack: [{ layer: 'database', choice: 'SQL Server 2022', custom: false }] },
  shippedCatalogue,
);
const planInput = {
  cards: [feature, entity],
  brief: ownBrief,
  catalogue: shippedCatalogue,
  answered: [
    { cardId: 'OQ-1', question: 'Who cancels?', context: 'src/A.cs:1-2', answer: 'Staff.' },
  ],
};
const setup = { words: 'Windows sign-in', defaulted: true };
const workbook = { signIn: setup, secrets: setup, screens: setup };
const taskOf = (name: string, user: string): TranscriptTask => ({
  name,
  messages: [
    { role: 'system', content: 'The prompt of the run.' },
    { role: 'user', content: user },
    { role: 'assistant', content: '{"never":"captured"}' },
  ],
});

const messages: readonly (readonly [string, string, string])[] = [
  ['planner/prd', 'planner-prd', planMessage(planInput, tags())],
  ['planner/package', 'planner-package', planMessage(planInput, tags())],
  ['planner/workbook', 'planner-package', planMessage({ ...planInput, workbook }, tags())],
  [
    'planner/data-model',
    'planner-data-model',
    dataModelMessage({ cards: [entity, entityTwo, rule], brief }, tags()),
  ],
  [
    'planner/data-model',
    'planner-data-model',
    dataModelMessage({ cards: [entity, entityTwo, rule], brief, batch: [entity] }, tags()),
  ],
  [
    'planner/api-contract',
    'planner-api-contract',
    apiContractMessage({ cards: [feature, flowCard, entity], brief, style: 'layered' }, tags()),
  ],
  [
    'planner/ux',
    'planner-ux',
    uxMessage({ screenCards: [screenCard], brief, style: 'layered' }, tags()),
  ],
  [
    'planner/flows',
    'planner-flows',
    flowsMessage(
      {
        ...{ flowCards: [flowCard], cards: [feature, flowCard] },
        components: [{ name: 'Shop UI', responsibility: 'The pages.' }],
      },
      tags(),
    ),
  ],
  [
    'planner/coverage',
    'planner-coverage',
    coverageMessage(
      {
        tasks: [
          { title: 'Save orders', acceptanceCriteria: ['Given a cart, when paid, then saved.'] },
        ],
        items: [{ id: 'feature:F-1', kind: 'feature', name: 'Checkout', detail: 'Pays.' }],
      },
      tags(),
    ),
  ],
  [
    'planner/adr-model',
    'planner-adr-model',
    adrModelMessage(
      {
        decisions: [
          { id: 'ADR-1', title: 'Ids', context: 'Why.', decision: 'Guids.', consequences: 'None.' },
        ],
        tables: [{ name: 'orders', purpose: 'Orders.', columns: [{ name: 'id' }] }],
      },
      tags(),
    ),
  ],
];

describe('a plan document message captured and rendered again', () => {
  it.each(messages)(
    'RF-1406 sends the message of the run for %s (%#)',
    async (prompt, name, text) => {
      const captured = captureInput(prompt, taskOf(name, text), context);
      const target = planDocTargets(draftFile('planner/package.v9.md', 'PACKAGE PROMPT')).find(
        (each) => each.id === prompt,
      );
      const parsed = target?.parseInput(captured);
      if (parsed?.ok !== true) throw new Error(JSON.stringify(parsed));
      const { env, requests } = environment([{ text: '{}' }]);

      await parsed.value.run(env, draftFile('x.v9.md', 'The prompt under test.'));

      expect(requests[0]?.messages[0]?.content).toBe(text);
      expect(JSON.stringify(captured)).not.toContain('never');
    },
  );
});

describe('the capture of the plan documents', () => {
  it('RF-1404 captures nothing from a task of another name or a message with other blocks', () => {
    const [, , text] = messages[0] ?? ['', '', ''];

    expect(capturePlanDocInput('planner/prd', taskOf('planner-ux', text))).toBeUndefined();
    expect(
      capturePlanDocInput('planner/ux', taskOf('planner-ux', 'No block here.')),
    ).toBeUndefined();
    expect(capturePlanDocInput('planner/gap', taskOf('planner-gap', text))).toBeUndefined();
  });

  it('RF-1404 leaves the package without a workbook setup out of the workbook set', () => {
    const plain = taskOf('planner-package', planMessage(planInput, tags()));
    const withSetup = taskOf('planner-package', planMessage({ ...planInput, workbook }, tags()));

    expect(capturePlanDocInput('planner/workbook', plain)).toBeUndefined();
    expect(capturePlanDocInput('planner/workbook', withSetup)).toBeDefined();
    expect(capturePlanDocInput('planner/package', withSetup)).toBeDefined();
  });

  it('RF-1404 keeps at most 8 cards of 4 claims, whatever the input says', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...feature,
      id: `FEAT-${String(index + 1).padStart(3, '0')}`,
      claims: Array.from({ length: 6 }, (__, each) => ({
        ...claimOf(`FEAT-${String(index + 1)}.c0`, `Claim ${String(each)}.`),
        claimId: `FEAT-${String(index + 1)}.c${String(each + 1)}`,
      })),
    }));
    const text = planMessage({ ...planInput, cards: many }, tags());

    const captured = capturePlanDocInput('planner/prd', taskOf('planner-prd', text)) as {
      cards: { id: string; claims: unknown[] }[];
    };

    expect(captured.cards.map((each) => each.id)).toEqual(many.slice(0, 8).map((each) => each.id));
    expect(captured.cards.every((each) => each.claims.length === 4)).toBe(true);
  });
});
