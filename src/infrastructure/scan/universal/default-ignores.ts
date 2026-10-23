import { baseName, extensionOf } from './path-parts.js';

// RF-100: files nobody should read as source. The reader already applies the project's ignore
// rules and the deny list (RF-140, RF-147); these are the scan's own defaults. Every entry left out
// is listed in the scan summary as ignored, with its rule, so nothing is hidden silently.

const ignoredFolders: ReadonlyMap<string, string> = new Map([
  ['.git', 'version control'],
  ['.svn', 'version control'],
  ['.hg', 'version control'],
  ['.bzr', 'version control'],
  ['bin', 'build output'],
  ['obj', 'build output'],
  ['node_modules', 'restored packages'],
  ['packages', 'restored packages'],
  ['.vs', 'IDE settings'],
  ['.idea', 'IDE settings'],
  ['.vscode', 'IDE settings'],
]);

/**
 * A backup copy folder, matched in lower case: `backup` or `backups`, `backup` followed by a digit or a date
 * (`Backup1`, `Backup2024-05-01`), or `backup` followed by a space, `_` or `-` (`Backup 2025`, `backup_old`).
 * A name such as `BackupService` or `Backupper` is first-party code.
 */
const backupFolder = /^backups?$|^backup(?:[\s_-]|\d)/u;

const binaryExtensions: ReadonlySet<string> = new Set([
  ...['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'tif', 'tiff', 'psd'],
  ...['zip', 'gz', 'tgz', 'tar', '7z', 'rar', 'bz2', 'xz', 'iso', 'img'],
  ...['jar', 'war', 'ear', 'nupkg', 'dll', 'exe', 'pdb', 'so', 'dylib', 'lib', 'a', 'o', 'obj'],
  ...['class', 'bin', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
  ...['woff', 'woff2', 'ttf', 'eot', 'otf', 'mp3', 'mp4', 'mov', 'avi', 'wav', 'ogg', 'webm'],
  ...['mdf', 'ldf', 'ndf', 'bak', 'mdb', 'accdb', 'sqlite', 'sqlite3'],
]);

/** Per-user IDE files: solution options (`.suo`) and project user settings (`*.csproj.user`). */
const ideUserExtensions: ReadonlySet<string> = new Set(['suo', 'user']);

/** An entry the scan leaves out: the topmost ignored folder or the file itself, and why. */
export interface DefaultIgnore {
  /** Repository-relative, forward slashes. */
  readonly path: string;
  readonly rule: string;
}

/** The part of `path` below `subpath`: folders above the analysed folder are not judged. */
function belowSubpath(path: string, subpath: string): string {
  return subpath !== '' && path.startsWith(`${subpath}/`) ? path.slice(subpath.length + 1) : path;
}

function folderRule(folder: string): string | undefined {
  const lower = folder.toLowerCase();
  if (backupFolder.test(lower)) return 'backup copy';
  return ignoredFolders.get(lower);
}

/**
 * Whether the scan leaves a file out, and the entry that does so: a folder on its way is version
 * control, build output, restored packages, IDE settings or a backup copy, or its name marks a
 * per-user IDE file or a binary format. Folder names ignore case.
 */
export function defaultIgnoreOf(path: string, subpath = ''): DefaultIgnore | undefined {
  const below = belowSubpath(path, subpath);
  const prefix = path.slice(0, path.length - below.length);
  const folders = below.split('/').slice(0, -1);
  for (let index = 0; index < folders.length; index += 1) {
    const rule = folderRule(folders[index] ?? '');
    if (rule !== undefined) {
      return { path: `${prefix}${folders.slice(0, index + 1).join('/')}`, rule };
    }
  }
  const extension = extensionOf(baseName(below));
  if (ideUserExtensions.has(extension)) return { path, rule: 'IDE user file' };
  if (binaryExtensions.has(extension)) return { path, rule: 'binary file' };
  return undefined;
}

/** Whether the scan leaves a file out by default (see `defaultIgnoreOf`). */
export function isDefaultIgnored(path: string, subpath = ''): boolean {
  return defaultIgnoreOf(path, subpath) !== undefined;
}
