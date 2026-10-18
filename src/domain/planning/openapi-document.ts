import { byCodeUnit } from '../code-map/code-unit-order.js';
import { reservedSchemaNames, type ApiOperation } from './api-contract.js';
import { pathParameters } from './api-contract-paths.js';
import type { TargetDataModel } from './data-model.js';
import { tableSchema, type JsonObject } from './openapi-schemas.js';

// RF-624, RF-623, RF-603, DEC-134: the OpenAPI 3.1 document of the hand-off package, built by code
// from the checked operations and the target data model. The model writes no part of it: every key is
// an identifier, a path or a status the checks allowed, every reference points at a schema the code
// made, and the few free texts (a summary, a table's purpose) pass the mask. The document is a plain
// value; the YAML text is made from it by the serializer (handoff-openapi-yaml.ts).

const jsonType = 'application/json';
const errorSchema = '#/components/schemas/ApiError';

const errorResponses: Readonly<Record<number, { readonly name: string; readonly text: string }>> = {
  400: { name: 'BadRequest', text: 'The request is not valid.' },
  401: { name: 'Unauthorized', text: 'The caller is not signed in, or the token is not valid.' },
  403: { name: 'Forbidden', text: 'The caller may not do this.' },
  404: { name: 'NotFound', text: 'The resource does not exist.' },
  409: { name: 'Conflict', text: 'The request conflicts with the current state.' },
  422: { name: 'Unprocessable', text: 'The request is well formed but breaks a rule.' },
  429: { name: 'TooManyRequests', text: 'Too many requests; try again later.' },
  500: { name: 'InternalError', text: 'The service failed.' },
};

function statusesOf(operation: ApiOperation): number[] {
  const added = [...operation.errors, 500, ...(operation.public ? [] : [401])];
  return [...new Set(added)].sort((a, b) => a - b);
}

function refTo(schema: string): JsonObject {
  return { $ref: `#/components/schemas/${schema}` };
}

function bodyOf(operation: ApiOperation): JsonObject | undefined {
  if (operation.schema === null) return undefined;
  const ref = refTo(operation.schema);
  return { [jsonType]: { schema: operation.list ? { type: 'array', items: ref } : ref } };
}

function successOf(operation: ApiOperation): JsonObject {
  const content = operation.method === 'delete' ? undefined : bodyOf(operation);
  const [status, text] =
    operation.method === 'post'
      ? ['201', 'Created.']
      : operation.method === 'delete'
        ? ['204', 'Deleted.']
        : ['200', 'The request succeeded.'];
  return { [status]: { description: text, ...(content === undefined ? {} : { content }) } };
}

function responsesOf(operation: ApiOperation): JsonObject {
  const errors = statusesOf(operation).map((status): [string, JsonObject] => [
    String(status),
    { $ref: `#/components/responses/${errorResponses[status]?.name ?? 'InternalError'}` },
  ]);
  return { ...successOf(operation), ...Object.fromEntries(errors) };
}

function operationOf(operation: ApiOperation, mask: (text: string) => string): JsonObject {
  const names = pathParameters(operation.path);
  const sends = ['post', 'put', 'patch'].includes(operation.method);
  const body = sends ? bodyOf(operation) : undefined;
  return {
    operationId: operation.operationId,
    summary: mask(operation.summary),
    'x-rosetta-serves': [...operation.serves],
    ...(names.length === 0
      ? {}
      : {
          parameters: names.map((name) => ({
            ...{ name, in: 'path', required: true },
            schema: { type: 'string' },
          })),
        }),
    ...(body === undefined ? {} : { requestBody: { required: true, content: body } }),
    responses: responsesOf(operation),
    ...(operation.public ? { security: [] } : {}),
  };
}

function pathsOf(operations: readonly ApiOperation[], mask: (text: string) => string): JsonObject {
  const paths = [...new Set(operations.map((operation) => operation.path))].sort(byCodeUnit);
  return Object.fromEntries(
    paths.map((path) => [
      path,
      Object.fromEntries(
        operations
          .filter((operation) => operation.path === path)
          .map((operation) => [operation.method, operationOf(operation, mask)]),
      ),
    ]),
  );
}

function responsesComponent(operations: readonly ApiOperation[]): JsonObject {
  const statuses = [...new Set(operations.flatMap(statusesOf))];
  const named = statuses.flatMap((status) => errorResponses[status] ?? []);
  return Object.fromEntries(
    named
      .sort((a, b) => byCodeUnit(a.name, b.name))
      .map(({ name, text }) => [
        name,
        { description: text, content: { [jsonType]: { schema: { $ref: errorSchema } } } },
      ]),
  );
}

const apiError: JsonObject = {
  type: 'object',
  required: ['code', 'message'],
  properties: { code: { type: 'string' }, message: { type: 'string' } },
};

function schemasOf(model: TargetDataModel, mask: (text: string) => string): JsonObject {
  const tables = model.tables
    .filter((table) => !reservedSchemaNames.includes(table.name))
    .sort((a, b) => byCodeUnit(a.name, b.name));
  return {
    ApiError: apiError,
    ...Object.fromEntries(tables.map((table) => [table.name, tableSchema(table, mask)])),
  };
}

/** The OpenAPI 3.1 document of these operations over the schemas of the target data model. */
// RF-624
export function openApiDocument(
  operations: readonly ApiOperation[],
  model: TargetDataModel,
  mask: (text: string) => string,
): JsonObject {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Target API contract',
      version: '0.1.0',
      description:
        'Written by Rosetta from the verified cards of the legacy analysis and the target data model. The team confirms it before building.',
    },
    security: [{ bearerAuth: [] }],
    paths: pathsOf(operations, mask),
    components: {
      schemas: schemasOf(model, mask),
      responses: responsesComponent(operations),
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
    },
  };
}
