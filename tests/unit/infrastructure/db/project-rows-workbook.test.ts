import { describe, expect, it } from 'vitest';
import { toProject } from '../../../../src/infrastructure/db/project-rows.js';
import { sampleProject } from '../../../support/project-fixtures.js';

// RF-152, data-model.md section 4 (`projects`): a row of kind `workbook` has no address, ref or
// subpath, as an upload row; a damaged one is refused on read, never guessed at.

function rowOf(changes: Record<string, unknown>): Record<string, unknown> {
  const project = sampleProject();
  return {
    id: project.id,
    user_id: project.userId,
    name: 'Pricing',
    source_kind: 'workbook',
    source_url: '',
    ref: '',
    subpath: '',
    source_snapshot_key: null,
    source_file_name: null,
    source_uploaded_at: null,
    last_run_snapshot_key: null,
    settings: project.settings,
    settings_version: 1,
    created_at: new Date(project.createdAt),
    updated_at: new Date(project.updatedAt),
    ...changes,
  };
}

describe('toProject a workbook row', () => {
  it('RF-152 reads the kind workbook', () => {
    expect(toProject(rowOf({}))).toMatchObject({
      name: 'Pricing',
      sourceKind: 'workbook',
      sourceUrl: '',
      ref: '',
      subpath: '',
    });
  });

  it.each([
    ['a source address', { source_url: 'https://github.com/o/r' }],
    ['a ref', { ref: 'main' }],
    ['a subpath', { subpath: 'src' }],
  ])('RF-152 refuses a workbook row that holds %s', (_what, changes) => {
    expect(() => toProject(rowOf(changes))).toThrow();
  });

  it('RF-152 refuses a kind that does not exist', () => {
    expect(() => toProject(rowOf({ source_kind: 'folder' }))).toThrow();
  });
});
