import { z } from 'zod';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { SnapshotInfo, UploadSnapshotInfo } from '../../application/ports/source-fetcher.js';

// RF-130, RF-126, data-model.md section 3.3: the two shapes of `snapshot.json`. A record without
// `kind` is a GitHub one, whether it was written before uploads existed or by the GitHub fetcher,
// which still writes none, so a GitHub record stays byte-identical. An upload record names its kind
// and holds the file name, the upload instant and the tree, and no GitHub field: it is parsed
// strictly, so a record that mixes the two kinds is refused, not trimmed.

const TREE_SHAPE = {
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  skippedLinks: z.number().int().nonnegative(),
  snapshotHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
};

const SCHEMA_VERSION = { schemaVersion: z.literal(1) };

const GITHUB_SHAPE = {
  kind: z.literal('github').optional(),
  url: z.string(),
  owner: z.string(),
  repo: z.string(),
  commitSha: z.string().regex(/^[0-9a-f]{40}$/),
  resolvedFrom: z.string(),
  downloadedAt: z.string(),
  ...TREE_SHAPE,
  licence: z.string(),
};

const UPLOAD_SHAPE = {
  kind: z.literal('upload'),
  fileName: z.string().min(1),
  uploadedAt: z.string(),
  ...TREE_SHAPE,
};

const GITHUB_INFO = z.object(GITHUB_SHAPE);
const UPLOAD_FILE = z.strictObject({ ...SCHEMA_VERSION, ...UPLOAD_SHAPE });
const FILE_SCHEMA = z.union([UPLOAD_FILE, z.object({ ...SCHEMA_VERSION, ...GITHUB_SHAPE })]);

function uploadInfo(record: z.infer<typeof UPLOAD_FILE>): UploadSnapshotInfo {
  const { kind, fileName, uploadedAt, fileCount, totalBytes, skippedLinks, snapshotHash } = record;
  return { kind, fileName, uploadedAt, fileCount, totalBytes, skippedLinks, snapshotHash };
}

/** The description a parsed `snapshot.json` holds, or why it is none of the two shapes. */
// RF-130
export function parseSnapshotRecord(json: unknown): Result<SnapshotInfo, z.ZodError> {
  const parsed = FILE_SCHEMA.safeParse(json);
  if (!parsed.success) return err(parsed.error);
  const { data } = parsed;
  return ok(data.kind === 'upload' ? uploadInfo(data) : GITHUB_INFO.parse(data));
}
