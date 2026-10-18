import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seededApiPlan } from '../../support/api-plan-harness.js';
import { checkOpenApi } from '../../support/openapi-check.js';
import { keysAt, valueAt } from '../../support/value-at.js';

// RF-624, RF-623, RF-603, RF-601, ADR-008: `api/openapi.yaml` of the hand-off package from a plan run
// whose fourth planner answer replays tests/recordings/fake/planner-package.json: five operations
// the checks keep and three they refuse.

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-api-file-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function packageFiles(): Promise<Readonly<Record<string, string>>> {
  const h = await seededApiPlan(dataDir);
  return h.handoffOf(await h.plan());
}

describe('BuildPlan: api/openapi.yaml', () => {
  it('RF-624 writes an OpenAPI 3.1 document that passes the structure check', async () => {
    const written = await packageFiles();

    const text = written['api/openapi.yaml'] ?? '';
    expect(text).toContain('openapi: 3.1.0');
    expect(checkOpenApi(text)).toEqual([]);
  });

  it('RF-624 holds the operations the checks kept, each naming its cards, and nothing refused', async () => {
    const written = await packageFiles();

    const text = written['api/openapi.yaml'] ?? '';
    const doc: unknown = parse(text);
    const paths = ['/customers', '/orders', '/orders/{orderId}', '/sessions'];
    expect(keysAt(doc, 'paths')).toEqual(paths);
    const serves = valueAt(doc, 'paths', '/orders', 'post', 'x-rosetta-serves');
    expect(serves).toEqual(['FEAT-001', 'FLOW-001']);
    expect(valueAt(doc, 'paths', '/sessions', 'post', 'security')).toEqual([]);
    expect(valueAt(doc, 'paths', '/customers', 'get', 'security')).toBeUndefined();
    for (const refused of ['bad id', '/a/../b', 'ghost', 'FEAT-404']) {
      expect(text).not.toContain(refused);
    }
  });

  it('RF-624 derives the schemas and the error responses from the data model and the operations', async () => {
    const written = await packageFiles();

    const doc: unknown = parse(written['api/openapi.yaml'] ?? '');
    const schemas = keysAt(doc, 'components', 'schemas');
    expect(schemas).toEqual(['ApiError', 'customer', 'customer_order']);
    const email = valueAt(doc, 'components', 'schemas', 'customer', 'properties', 'email');
    expect(email).toEqual({ type: 'string', maxLength: 200 });
    const unprocessable = valueAt(doc, 'paths', '/orders', 'post', 'responses', '422');
    expect(unprocessable).toEqual({ $ref: '#/components/responses/Unprocessable' });
  });
});

describe('BuildPlan: api/openapi.yaml and the rest of the package', () => {
  it('RF-624 every card an operation names has a heading in sources.md', async () => {
    const written = await packageFiles();

    const ids = [...new Set((written['api/openapi.yaml'] ?? '').match(/\b(?:FEAT|FLOW)-\d+\b/gu))];
    expect(ids.sort()).toEqual(['FEAT-001', 'FLOW-001']);
    for (const id of ids) expect(written['sources.md']).toMatch(new RegExp(`^## ${id}$`, 'mu'));
  });

  it('RF-603 a hostile summary stays one value of the document and adds nothing to the README', async () => {
    const written = await packageFiles();

    const doc: unknown = parse(written['api/openapi.yaml'] ?? '');
    expect(valueAt(doc, 'paths', '/orders/{orderId}', 'get', 'summary')).toBe(
      'Reads one order. <script>alert(1)</script> [click](javascript:alert(1))',
    );
    expect(written['README.md']).not.toContain('<script');
  });

  it('RF-601 the README reading order links the contract after the data model and the section counts', async () => {
    const written = await packageFiles();

    const readme = written['README.md'] ?? '';
    const order = readme.split('## Reading order')[1]?.split('\n## ')[0] ?? '';
    const links = [...order.matchAll(/\]\(([^)#]+)\)/gu)].map((match) => match[1]);
    expect(links.slice(0, 5)).toEqual([
      ...['prd.md', 'trd.md', 'data-model.md', 'api/openapi.yaml', 'requirements.md'],
    ]);
    expect(readme).toContain('5 operations');
  });
});
