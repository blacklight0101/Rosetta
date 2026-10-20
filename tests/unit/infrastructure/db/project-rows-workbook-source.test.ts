import { describe, expect, it } from 'vitest';
import { toProject } from '../../../../src/infrastructure/db/project-rows.js';
import { sampleProject } from '../../../support/project-fixtures.js';

// RF-150, RF-152, data-model.md section 4 (`projects`): the source of a workbook project is read from
// the same columns as a zip, and the number of workbooks from a fourth.

const key = 'workbook__00000000-0000-4000-a000-000000000001@0123456789abcdef';
const uploadedAt = new Date('2026-10-19T08:00:00.000Z');

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
    source_snapshot_key: key,
    source_file_name: 'Pricing.xlsx, Rates.xlsm',
    source_uploaded_at: uploadedAt,
    source_workbooks: 2,
    last_run_snapshot_key: null,
    settings: project.settings,
    settings_version: 1,
    created_at: new Date(project.createdAt),
    updated_at: new Date(project.updatedAt),
    ...changes,
  };
}

describe('toProject the source of a workbook project', () => {
  it('RF-150 reads the workbooks a workbook project holds, with their count', () => {
    expect(toProject(rowOf({})).upload).toEqual({
      fileName: 'Pricing.xlsx, Rates.xlsm',
      uploadedAt: uploadedAt.getTime(),
      snapshotKey: key,
      workbooks: 2,
    });
  });

  it('RF-150 reads a zip that held workbooks with their count', () => {
    const zip = toProject(
      rowOf({
        source_kind: 'upload',
        source_file_name: 'OrderDesk.zip',
        source_snapshot_key: key.replace('workbook__', 'upload__'),
        source_workbooks: 3,
      }),
    );

    expect(zip.upload?.workbooks).toBe(3);
  });

  it('RF-150 a source with no count has none', () => {
    const project = toProject(rowOf({ source_workbooks: null }));

    expect(project.upload).not.toHaveProperty('workbooks');
  });

  it('RF-150 refuses a GitHub row that holds a source', () => {
    expect(() => toProject(rowOf({ source_kind: 'github' }))).toThrow();
  });

  it('RF-150 refuses a count on a row that has no source', () => {
    const empty = {
      source_snapshot_key: null,
      source_file_name: null,
      source_uploaded_at: null,
      source_workbooks: 2,
    };

    expect(() => toProject(rowOf(empty))).toThrow();
  });
});
