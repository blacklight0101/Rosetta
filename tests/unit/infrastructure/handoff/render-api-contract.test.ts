import { describe, expect, it } from 'vitest';
import type { ApiContract } from '../../../../src/domain/planning/api-contract.js';
import { emptyPrd } from '../../../../src/domain/planning/prd-content.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { apiOperations } from '../../../support/api-contract-fixtures.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { checkOpenApi } from '../../../support/openapi-check.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';

// RF-624, RF-620, RF-603, RNF-003: the API contract in the hand-off package. When the front end is
// separate, `api/openapi.yaml` is written and the README links it as the fourth document of the
// reading order; otherwise the README says no contract applies and why, and no file is written.

const masker = new SecretMasker();

const written: ApiContract = {
  kind: 'openapi',
  operations: apiOperations(),
  unserved: [{ cardId: 'FEAT-002', reason: 'Exported by a batch job.', byPlanner: true }],
};

function files(contract: ApiContract, text = 'Plain text.'): Readonly<Record<string, string>> {
  return renderHandoff(handoffOf(text, emptyPrd, { apiContract: contract }), masker);
}

function order(readme: string | undefined): string {
  return (readme ?? '').split('## Reading order')[1]?.split('\n## ')[0] ?? '';
}

describe('renderHandoff: a package with an API contract', () => {
  it('RF-624 writes api/openapi.yaml, and it passes the OpenAPI 3.1 structure check', () => {
    const text = files(written)['api/openapi.yaml'] ?? '';

    expect(text).toContain('openapi: 3.1.0');
    expect(checkOpenApi(text)).toEqual([]);
  });

  it('RF-620 the reading order lists the API contract fourth, after the data model, and links it', () => {
    const links = [...order(files(written)['README.md']).matchAll(/\]\(([^)#]+)\)/gu)];

    expect(links.slice(0, 6).map((match) => match[1])).toEqual([
      'prd.md',
      'trd.md',
      'data-model.md',
      'api/openapi.yaml',
      'flows/README.md',
      'requirements.md',
    ]);
  });

  it('RF-624 the README lists the operations count and each card no operation serves', () => {
    const readme = files(written)['README.md'] ?? '';

    const section = readme.split('## API contract')[1]?.split('\n## ')[0] ?? '';
    expect(section).toContain('6 operations');
    expect(section).toMatch(/FEAT-002.*Exported by a batch job\./u);
  });

  it('RF-624 every FEAT or FLOW card an operation names has a heading in sources.md', () => {
    const operations = apiOperations().map((each) => ({ ...each, serves: ['FEAT-001'] }));
    const rendered = files({ kind: 'openapi', operations, unserved: [] });

    const text = rendered['api/openapi.yaml'] ?? '';
    const ids = [...new Set(text.match(/\b(?:FEAT|FLOW)-\d+\b/gu))];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(rendered['sources.md']).toMatch(new RegExp(`^## ${id}$`, 'mu'));
  });
});

describe('renderHandoff: a package without an API contract', () => {
  const none: ApiContract = { kind: 'none', reason: 'The pages are rendered by the server.' };

  it('RF-624 writes no api folder, and the README says no contract applies and why', () => {
    const rendered = files(none);

    expect(Object.keys(rendered).filter((path) => path.startsWith('api/'))).toEqual([]);
    const readme = rendered['README.md'] ?? '';
    expect(order(readme)).toMatch(
      /4\. API contract: no contract applies\. The pages are rendered/u,
    );
    expect(readme).toContain('## API contract');
    expect(readme).not.toContain('openapi.yaml');
  });

  it('RF-620 the reading order still has one link for each of the other files', () => {
    const links = [...order(files(none)['README.md']).matchAll(/\]\(([^)#]+)\)/gu)];

    expect(links.slice(0, 5).map((match) => match[1])).toEqual([
      'prd.md',
      'trd.md',
      'data-model.md',
      'flows/README.md',
      'requirements.md',
    ]);
  });
});

describe('renderHandoff: hostile text in the API contract', () => {
  const hostile = '<img src=x onerror=alert(1)> [x](javascript:alert(1)) | cell\n# Title\n```js';

  it('RF-603 the reason adds no HTML, link, heading or fence to the README', () => {
    const readme = files({ kind: 'none', reason: hostile })['README.md'] ?? '';

    expect(readme).not.toMatch(/<[A-Za-z!/?]/u);
    expect(readme).not.toMatch(/\]\(javascript/u);
    expect(readme).not.toMatch(/^#+ Title/mu);
    expect(readme).not.toMatch(/^```/mu);
  });

  it('RF-603 the reason of an unserved card adds nothing to the README either', () => {
    const contract: ApiContract = {
      kind: 'openapi',
      operations: apiOperations(),
      unserved: [{ cardId: 'FEAT-002', reason: hostile, byPlanner: true }],
    };

    const readme = files(contract)['README.md'] ?? '';

    expect(readme).not.toMatch(/<[A-Za-z!/?]/u);
    expect(readme).not.toMatch(/^#+ Title/mu);
    expect(readme).not.toMatch(/^```/mu);
  });

  it('RNF-003 a secret in the reason is masked in the README', () => {
    const readme = files({ kind: 'none', reason: `Key ${fakeOpenAiKey}` })['README.md'] ?? '';

    expect(readme).not.toContain(fakeOpenAiKey.slice(8, 30));
  });
});
