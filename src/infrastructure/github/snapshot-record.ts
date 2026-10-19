import { z } from 'zod';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type {
  SnapshotInfo,
  UploadSnapshotInfo,
  WorkbookSnapshotInfo,
} from '../../application/ports/source-fetcher.js';
import type { WorkbookEntry } from '../../domain/sources/source.js';

// RF-130, RF-126, RF-152, data-model.md section 3.3: the three shapes of `snapshot.json`. A record
// without `kind` is a GitHub one, whether it was written before uploads existed or by the GitHub
// fetcher, which still writes none, so a GitHub record stays byte-identical. An upload record names
// its kind and holds the file name, the upload instant and the tree, and no GitHub field; it may
// list the workbooks its zip held. A workbook record names its kind and holds the upload instant,
// the renderer version, its workbooks and the tree. The upload and workbook records are parsed
// strictly, so a record that mixes kinds is refused, not trimmed.

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

const count = z.number().int().nonnegative();

const WORKBOOK_ENTRY = z.strictObject({
  fileName: z.string().min(1),
  folder: z.string(),
  sizeBytes: count,
  sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  counts: z.strictObject({
    sheets: count,
    nonEmptyCells: count,
    formulas: count,
    macroModules: count,
    macrosSkipped: count,
  }),
});

const UPLOAD_SHAPE = {
  kind: z.literal('upload'),
  fileName: z.string().min(1),
  uploadedAt: z.string(),
  workbooks: z.array(WORKBOOK_ENTRY).optional(),
  ...TREE_SHAPE,
};

const WORKBOOK_SHAPE = {
  kind: z.literal('workbook'),
  uploadedAt: z.string(),
  rendererVersion: z.string().min(1),
  workbooks: z.array(WORKBOOK_ENTRY).min(1),
  ...TREE_SHAPE,
};

const GITHUB_INFO = z.object(GITHUB_SHAPE);
const UPLOAD_FILE = z.strictObject({ ...SCHEMA_VERSION, ...UPLOAD_SHAPE });
const WORKBOOK_FILE = z.strictObject({ ...SCHEMA_VERSION, ...WORKBOOK_SHAPE });
const FILE_SCHEMA = z.union([
  UPLOAD_FILE,
  WORKBOOK_FILE,
  z.object({ ...SCHEMA_VERSION, ...GITHUB_SHAPE }),
]);

/** The listed workbooks of an upload: none when the list is absent or empty, so both read alike. */
function listed(workbooks: readonly WorkbookEntry[] | undefined) {
  return workbooks === undefined || workbooks.length === 0 ? {} : { workbooks };
}

function uploadInfo(record: z.infer<typeof UPLOAD_FILE>): UploadSnapshotInfo {
  const { kind, fileName, uploadedAt, fileCount, totalBytes, skippedLinks, snapshotHash } = record;
  const tree = { fileCount, totalBytes, skippedLinks, snapshotHash };
  return { kind, fileName, uploadedAt, ...listed(record.workbooks), ...tree };
}

function workbookInfo(record: z.infer<typeof WORKBOOK_FILE>): WorkbookSnapshotInfo {
  const { kind, uploadedAt, rendererVersion, workbooks } = record;
  const { fileCount, totalBytes, skippedLinks, snapshotHash } = record;
  return {
    ...{ kind, uploadedAt, rendererVersion, workbooks },
    ...{ fileCount, totalBytes, skippedLinks, snapshotHash },
  };
}

/** The description a parsed `snapshot.json` holds, or why it is none of the three shapes. */
// RF-130, RF-152
export function parseSnapshotRecord(json: unknown): Result<SnapshotInfo, z.ZodError> {
  const parsed = FILE_SCHEMA.safeParse(json);
  if (!parsed.success) return err(parsed.error);
  const { data } = parsed;
  if (data.kind === 'upload') return ok(uploadInfo(data));
  if (data.kind === 'workbook') return ok(workbookInfo(data));
  return ok(GITHUB_INFO.parse(data));
}
