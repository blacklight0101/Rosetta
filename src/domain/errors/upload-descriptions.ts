import type { ErrorCode, ErrorDescription } from './codes.js';

// RF-007, RF-129: the plain message and the next step of the uploaded-zip codes
// (RST-1909..1915), in numeric order. descriptions.ts merges them with the rest; describeError
// there is the only way to read them.

export type UploadErrorCode = Extract<
  ErrorCode,
  | 'RST-1909'
  | 'RST-1910'
  | 'RST-1911'
  | 'RST-1912'
  | 'RST-1913'
  | 'RST-1914'
  | 'RST-1915'
  | 'RST-1916'
  | 'RST-1917'
  | 'RST-1918'
  | 'RST-1919'
  | 'RST-1920'
>;

export const UPLOAD_ERROR_DESCRIPTIONS: Readonly<Record<UploadErrorCode, ErrorDescription>> = {
  'RST-1909': {
    message: 'The file is not a readable zip archive, or its headers do not match its content.',
    nextStep:
      'Make the zip again from the project folder (not a split or spanned archive) and upload it again.',
  },
  'RST-1910': {
    message: 'The zip holds more data than the limit once it is unpacked.',
    nextStep:
      'Remove build output, packages and data files, such as the node_modules folder, and zip again.',
  },
  'RST-1911': {
    message: 'The zip holds more files than the limit.',
    nextStep: 'Remove build output and packages, such as the node_modules folder, and zip again.',
  },
  'RST-1912': {
    message:
      'A file in the zip is compressed far more than any real file is, which looks like a zip bomb.',
    nextStep: 'Remove that file from the folder and zip again; the log names it.',
  },
  'RST-1913': {
    message:
      'The zip contains a path that would land outside the project folder, so it was discarded.',
    nextStep:
      'Nothing was kept; zip the project folder again with your usual tool and upload it again.',
  },
  'RST-1914': {
    message: 'The zip contains an encrypted file or one compressed in a way Rosetta cannot read.',
    nextStep:
      'Zip again without a password and with the normal Deflate method, then upload it again.',
  },
  'RST-1915': {
    message:
      'The zip has no files left to analyse (it was empty, or only held folders that are left out).',
    nextStep:
      'Zip the folder that holds the source code; .git, node_modules, bin and obj folders are left out.',
  },
  'RST-1916': {
    message: 'The zip is larger than the upload limit of this server.',
    nextStep:
      'Remove build output, packages and data files, such as the node_modules folder, and zip again.',
  },
  'RST-1917': {
    message: 'The server is low on disk space, so the upload was refused before it started.',
    nextStep:
      'Delete old projects or runs you no longer need, or ask the administrator, and try again.',
  },
  'RST-1918': {
    message: 'Unpacking the zip took longer than the server allows, so it was stopped.',
    nextStep: 'Remove build output and packages from the folder, zip again and upload it again.',
  },
  'RST-1919': {
    message: 'Another upload to this project is still running.',
    nextStep: 'Wait for it to finish, then upload again.',
  },
  'RST-1920': {
    message: 'This project has no source to analyse yet.',
    nextStep: 'Upload a zip of the project, then start the run again.',
  },
};
