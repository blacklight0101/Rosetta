import type { ExternalLink } from './workbook-model.js';

// RF-153: a formula names an external link by its number (`[2]Sheet!A1`). The reader leaves out a link
// with no usable file name, so a link that follows it carries the number it had in the file.

/**
 * The file name of each link at its number minus one. A number the reader dropped is a hole, which
 * reads as undefined, so a formula that names it resolves to nothing instead of to another link.
 */
export function linkNamesByNumber(links: readonly ExternalLink[]): string[] {
  const names: string[] = [];
  links.forEach((link, index) => {
    names[(link.position ?? index + 1) - 1] = link.fileName;
  });
  return names;
}
