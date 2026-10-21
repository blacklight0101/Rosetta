import { z } from 'zod';
import type { AgentToolSet } from '../../src/application/agent/agent-tool-set.js';
import type { FileEntry } from '../../src/domain/code-map/file-entry.js';

// RF-206: tools over a list of area files for the tests of the read gate. A read of a listed file
// returns its whole line range as an excerpt, so the gate counts the file as read.

const pathArguments = z.object({ path: z.string() });

function pathOf(args: unknown): string {
  const parsed = pathArguments.safeParse(args);
  return parsed.success ? parsed.data.path : '';
}

export function toolsOver(files: readonly FileEntry[]): AgentToolSet {
  return {
    definitions: [],
    areaOverview: () => 'overview',
    readableAreaFiles: () => files.map((file) => file.path),
    readableAreaEntries: () => files,
    renderBlock: (_source, text) => text,
    rowSpans: () => Promise.resolve(undefined),
    run(call) {
      const path = pathOf(call.arguments);
      const file = files.find((each) => each.path === path);
      const excerpts = file === undefined ? [] : [{ path, startLine: 1, endLine: file.lines }];
      return Promise.resolve({ content: `read ${path}`, excerpts });
    },
  };
}
