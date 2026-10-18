import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import type { TargetDataModel } from '../../../../src/domain/planning/data-model.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { openApiYaml } from '../../../../src/infrastructure/handoff/handoff-openapi-yaml.js';
import { apiOperations } from '../../../support/api-contract-fixtures.js';
import { targetModel } from '../../../support/data-model-fixtures.js';
import { checkOpenApi } from '../../../support/openapi-check.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { keysAt, valueAt } from '../../../support/value-at.js';

// RF-624, RF-603, RNF-003, DEC-125: `api/openapi.yaml` as it is written. The text comes from the
// YAML serializer, never from string joining, so a hostile name, summary or table text stays one
// value: it adds no key, no anchor and no alias, and a secret in it is masked first.

const masker = new SecretMasker();

function yamlOf(model: TargetDataModel = targetModel()): string {
  return openApiYaml(apiOperations(), model, masker);
}

const hostile = "\"\n- injected: true\nx: &a [*a]\n---\n!!js/function 'x' # end";

describe('openApiYaml', () => {
  it('RF-624 writes a document that passes the OpenAPI 3.1 structure check', () => {
    expect(checkOpenApi(yamlOf())).toEqual([]);
  });

  it('RF-624 writes the same bytes for the same input', () => {
    expect(yamlOf()).toBe(yamlOf());
  });

  it('RF-624 writes no anchor, alias, tag or merge key', () => {
    const text = yamlOf();

    expect(text).not.toMatch(/(?:^|[\s:[,-])[&*!][A-Za-z0-9_]/mu);
    expect(text).not.toContain('<<:');
  });
});

describe('openApiYaml: hostile text', () => {
  it('RF-603 a hostile summary and table purpose stay one value each and add no key', () => {
    const model = targetModel();
    const tables = model.tables.map((table) => ({ ...table, purpose: hostile }));
    const operations = apiOperations().map((each) => ({ ...each, summary: hostile }));

    const text = openApiYaml(operations, { ...model, tables }, masker);

    expect(checkOpenApi(text)).toEqual([]);
    const doc: unknown = parse(text);
    expect(keysAt(doc)).toEqual(['openapi', 'info', 'security', 'paths', 'components']);
    expect(valueAt(doc, 'paths', '/orders', 'get', 'summary')).toBe(hostile);
    expect(valueAt(doc, 'components', 'schemas', 'customer', 'description')).toBe(hostile);
    expect(keysAt(doc, 'paths', '/orders', 'get')).not.toContain('injected');
  });

  it('RF-603 a column named like a YAML 1.1 boolean stays a string key in either YAML version', () => {
    const model = targetModel();
    const [first, ...rest] = model.tables;
    if (first === undefined) throw new Error('The fixture has tables');
    const names = ['no', 'on', 'y', 'null', '123'];
    const columns = names.map((name) => ({
      ...{ name, type: 'text', nullable: true, legacy: null, migrationRisk: '' },
    }));
    const tables = [{ ...first, columns }, ...rest];

    const text = openApiYaml(apiOperations(), { ...model, tables }, masker);

    for (const version of ['1.1', '1.2'] as const) {
      const doc: unknown = parse(text, { version });
      expect(keysAt(doc, 'components', 'schemas', 'customer', 'properties')).toEqual(names);
    }
  });

  it('RNF-003 a secret in the text of the model is masked before it is written', () => {
    const model = targetModel();
    const tables = model.tables.map((table) => ({ ...table, purpose: `Key ${fakeOpenAiKey}.` }));
    const operations = apiOperations().map((each) => ({ ...each, summary: fakeOpenAiKey }));

    const text = openApiYaml(operations, { ...model, tables }, masker);

    expect(text).not.toContain(fakeOpenAiKey.slice(8, 30));
    expect(text).toContain('[MASKED');
  });
});
