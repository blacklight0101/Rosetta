import type { LlmProvider } from '../application/ports/llm-provider.js';
import { ERROR_CODES } from '../domain/errors/codes.js';
import { RosettaError } from '../domain/errors/rosetta-error.js';
import type { Environment } from '../infrastructure/config/environment.js';
import type { FetchFunction } from '../infrastructure/github/github-http-client.js';

// RNF-005, ADR-008, DEC-112: the injection points of the end-to-end tests. The composition root
// accepts a fake GitHub (the `fetch` the snapshot fetcher uses) and a fake provider only as a
// `TestDoubles`, and the only way to make one is `TestDoubles.create`, which refuses unless the
// environment has ROSETTA_TEST=1. `main.ts` never makes one, so a real deployment cannot reach them.

export interface TestDoubleParts {
  /** The fake GitHub: answers the REST API and the archive host in process. */
  readonly fetch?: FetchFunction;
  /** The fake provider (ADR-008). */
  readonly provider?: LlmProvider;
}

// RNF-005
export class TestDoubles {
  readonly fetch: FetchFunction | undefined;
  readonly provider: LlmProvider | undefined;

  private constructor(parts: TestDoubleParts) {
    this.fetch = parts.fetch;
    this.provider = parts.provider;
  }

  /** Throws RST-1500 unless the environment is in test mode. */
  static create(environment: Pick<Environment, 'test'>, parts: TestDoubleParts): TestDoubles {
    TestDoubles.requireTestMode(environment);
    return new TestDoubles(parts);
  }

  /** The composition root calls this before it uses any double. */
  static requireTestMode(environment: Pick<Environment, 'test'>): void {
    if (!environment.test) throw new RosettaError(ERROR_CODES.fakeProviderRefused);
  }
}
