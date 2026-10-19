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
  'id::text AS id, user_id::text AS user_id, name, source_kind, source_url, ref, subpath, settings, settings_version, created_at, updated_at';

const instant = z.date().transform((date) => date.getTime());

const projectRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    name: z.string(),
    source_kind: z.enum(SOURCE_KINDS),
    source_url: z.string(),
    ref: z.string(),
    subpath: z.string(),
    settings: projectSettingsSchema,
    settings_version: z.number().int().min(1),
    created_at: instant,
    updated_at: instant,
  })
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
    settings: parsed.settings,
    settingsVersion: parsed.settings_version,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  };
}
