import type { ToolDefinition } from '../ports/llm-provider.js';
import { maxPathChars, maxQueryChars } from './tool-limits.js';

// RF-201, ADR-006: the reader's tool set. Every tool is read-only; there is no tool that writes,
// runs a command or reaches the network. The definitions come from code only and never carry
// repository text (RF-145): the egress guard does not mask them.

export const readerToolNames = ['list_area_files', 'read_file', 'grep', 'codemap_query'] as const;
export type ReaderToolName = (typeof readerToolNames)[number];

const path = {
  type: 'string',
  maxLength: maxPathChars,
  description: 'Relative to the repository root, with forward slashes.',
};
const line = { type: 'integer', minimum: 1, description: '1-based line number.' };

export const readerToolDefinitions: readonly ToolDefinition[] = [
  {
    name: 'list_area_files',
    description: 'Lists the files of your area with their language and line count.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_file',
    description: 'Returns lines startLine to endLine (inclusive) of one file of the repository.',
    parameters: {
      type: 'object',
      properties: { path, startLine: line, endLine: line },
      required: ['path', 'startLine', 'endLine'],
      additionalProperties: false,
    },
  },
  {
    name: 'grep',
    description:
      'Finds the lines that match a JavaScript regular expression, optionally only in files that match a gitignore-style pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', maxLength: maxQueryChars },
        pathGlob: { type: 'string', maxLength: maxQueryChars },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
  {
    name: 'codemap_query',
    description:
      'Tells what the code map knows about a symbol name or a file: symbols, links, SQL statements and entities. Give either symbol or path.',
    parameters: {
      type: 'object',
      properties: { symbol: { type: 'string', maxLength: maxQueryChars }, path },
      additionalProperties: false,
    },
  },
];

export function isReaderToolName(name: string): name is ReaderToolName {
  return readerToolNames.some((known) => known === name);
}
