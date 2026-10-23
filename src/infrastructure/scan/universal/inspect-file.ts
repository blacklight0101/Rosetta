import { createHash } from 'node:crypto';
import type { FileBytes } from '../../../application/ports/repository-reader.js';
import { artefactKindsOf } from './artefact-rules.js';
import { decodeText, isBinary } from './binary-detect.js';
import { countLines, estimateTokens } from './file-facts.js';
import { detectLanguage } from './language-detect.js';
import type { SkipReason } from '../../../domain/code-map/file-entry.js';
import type { TextMasker } from '../../guards/secret-masker.js';
import type { ScannedFile, SqlStatement } from './scan-types.js';
import { extractEmbeddedStatements } from './sql-embedded.js';
import { extractScriptStatements } from './sql-script.js';
import { isVendoredContent } from './vendor-content.js';

// RF-100..RF-103: everything the scan records about one file, from its bytes.

/** How much of a file's text decides its language when the extension does not. */
const headCharacters = 4096;

export interface InspectedFile {
  readonly file: ScannedFile;
  readonly sql: readonly SqlStatement[];
}

function skippedFile(path: string, reason: SkipReason, sha256: string | undefined): ScannedFile {
  return {
    path,
    language: detectLanguage(path),
    lines: 0,
    estimatedTokens: 0,
    ...(sha256 === undefined ? {} : { sha256 }),
    artefactKinds: artefactKindsOf(path),
    skipped: reason,
  };
}

function sqlOf(
  path: string,
  language: string,
  text: string,
  masker: TextMasker,
): readonly SqlStatement[] {
  if (language === 'markdown') return [];
  const lines = text.split('\n');
  return language === 'sql'
    ? extractScriptStatements(path, lines, masker)
    : extractEmbeddedStatements(path, lines);
}

/** Never reads more than the bytes it is given, and never throws on their content. */
export function inspectFile(path: string, content: FileBytes, masker: TextMasker): InspectedFile {
  const { bytes } = content;
  if (bytes === undefined) return { file: skippedFile(path, 'too-large', undefined), sql: [] };
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (isBinary(bytes)) return { file: skippedFile(path, 'binary', sha256), sql: [] };
  const text = decodeText(bytes);
  const language = detectLanguage(path, text.slice(0, headCharacters));
  const estimatedTokens = estimateTokens(text);
  const vendored = isVendoredContent(path, text.slice(0, headCharacters), estimatedTokens);
  const file: ScannedFile = {
    path,
    language,
    lines: countLines(text),
    estimatedTokens,
    sha256,
    artefactKinds: artefactKindsOf(path),
    ...(vendored ? { vendored: true as const } : {}),
  };
  return { file, sql: sqlOf(path, language, text, masker) };
}
