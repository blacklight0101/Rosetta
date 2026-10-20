import { z } from 'zod';
import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunTextFiles } from '../ports/run-text-files.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-230, RF-1005, RF-1105: Read run coverage gives the run page the files of every area of a run
// with the lines read of each (none for a file not read), from the run's `coverage.json` (data-model
// 3.8). A run without the file, a torn one or one of another version has no areas yet. Another
// user's run id and an unknown id give the same answer, `not-found`. Paths and notes are
// repository and model text: the page shows them as text.

const lines = z.object({ startLine: z.number().int(), endLine: z.number().int() });

const coverageSchema = z.object({
  schemaVersion: z.literal(1),
  areas: z.array(
    z.object({
      area: z.string(),
      files: z.array(z.object({ path: z.string(), read: z.array(lines) })),
      note: z.string().optional(),
      failure: z.string().optional(),
    }),
  ),
});

export type CoverageListing = Pick<z.output<typeof coverageSchema>, 'areas'>;

export interface ReadRunCoverageDependencies {
  readonly runs: Pick<RunIndex, 'find'>;
  readonly files: RunTextFiles;
}

function listingOf(text: string | undefined): CoverageListing {
  if (text === undefined) return { areas: [] };
  try {
    const parsed = coverageSchema.safeParse(JSON.parse(text));
    return parsed.success ? { areas: parsed.data.areas } : { areas: [] };
  } catch {
    // A torn file holds no listing yet: the run rewrites it after every task that ends.
    return { areas: [] };
  }
}

export class ReadRunCoverage {
  private readonly deps: ReadRunCoverageDependencies;

  constructor(deps: ReadRunCoverageDependencies) {
    this.deps = deps;
  }

  // RF-230, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<CoverageListing, 'not-found'>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    return ok(listingOf(await this.deps.files.read(scopeOf(run), 'coverage.json')));
  }
}
