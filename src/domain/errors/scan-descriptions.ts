import type { ErrorCode, ErrorDescription } from './codes.js';

// RF-007, RF-110: the plain message and the next step of the scan and language-pack codes
// (RST-1200..1299), in numeric order. descriptions.ts merges them with the rest; describeError there
// is the only way to read them.

export type ScanErrorCode = Extract<ErrorCode, `RST-12${string}`>;

export const SCAN_ERROR_DESCRIPTIONS: Readonly<Record<ScanErrorCode, ErrorDescription>> = {
  'RST-1200': {
    message: 'A language pack could not map one file; the file stays at the coarse map level.',
    nextStep:
      'No action needed; agents read the file as text. Report the file type if it happens often.',
  },
  'RST-1201': {
    message: 'A language pack is registered with an invalid or duplicate file extension.',
    nextStep: 'Give each pack its own extensions, lower case and starting with a dot.',
  },
  'RST-1202': {
    message: 'The scan could not build a valid code map from the repository.',
    nextStep: 'Run the scan again; if it fails again, report the repository and the run id.',
  },
  'RST-1203': {
    message: 'The project has no completed scan, so there is no code map to understand.',
    nextStep: 'Run a scan of the project first, then start understand again.',
  },
  'RST-1204': {
    message:
      'The scan reached its total parse time budget, so the remaining files were not analysed by a language pack.',
    nextStep:
      'No action needed; those files stay at the coarse map level. Narrow the scan with a subpath or ignore rules to map them.',
  },
};
