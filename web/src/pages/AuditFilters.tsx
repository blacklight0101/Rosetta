import type { JSX } from 'preact';
import type { AuditQuery } from '../api/admin.js';
import type { ListedAccount } from '../api/admin-schemas.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { auditActions } from './audit-actions.js';

// RF-1109, P1-107, design-system.md section 14 (administration: audit, AdminAudit.dc.html): the
// filters of the audit view. User and action, the period (the last 24 hours, 7 days or 30 days) and
// the outcome; Clear filters goes back to every event of the last 30 days.

export const noFilters: AuditQuery = { userId: '', action: '', days: '30', outcome: '' };

const periods: readonly { readonly value: string; readonly label: string }[] = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

const outcomes: readonly { readonly value: string; readonly label: string }[] = [
  { value: '', label: 'All outcomes' },
  { value: 'ok', label: 'ok' },
  { value: 'refused', label: 'refused' },
  { value: 'failed', label: 'failed' },
];

/** `the last 24 hours`, `the last 7 days`: the window of a query, for a sentence. */
export function periodText(days: string): string {
  return days === '1' ? 'the last 24 hours' : `the last ${days} days`;
}

interface AuditFiltersProps {
  readonly query: AuditQuery;
  readonly users: readonly ListedAccount[];
  readonly onChange: (query: AuditQuery) => void;
}

type FilterKey = keyof AuditQuery;

interface FilterSelect {
  readonly key: FilterKey;
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

function selectsOf(users: readonly ListedAccount[]): readonly FilterSelect[] {
  return [
    {
      key: 'userId',
      label: 'User',
      options: [
        { value: '', label: 'All users' },
        ...users.map((user) => ({ value: user.id, label: user.userName })),
      ],
    },
    {
      key: 'action',
      label: 'Action',
      options: [
        { value: '', label: 'All actions' },
        ...auditActions.map((action) => ({ value: action, label: action })),
      ],
    },
    { key: 'days', label: 'Period', options: periods },
    { key: 'outcome', label: 'Outcome', options: outcomes },
  ];
}

const fieldIds: Readonly<Record<FilterKey, string>> = {
  userId: 'audit-user',
  action: 'audit-action',
  days: 'audit-period',
  outcome: 'audit-outcome',
};

// RF-1109
export function AuditFilters({ query, users, onChange }: AuditFiltersProps): JSX.Element {
  return (
    <section class="rst-card rst-audit__filters" aria-label="Filters">
      {selectsOf(users).map(({ key, label, options }) => (
        <Field
          key={key}
          kind="select"
          id={fieldIds[key]}
          label={label}
          value={query[key]}
          options={options}
          onChange={(value) => {
            onChange({ ...query, [key]: value });
          }}
        />
      ))}
      <Button
        onClick={() => {
          onChange(noFilters);
        }}
      >
        Clear filters
      </Button>
    </section>
  );
}
