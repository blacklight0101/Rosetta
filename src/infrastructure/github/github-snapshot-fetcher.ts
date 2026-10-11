import { rm } from 'node:fs/promises';
import type { Clock } from '../../application/ports/clock.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import type { Logger } from '../../application/ports/logger.js';
import type {
  Snapshot,
  SnapshotInfo,
  SourceFetcher,
} from '../../application/ports/source-fetcher.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { parseCommitSha, type CommitSha } from '../../domain/sources/commit-sha.js';
import {
  repositoryUrl,
  snapshotKey,
  type GitHubRepoRef,
} from '../../domain/sources/github-repo-ref.js';
import { GitHubApi, type RepositoryInfo } from './github-api.js';
import { GitHubHttpClient, type FetchFunction } from './github-http-client.js';
import { SnapshotStore } from './snapshot-store.js';
import {
  DEFAULT_EXTRACTION_LIMITS,
  extractTarball,
  tooLarge,
  type ExtractionLimits,
} from './tarball-extractor.js';

export interface GitHubSnapshotFetcherOptions {
  readonly dataDir: string;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly logger: Logger;
  /** The optional read-only GITHUB_TOKEN (RF-123). */
  readonly githubToken: string | undefined;
  readonly fetch?: FetchFunction;
  readonly limits?: Partial<ExtractionLimits>;
  readonly requestTimeoutMs?: number;
  readonly downloadTimeoutMs?: number;
}

interface DownloadTarget {
  readonly ref: GitHubRepoRef;
  readonly repository: RepositoryInfo;
  readonly refName: string;
  readonly sha: CommitSha;
  readonly key: string;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const SECURITY_CODES: ReadonlySet<string> = new Set([
  ERROR_CODES.snapshotTooLarge,
  ERROR_CODES.snapshotEntryRefused,
]);

/**
 * Resolves a GitHub URL to a commit through the REST API, downloads that commit's tarball over https
 * from GitHub hosts only, extracts it with the ADR-019 filter into a partial folder, and publishes
 * it read-only under `<data>/sources/<owner>__<repo>@<sha>/`. A cached commit is served without
 * network; concurrent fetches of one commit share a single download.
 */
// RF-005, RF-120, RF-121, RF-122, RF-123, RF-126, RF-127
export class GitHubSnapshotFetcher implements SourceFetcher {
  private readonly api: GitHubApi;
  private readonly store: SnapshotStore;
  private readonly clock: Clock;
  private readonly idGenerator: IdGenerator;
  private readonly logger: Logger;
  private readonly limits: ExtractionLimits;
  private readonly downloadTimeoutMs: number;
  private readonly inFlight = new Map<string, Promise<Snapshot>>();

  constructor(options: GitHubSnapshotFetcherOptions) {
    const client = new GitHubHttpClient({
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      token: options.githubToken,
      logger: options.logger,
    });
    this.api = new GitHubApi(client, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
    this.store = new SnapshotStore(options.dataDir);
    this.clock = options.clock;
    this.idGenerator = options.idGenerator;
    this.logger = options.logger;
    this.limits = { ...DEFAULT_EXTRACTION_LIMITS, ...options.limits };
    this.downloadTimeoutMs = options.downloadTimeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS;
  }

  async fetch(ref: GitHubRepoRef, signal: AbortSignal): Promise<Snapshot> {
    const pinned = ref.ref === undefined ? undefined : parseCommitSha(ref.ref);
    if (pinned?.ok === true) {
      const existing = await this.store.readExisting(snapshotKey(ref, pinned.value));
      if (existing !== undefined) return existing;
    }
    const repository = await this.api.repository(ref, signal);
    const refName = ref.ref ?? repository.defaultBranch;
    const sha = await this.api.commitSha(ref, refName, signal);
    const key = snapshotKey(repository, sha);
    const existing = await this.store.readExisting(key);
    if (existing !== undefined) return existing;
    return this.locked(key, () => this.download({ ref, repository, refName, sha, key }, signal));
  }

  /** Start-up: deletes every partial folder left by an interrupted download (RF-122). */
  discardPartialFolders(): Promise<string[]> {
    return this.store.discardPartials();
  }

  private locked(key: string, work: () => Promise<Snapshot>): Promise<Snapshot> {
    const running = this.inFlight.get(key);
    if (running !== undefined) return running;
    const task = work().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, task);
    return task;
  }

  private async download(target: DownloadTarget, signal: AbortSignal): Promise<Snapshot> {
    const partial = await this.store.createPartial(this.idGenerator.uuid());
    try {
      const body = await this.openArchive(target, signal);
      const extracted = await extractTarball(body, partial.filesDir, this.limits, signal);
      const summary = await this.store.inspect(partial.filesDir);
      const info: SnapshotInfo = {
        url: repositoryUrl(target.repository),
        owner: target.repository.owner,
        repo: target.repository.repo,
        commitSha: target.sha.value,
        resolvedFrom: target.refName,
        downloadedAt: this.clock.now().toISOString(),
        ...summary,
        skippedLinks: extracted.skippedLinks,
        licence: target.repository.licence,
      };
      await this.store.writeInfo(partial.dir, info);
      await this.reportSkippedLinks(target.key, extracted.skippedLinks);
      return await this.publish(partial.dir, target.key, info);
    } catch (error) {
      await rm(partial.dir, { recursive: true, force: true });
      await this.reportFailure(target.key, error);
      throw error;
    }
  }

  private async openArchive(
    target: DownloadTarget,
    signal: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const response = await this.api.tarball(target.ref, target.sha, {
      signal,
      timeoutMs: this.downloadTimeoutMs,
    });
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > this.limits.maxBytes) {
      await response.body?.cancel();
      throw tooLarge('bytes', this.limits.maxBytes);
    }
    if (response.body === null) {
      throw new RosettaError(ERROR_CODES.githubRequestFailed, 'GitHub sent an empty archive.');
    }
    return response.body;
  }

  private async publish(partialDir: string, key: string, info: SnapshotInfo): Promise<Snapshot> {
    const moved = await this.store.commit(partialDir, key);
    if (moved) {
      await this.store.makeReadOnly(this.store.snapshotDir(key));
      await this.logger.log({
        level: 'info',
        logger: 'github',
        message: `Snapshot ${key} downloaded and cached.`,
        data: {
          fileCount: info.fileCount,
          totalBytes: info.totalBytes,
          resolvedFrom: info.resolvedFrom,
        },
      });
      return { ...info, key, rootDir: this.store.filesDir(key), cached: false };
    }
    const existing = await this.store.readExisting(key);
    if (existing === undefined) {
      throw new RosettaError(ERROR_CODES.snapshotWriteFailed, `The snapshot ${key} vanished.`);
    }
    return existing;
  }

  private async reportSkippedLinks(key: string, skippedLinks: number): Promise<void> {
    if (skippedLinks === 0) return;
    await this.logger.securityEvent(ERROR_CODES.snapshotEntryRefused, {
      message: `Skipped ${String(skippedLinks)} link entries while extracting ${key}.`,
      data: { snapshot: key, skippedLinks },
    });
  }

  private async reportFailure(key: string, error: unknown): Promise<void> {
    if (!(error instanceof RosettaError) || !SECURITY_CODES.has(error.code)) return;
    await this.logger.securityEvent(error.code, {
      message: `${error.message} The partial download of ${key} was deleted.`,
      data: { snapshot: key },
    });
  }
}
