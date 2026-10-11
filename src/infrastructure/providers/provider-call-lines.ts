import type {
  ProviderCallRecord,
  TranscriptEntry,
} from '../../application/ports/provider-call-recorder.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-408, RNF-003: the lines of `provider-calls.jsonl` and `transcripts/<agentTaskId>.jsonl`
// (data-model.md sections 3.10 and 3.15). Every key and every string is masked, and every value is
// masked again together with its property name, so a secret whose only clue is its key
// (`{ "password": "..." }`) is caught too. A masker failure is thrown (RST-2101) and nothing is
// written.

const schemaVersion = 1;
// The agent task id becomes a file name, so it may not name a folder or leave one.
const safeFileStem = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const maskedMarker = /\[MASKED:[a-z-]+\]/;

/** The value of a one-property JSON object text, or undefined when the text is not one. */
function onlyValueOf(objectText: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(objectText);
  } catch {
    return undefined;
  }
  return parsed !== null && typeof parsed === 'object' ? Object.values(parsed)[0] : undefined;
}

/** A primitive value masked alone, then together with its (masked) property name. */
function maskKeyed(key: string, value: unknown, masker: TextMasker): unknown {
  const alone = maskDeep(value, masker);
  if (alone === undefined) return undefined;
  const pair = `${JSON.stringify(key)}:${JSON.stringify(alone)}`;
  const masked = masker.mask(pair).text;
  if (masked === pair) return alone;
  // When the masked pair is no longer valid JSON, the whole value becomes the marker.
  return onlyValueOf(`{${masked}}`) ?? maskedMarker.exec(masked)?.[0] ?? '[MASKED:password]';
}

function maskObject(value: object, masker: TextMasker): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]: [string, unknown]) => {
      const maskedKey = masker.mask(key).text;
      const keyed =
        item !== null && typeof item === 'object'
          ? maskDeep(item, masker)
          : maskKeyed(maskedKey, item, masker);
      return [maskedKey, keyed];
    }),
  );
}

function maskDeep(value: unknown, masker: TextMasker): unknown {
  if (typeof value === 'string') return masker.mask(value).text;
  if (Array.isArray(value)) return value.map((item: unknown) => maskDeep(item, masker));
  if (value !== null && typeof value === 'object') return maskObject(value, masker);
  return value;
}

function maskedLine(value: object, masker: TextMasker): string {
  return `${JSON.stringify(maskDeep(value, masker))}\n`;
}

/** One masked line of `provider-calls.jsonl`. */
export function callLine(call: ProviderCallRecord, seq: number, masker: TextMasker): string {
  return maskedLine({ schemaVersion, seq, ...call }, masker);
}

/** One masked line of a transcript. */
export function transcriptLine(entry: TranscriptEntry, seq: number, masker: TextMasker): string {
  return maskedLine({ schemaVersion, seq, ...entry }, masker);
}

/** The file name of an agent task's transcript; refuses an id that is not a plain name. */
export function transcriptFileName(agentTaskId: string): string {
  if (!safeFileStem.test(agentTaskId) || agentTaskId.includes('..')) {
    throw new RosettaError(
      ERROR_CODES.providerCallLogFailed,
      'The agent task id cannot be used as a transcript file name.',
    );
  }
  return `${agentTaskId}.jsonl`;
}

/** The link from a call record to a transcript line (data-model.md section 3.10). */
export function transcriptRef(agentTaskId: string, seq: number): string {
  return `transcripts/${transcriptFileName(agentTaskId)}#${String(seq)}`;
}

/** The link `lines` lines after `ref` in the same transcript. */
export function laterRef(ref: string, lines: number): string {
  return ref.replace(/#(\d+)$/, (_match, line: string) => `#${String(Number(line) + lines)}`);
}
