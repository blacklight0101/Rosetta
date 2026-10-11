import type { CodeMap, CodeMapProblem } from '../../../domain/code-map/code-map.js';
import { createCodeMap } from '../../../domain/code-map/code-map.js';
import { byCodeUnit } from '../../../domain/code-map/code-unit-order.js';
import type { Result } from '../../../domain/errors/result.js';
import type { TextMasker } from '../../guards/secret-masker.js';

// RF-141: every string of the code map that comes from the repository (file paths, area names, the
// subpath, SQL text, symbol and entity names, link symbols) goes through the SecretMasker before
// the map is returned, so nothing downstream sees an unmasked secret. The map is built and grouped
// on the real paths first; masking comes last and the map is re-created, which sorts it again.

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

/** The same map with every repository text masked; a problem if two masked names now collide. */
export function maskCodeMap(map: CodeMap, masker: TextMasker): Result<CodeMap, CodeMapProblem> {
  const mask = memoMask(masker);
  return createCodeMap({
    source: { ...map.source, subpath: mask(map.source.subpath) },
    files: map.files.map((file) => ({ ...file, path: mask(file.path) })),
    areas: map.areas.map((area) => ({
      ...area,
      name: mask(area.name),
      files: area.files.map(mask).sort(byCodeUnit),
    })),
    symbols: map.symbols.map((symbol) => ({
      ...symbol,
      path: mask(symbol.path),
      name: mask(symbol.name),
      ...(symbol.container === undefined ? {} : { container: mask(symbol.container) }),
    })),
    links: map.links.map((link) => ({
      ...link,
      from: mask(link.from),
      to: mask(link.to),
      ...(link.symbol === undefined ? {} : { symbol: mask(link.symbol) }),
    })),
    // Masking can lengthen a text (a short secret becomes a longer marker), so the cut comes last.
    sqlStatements: map.sqlStatements.map((statement) => ({
      ...statement,
      path: mask(statement.path),
      text: mask(statement.text).slice(0, maxStatementCharacters),
    })),
    entities: map.entities.map((entity) => ({
      ...entity,
      name: mask(entity.name),
      path: mask(entity.path),
      source: mask(entity.source),
    })),
    languagePacks: map.languagePacks,
  });
}
