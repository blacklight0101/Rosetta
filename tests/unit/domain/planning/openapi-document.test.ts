import { describe, expect, it } from 'vitest';
import { openApiDocument } from '../../../../src/domain/planning/openapi-document.js';
import type { ModelColumn, TargetDataModel } from '../../../../src/domain/planning/data-model.js';
import { targetModel } from '../../../support/data-model-fixtures.js';
import { apiOperations } from '../../../support/api-contract-fixtures.js';
import { keysAt, valueAt as at } from '../../../support/value-at.js';

// RF-624, RF-623, DEC-134: the OpenAPI 3.1 document is built by code from the checked operations and
// the target data model: the schemas come from the tables, every operation names its cards, carries
// its error responses and its security, and no text of the model is a key or a reference.

const identity = (text: string): string => text;

function document(model: TargetDataModel = targetModel(), mask = identity) {
  return openApiDocument(apiOperations(), model, mask);
}

function withColumns(...columns: ModelColumn[]): TargetDataModel {
  const model = targetModel();
  const [first, ...rest] = model.tables;
  if (first === undefined) throw new Error('The fixture has tables');
  return { ...model, tables: [{ ...first, columns }, ...rest] };
}

describe('openApiDocument: the head and the paths', () => {
  it('RF-624 is an OpenAPI 3.1 document with the paths, methods and operation ids', () => {
    const doc = document();

    expect(at(doc, 'openapi')).toBe('3.1.0');
    expect(typeof at(doc, 'info', 'title')).toBe('string');
    expect(keysAt(doc, 'paths')).toEqual([
      '/customers',
      '/orders',
      '/orders/{orderId}',
      '/sessions',
    ]);
    expect(at(doc, 'paths', '/orders', 'get', 'operationId')).toBe('listOrders');
    expect(at(doc, 'paths', '/orders', 'post', 'operationId')).toBe('placeOrder');
    expect(at(doc, 'paths', '/orders/{orderId}', 'delete', 'operationId')).toBe('cancelOrder');
  });

  it('RF-624 each operation lists the FEAT or FLOW cards it serves', () => {
    const doc = document();

    expect(at(doc, 'paths', '/orders', 'post', 'x-rosetta-serves')).toEqual([
      'FEAT-001',
      'FLOW-001',
    ]);
    expect(at(doc, 'paths', '/customers', 'get', 'x-rosetta-serves')).toEqual(['FEAT-001']);
  });

  it('RF-624 declares each path parameter as a required string', () => {
    const doc = document();

    expect(at(doc, 'paths', '/orders/{orderId}', 'get', 'parameters')).toEqual([
      { name: 'orderId', in: 'path', required: true, schema: { type: 'string' } },
    ]);
    expect(at(doc, 'paths', '/orders', 'get', 'parameters')).toBeUndefined();
  });
});

describe('openApiDocument: bodies and responses', () => {
  it('RF-624 a list answers an array of the table schema, a post takes it and answers 201', () => {
    const doc = document();
    const ref = { $ref: '#/components/schemas/customer_order' };

    expect(at(doc, 'paths', '/orders', 'get', 'responses', '200', 'content')).toEqual({
      'application/json': { schema: { type: 'array', items: ref } },
    });
    expect(at(doc, 'paths', '/orders', 'post', 'requestBody', 'content')).toEqual({
      'application/json': { schema: ref },
    });
    expect(at(doc, 'paths', '/orders', 'post', 'requestBody', 'required')).toBe(true);
    expect(at(doc, 'paths', '/orders', 'post', 'responses', '201', 'description')).toBeTypeOf(
      'string',
    );
    expect(at(doc, 'paths', '/orders/{orderId}', 'get', 'responses', '200', 'content')).toEqual({
      'application/json': { schema: ref },
    });
  });

  it('RF-624 a delete without a body answers 204 with no content', () => {
    const responses = at(document(), 'paths', '/orders/{orderId}', 'delete', 'responses');

    expect(keysAt(document(), 'paths', '/orders/{orderId}', 'delete', 'responses')).toContain(
      '204',
    );
    expect(at(responses, '204', 'content')).toBeUndefined();
    expect(at(document(), 'paths', '/orders/{orderId}', 'delete', 'requestBody')).toBeUndefined();
  });
});

describe('openApiDocument: error responses', () => {
  it('RF-624 every operation has the error responses of the planner, 401 when signed in, and 500', () => {
    const doc = document();
    const statuses = (path: string, method: string): string[] =>
      keysAt(doc, 'paths', path, method, 'responses').sort();

    expect(statuses('/orders', 'post')).toEqual(['201', '401', '409', '422', '500']);
    expect(statuses('/orders/{orderId}', 'get')).toEqual(['200', '401', '404', '500']);
    expect(statuses('/sessions', 'post')).toEqual(['201', '500']);
    expect(at(doc, 'paths', '/orders/{orderId}', 'get', 'responses', '404')).toEqual({
      $ref: '#/components/responses/NotFound',
    });
  });

  it('RF-624 the error responses answer the shared error schema', () => {
    const doc = document();

    expect(at(doc, 'components', 'responses', 'NotFound', 'content')).toEqual({
      'application/json': { schema: { $ref: '#/components/schemas/ApiError' } },
    });
    expect(at(doc, 'components', 'schemas', 'ApiError', 'required')).toEqual(['code', 'message']);
    expect(keysAt(doc, 'components', 'responses')).toEqual([
      'Conflict',
      'InternalError',
      'NotFound',
      'Unauthorized',
      'Unprocessable',
    ]);
  });
});

describe('openApiDocument: authentication', () => {
  it('RF-624 describes a bearer scheme and requires it everywhere except a public operation', () => {
    const doc = document();

    expect(at(doc, 'components', 'securitySchemes', 'bearerAuth')).toEqual({
      type: 'http',
      scheme: 'bearer',
    });
    expect(at(doc, 'security')).toEqual([{ bearerAuth: [] }]);
    expect(at(doc, 'paths', '/sessions', 'post', 'security')).toEqual([]);
    expect(at(doc, 'paths', '/orders', 'get', 'security')).toBeUndefined();
  });
});

describe('openApiDocument: schemas from the data model', () => {
  it('RF-624 has one schema per table with the required columns and the nullable ones', () => {
    const doc = document();

    expect(at(doc, 'components', 'schemas', 'customer_order', 'required')).toEqual([
      'id',
      'customer_id',
      'status',
    ]);
    expect(at(doc, 'components', 'schemas', 'customer_order', 'properties', 'total')).toEqual({
      type: ['number', 'null'],
    });
    expect(at(doc, 'components', 'schemas', 'customer', 'properties', 'email')).toEqual({
      type: 'string',
      maxLength: 200,
    });
    expect(at(doc, 'components', 'schemas', 'customer', 'properties', 'id')).toEqual({
      type: 'string',
      format: 'uuid',
    });
  });
});

describe('openApiDocument: column types', () => {
  it.each([
    ['integer', { type: 'integer' }],
    ['bigint', { type: 'integer', format: 'int64' }],
    ['boolean', { type: 'boolean' }],
    ['date', { type: 'string', format: 'date' }],
    ['timestamp with time zone', { type: 'string', format: 'date-time' }],
    ['decimal(10,2)', { type: 'number' }],
    ['jsonb', {}],
    ['uuid[]', { type: 'array', items: { type: 'string', format: 'uuid' } }],
    ['to confirm', { type: 'string' }],
  ])('RF-624 the column type %s becomes %j', (type, schema) => {
    const doc = document(
      withColumns({ name: 'c', type, nullable: false, legacy: null, migrationRisk: '' }),
    );

    expect(at(doc, 'components', 'schemas', 'customer', 'properties', 'c')).toEqual(schema);
  });
});

describe('openApiDocument: names and text', () => {
  it('RF-624 names a hostile column by key only, whatever the key is', () => {
    const hostile = ['__proto__', 'constructor', 'no', 'on', 'y'];
    const doc = document(
      withColumns(
        ...hostile.map((name) => ({
          ...{ name, type: 'text', nullable: false, legacy: null, migrationRisk: '' },
        })),
      ),
    );

    const properties = at(doc, 'components', 'schemas', 'customer', 'properties');
    expect(typeof properties).toBe('object');
    expect(keysAt(doc, 'components', 'schemas', 'customer', 'properties')).toEqual(hostile);
    expect(Object.getPrototypeOf(properties)).toBe(Object.prototype);
  });

  it('RF-624 a table named like the shared error schema does not replace it', () => {
    const model = targetModel();
    const [first, ...rest] = model.tables;
    if (first === undefined) throw new Error('The fixture has tables');

    const doc = document({ ...model, tables: [{ ...first, name: 'ApiError' }, ...rest] });

    expect(at(doc, 'components', 'schemas', 'ApiError', 'required')).toEqual(['code', 'message']);
  });

  it('RF-603 the text of the model passes the mask and never becomes a key or reference', () => {
    const mask = (text: string): string => text.replaceAll('Keeps', 'KEPT');
    const doc = document(targetModel(), mask);

    expect(at(doc, 'components', 'schemas', 'customer', 'description')).toBe(
      'KEPT the people who place orders.',
    );
    expect(at(doc, 'paths', '/orders', 'post', 'summary')).toBe('Places an order.');
  });

  it('RF-624 the same input gives the same document', () => {
    expect(JSON.stringify(document())).toBe(JSON.stringify(document()));
  });
});
