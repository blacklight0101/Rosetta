import { describe, expect, it } from 'vitest';
import { toProject } from '../../../../src/infrastructure/db/project-rows.js';
import { sampleProject } from '../../../support/project-fixtures.js';

// RF-128, RF-130, data-model.md section 4 (`projects`): the zip an upload project holds is read from
// three columns that are all there or all null, and the snapshot of its newest run from a fourth.

const key = 'upload__00000000-0000-4000-a000-000000000001@0123456789abcdef';
const uploadedAt = new Date('2026-10-19T08:00:00.000Z');

function rowOf(changes: Record<string, unknown>): Record<string, unknown> {
  const project = sampleProject();
  return {
    id: project.id,
    user_id: project.userId,
    name: 'OrderDesk',
    source_url: '',
    ref: '',
    subpath: '',
    settings: project.settings,
    settings_version: 1,
    created_at: new Date(project.createdAt),
    updated_at: new Date(project.updatedAt),
    source_kind: 'upload',
    source_snapshot_key: null,
    source_file_name: null,
    source_uploaded_at: null,
    last_run_snapshot_key: null,
    ...changes,
  };
}

describe('toProject the source of an upload', () => {
  it('RF-128 reads the zip of an upload project', () => {
    const project = toProject(
      rowOf({
        source_snapshot_key: key,
        source_file_name: 'OrderDesk.zip',
        source_uploaded_at: uploadedAt,
      }),
    );

    expect(project.upload).toEqual({
      fileName: 'OrderDesk.zip',
      uploadedAt: uploadedAt.getTime(),
      snapshotKey: key,
    });
  });

  it('RF-128 an upload with no source has no upload field', () => {
    expect(toProject(rowOf({}))).not.toHaveProperty('upload');
  });

  it('RF-128 a row from before the columns existed reads as a project without a source', () => {
    const row = rowOf({});
    for (const name of ['source_snapshot_key', 'source_file_name', 'source_uploaded_at']) {
      Reflect.deleteProperty(row, name);
    }

    expect(toProject(row)).not.toHaveProperty('upload');
  });

  it('RF-128 reads the snapshot of the newest run', () => {
    expect(toProject(rowOf({ last_run_snapshot_key: key })).lastRunSnapshotKey).toBe(key);
    expect(toProject(rowOf({}))).not.toHaveProperty('lastRunSnapshotKey');
  });
});

describe('toProject a source that does not fit', () => {
  it('RF-128 refuses a row that holds only part of the source', () => {
    expect(() => toProject(rowOf({ source_snapshot_key: key }))).toThrow();
  });

  it('RF-128 refuses a GitHub row that holds a zip', () => {
    const row = rowOf({
      source_kind: 'github',
      source_url: 'https://github.com/o/r',
      source_snapshot_key: key,
      source_file_name: 'OrderDesk.zip',
      source_uploaded_at: uploadedAt,
    });

    expect(() => toProject(row)).toThrow();
  });
});
