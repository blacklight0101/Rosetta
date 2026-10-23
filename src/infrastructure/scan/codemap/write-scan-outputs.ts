import { createHash } from 'node:crypto';
import type { OutputWriter, WriteRefusal } from '../../../application/ports/output-writer.js';
import type { CodeMap } from '../../../domain/code-map/code-map.js';
import { ok, type Result } from '../../../domain/errors/result.js';
import type { TextMasker } from '../../guards/secret-masker.js';
import { serialiseCodeMap } from './codemap-json.js';
import type { IgnoredEntry } from '../universal/scan-types.js';
import { renderScanSummary } from './scan-summary.js';

// RF-005, RF-105: the scan's two output files, written only through the OutputWriter port.

/** Where the files go: the run folder inside the user's workspace (data-model section 2). */
export interface ScanOutputTarget {
  readonly userId: string;
  /** Relative to the workspace, forward slashes, no trailing slash. */
  readonly folder: string;
}

export interface ScanOutputInput {
  readonly codeMap: CodeMap;
  readonly durationMs: number;
  /** Files past the scan-wide parse budget, for the summary (P1-75). */
  readonly overParseBudget?: number;
  /** Entries the default ignores left out, for the summary (RF-100). */
  readonly ignored?: readonly IgnoredEntry[];
  /** The summary is masked once more as a last guard (RF-141). */
  readonly masker: TextMasker;
}

export interface ScanOutputsWritten {
  /** SHA-256 of `codemap.json`, for the run manifest (RNF-004). */
  readonly codeMapHash: string;
}

/** Writes `codemap.json`, then `scan-summary.md`; stops at the first refusal. */
export async function writeScanOutputs(
  writer: OutputWriter,
  target: ScanOutputTarget,
  input: ScanOutputInput,
): Promise<Result<ScanOutputsWritten, WriteRefusal>> {
  // Both texts are made (and the summary masked) before anything is written: a masker that fails
  // leaves no file behind (RF-141).
  const codeMapText = serialiseCodeMap(input.codeMap);
  const summary = input.masker.mask(
    renderScanSummary({
      codeMap: input.codeMap,
      durationMs: input.durationMs,
      ...(input.overParseBudget === undefined ? {} : { overParseBudget: input.overParseBudget }),
      ...(input.ignored === undefined ? {} : { ignored: input.ignored }),
    }),
  ).text;
  const codeMap = await writer.writeText(
    { userId: target.userId, path: `${target.folder}/codemap.json` },
    codeMapText,
  );
  if (!codeMap.ok) return codeMap;
  const written = await writer.writeText(
    { userId: target.userId, path: `${target.folder}/scan-summary.md` },
    summary,
  );
  if (!written.ok) return written;
  return ok({ codeMapHash: createHash('sha256').update(codeMapText, 'utf8').digest('hex') });
}
