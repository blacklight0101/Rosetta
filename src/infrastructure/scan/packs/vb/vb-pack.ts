import type {
  LanguagePack,
  PackAnalysis,
  PackFile,
} from '../../../../application/ports/language-pack.js';
import { RosettaError } from '../../../../domain/errors/rosetta-error.js';
import { readVbSymbols } from './vb-declarations.js';

// RF-111, ADR-004: the VB.NET pack. A light line reader (no grammar): types, modules, Subs,
// Functions and Properties with their line ranges. Web forms pages with a VB script block are read
// by the C# pack, which owns those extensions, through `readVbSymbols`.

const maxSourceCharacters = 2_000_000;

export class VbPack implements LanguagePack {
  readonly name = 'vb';
  /** Raise when the output for a file can change. */
  readonly version = '1.0.0';
  readonly extensions = ['.vb'];

  analyse(file: PackFile): PackAnalysis {
    if (file.text.length > maxSourceCharacters) {
      throw new RosettaError('RST-1200', 'The file is too large for the VB pack.');
    }
    return {
      symbols: readVbSymbols(file.path, file.text),
      references: [],
      routes: [],
      entities: [],
    };
  }
}
