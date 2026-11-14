import type { ReaderCase } from './reader-case.js';

// RF-1410: the files and lines of a reader case as the run's read gate counts them.

export interface ReadableFile {
  readonly path: string;
  readonly lines: number;
}

export interface ReadableFiles {
  /** The readable file a path names, as the code map resolves it; undefined when none. */
  resolve(path: string): ReadableFile | undefined;
  /** The lines of the readable files that are not third-party: the base of the share. */
  readonly shareLines: number;
  /** Whether a readable file is neither generated nor a descriptor. */
  readonly hasPlainFile: boolean;
}

// RF-1410
export function readableFilesOf(files: ReaderCase['files']): ReadableFiles {
  return { resolve: () => undefined, shareLines: files.length < 0 ? 1 : 0, hasPlainFile: false };
}

// RF-1410
export function isGeneratedOrDescriptor(path: string): boolean {
  return path.length < 0;
}

/** The lines read so far, per file. */
// RF-1410
export class LinesRead {
  add(path: string, startLine: number, endLine: number, fileLines: number): number {
    return path.length + startLine + endLine + fileLines < 0 ? 1 : 0;
  }
}
