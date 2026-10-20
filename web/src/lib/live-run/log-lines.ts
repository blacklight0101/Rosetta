import type { RunEvent } from '../../api/run-events.js';
import { usageData } from './event-data.js';
import { costLabel, tokensLabel } from './format.js';
import { logText } from './log-text.js';
import type { LogLine, UsageDetail, VerdictDetail } from './run-state.js';

// RF-1002, RF-1003: the lines of the verbose event log. An event is a line with its text; a usage
// event says its role, calls, tokens and cost in words (never micro-dollars), and the usage lines
// that follow each other for one role are one line; a verdict keeps its whole reason beside the
// text, which is cut, so the page can open it in full.

const plural = (count: number, one: string): string =>
  `${String(count)} ${count === 1 ? one : `${one}s`}`;

/** `verifier · 3 calls · 360 tokens · $0.0015`; `no price` when no call had one. */
function usageText(usage: UsageDetail): string {
  const cost = usage.costMicros === undefined ? 'no price' : costLabel(usage.costMicros);
  return `${usage.role} · ${plural(usage.calls, 'call')} · ${tokensLabel(usage.tokens)} tokens · ${cost}`;
}

function usageOf(event: RunEvent): UsageDetail {
  const parsed = usageData.safeParse(event.data);
  const data = parsed.success ? parsed.data : {};
  const tokens = (data.tokens?.inputTokens ?? 0) + (data.tokens?.outputTokens ?? 0);
  return {
    kind: 'usage',
    role: data.role ?? 'model',
    calls: 1,
    tokens,
    costMicros: data.costMicros,
  };
}

function verdictOf(event: RunEvent): VerdictDetail | undefined {
  const { claimId, status, reason } = event.data;
  if (typeof claimId !== 'string' || typeof status !== 'string') return undefined;
  return { kind: 'verdict', claimId, status, reason: typeof reason === 'string' ? reason : '' };
}

function lineOf(event: RunEvent, area: string): LogLine {
  const { seq, at, type } = event;
  if (type === 'usage.recorded') {
    const usage = usageOf(event);
    return { seq, at, type, text: usageText(usage), detail: usage };
  }
  const verdict = type === 'verify.claim.judged' ? verdictOf(event) : undefined;
  const text = logText(event, area);
  return verdict === undefined ? { seq, at, type, text } : { seq, at, type, text, detail: verdict };
}

function merged(last: UsageDetail, next: UsageDetail): UsageDetail {
  const costs = [last.costMicros, next.costMicros].filter((cost) => cost !== undefined);
  return {
    ...last,
    calls: last.calls + next.calls,
    tokens: last.tokens + next.tokens,
    costMicros: costs.length === 0 ? undefined : costs.reduce((sum, cost) => sum + cost, 0),
  };
}

/** The log with the line of this event added; usage lines in a row for one role become one line. */
// RF-1003
export function withLine(
  log: readonly LogLine[],
  event: RunEvent,
  area: string,
): readonly LogLine[] {
  const line = lineOf(event, area);
  const last = log.at(-1);
  if (line.detail?.kind !== 'usage' || last?.detail?.kind !== 'usage') return [...log, line];
  if (last.detail.role !== line.detail.role) return [...log, line];
  const usage = merged(last.detail, line.detail);
  return [...log.slice(0, -1), { ...line, text: usageText(usage), detail: usage }];
}
