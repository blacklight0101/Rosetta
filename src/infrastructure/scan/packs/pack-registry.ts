import type { LanguagePack } from '../../../application/ports/language-pack.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';

// RF-110: which pack maps which extension. Built once by the composition root.

const extensionForm = /^\.[a-z0-9]+$/u;

/** The extension of the last path segment, lower case with the dot; undefined when it has none. */
function extensionOf(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? undefined : name.slice(dot).toLowerCase();
}

function byName(left: LanguagePack, right: LanguagePack): number {
  if (left.name === right.name) return 0;
  return left.name < right.name ? -1 : 1;
}

export class LanguagePackRegistry {
  /** Sorted by name. */
  readonly packs: readonly LanguagePack[];
  private readonly byExtension = new Map<string, LanguagePack>();

  /** Throws RST-1201 when an extension is malformed or claimed by two packs. */
  constructor(packs: readonly LanguagePack[]) {
    for (const pack of packs) {
      for (const extension of pack.extensions) {
        if (!extensionForm.test(extension) || this.byExtension.has(extension)) {
          throw new RosettaError(
            'RST-1201',
            `Language pack ${pack.name} cannot claim the extension ${extension}.`,
          );
        }
        this.byExtension.set(extension, pack);
      }
    }
    this.packs = [...packs].sort(byName);
  }

  /** The pack for a repository-relative path, or undefined when no pack claims its extension. */
  packFor(path: string): LanguagePack | undefined {
    const extension = extensionOf(path);
    return extension === undefined ? undefined : this.byExtension.get(extension);
  }
}
