import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import { emptyPrd } from '../../../../src/domain/planning/prd-content.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { incompleteNotice } from '../../../../src/infrastructure/handoff/handoff-incomplete-markdown.js';
import { apiOperations } from '../../../support/api-contract-fixtures.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { checkOpenApi } from '../../../support/openapi-check.js';

// RF-604: a document the planner's answer stayed cut off for is kept, its file opens with an
// Incomplete notice that names the output limit and the setting, and the package README lists it.
// A document that was not cut off has no notice and no README line.

const masker = new SecretMasker();

const LIMIT = 4096;

const notice = (limit: number): string =>
  `> **Incomplete.** The planner answer for this document was cut off at ${String(limit)} output tokens, even after its continuations. The text below is what the planner wrote before the cut. To complete it, raise Project settings > Planner max output tokens and plan again.\n\n`;

const yamlNotice = (limit: number): string =>
  `# Incomplete. The planner answer for this document was cut off at ${String(limit)} output tokens, even after its continuations. The text below is what the planner wrote before the cut. To complete it, raise Project settings > Planner max output tokens and plan again.\n`;

function filesOf(
  incomplete: readonly { document: Kind; outputTokens: number }[],
  extra: Partial<HandoffPackage> = {},
): Readonly<Record<string, string>> {
  return renderHandoff(handoffOf('Plain text.', emptyPrd, { incomplete, ...extra }), masker);
}

type Kind = 'prd' | 'dataModel' | 'flows' | 'apiContract' | 'ux';

const cut = (document: Kind): { document: Kind; outputTokens: number }[] => [
  { document, outputTokens: LIMIT },
];

describe('renderHandoff: a document that stays cut off', () => {
  it.each([
    ['prd', 'prd.md'],
    ['dataModel', 'data-model.md'],
    ['flows', 'flows/README.md'],
    ['ux', 'ux/README.md'],
  ] as const)('RF-604 the %s document opens with the Incomplete notice', (document, path) => {
    const text = filesOf(cut(document))[path] ?? '';

    expect(text.startsWith(notice(LIMIT))).toBe(true);
    expect(text.slice(notice(LIMIT).length)).toMatch(/^# /u);
  });

  it('RF-604 api/openapi.yaml opens with the Incomplete notice as a comment and stays a valid contract', () => {
    const contract = { kind: 'openapi', operations: apiOperations(), unserved: [] } as const;
    const text = filesOf(cut('apiContract'), { apiContract: contract })['api/openapi.yaml'] ?? '';

    expect(text.startsWith(yamlNotice(LIMIT))).toBe(true);
    expect(checkOpenApi(text)).toEqual([]);
  });

  it('RF-604 a document that is not cut off has no notice anywhere in the package', () => {
    const files = filesOf([]);

    for (const text of Object.values(files)) expect(text).not.toContain('Incomplete.');
  });

  it('RF-604 the package README lists each cut-off document with its limit', () => {
    const readme = filesOf(cut('prd'))['README.md'] ?? '';

    expect(readme).toContain('## Incomplete documents');
    expect(readme).toContain(
      `- [Product requirements document](prd.md) (cut off at ${String(LIMIT)} output tokens)`,
    );
  });

  it('RF-604 the README lists an API contract that was cut off with no file', () => {
    const readme = filesOf(cut('apiContract'))['README.md'] ?? '';

    expect(readme).toContain(
      `- API contract (cut off at ${String(LIMIT)} output tokens; no file was written)`,
    );
  });

  it('RF-604 the README has no incomplete section when no document is cut off', () => {
    const readme = filesOf([])['README.md'] ?? '';

    expect(readme).not.toContain('Incomplete documents');
  });
});

describe('the notice on every file of a cut-off flow or UX document', () => {
  const opening = /^(?:> \*\*Incomplete\.\*\*|# Incomplete\.|<!-- Incomplete\.)/u;

  it('RF-604 RF-625 every per-flow file and the index of cut-off flows open with the notice', () => {
    const files = filesOf(cut('flows'));
    const flowFiles = Object.keys(files).filter((path) => path.startsWith('flows/'));

    expect(flowFiles.length).toBeGreaterThan(1);
    for (const path of flowFiles) expect(files[path] ?? '').toMatch(opening);
  });

  it('RF-604 RF-626 the design brief and the wireframes of a cut-off UX document open with the notice', () => {
    const handoff = handoffOf('Plain text.', emptyPrd, { incomplete: cut('ux') });

    expect(incompleteNotice(handoff, 'ux/design-brief.md')).toMatch(/^> \*\*Incomplete\.\*\*/u);
    expect(incompleteNotice(handoff, 'ux/wireframes/SCRN-001.html')).toMatch(/^<!-- Incomplete\./u);
  });

  it('RF-604 a file outside the cut-off document gets no notice', () => {
    const handoff = handoffOf('Plain text.', emptyPrd, { incomplete: cut('flows') });

    expect(incompleteNotice(handoff, 'ux/README.md')).toBe('');
    expect(incompleteNotice(handoff, 'prd.md')).toBe('');
  });
});
