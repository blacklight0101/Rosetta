import { z } from 'zod';
import { DATA_BLOCK_CLOSE, DATA_BLOCK_OPEN } from '../../../domain/egress/data-block.js';

// RF-1404, RF-145: the capture reads the data blocks of a saved message back. A block starts at a
// line `<<<ROSETTA-DATA <tag> {json}>>>` and ends only at the line that carries the same tag; any
// other line that looks like a marker is part of the text, as the model is told.

export interface ReadDataBlock {
  readonly source: string;
  readonly excerpts: readonly {
    readonly path: string;
    readonly startLine: number;
    readonly endLine: number;
  }[];
  readonly text: string;
}

const header = z.object({
  source: z.string(),
  excerpts: z
    .array(z.object({ path: z.string(), startLine: z.number().int(), endLine: z.number().int() }))
    .default([]),
});

const END = '<<<END ROSETTA-DATA ';

function openedBy(line: string): { tag: string; json: string } | undefined {
  if (!line.startsWith(DATA_BLOCK_OPEN) || !line.endsWith(DATA_BLOCK_CLOSE)) return undefined;
  const rest = line.slice(DATA_BLOCK_OPEN.length, line.length - DATA_BLOCK_CLOSE.length);
  const space = rest.indexOf(' ');
  if (space <= 0) return undefined;
  return { tag: rest.slice(0, space), json: rest.slice(space + 1) };
}

function headerOf(json: string): z.infer<typeof header> | undefined {
  try {
    const parsed = header.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

// RF-1404
export function readDataBlocks(message: string): ReadDataBlock[] {
  const lines = message.split('\n');
  const blocks: ReadDataBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const open = openedBy(lines[index] ?? '');
    const head = open === undefined ? undefined : headerOf(open.json);
    if (open === undefined || head === undefined) continue;
    const end = lines.indexOf(`${END}${open.tag}${DATA_BLOCK_CLOSE}`, index + 1);
    if (end < 0) continue;
    blocks.push({ ...head, text: lines.slice(index + 1, end).join('\n') });
    index = end;
  }
  return blocks;
}
