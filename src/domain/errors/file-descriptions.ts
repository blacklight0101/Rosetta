import type { ErrorCode, ErrorDescription } from './codes.js';

// RF-007, RF-140..RF-147: the plain message and the next step of the file system, ignore rule and
// output folder codes (RST-1100..1199), in numeric order. descriptions.ts merges them with the
// rest; describeError there is the only way to read them.

export type FileErrorCode = Extract<ErrorCode, `RST-11${string}`>;

export const FILE_ERROR_DESCRIPTIONS: Readonly<Record<FileErrorCode, ErrorDescription>> = {
  'RST-1100': {
    message: 'The path points outside the analysed repository folder, so it was not read.',
    nextStep: 'Use a path relative to the repository root, inside the analysed folder.',
  },
  'RST-1101': {
    message: 'The path is not a valid repository path, so it was not read.',
    nextStep: 'Use forward slashes and plain file names, without device names or stream suffixes.',
  },
  'RST-1102': {
    message: 'The path matches the ignore rules, so it is never read or sent.',
    nextStep: 'Change the ignore rules in the project settings if this file must be analysed.',
  },
  'RST-1103': {
    message:
      'The path matches the built-in deny list of secret files, so it is never read or sent.',
    nextStep: 'Add the pattern to scan.allowDenied in the project settings only if you are sure.',
  },
  'RST-1104': {
    message: 'The file does not exist in the analysed snapshot.',
    nextStep: 'Check the path against the list of files in the code map.',
  },
  'RST-1105': {
    message: 'The line range is not valid for this file.',
    nextStep: 'Ask for 1-based lines with the start not after the end and inside the file.',
  },
  'RST-1106': {
    message: 'The search pattern is longer than 200 characters, so it was not run.',
    nextStep: 'Use a shorter pattern.',
  },
  'RST-1107': {
    message: 'The search pattern is not a valid regular expression.',
    nextStep: 'Correct the pattern and search again.',
  },
  'RST-1108': {
    message: 'The search took longer than its time limit and was stopped.',
    nextStep: 'Use a simpler pattern or limit the files searched.',
  },
  'RST-1109': {
    message: 'The file would be written outside the user workspace, so the write was refused.',
    nextStep: 'Nothing was written; check the application log for the refused path.',
  },
  'RST-1110': {
    message: 'The snapshot cache is read-only, so the write was refused.',
    nextStep: 'Nothing was written; output belongs in the user workspace.',
  },
  'RST-1111': {
    message: 'A workspace id is not in the expected format, so no path was built from it.',
    nextStep: 'Check the user, project or run id that was passed.',
  },
  'RST-1112': {
    message: 'The search could not run because its worker failed.',
    nextStep: 'Search again; if it keeps failing, check the application log.',
  },
  'RST-1113': {
    message: 'The file size limit is not a whole number of bytes of zero or more.',
    nextStep: 'Correct the maximum file size in the project settings.',
  },
  'RST-1114': {
    message: 'The file is larger than the project scan.maxFileBytes, so it was not read.',
    nextStep:
      'Read a smaller file; raise scan.maxFileBytes and scan again if this one must be read.',
  },
  'RST-1115': {
    message: 'The folder could not be removed.',
    nextStep:
      'Ask the administrator to check the application log for the folder and close what holds it open; a run that is still listed can be deleted again.',
  },
};
