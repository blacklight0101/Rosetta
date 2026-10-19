import { describe, expect, it } from 'vitest';
import { toProject } from '../../../../src/infrastructure/db/project-rows.js';
import { sampleProject } from '../../../support/project-fixtures.js';

// RF-130, data-model.md section 4 (`projects`), RFC-004 section 4.1: a project row has a source
// kind. An upload has no address, ref or subpath; a row that says otherwise is refused on read.

function rowOf(changes: Record<string, unknown>): Record<string, unknown> {
  const project = sampleProject();
  return {
    id: project.id,
    user_id: project.userId,
    name: project.name,
    source_url: 'https://github.com/owner/repo',
    ref: '',
    subpath: '',
    settings: project.settings,
    settings_version: 1,
    created_at: new Date(project.createdAt),
    updated_at: new Date(project.updatedAt),
    source_kind: 'github',
    ...changes,
  };
}

describe('toProject source kind', () => {
  it('RF-130 reads a github row as a project of kind github', () => {
    expect(toProject(rowOf({}))).toMatchObject({
      sourceKind: 'github',
      sourceUrl: 'https://github.com/owner/repo',
    });
  });

  it('RF-130 reads an upload row with no address as a project of kind upload', () => {
    expect(toProject(rowOf({ source_kind: 'upload', source_url: '' }))).toMatchObject({
      sourceKind: 'upload',
      sourceUrl: '',
      ref: '',
      subpath: '',
    });
  });

  it('RF-130 refuses an upload row that holds a source address', () => {
    expect(() => toProject(rowOf({ source_kind: 'upload' }))).toThrow();
  });

  it.each([{ ref: 'main' }, { subpath: 'src' }])(
    'RF-130 refuses an upload row that holds %j',
    (extra) => {
      expect(() => toProject(rowOf({ source_kind: 'upload', source_url: '', ...extra }))).toThrow();
    },
  );

  it('RF-130 refuses a row of a kind that does not exist', () => {
    expect(() => toProject(rowOf({ source_kind: 'folder', source_url: '' }))).toThrow();
  });
});
