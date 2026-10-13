import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { listAudit, type AuditQuery } from '../api/admin.js';
import type { AuditEvent, AuditPage, ListedAccount } from '../api/admin-schemas.js';
import type { ApiFailure } from '../api/client.js';
import { useApp } from '../app/app-context.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Glyph } from '../components/Glyph.js';
import { secondsText } from './admin-format.js';
import { AuditFilters, noFilters, periodText } from './AuditFilters.js';
import { useAdminOverview } from './use-admin-overview.js';
import { ScrollRegion } from './ScrollRegion.js';

// RF-1109, design-system.md section 14 (administration: audit): the last 30 days of the audit
// trail, newest first, filtered by user, action, period and outcome (AuditFilters.tsx). The actor
// and the target of a row are shown by user name. Passwords and keys are never recorded, so there
// is nothing of them to show. The cap banner is the shell's (SignedInShell.tsx).

type Loaded =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly page: AuditPage };

/** The events of the query; a new query clears the list so rows of the old one never linger. */
function useAuditEvents(query: AuditQuery): Loaded {
  const { client } = useApp();
  const [state, setState] = useState<Loaded>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    setState({ status: 'loading' });
    void listAudit(client, query, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setState(
        result.ok
          ? { status: 'ready', page: result.value }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client, query]);
  return state;
}

const outcomeStyle = {
  ok: { tone: 'ok', glyph: 'check' },
  refused: { tone: 'danger', glyph: 'cross' },
  failed: { tone: 'warn', glyph: 'exclamation' },
} as const;

function Outcome({ outcome }: { readonly outcome: AuditEvent['outcome'] }): JSX.Element {
  const { tone, glyph } = outcomeStyle[outcome];
  return (
    <span class={`rst-badge rst-badge--${tone}-tint`}>
      <Glyph name={glyph} />
      {outcome}
    </span>
  );
}

function nameOf(users: readonly ListedAccount[], id: string): string {
  return users.find((user) => user.id === id)?.userName ?? id;
}

function targetText(event: AuditEvent, users: readonly ListedAccount[]): string {
  if (event.targetType === null) return '-';
  if (event.targetId === null) return event.targetType;
  const id = event.targetType === 'user' ? nameOf(users, event.targetId) : event.targetId;
  return `${event.targetType} ${id}`;
}

function EventRow(props: { readonly event: AuditEvent; readonly users: readonly ListedAccount[] }) {
  const { event, users } = props;
  return (
    <tr>
      <td class="rst-mono">{secondsText(event.at)}</td>
      <td>{event.actorUserId === null ? 'anonymous' : nameOf(users, event.actorUserId)}</td>
      <td class="rst-mono">{event.action}</td>
      <td>{targetText(event, users)}</td>
      <td class="rst-mono">{event.ip}</td>
      <td>
        <Outcome outcome={event.outcome} />
      </td>
    </tr>
  );
}

function plural(count: number): string {
  return `${String(count)} ${count === 1 ? 'event' : 'events'}`;
}

function Events(props: {
  readonly page: AuditPage;
  readonly users: readonly ListedAccount[];
  readonly days: string;
}) {
  const { page, users, days } = props;
  if (page.events.length === 0) {
    return <EmptyState message={`No events match these filters in ${periodText(days)}.`} />;
  }
  return (
    <>
      <ScrollRegion label="Audit events table">
        <table class="rst-table">
          <caption class="rst-visually-hidden">Audit events</caption>
          <thead>
            <tr>
              <th scope="col">Time (UTC)</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Target</th>
              <th scope="col">IP address</th>
              <th scope="col">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {page.events.map((event) => (
              <EventRow key={event.id} event={event} users={users} />
            ))}
          </tbody>
        </table>
      </ScrollRegion>
      <p class="rst-settings__note">
        {page.truncated
          ? `Showing the newest ${plural(page.events.length)} of ${periodText(days)}. Narrow the filters to see older ones.`
          : `Showing ${plural(page.events.length)} · newest first`}
      </p>
    </>
  );
}

function AuditView(props: { readonly users: readonly ListedAccount[] }): JSX.Element {
  const { users } = props;
  const [query, setQuery] = useState(noFilters);
  const loaded = useAuditEvents(query);
  return (
    <>
      <AuditFilters query={query} users={users} onChange={setQuery} />
      <section class="rst-card rst-audit__events">
        {loaded.status === 'loading' ? (
          <p class="rst-loading" role="status">
            Loading the events
          </p>
        ) : null}
        {loaded.status === 'failed' ? <ErrorBanner error={loaded.error} /> : null}
        {loaded.status === 'ready' ? (
          <Events page={loaded.page} users={users} days={query.days} />
        ) : null}
      </section>
    </>
  );
}

// RF-1109
export function AdminAuditPage(): JSX.Element {
  const { overview } = useAdminOverview();
  return (
    <div class="rst-settings rst-admin">
      <div>
        <h1 class="rst-page__title">Audit</h1>
        <p class="rst-settings__lead">
          Sign-ins, account and key changes, and refused requests from the last 30 days. Passwords
          and keys are never recorded.
        </p>
      </div>
      {overview.status === 'loading' ? (
        <p class="rst-loading" role="status">
          Loading the accounts
        </p>
      ) : null}
      {overview.status === 'failed' ? <ErrorBanner error={overview.error} /> : null}
      {overview.status === 'ready' ? <AuditView users={overview.users} /> : null}
    </div>
  );
}
