import { describe, expect, it } from 'vitest';
import type { SourceFetcher } from '../../src/application/ports/source-fetcher.js';
import type { GitHubRepoRef } from '../../src/domain/sources/github-repo-ref.js';
import { parseGitHubUrl } from '../../src/domain/sources/github-repo-ref.js';

export interface SourceFetcherHarness {
  readonly fetcher: SourceFetcher;
  /** A public repository the fetcher knows, with the commit its default branch resolves to. */
  readonly known: {
    readonly url: string;
    readonly owner: string;
    readonly repo: string;
    readonly commitSha: string;
  };
  /** A repository that is private or does not exist. */
  readonly missingUrl: string;
}

function ref(url: string): GitHubRepoRef {
  const parsed = parseGitHubUrl(url);
  if (!parsed.ok) throw new Error(`The contract URL ${url} does not parse: ${parsed.error}`);
  return parsed.value;
}

/** Contract of the SourceFetcher port (ADR-012): the real adapter and the fake must both pass it. */
export function sourceFetcherContract(
  name: string,
  create: () => Promise<SourceFetcherHarness>,
): void {
  describe(`SourceFetcher contract: ${name}`, () => {
    it('RF-121 resolves the default branch to the full commit SHA of the repository', async () => {
      const { fetcher, known } = await create();

      const snapshot = await fetcher.fetch(ref(known.url), new AbortController().signal);

      expect(snapshot).toMatchObject({
        owner: known.owner,
        repo: known.repo,
        commitSha: known.commitSha,
        url: `https://github.com/${known.owner}/${known.repo}`,
        cached: false,
      });
      expect(snapshot.snapshotHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(snapshot.key).toBe(
        `${known.owner.toLowerCase()}__${known.repo.toLowerCase()}@${known.commitSha}`,
      );
    });

    it('RF-122 fetching the same commit again reuses the cached snapshot', async () => {
      const { fetcher, known } = await create();
      const signal = new AbortController().signal;
      const first = await fetcher.fetch(ref(known.url), signal);

      const second = await fetcher.fetch(ref(known.url), signal);

      expect(second.cached).toBe(true);
      expect(second.rootDir).toBe(first.rootDir);
      expect(second.snapshotHash).toBe(first.snapshotHash);
    });

    it('RF-120 a private or missing repository stops with RST-1903', async () => {
      const { fetcher, missingUrl } = await create();

      await expect(
        fetcher.fetch(ref(missingUrl), new AbortController().signal),
      ).rejects.toMatchObject({ code: 'RST-1903' });
    });

    it('RF-127 an aborted signal stops the fetch', async () => {
      const { fetcher, known } = await create();
      const controller = new AbortController();
      controller.abort();

      await expect(fetcher.fetch(ref(known.url), controller.signal)).rejects.toThrow();
    });
  });
}
