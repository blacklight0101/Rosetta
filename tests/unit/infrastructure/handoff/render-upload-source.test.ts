import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import {
  hostileFileName,
  uploadHash,
  uploadReportSource,
} from '../../../support/upload-source-fixtures.js';

// RF-131: the package of an uploaded project names the zip, the upload date and the snapshot hash
// instead of a repository and a commit, and holds no GitHub address. The package of a GitHub
// project is not touched (RF-601).

const masker = new SecretMasker();
const upload = {
  fileName: uploadReportSource.fileName,
  uploadedAt: uploadReportSource.uploadedAt,
  snapshotHash: uploadHash,
};

const plain = (text: string | undefined): string => (text ?? '').replaceAll('\\', '');

function filesOf(fileName: string = upload.fileName) {
  const handoff = handoffOf('Plain text.', undefined, {
    repository: { url: '', commitSha: null },
    upload: { ...upload, fileName },
  });
  return renderHandoff(handoff, masker);
}

describe('the package of an uploaded project', () => {
  it('RF-131 names the zip, the upload date and the hash in the README and in AGENTS.md', () => {
    const files = filesOf();

    expect(plain(files['README.md'])).toContain(
      `Planned from the analysis of the uploaded zip OrderDesk.zip (uploaded ${upload.uploadedAt}, snapshot ${uploadHash})`,
    );
    expect(plain(files['AGENTS.md'])).toContain(
      'build the new system that replaces the uploaded zip OrderDesk.zip.',
    );
  });

  it('RF-131 says its citations are into the uploaded code, not at a commit', () => {
    const files = filesOf();

    expect(files['sources.md']).toContain('into the legacy code in the uploaded zip');
    expect(files['sources.md']).not.toContain('analysed commit');
    expect(plain(files['README.md'])).not.toContain('at commit');
  });
});

describe('the files of the package of an uploaded project', () => {
  it('RF-131 holds no github.com address in any file', () => {
    const holding = Object.entries(filesOf())
      .filter(([, text]) => text.includes('github.com'))
      .map(([path]) => path);

    expect(holding).toEqual([]);
  });

  it('RF-131 shows a file name that is markup, a link or a table cell as text', () => {
    const files = filesOf(hostileFileName);

    const text = `${files['README.md'] ?? ''}\n${files['AGENTS.md'] ?? ''}`;
    expect(text).not.toContain('<img');
    expect(text).not.toMatch(/\]\(javascript:/u);
    expect(text.match(/&lt;img src=x/gu)).toHaveLength(2);
  });

  it('RF-131 says the zip was not recorded when the manifest holds no name', () => {
    const handoff = handoffOf('Plain text.', undefined, {
      repository: { url: '', commitSha: null },
      upload: { fileName: null, uploadedAt: null, snapshotHash: null },
    });

    const files = renderHandoff(handoff, masker);

    expect(plain(files['README.md'])).toContain(
      'Planned from the analysis of an uploaded zip (its name was not recorded)',
    );
  });
});

describe('the package of a GitHub project, as before', () => {
  it('RF-601 names the repository and the commit as before', () => {
    const files = renderHandoff(handoffOf('Plain text.'), masker);

    expect(plain(files['README.md'])).toContain(`at commit ${'c'.repeat(40)} (understand run`);
    expect(files['sources.md']).toContain('at the analysed commit');
  });
});
