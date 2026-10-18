import { describe, expect, it } from 'vitest';
import type { ApiDraft, ApiOperation } from '../../../../src/domain/planning/api-contract.js';
import { assembleApiContract } from '../../../../src/domain/planning/api-contract-assembly.js';
import { targetModel } from '../../../support/data-model-fixtures.js';
import { apiDraft, draftOperation } from '../../../support/api-contract-fixtures.js';

// RF-624, RF-603, ADR-013: the planner's draft of the API is checked before it becomes the contract.
// An operation names the verified FEAT or FLOW cards it serves, has an identifier for a name, a
// path made of plain segments and a known method; a duplicate, a hostile spelling or an operation
// that serves no known card is left out and counted; no card is silently left without an operation.

const servable = ['FEAT-001', 'FEAT-002', 'FLOW-001'];

function assembled(draft: ApiDraft = apiDraft()) {
  return assembleApiContract(draft, servable, targetModel());
}

function operationsOf(draft: ApiDraft = apiDraft()): readonly ApiOperation[] {
  const { contract } = assembled(draft);
  return contract.kind === 'openapi' ? contract.operations : [];
}

function oneOperation(rest: Parameters<typeof draftOperation>[0]): readonly ApiOperation[] {
  return operationsOf(apiDraft({ operations: [draftOperation(rest)] }));
}

describe('assembleApiContract: operations', () => {
  it('RF-624 keeps each operation, ordered by path and then method', () => {
    const operations = operationsOf();

    expect(operations.map((each) => `${each.method} ${each.path}`)).toEqual([
      'get /customers',
      'get /orders',
      'post /orders',
      'get /orders/{orderId}',
      'post /sessions',
    ]);
    expect(assembled().readable).toBe(true);
  });

  it('RF-624 names the cards each operation serves, sorted, from the verified cards only', () => {
    const operations = operationsOf();

    expect(operations.find((each) => each.operationId === 'placeOrder')?.serves).toEqual([
      'FEAT-001',
      'FLOW-001',
    ]);
  });

  it('RF-624 leaves out a card id that is not a verified FEAT or FLOW card, and the operation that serves nothing else', () => {
    const kept = oneOperation({ serves: ['FEAT-001', 'ENT-001', 'FEAT-999'] });
    const none = oneOperation({ serves: ['ENT-001', 'BR-001'] });
    const empty = oneOperation({ serves: [] });

    expect(kept.map((each) => each.serves)).toEqual([['FEAT-001']]);
    expect(none).toEqual([]);
    expect(empty).toEqual([]);
  });

  it('RF-624 counts what it left out', () => {
    const draft = apiDraft({
      operations: [
        draftOperation({ serves: ['FEAT-001', 'FEAT-999'] }),
        draftOperation({ operationId: 'other', path: '/other', serves: ['BR-001'] }),
      ],
    });

    expect(assembled(draft).leftOut).toEqual({ operations: 1, serves: 1, security: 0 });
  });
});

describe('assembleApiContract: names, paths and methods', () => {
  it.each(['list orders', 'a"b', "a'b", '1abc', '', 'x'.repeat(80), 'a;drop', 'a: b', 'é'])(
    'RF-624 refuses the operation id %j',
    (operationId) => {
      expect(oneOperation({ operationId })).toEqual([]);
    },
  );

  it.each([
    'orders',
    '/a/../b',
    '/a/./b',
    '//x',
    '/a b',
    '/a?x=1',
    '/a#frag',
    '/a/{id',
    '/a/id}',
    '/a/{}',
    '/a/{b-c}',
    '/a/{1b}',
    'http://evil.example/x',
    '/a/',
    '/A/b',
    '/a\\b',
    '/a/%2e%2e/b',
    '/a\nb',
    '/a/{id}{id2}',
    `/${'a'.repeat(300)}`,
  ])('RF-624 refuses the path %j', (path) => {
    expect(oneOperation({ path })).toEqual([]);
  });
});

describe('assembleApiContract: methods, summaries and duplicates', () => {
  it.each(['trace', 'connect', 'options', '', 'get; drop', 'get '.repeat(3)])(
    'RF-624 refuses the method %j',
    (method) => {
      expect(oneOperation({ method })).toEqual([]);
    },
  );

  it('RF-624 reads a method in capitals', () => {
    expect(oneOperation({ method: 'GET' }).map((each) => each.method)).toEqual(['get']);
  });

  it('RF-624 refuses an operation without a summary', () => {
    expect(oneOperation({ summary: '   ' })).toEqual([]);
  });

  it('RF-624 keeps the first of two operations with one operation id or one method and path', () => {
    const draft = apiDraft({
      operations: [
        draftOperation(),
        draftOperation({ path: '/other' }),
        draftOperation({ operationId: 'again' }),
        draftOperation({ operationId: 'params', path: '/orders/{id}' }),
        draftOperation({ operationId: 'paramsAgain', path: '/orders/{orderId}' }),
      ],
    });

    expect(operationsOf(draft).map((each) => each.operationId)).toEqual(['listOrders', 'params']);
  });
});

describe('assembleApiContract: errors, security and schemas', () => {
  it('RF-624 keeps the error statuses the planner may add, sorted and without repeats', () => {
    const errors = oneOperation({
      errors: [429, 404, 404, 401, 500, 200, 999, 400, 422, 403, 409],
    });

    expect(errors.map((each) => each.errors)).toEqual([[400, 403, 404, 409, 422, 429]]);
  });

  it('RF-624 an operation that carries data stays signed in even if the planner called it public', () => {
    const draft = apiDraft({
      operations: [
        draftOperation({ public: true }),
        draftOperation({ operationId: 'signIn', path: '/sessions', entity: null, public: true }),
      ],
    });

    const operations = operationsOf(draft);

    expect(operations.map((each) => each.public)).toEqual([false, true]);
    expect(assembled(draft).leftOut.security).toBe(1);
  });

  it('RF-624 the body is the table built from the entity card, or none', () => {
    const operations = operationsOf();
    const schemaOf = (id: string): string | null | undefined =>
      operations.find((each) => each.operationId === id)?.schema;

    expect(schemaOf('listOrders')).toBe('customer_order');
    expect(schemaOf('listCustomers')).toBe('customer');
    expect(schemaOf('signIn')).toBeNull();
  });

  it.each(['ENT-999', 'FEAT-001', 'customer', '__proto__'])(
    'RF-624 an entity %j that names no ENT table gives no body',
    (entity) => {
      expect(oneOperation({ entity }).map((each) => each.schema)).toEqual([null]);
    },
  );
});

describe('assembleApiContract: cards no operation serves', () => {
  it('RF-624 lists a card without an operation with the planner reason', () => {
    const draft = apiDraft({
      operations: [draftOperation()],
      notServed: [{ card: 'FLOW-001', reason: 'The flow runs in the batch job.' }],
    });

    const { contract } = assembled(draft);

    const unserved = contract.kind === 'openapi' ? contract.unserved : [];
    expect(unserved.map((each) => each.cardId)).toEqual(['FEAT-002', 'FLOW-001']);
    expect(unserved.map((each) => each.byPlanner)).toEqual([false, true]);
    expect(unserved[0]?.reason).toContain('no operation');
    expect(unserved[1]?.reason).toBe('The flow runs in the batch job.');
  });

  it('RF-624 every FEAT and FLOW card is served or listed', () => {
    const { contract } = assembled();

    expect(contract.kind === 'openapi' ? contract.unserved : ['x']).toEqual([]);
  });

  it('RF-624 a reason for a card that is served, or for an unknown card, is ignored', () => {
    const draft = apiDraft({
      notServed: [
        { card: 'FEAT-001', reason: 'Not needed.' },
        { card: 'FEAT-999', reason: 'Unknown.' },
      ],
    });

    const { contract } = assembled(draft);

    expect(contract.kind === 'openapi' ? contract.unserved : ['x']).toEqual([]);
  });
});

describe('assembleApiContract: no contract', () => {
  it('RF-624 a server-rendered front end gives the contract of kind none with the planner reason', () => {
    const draft = apiDraft({
      applies: false,
      reason: 'The pages are rendered by the server.',
      operations: [draftOperation()],
    });

    expect(assembled(draft)).toMatchObject({
      contract: { kind: 'none', reason: 'The pages are rendered by the server.' },
      readable: true,
    });
  });

  it('RF-624 a missing reason is replaced by one the code writes', () => {
    const { contract } = assembled(apiDraft({ applies: false, reason: '  ', operations: [] }));

    expect(contract.kind === 'none' ? contract.reason : '').toContain('no public API');
  });

  it('RF-624 no answer at all gives kind none and is not readable', () => {
    const { contract, readable } = assembleApiContract(undefined, servable, targetModel());

    expect(readable).toBe(false);
    expect(contract.kind === 'none' ? contract.reason : '').toContain('no usable operation');
  });

  it('RF-624 an answer whose every operation is refused is treated the same way', () => {
    const draft = apiDraft({ operations: [draftOperation({ path: '../x' })] });

    const { contract, readable, leftOut } = assembled(draft);

    expect(readable).toBe(false);
    expect(contract.kind).toBe('none');
    expect(leftOut.operations).toBe(1);
  });
});
