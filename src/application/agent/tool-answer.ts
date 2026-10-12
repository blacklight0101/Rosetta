import type { Citation } from '../../domain/cards/citation.js';
import type { ErrorCode } from '../../domain/errors/codes.js';
import type { Result } from '../../domain/errors/result.js';

// RF-201: a tool's answer before it is rendered as a data block.

export interface ToolData {
  /** The file lines the text holds, for the block header and the egress log (RF-142). */
  readonly excerpts: readonly Citation[];
  readonly text: string;
}

/** What the model is told when a call cannot be served; `message` says what to change. */
export interface ToolError {
  readonly code: ErrorCode;
  readonly message: string;
}

export type ToolAnswer = Result<ToolData, ToolError>;
