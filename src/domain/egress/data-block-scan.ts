import type { Citation } from '../cards/citation.js';
import type { Result } from '../errors/result.js';

// RF-142, RF-145: reads the data blocks of a message back (see data-block.ts).

export interface DataBlockScan {
  /** How many well-formed blocks the text holds. */
  readonly blocks: number;
  /** The excerpts of every block, in order. */
  readonly excerpts: readonly Citation[];
  /** Whether any non-blank text stands outside the blocks. */
  readonly textOutside: boolean;
  /**
   * The text cut at the header and footer lines: joined with line breaks they give the content
   * back. The text between frames is masked as one piece, so a secret pattern never eats a frame.
   */
  readonly parts: readonly DataBlockPart[];
}

export interface DataBlockPart {
  /** A header or footer line. */
  readonly frame: boolean;
  readonly text: string;
}

export type DataBlockProblem = 'malformed-block';

// RF-145
export function scanDataBlocks(_content: string): Result<DataBlockScan, DataBlockProblem> {
  throw new Error('not implemented');
}
