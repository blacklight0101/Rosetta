import { z } from 'zod';
import type { Project } from '../../application/projects/project.js';
import { SOURCE_KINDS } from '../../domain/sources/source-kind.js';
import { hasValidSourceShape } from '../../domain/sources/source-shape.js';
import { projectSettingsSchema } from '../../application/projects/project-settings.js';

// Data-model.md section 4, `projects`: the columns every project query selects, the row schema and
// the mapping to the application type. The settings document is parsed with its schema on every
// read (a row that no longer fits is an error, never guessed); times become epoch milliseconds.

/** Every column, in table order. */
export const PROJECT_COLUMNS =
  'id::text AS id, user_id::text AS user_id, name, source_kind, source_url, ref, subpath, source_snapshot_key, source_file_name, source_uploaded_at, source_workbooks, (SELECT r.snapshot_key FROM runs r WHERE r.project_id = projects.id AND r.snapshot_key IS NOT NULL ORDER BY r.queued_at DESC, r.id DESC LIMIT 1) AS last_run_snapshot_key, settings, settings_version, created_at, updated_at';

const instant = z.date().transform((date) => date.getTime());

interface UploadColumns {
  readonly source_kind: string;
  readonly source_snapshot_key: string | null;
  readonly source_file_name: string | null;
  readonly source_uploaded_at: number | null;
  readonly source_workbooks: number | null;
}

function hasValidUpload(row: UploadColumns): boolean {
  const set = [row.source_snapshot_key, row.source_file_name, row.source_uploaded_at].filter(
    (value) => value !== null,
  ).length;
  if (set === 0) return row.source_workbooks === null;
  return set === 3 && (row.source_kind === 'upload' || row.source_kind === 'workbook');
}

const projectRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    name: z.string(),
    source_kind: z.enum(SOURCE_KINDS),
    source_url: z.string(),
    ref: z.string(),
    subpath: z.string(),
    // Rows read before the columns existed have none of the four (RF-128).
    source_snapshot_key: z.string().nullable().default(null),
    source_file_name: z.string().nullable().default(null),
    source_uploaded_at: instant.nullable().default(null),
    source_workbooks: z.number().int().min(1).nullable().default(null),
    last_run_snapshot_key: z.string().nullable().default(null),
    settings: projectSettingsSchema,
    settings_version: z.number().int().min(1),
    created_at: instant,
    updated_at: instant,
  })
  // RF-128, RF-150: the source is all there or all null, and only an upload or workbook project has one.
  .refine(hasValidUpload)
  // RF-130: an upload row with an address, ref or subpath is damaged, never guessed at.
  .refine((row) =>
    hasValidSourceShape(row.source_kind, {
      sourceUrl: row.source_url,
      ref: row.ref,
      subpath: row.subpath,
    }),
  );

// RF-010
export function toProject(row: unknown): Project {
  const parsed = projectRowSchema.parse(row);
  return {
    id: parsed.id,
    userId: parsed.user_id,
    name: parsed.name,
    sourceKind: parsed.source_kind,
    sourceUrl: parsed.source_url,
    ref: parsed.ref,
    subpath: parsed.subpath,
    ...(parsed.source_snapshot_key === null ||
    parsed.source_file_name === null ||
    parsed.source_uploaded_at === null
      ? {}
      : {
          upload: {
            fileName: parsed.source_file_name,
            uploadedAt: parsed.source_uploaded_at,
            snapshotKey: parsed.source_snapshot_key,
            ...(parsed.source_workbooks === null ? {} : { workbooks: parsed.source_workbooks }),
          },
        }),
    ...(parsed.last_run_snapshot_key === null
      ? {}
      : { lastRunSnapshotKey: parsed.last_run_snapshot_key }),
    settings: parsed.settings,
    settingsVersion: parsed.settings_version,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  };
}
