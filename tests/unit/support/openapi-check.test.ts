import { describe, expect, it } from 'vitest';
import { checkOpenApi } from '../../support/openapi-check.js';

// RF-624, DEC-125: the dev-only structural check of an OpenAPI 3.1 document must refuse what a
// contract reader cannot use; a check that accepts anything would make the contract tests empty.

const valid = `
openapi: 3.1.0
info: { title: T, version: '1' }
paths:
  /items/{id}:
    get:
      operationId: getItem
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      security: [{ bearerAuth: [] }]
      responses:
        '200':
          description: ok
          content: { application/json: { schema: { $ref: '#/components/schemas/Item' } } }
components:
  securitySchemes: { bearerAuth: { type: http, scheme: bearer } }
  schemas:
    Item: { type: object, required: [id], properties: { id: { type: [string, 'null'] } } }
`;

describe('checkOpenApi', () => {
  it('RF-624 accepts a well-formed OpenAPI 3.1 document', () => {
    expect(checkOpenApi(valid)).toEqual([]);
  });

  it.each([
    ['a 3.0 version', valid.replace('3.1.0', '3.0.3'), 'is not 3.1.x'],
    ['no title', valid.replace('title: T, ', ''), 'info.title is missing'],
    ['a $ref that does not resolve', valid.replace('/Item', '/Missing'), 'does not resolve'],
    ['an undeclared path parameter', valid.replace('name: id', 'name: other'), 'is not declared'],
    ['an empty responses object', valid.replace(/ {8}'200':[\s\S]*?\}\n/u, ''), 'responses'],
    ['an unknown security scheme', valid.replace('{ bearerAuth: [] }', '{ other: [] }'), 'other'],
    ['a required name that is no property', valid.replace('[id]', '[ghost]'), 'is not a property'],
    [
      'a 3.0 nullable keyword',
      valid.replace('type: [string,', 'nullable: true, type: [string,'),
      'nullable',
    ],
    ['an unknown type', valid.replace('type: object', 'type: text'), 'not a JSON Schema type'],
    ['a duplicate key', `${valid}\nopenapi: 3.1.0\n`, 'YAML'],
    ['a document that is not an object', '- a\n- b\n', 'not an object'],
  ])('RF-624 refuses %s', (_name, text, problem) => {
    expect(checkOpenApi(text).join('\n')).toContain(problem);
  });

  it('RF-624 refuses two operations with one operationId', () => {
    const twice = valid.replace(
      '/items/{id}:',
      '/other:\n    get: { operationId: getItem, responses: { "200": { description: ok } } }\n  /items/{id}:',
    );
    expect(checkOpenApi(twice).join('\n')).toContain('operationId getItem is used twice');
  });
});
