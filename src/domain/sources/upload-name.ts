import { err, ok, type Result } from '../errors/result.js';

// RF-128, RF-130: the name of an uploaded zip and the key of its snapshot folder.

const HASH_PREFIX = 'sha256:';
const HASH_CHARS = 16;
const MAX_NAME = 200;
const EXTENSION = /\.zip$/iu;
const UPLOAD_KEY =
  /^upload__[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[0-9a-f]{16}$/u;

/** `upload__<project id>@<first 16 hex of the hash>` (RFC-004 section 4.1). */
// RF-130
export function uploadSnapshotKey(projectId: string, snapshotHash: string): string {
  const hex = snapshotHash.startsWith(HASH_PREFIX)
    ? snapshotHash.slice(HASH_PREFIX.length)
    : snapshotHash;
  return `${uploadKeyPrefix(projectId)}${hex.slice(0, HASH_CHARS)}`;
}

/** The folder-name prefix every snapshot of one project's uploads shares. */
// RF-130
export function uploadKeyPrefix(projectId: string): string {
  return `upload__${projectId}@`;
}

/** True for a folder name of the shape `upload__<project id>@<16 hex>`. */
// RF-130
export function isUploadSnapshotKey(key: string): boolean {
  return UPLOAD_KEY.test(key);
}

const DELETE = 0x7f;
const FIRST_PRINTABLE = 0x20;

/** Bidi controls change how a name reads on screen (`‮gnp.zip` shows as `piz.png`): they are never kept. */
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩]/gu;

function withoutControls(text: string): string {
  let kept = '';
  for (let at = 0; at < text.length; at += 1) {
    const code = text.charCodeAt(at);
    if (code >= FIRST_PRINTABLE && code !== DELETE) kept += text.charAt(at);
  }
  return kept;
}

/** The last path segment of a name as sent, without control or bidi characters (RF-128, RF-150). */
export function baseNameOf(text: string): string {
  const parts = text.split(/[/\\]/u);
  return withoutControls(parts[parts.length - 1] ?? '')
    .replace(BIDI_CONTROLS, '')
    .trim();
}

/** The percent-decoded text; undefined when the encoding is broken (RF-128, RF-150). */
export function decoded(text: string): string | undefined {
  try {
    return decodeURIComponent(text);
  } catch {
    return undefined;
  }
}

export function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** At most 200 characters, keeping the extension; a surrogate pair is kept whole or dropped whole. */
function cut(name: string): string {
  if (name.length <= MAX_NAME) return name;
  const extension = name.slice(-'.zip'.length);
  let keep = MAX_NAME - extension.length;
  if (isHighSurrogate(name.charCodeAt(keep - 1))) keep -= 1;
  return `${name.slice(0, keep)}${extension}`;
}

/**
 * The file name to record: the one the page sent (percent-encoded, a base name, no control
 * or bidi characters, at most 200 characters), or `<project name>.zip` when it sent none. A name that does
 * not end in `.zip`, or has nothing before it, is refused (RF-128).
 */
// RF-128
export function uploadFileName(
  sent: string | undefined,
  projectName: string,
): Result<string, 'not-a-zip-name' | 'bad-encoding'> {
  const text = sent === undefined ? `${baseNameOf(projectName)}.zip` : decoded(sent);
  if (text === undefined) return err('bad-encoding');
  const name = baseNameOf(text);
  if (!EXTENSION.test(name) || name.replace(EXTENSION, '').trim() === '') {
    return err('not-a-zip-name');
  }
  return ok(cut(name));
}
