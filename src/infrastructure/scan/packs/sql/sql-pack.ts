import type {
  LanguagePack,
  PackAnalysis,
  PackFile,
} from '../../../../application/ports/language-pack.js';
import { RosettaError } from '../../../../domain/errors/rosetta-error.js';
import { readSqlObjects } from './sql-objects.js';

// P5-36, RF-104, DEC-11, ADR-004: the SQL pack. SQL objects are stack-specific (T-SQL, PL/pgSQL
// and MySQL spell them differently), so finding them lives in a pack and not in the universal
// scan, which keeps listing only the statements it can find in any language (RF-103). The pack
// reports each table, view, procedure, trigger and function of a `.sql` script as a symbol.

const maxSourceCharacters = 2_000_000;

export class SqlPack implements LanguagePack {
  readonly name = 'sql';
  /** Raise when the output for a file can change. */
  readonly version = '1.0.0';
  readonly extensions = ['.sql'];

  analyse(file: PackFile): PackAnalysis {
    if (file.text.length > maxSourceCharacters) {
      throw new RosettaError('RST-1200', 'The file is too large for the SQL pack.');
    }
    const text = file.text.startsWith('﻿') ? file.text.slice(1) : file.text;
    return {
      symbols: readSqlObjects(file.path, text.split('\n')),
      references: [],
      routes: [],
      entities: [],
    };
  }
}
