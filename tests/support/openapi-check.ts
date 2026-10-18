import { parse } from 'yaml';

// RF-624, DEC-125: a dev-only structural check of an OpenAPI 3.1 document, written with the YAML
// parser the project already depends on. No schema validator is a direct dependency (ajv is only
// reached through other tools), and the owner has not approved a new package, so this checks what
// a reader of the contract relies on: the version, `info`, paths and operations, unique operation
// ids, responses, path parameters, `$ref` targets, security requirements, schema types and
// `required` lists. It returns the problems found, empty for a document that passes.

const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const topKeys = [
  ...['openapi', 'info', 'jsonSchemaDialect', 'servers', 'paths', 'webhooks', 'components'],
  ...['security', 'tags', 'externalDocs'],
];
const operationKeys = [
  ...['tags', 'summary', 'description', 'externalDocs', 'operationId', 'parameters'],
  ...['requestBody', 'responses', 'callbacks', 'deprecated', 'security', 'servers'],
];
const schemaTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'];
const securityTypes = ['apiKey', 'http', 'oauth2', 'openIdConnect', 'mutualTLS'];

type Node = Readonly<Record<string, unknown>>;

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nodeAt(value: unknown, key: string): unknown {
  return isNode(value) ? value[key] : undefined;
}

function resolves(root: unknown, ref: string): boolean {
  if (!ref.startsWith('#/')) return false;
  let at: unknown = root;
  for (const part of ref.slice(2).split('/')) {
    const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!isNode(at) || !Object.hasOwn(at, key)) return false;
    at = at[key];
  }
  return true;
}

function refProblems(root: unknown, value: unknown, where: string): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, at) => refProblems(root, item, `${where}/${String(at)}`));
  }
  if (!isNode(value)) return [];
  const ref = value['$ref'];
  const own = typeof ref === 'string' && !resolves(root, ref) ? [`${where}: $ref ${ref}`] : [];
  const nested = Object.entries(value).flatMap(([key, item]) =>
    refProblems(root, item, `${where}/${key}`),
  );
  return [...own.map((line) => `${line} does not resolve`), ...nested];
}

function typeProblems(schema: Node, where: string): string[] {
  const { type } = schema;
  const types = Array.isArray(type) ? type : type === undefined ? [] : [type];
  const found = types
    .filter((each) => typeof each !== 'string' || !schemaTypes.includes(each))
    .map((each) => `${where}: type ${String(each)} is not a JSON Schema type`);
  if ('nullable' in schema) found.push(`${where}: nullable is OpenAPI 3.0, use a type list`);
  return found;
}

function requiredProblems(schema: Node, where: string): string[] {
  const { required, properties } = schema;
  if (!Array.isArray(required)) return [];
  return required
    .filter(
      (name) => !isNode(properties) || typeof name !== 'string' || !Object.hasOwn(properties, name),
    )
    .map((name) => `${where}: required ${String(name)} is not a property`);
}

function schemaProblems(schema: unknown, where: string): string[] {
  if (Array.isArray(schema)) {
    return schema.flatMap((item, at) => schemaProblems(item, `${where}/${String(at)}`));
  }
  if (!isNode(schema)) return [];
  return [
    ...typeProblems(schema, where),
    ...requiredProblems(schema, where),
    ...Object.entries(schema).flatMap(([key, item]) => schemaProblems(item, `${where}/${key}`)),
  ];
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value.map((item: unknown) => item) : [];
}

function pathParameters(path: string): string[] {
  return [...path.matchAll(/\{([^}]*)\}/gu)].map((match) => match[1] ?? '');
}

function responseProblems(responses: unknown, where: string): string[] {
  if (!isNode(responses) || Object.keys(responses).length === 0)
    return [`${where}: responses is missing or empty`];
  return Object.entries(responses).flatMap(([status, response]) => {
    const bad = /^(?:[1-5][0-9]{2}|default)$/u.test(status) ? [] : [`${where}: status ${status}`];
    const hasText = isNode(response) && ('$ref' in response || 'description' in response);
    return hasText ? bad : [...bad, `${where}/${status}: a response needs a description`];
  });
}

function parameterProblems(operation: Node, path: string, where: string): string[] {
  const parameters = Array.isArray(operation['parameters']) ? operation['parameters'] : [];
  const inPath = parameters.filter((each) => nodeAt(each, 'in') === 'path');
  const declared = inPath.map((each) => String(nodeAt(each, 'name')));
  return [
    ...pathParameters(path)
      .filter((name) => !declared.includes(name))
      .map((name) => `${where}: path parameter ${name} is not declared`),
    ...inPath
      .filter((each) => nodeAt(each, 'required') !== true)
      .map(() => `${where}: a path parameter is required`),
  ];
}

function operationProblems(
  operation: unknown,
  path: string,
  ids: Set<string>,
  where: string,
): string[] {
  if (!isNode(operation)) return [`${where}: an operation is an object`];
  const found = Object.keys(operation)
    .filter((key) => !operationKeys.includes(key) && !key.startsWith('x-'))
    .map((key) => `${where}: unknown key ${key}`);
  const id = operation['operationId'];
  if (typeof id !== 'string' || id === '') found.push(`${where}: operationId is missing`);
  else if (ids.has(id)) found.push(`${where}: operationId ${id} is used twice`);
  else ids.add(id);
  return [
    ...found,
    ...responseProblems(operation['responses'], where),
    ...parameterProblems(operation, path, where),
  ];
}

function pathProblems(paths: unknown): string[] {
  if (!isNode(paths) || Object.keys(paths).length === 0) return ['paths: no path'];
  const ids = new Set<string>();
  return Object.entries(paths).flatMap(([path, item]) => {
    const where = `paths ${path}`;
    if (!path.startsWith('/') || !isNode(item)) return [`${where}: not a path item`];
    return Object.entries(item).flatMap(([key, operation]) =>
      methods.includes(key)
        ? operationProblems(operation, path, ids, `${where} ${key}`)
        : [`${where}: unknown key ${key}`],
    );
  });
}

function securityProblems(root: Node): string[] {
  const schemes = nodeAt(root['components'], 'securitySchemes');
  const defined = isNode(schemes) ? Object.keys(schemes) : [];
  const unknownTypes = isNode(schemes)
    ? Object.entries(schemes)
        .filter(([, scheme]) => !securityTypes.includes(String(nodeAt(scheme, 'type'))))
        .map(([name]) => `securitySchemes ${name}: unknown type`)
    : [];
  const operations = Object.values(isNode(root['paths']) ? root['paths'] : {}).flatMap((item) =>
    isNode(item) ? Object.values(item).map((operation) => nodeAt(operation, 'security')) : [],
  );
  const requirements = [root['security'], ...operations].flatMap(listOf);
  const unknown = requirements.flatMap((each) =>
    isNode(each) ? Object.keys(each).filter((name) => !defined.includes(name)) : [],
  );
  return [...unknownTypes, ...unknown.map((name) => `security: ${name} is not a security scheme`)];
}

function headProblems(root: Node): string[] {
  const found: string[] = [];
  const version = root['openapi'];
  if (typeof version !== 'string' || !/^3\.1\.\d+$/u.test(version))
    found.push(`openapi: ${String(version)} is not 3.1.x`);
  for (const key of ['title', 'version']) {
    if (typeof nodeAt(root['info'], key) !== 'string') found.push(`info.${key} is missing`);
  }
  for (const key of Object.keys(root)) {
    if (!topKeys.includes(key) && !key.startsWith('x-')) found.push(`unknown top-level key ${key}`);
  }
  return found;
}

/** The problems found in the OpenAPI 3.1 document in this YAML text; empty when it passes. */
export function checkOpenApi(text: string): string[] {
  let root: unknown;
  try {
    root = parse(text);
  } catch (error) {
    return [`YAML: ${error instanceof Error ? error.message : 'unreadable'}`];
  }
  if (!isNode(root)) return ['The document is not an object'];
  return [
    ...headProblems(root),
    ...pathProblems(root['paths']),
    ...securityProblems(root),
    ...schemaProblems(nodeAt(root['components'], 'schemas'), 'components/schemas'),
    ...refProblems(root, root, '#'),
  ];
}
