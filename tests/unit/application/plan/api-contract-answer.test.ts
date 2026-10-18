import { describe, expect, it } from 'vitest';
import { parseApiContractAnswer } from '../../../../src/application/plan/api-contract-answer.js';

// RF-624, ADR-013: the planner's API answer is untrusted text. It is read as one JSON object (fenced
// or inside prose) with every list and text bounded; which cards, paths and names are allowed is
// decided by the domain, not here. An operation that cannot be read is left out, not guessed.

const operation = {
  operationId: 'listOrders',
  method: 'get',
  path: '/orders',
  summary: 'Lists the orders.',
  serves: ['FEAT-001'],
  entity: 'ENT-001',
  list: true,
};

function answer(body: unknown): string {
  return `Here is the contract.\n\`\`\`json\n${JSON.stringify(body)}\n\`\`\`\nDone.`;
}

describe('parseApiContractAnswer', () => {
  it('RF-624 reads the operations, with the parts the answer leaves out at their empty value', () => {
    const draft = parseApiContractAnswer(answer({ applies: true, operations: [operation] }));

    expect(draft).toEqual({
      applies: true,
      reason: '',
      operations: [{ ...operation, public: false, errors: [] }],
      notServed: [],
    });
  });

  it('RF-624 reads an answer that says no contract applies, with its reason', () => {
    const draft = parseApiContractAnswer(
      answer({ applies: false, reason: 'The pages are rendered by the server.' }),
    );

    expect(draft).toEqual({
      applies: false,
      reason: 'The pages are rendered by the server.',
      operations: [],
      notServed: [],
    });
  });

  it('RF-624 reads the cards no operation serves', () => {
    const draft = parseApiContractAnswer(
      answer({ operations: [operation], notServed: [{ card: 'FLOW-001', reason: 'Batch job.' }] }),
    );

    expect(draft?.notServed).toEqual([{ card: 'FLOW-001', reason: 'Batch job.' }]);
    expect(draft?.applies).toBe(true);
  });
});

describe('parseApiContractAnswer: bounds and refusals', () => {
  it('RF-624 leaves out an operation that cannot be read and keeps the others', () => {
    const draft = parseApiContractAnswer(
      answer({
        operations: [
          { ...operation, operationId: 7 },
          { ...operation, operationId: 'ok' },
          'text',
          { ...operation, serves: 'FEAT-001' },
          { ...operation, errors: ['404'], operationId: 'bad' },
        ],
      }),
    );

    expect(draft?.operations.map((each) => each.operationId)).toEqual(['ok']);
  });

  it('RF-624 bounds the operations and every text', () => {
    const many = Array.from({ length: 400 }, (_, at) => ({
      ...operation,
      operationId: `op${String(at)}`,
    }));
    const long = { ...operation, operationId: 'long', summary: 'x'.repeat(5000) };

    const draft = parseApiContractAnswer(answer({ operations: [...many, long] }));

    expect(draft?.operations).toHaveLength(300);
    expect(draft?.operations.every((each) => each.summary.length <= 2000)).toBe(true);
    expect(parseApiContractAnswer(answer({ operations: [long] }))?.operations).toEqual([]);
  });
});

describe('parseApiContractAnswer: what is no answer', () => {
  it('RF-624 reads an answer written inside prose without a fence', () => {
    const text = `I think ${JSON.stringify({ operations: [operation] })} is right.`;

    expect(parseApiContractAnswer(text)?.operations).toHaveLength(1);
  });

  it.each([
    ['text without JSON', 'No contract.'],
    ['an object that is no answer', JSON.stringify({ hello: 'world' })],
    ['a list', JSON.stringify([operation])],
    [
      'an applies that is not a boolean',
      JSON.stringify({ applies: 'yes', operations: [operation] }),
    ],
  ])('RF-624 gives no draft for %s', (_name, text) => {
    expect(parseApiContractAnswer(text)).toBeUndefined();
  });

  it('RF-624 never lets a prototype key through', () => {
    const text = `{"operations": [${JSON.stringify(operation)}], "__proto__": {"applies": false}}`;

    const draft = parseApiContractAnswer(text);

    expect(draft?.applies).toBe(true);
    expect(Object.hasOwn(Object.prototype, 'applies')).toBe(false);
  });
});
