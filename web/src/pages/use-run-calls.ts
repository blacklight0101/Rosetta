import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { CallRow, RunCalls } from '../api/call-schemas.js';
import { getRunCalls } from '../api/calls.js';
import type { ApiClient, ApiFailure } from '../api/client.js';
import { useApp } from '../app/app-context.js';

// RF-1011, P5-22: the calls of a run, a page at a time. The first page shows at once; the next page
// is read when the person asks for it. While the run goes on the page asks again every few seconds
// for what follows the calls it holds: the summary and the total are always the log's, and the new
// calls join the list when no page the person has not asked for yet lies between. The repeating
// stops with the first answer that says the run has ended, and when the page is left.

type CallsHead = Omit<RunCalls, 'calls' | 'nextCursor'>;

export type RunCallsLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | {
      readonly status: 'ready';
      readonly head: CallsHead;
      readonly calls: readonly CallRow[];
      /** Calls of the log that are not in the list yet. */
      readonly hasMore: boolean;
      readonly loadingMore: boolean;
      readonly loadMore: () => void;
    };

const POLL_MS = 2000;

interface Held {
  readonly head: CallsHead;
  readonly calls: readonly CallRow[];
  readonly hasMore: boolean;
}

interface Feed {
  readonly onHeld: (held: Held) => void;
  readonly onFailed: (error: ApiFailure) => void;
}

/** The pages read so far and the reads that add to them, one after the other. */
class CallsFeed {
  private calls: readonly CallRow[] = [];
  private chain: Promise<void> = Promise.resolve();
  private over = false;
  private readonly client: ApiClient;
  private readonly runId: string;
  private readonly signal: AbortSignal;
  private readonly feed: Feed;

  constructor(client: ApiClient, runId: string, signal: AbortSignal, feed: Feed) {
    this.client = client;
    this.runId = runId;
    this.signal = signal;
    this.feed = feed;
  }

  /** True once the run has ended or the first read failed: nothing more to poll. */
  get finished(): boolean {
    return this.over;
  }

  /** Reads follow one another, so a page asked for while one is on its way is not lost. */
  read(append: boolean): Promise<void> {
    this.chain = this.chain.then(() => this.once(append));
    return this.chain;
  }

  private stopped(): boolean {
    return this.signal.aborted;
  }

  private async once(append: boolean): Promise<void> {
    if (this.stopped()) return;
    const cursor = this.calls.length === 0 ? undefined : String(this.calls.at(-1)?.seq ?? 0);
    const result = await getRunCalls(this.client, this.runId, cursor, this.signal);
    if (this.stopped()) return;
    if (!result.ok) {
      // A first read that fails shows its error and is not repeated.
      if (this.calls.length === 0) {
        this.over = true;
        this.feed.onFailed(result.error);
      }
      return;
    }
    this.take(result.value, append);
  }

  private take(answer: RunCalls, append: boolean): void {
    const { calls: page, nextCursor, ...head } = answer;
    // A page the person has not asked for is not added while another page lies behind it.
    if (append || this.calls.length === 0 || nextCursor === undefined) {
      this.calls = [...this.calls, ...page];
    }
    this.over = head.runState === 'Ended';
    this.feed.onHeld({ head, calls: this.calls, hasMore: this.calls.length < head.total });
  }
}

// RF-1011
export function useRunCalls(runId: string): RunCallsLoad {
  const { client } = useApp();
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const [held, setHeld] = useState<Held | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const reading = useRef<(append: boolean) => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const feed = new CallsFeed(client, runId, abort.signal, {
      onHeld: setHeld,
      onFailed: setFailure,
    });
    reading.current = (append) => feed.read(append);
    const tick = async (): Promise<void> => {
      await feed.read(false);
      if (abort.signal.aborted || feed.finished) return;
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [client, runId]);
  const loadMore = useCallback(() => {
    setLoadingMore(true);
    void reading.current(true).finally(() => {
      setLoadingMore(false);
    });
  }, []);
  if (held !== undefined) return { status: 'ready', ...held, loadingMore, loadMore };
  return failure === undefined ? { status: 'loading' } : { status: 'failed', error: failure };
}
