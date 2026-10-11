// RF-110, ADR-004: a language pack adds symbols, references and routes for the files of one
// language. The universal scan never depends on one; a file no pack maps stays at the coarse level.

import type { LinkKind, SymbolKind } from '../../domain/code-map/vocabulary.js';

/** One file to analyse: a repository-relative path with forward slashes, and its text. */
export interface PackFile {
  readonly path: string;
  readonly text: string;
}

/** A type, function, method or property with its 1-based, inclusive line range (RF-110). */
export interface PackSymbol {
  readonly path: string;
  readonly kind: SymbolKind;
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
  /** The qualified name of the enclosing namespace or type, when there is one. */
  readonly container?: string;
}

/** A link from one file to another, for example a page to its code-behind (data-model 3.4 `links`). */
export interface PackReference {
  /** The analysed file. */
  readonly from: string;
  /** A repository-relative path; the runner drops a reference to a file that was not scanned. */
  readonly to: string;
  readonly kind: LinkKind;
  /** The class or name inside `to` that the link targets, when the source names one. */
  readonly symbol?: string;
}

/** A URL pattern an application answers, with the line that declares it. */
export interface PackRoute {
  readonly path: string;
  readonly startLine: number;
  readonly template: string;
  /** The HTTP method, when the declaration names one. */
  readonly method?: string;
  /** The symbol that handles the route, when known. */
  readonly handler?: string;
}

/** A candidate entity, for example an Entity Framework entity set (RF-111). */
export interface PackEntity {
  readonly name: string;
  readonly path: string;
  readonly startLine: number;
  /** Where the pack found it, for example `Shop.CatalogContext.Items`. */
  readonly source: string;
}

export interface PackAnalysis {
  readonly symbols: readonly PackSymbol[];
  readonly references: readonly PackReference[];
  readonly routes: readonly PackRoute[];
  readonly entities: readonly PackEntity[];
}

export interface LanguagePack {
  /** Lower-case id recorded in the code map (`languagePacks`). */
  readonly name: string;
  /** Changes whenever the pack's output for a file can change, so a code map explains itself. */
  readonly version: string;
  /** Lower-case, with the dot, for example `.cs`. */
  readonly extensions: readonly string[];
  /**
   * Maps one file. It never reads anything else and never writes. It may throw (typically a
   * `RosettaError`): the scan then keeps that file at the coarse level and goes on (RF-110).
   */
  analyse(file: PackFile): PackAnalysis;
}
