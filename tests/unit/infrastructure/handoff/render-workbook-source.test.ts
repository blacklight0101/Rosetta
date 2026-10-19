import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { githubAddress, workbookHash } from '../../../support/upload-source-fixtures.js';

// RF-156: the package of a workbook project names the workbooks, the upload date and the snapshot
// hash instead of a repository and a commit, and holds no GitHub address.

const masker = new SecretMasker();
const uploadedAt = '2026-10-19T09:30:00.000Z';
const hostile = '<img src=x onerror=alert(1)> **b** | y.xlsx';

const plain = (text: string | undefined): string => (text ?? '').replaceAll('\\', '');

function filesOf(workbooks: readonly string[] = ['Pricing.xlsx', 'Rates.xlsm']) {
  const handoff = handoffOf('Plain text.', undefined, {
    repository: { url: '', commitSha: null },
    upload: { fileName: null, workbooks, uploadedAt, snapshotHash: workbookHash },
  });
  return renderHandoff(handoff, masker);
}

describe('the package of a workbook project', () => {
  it('RF-156 names the workbooks, the upload date and the hash in the README and in AGENTS.md', () => {
    const files = filesOf();
    const sentence = `the Excel workbooks Pricing.xlsx and Rates.xlsm (uploaded ${uploadedAt}, snapshot ${workbookHash})`;

    expect(plain(files['README.md'])).toContain(`Planned from the analysis of ${sentence}`);
    expect(plain(files['AGENTS.md'])).toContain(`replaces ${sentence}.`);
  });

  it('RF-156 says its citations are into the uploaded workbooks, not a zip or a commit', () => {
    const files = filesOf();

    expect(files['sources.md']).toContain('into the legacy code in the uploaded workbooks');
    expect(files['sources.md']).not.toContain('uploaded zip');
    expect(files['sources.md']).not.toContain('analysed commit');
  });

  it('RF-156 holds no github.com address in any file', () => {
    const holding = Object.entries(filesOf())
      .filter(([, text]) => githubAddress.test(text.replaceAll('&#58;', ':')))
      .map(([path]) => path);

    expect(holding).toEqual([]);
  });

  it('RF-156 shows a workbook name that is markup, a link or a table cell as text', () => {
    const files = filesOf([hostile]);

    const raw = [files['README.md'], files['AGENTS.md']].join('\n');
    expect(plain(raw)).not.toContain('<img');
    expect(plain(raw).match(/&lt;img src=x/gu)).toHaveLength(2);
  });
});

describe('the package of a zip, as before', () => {
  it('RF-131 still says its citations are into the uploaded zip', () => {
    const handoff = handoffOf('Plain text.', undefined, {
      repository: { url: '', commitSha: null },
      upload: { fileName: 'OrderDesk.zip', uploadedAt, snapshotHash: workbookHash },
    });

    const files = renderHandoff(handoff, masker);

    expect(files['sources.md']).toContain('into the legacy code in the uploaded zip');
  });
});
