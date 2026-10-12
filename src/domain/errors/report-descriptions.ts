import type { ErrorCode, ErrorDescription } from './codes.js';

// RF-007, RF-008, RF-504: the plain message and the next step of the report and export codes
// (RST-1700..1799), in numeric order. descriptions.ts merges them with the rest; describeError
// there is the only way to read them.

export type ReportErrorCode = Extract<ErrorCode, `RST-17${string}`>;

export const REPORT_ERROR_DESCRIPTIONS: Readonly<Record<ReportErrorCode, ErrorDescription>> = {
  'RST-1700': {
    message: 'This run is still in progress, so it cannot be downloaded yet.',
    nextStep: 'Wait until the run has ended, then download it again.',
  },
  'RST-1701': {
    message: 'The report of this run could not be written.',
    nextStep:
      'Try building the report again; if it keeps failing, check the free space of the data folder.',
  },
};
