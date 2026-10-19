import { bytesText } from './bytes.js';

// RF-128, RF-134: what the page checks before it sends a file: a name ending in `.zip`, not empty,
// not above the limit, and the first bytes of a zip (the local file header, `PK\x03\x04`). Each
// refusal names the file, the reason and what to do. The server checks again (RF-129).

const signature = [0x50, 0x4b, 0x03, 0x04] as const;
const megabyte = 1024 * 1024;

/** The reason a file cannot be uploaded, or undefined when it can be. */
// RF-134
export async function zipProblem(file: File, limitMb: number): Promise<string | undefined> {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    return `${file.name} does not end in .zip. Choose a file ending in .zip.`;
  }
  if (file.size === 0) return `${file.name} is empty. Choose a zip that holds your code.`;
  if (file.size > limitMb * megabyte) {
    return `${file.name} is ${bytesText(file.size)}; the limit is ${String(limitMb)} MB. Remove folders such as node_modules, bin and obj, then zip again.`;
  }
  const head = new Uint8Array(await file.slice(0, signature.length).arrayBuffer());
  if (signature.some((byte, index) => head[index] !== byte)) {
    return `${file.name} is not a zip file inside, although its name ends in .zip. Make the zip again from your folder.`;
  }
  return undefined;
}

/** The project name an upload starts with: the file name without `.zip` (RF-128). */
export function projectNameOf(fileName: string): string {
  return fileName.replace(/\.zip$/iu, '');
}
