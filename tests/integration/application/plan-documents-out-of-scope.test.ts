import { describe, expect, it } from 'vitest';
import {
  planDocuments,
  type DocumentPrompts,
} from '../../../src/application/plan/plan-documents.js';
import type { LlmProvider } from '../../../src/application/ports/llm-provider.js';
import type { PromptFile } from '../../../src/application/agent/prompt-file.js';
import { shippedCatalogue } from '../../support/planning-brief-harness.js';
import { briefOf, card } from '../../support/data-model-sqlserver-orders.js';
import { scriptedPlanner } from '../../support/batched-model-planner.js';
import { fakeResponse } from '../../support/fake-recordings.js';

// RF-623, P7-32, P8-07: planDocuments passes the "out of scope" lines of the PRD it just read to
// planDataModel, so a table that a line drops (it cites every card of the table) is not written and
// checks.md lists it with the line; a table the line does not cite stays. Synthetic names only.

const prompt = (name: string): PromptFile => ({
  ...{ name: `planner/${name}.md`, version: 'v1', sha256: 'c'.repeat(64) },
  text: name,
});
const prompts: DocumentPrompts = {
  prd: prompt('prd'),
  dataModel: prompt('data-model'),
  flows: prompt('flows'),
  apiContract: prompt('api-contract'),
  ux: prompt('ux'),
};

const cards = [
  card('ENT-001', 'ENT', 'Gadget sheet', ['The gadget table has an id and a label.']),
  card('ENT-002', 'ENT', 'Spare gadget sheet', [
    'The spare sheet repeats the gadgets and is empty.',
  ]),
];

const column = (name: string, claim: string) => ({
  ...{ name, type: 'varchar(50)', nullable: true },
  legacy: { claim, field: name },
});
const table = (name: string, id: string) => ({
  ...{ name, purpose: 'Keeps rows.', sources: [id], primaryKey: [], uniqueKeys: [] },
  ...{ foreignKeys: [], checks: [], indexes: [] },
  columns: [column('label', `${id}.c1`), column('colour', `${id}.c1`)],
});

const prdAnswer = JSON.stringify({
  outOfScope: [{ text: 'The empty spare sheet is out of scope.', sources: ['ENT-002'] }],
});
const modelAnswer = JSON.stringify({
  tables: [table('gadget', 'ENT-001'), table('spare_gadget', 'ENT-002')],
  dropped: [],
});

async function planned(prdText: string) {
  const { call } = scriptedPlanner({ maxEntities: 20 });
  const provider: LlmProvider = {
    complete(request) {
      const text =
        request.system === 'prd' ? prdText : request.system === 'data-model' ? modelAnswer : 'none';
      const usage = { inputTokens: 1, outputTokens: 10, cachedInputTokens: 0 } as const;
      return Promise.resolve(
        fakeResponse({
          ...{ text, toolCalls: [], finishReason: 'stop' },
          usage: { ...usage, usageSource: 'reported' },
        }),
      );
    },
  };
  const base = { ...call, planner: { ...call.planner, provider } };
  const input = {
    ...{ cards, brief: briefOf('SQL Server'), catalogue: shippedCatalogue },
    ...{ answered: [], components: [] },
  };
  return planDocuments(base, prompts, input, () => Promise.resolve());
}

describe('planDocuments: the out-of-scope lines of the PRD reach the data model', () => {
  it('RF-623 writes no table for a sheet the PRD lists out of scope, and lists it in the checks', async () => {
    const result = await planned(prdAnswer);

    expect(result.dataModel.tables.map((each) => each.name)).toEqual(['gadget']);
    expect(result.dataModelProblems).toContainEqual(
      expect.objectContaining({ item: 'spare_gadget', kind: 'check' }),
    );
  });

  it('RF-623 writes both tables when the PRD lists nothing out of scope', async () => {
    const result = await planned('{}');

    expect(result.dataModel.tables.map((each) => each.name)).toEqual(['gadget', 'spare_gadget']);
  });
});
