import type { CodeMap, CodeMapProblem } from '../../../domain/code-map/code-map.js';
import { createCodeMap } from '../../../domain/code-map/code-map.js';
import { byCodeUnit } from '../../../domain/code-map/code-unit-order.js';
import type { Result } from '../../../domain/errors/result.js';
import type { TextMasker } from '../../guards/secret-masker.js';
import { cutAtWord } from '../universal/sql-words.js';

// RF-141: every string of the code map that comes from the repository (file paths, area names, the
// subpath, SQL text, symbol and entity names, link symbols) goes through the SecretMasker before
// the map is returned. The map is built and grouped on the real paths first; masking comes last and
// the map is re-created, which sorts it again. The SQL text was cut by the scan never inside a word
// (sql-words.ts `cutAtWord`), so the masker sees every secret of the kept text whole.

/** RF-103: a statement is recorded with at most this many characters, counted after masking. */
const maxStatementCharacters = 500;

/** Masks one string once, however often it occurs (paths repeat in every list). */
function memoMask(masker: TextMasker): (text: string) => string {
  const seen = new Map<string, string>();
  return (text) => {
    const known = seen.get(text);
    if (known !== undefined) return known;
    const masked = masker.mask(text).text;
    seen.set(text, masked);
    return masked;
  };
}

/**
 * Masks names that must stay unique (file paths, area names). Names that masking changed and that
 * now share one masked form get `~1`, `~2`, ... in the code-unit order of the real names, so two
 * files that differ only by a secret stay two files. An ordinal, not a hash of the real name: a
 * short hash would let a reader confirm a guessed secret. Other names are masked as usual.
 */
function uniqueMask(
  names: readonly string[],
  mask: (text: string) => string,
): (text: string) => string {
  const byMasked = new Map<string, string[]>();
  for (const name of [...new Set(names)].sort(byCodeUnit)) {
    const masked = mask(name);
    if (masked !== name) byMasked.set(masked, [...(byMasked.get(masked) ?? []), name]);
  }
  const unique = new Map<string, string>();
  for (const [masked, group] of byMasked) {
    if (group.length < 2) continue;
    group.forEach((name, index) => unique.set(name, `${masked}~${String(index + 1)}`));
  }
  return (text) => unique.get(text) ?? mask(text);
}

/** The same map with every repository text masked; a problem if two masked names still collide. */
export function maskCodeMap(map: CodeMap, masker: TextMasker): Result<CodeMap, CodeMapProblem> {
  const mask = memoMask(masker);
  const maskPath = uniqueMask(
    map.files.map((file) => file.path),
    mask,
  );
  const maskArea = uniqueMask(
    map.areas.map((area) => area.name),
    mask,
  );
  return createCodeMap({
    source: { ...map.source, subpath: mask(map.source.subpath) },
    files: map.files.map((file) => ({ ...file, path: maskPath(file.path) })),
    areas: map.areas.map((area) => ({
      ...area,
      name: maskArea(area.name),
      files: area.files.map(maskPath).sort(byCodeUnit),
    })),
    symbols: map.symbols.map((symbol) => ({
      ...symbol,
      path: maskPath(symbol.path),
      name: mask(symbol.name),
      ...(symbol.container === undefined ? {} : { container: mask(symbol.container) }),
    })),
    links: map.links.map((link) => ({
      ...link,
      from: maskPath(link.from),
      to: maskPath(link.to),
      ...(link.symbol === undefined ? {} : { symbol: mask(link.symbol) }),
    })),
    // Masking can lengthen a text (a short secret becomes a longer marker), so the cut comes last;
    // it falls between words too, so it never leaves half a marker or a bare `user:` behind.
    sqlStatements: map.sqlStatements.map((statement) => ({
      ...statement,
      path: maskPath(statement.path),
      text: cutAtWord(mask(statement.text), maxStatementCharacters),
    })),
    entities: map.entities.map((entity) => ({
      ...entity,
      name: mask(entity.name),
      path: maskPath(entity.path),
      source: mask(entity.source),
    })),
    languagePacks: map.languagePacks,
  });
}
