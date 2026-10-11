import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import { z } from 'zod';
import type { searchFiles } from './grep-search.js';

// RF-146, ADR-013: a thin shell that runs the search in its own thread, so the caller can stop it.
// The search module sits next to this file (`.ts` from source, `.js` from the build), and the
// worker derives its URL from its own location: nothing in the input names a module to load.

const input = z.object({
  pattern: z.string(),
  files: z.array(z.object({ path: z.string(), lines: z.array(z.string()) })),
});

const searchModule = z.object({
  searchFiles: z.custom<typeof searchFiles>((value) => typeof value === 'function'),
});

const extension = extname(fileURLToPath(import.meta.url));
const searchModuleUrl = new URL(`./grep-search${extension}`, import.meta.url).href;

const data = input.parse(workerData);
const search = searchModule.parse(await import(searchModuleUrl));
parentPort?.postMessage(search.searchFiles(data));
