import {
  isRenderedFile,
  renderedFileNamesIn,
} from '../../domain/sources/rendered-workbook-files.js';
import type { Claim } from '../../domain/cards/card.js';

// RF-301, ADR-005, P3-105, EV-11: a claim that talks about a file Rosetta rendered from a workbook
// (`workbook.md` as the workbook's index) describes Rosetta's view, not the system. The Invoice
// evaluation had five such claims Supported by a small model. The check is free and needs no model:
// the claim names a rendered file and also cites a file inside a rendered workbook folder of the
// snapshot (`workbookFolders`, from the snapshot record), so a code project with its own
// `docs/notes.md` or `docs/formulas.md` is judged by the model like any other claim. A claim about a sheet, a name
// or a formula that only cites the index does not name the file and is not touched.

/** Why the claim is rejected, or undefined when it is not about a rendered file. */
// RF-301
export function renderedFileReason(
  claim: Pick<Claim, 'text' | 'citations'>,
  workbookFolders: readonly string[] = [],
): string | undefined {
  const [name] = renderedFileNamesIn(claim.text);
  if (name === undefined) return undefined;
  if (!claim.citations.some((citation) => isRenderedFile(citation.path, workbookFolders)))
    return undefined;
  return `The claim is about ${name}, a file Rosetta rendered from the workbook; it is Rosetta's view of the workbook and not a feature of it.`;
}
