import { parentPort, workerData } from 'node:worker_threads';
import { z } from 'zod';
import type { searchFiles } from './grep-search.js';

// RF-146: a thin shell that runs the search in its own thread, so the caller can stop it. The
// runner passes the URL of the search module (`.ts` from source, `.js` from the build), because
// Node.js does not map a `.js` import to a `.ts` file when it runs the source.

const input = z.object({
  searchModule: z.string(),
  pattern: z.string(),
  files: z.array(z.object({ path: z.string(), lines: z.array(z.string()) })),
});

const searchModule = z.object({
  searchFiles: z.custom<typeof searchFiles>((value) => typeof value === 'function'),
});

const data = input.parse(workerData);
const search = searchModule.parse(await import(data.searchModule));
parentPort?.postMessage(search.searchFiles(data));
