import { baseName, extensionOf } from './path-parts.js';

// RF-100: files nobody should read as source. The reader already applies the project's ignore
// rules and the deny list (RF-140, RF-147); these are the scan's own defaults.

const ignoredFolders: ReadonlySet<string> = new Set([
  '.git',
  '.svn',
  '.hg',
  '.bzr',
  'bin',
  'obj',
  'node_modules',
  'packages',
]);

const binaryExtensions: ReadonlySet<string> = new Set([
  ...['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'tif', 'tiff', 'psd'],
  ...['zip', 'gz', 'tgz', 'tar', '7z', 'rar', 'bz2', 'xz', 'iso', 'img'],
  ...['jar', 'war', 'ear', 'nupkg', 'dll', 'exe', 'pdb', 'so', 'dylib', 'lib', 'a', 'o', 'obj'],
  ...['class', 'bin', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
  ...['woff', 'woff2', 'ttf', 'eot', 'otf', 'mp3', 'mp4', 'mov', 'avi', 'wav', 'ogg', 'webm'],
  ...['mdf', 'ldf', 'ndf', 'bak', 'mdb', 'accdb', 'sqlite', 'sqlite3'],
]);

/** The part of `path` below `subpath`: folders above the analysed folder are not judged. */
function belowSubpath(path: string, subpath: string): string {
  return subpath !== '' && path.startsWith(`${subpath}/`) ? path.slice(subpath.length + 1) : path;
}

/**
 * Whether the scan leaves a file out: a folder on its way is version control, build output or
 * restored packages, or its extension marks a binary format. Folder names ignore case.
 */
export function isDefaultIgnored(path: string, subpath = ''): boolean {
  const below = belowSubpath(path, subpath);
  const folders = below.split('/').slice(0, -1);
  if (folders.some((folder) => ignoredFolders.has(folder.toLowerCase()))) return true;
  return binaryExtensions.has(extensionOf(baseName(below)));
}
