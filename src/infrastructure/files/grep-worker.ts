import { parentPort, workerData } from 'node:worker_threads';
import { z } from 'zod';

// RF-146: runs a model-supplied pattern in its own thread so the caller can stop it after the
// timeout. Self-contained (no relative imports) so Node.js can start it from source or from dist.

const input = z.object({
  pattern: z.string(),
  files: z.array(z.object({ path: z.string(), lines: z.array(z.string()) })),
});

function search(data: z.infer<typeof input>): unknown {
  let expression: RegExp;
  try {
    expression = new RegExp(data.pattern);
  } catch (error: unknown) {
    return { kind: 'invalid-pattern', detail: error instanceof Error ? error.message : '' };
  }
  const matches: { path: string; line: number }[] = [];
  for (const file of data.files) {
    file.lines.forEach((text, index) => {
      if (expression.test(text)) matches.push({ path: file.path, line: index + 1 });
    });
  }
  return { kind: 'matches', matches };
}

parentPort?.postMessage(search(input.parse(workerData)));
