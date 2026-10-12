import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { StatusBadge } from '../../../web/src/components/StatusBadge';
import { badgeSpecs, stateLists } from '../../../web/src/components/badge-specs';

const architecture = await readFile(
  new URL('../../../docs/architecture.md', import.meta.url),
  'utf8',
);

// design-system.md sections 6 and 13: one badge component for every state list, glyph and word
// together; the map covers every value of every state list of architecture.md section 5.

/** The state lists of architecture.md section 5: list name -> values, read from the table. */
function documentedStateLists(): Record<string, string[]> {
  const section = architecture.slice(architecture.indexOf('**State lists** (canonical)'));
  const table = section.slice(0, section.indexOf('\n## '));
  const lists: Record<string, string[]> = {};
  for (const row of table.split('\n')) {
    const cells = row.split('|').map((cell) => cell.trim());
    const name = /^`(\w+)`$/.exec(cells[1] ?? '')?.[1];
    if (name === undefined) continue;
    lists[name] = [...(cells[2] ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '');
  }
  return lists;
}

const statusLists = [
  'ClaimStatus',
  'OpenQuestionState',
  'AgentTaskState',
  'RunEndState',
  'RunQueueState',
  'AccountState',
  'CallStatus',
] as const;

describe('RNF-010 status badge map', () => {
  const documented = documentedStateLists();

  it('RNF-010 reads the ten state lists of architecture section 5', () => {
    expect(Object.keys(documented).sort()).toEqual(
      [
        'AccountState',
        'AgentTaskState',
        'CardType',
        'ClaimStatus',
        'Confidence',
        'MapLevel',
        'OpenQuestionState',
        'Role',
        'RunEndState',
        'RunQueueState',
      ].sort(),
    );
  });

  it('RNF-010 has an entry for every value of every documented state list', () => {
    for (const [list, values] of Object.entries(documented)) {
      const specs: unknown = Reflect.get(badgeSpecs, list);
      expect(specs, `list ${list}`).toBeTypeOf('object');
      expect(Object.keys(specs as object).sort(), `values of ${list}`).toEqual([...values].sort());
    }
  });

  it('RNF-010 gives every value of a status list a glyph, a label and a tone', () => {
    for (const list of statusLists) {
      for (const [value, spec] of Object.entries(badgeSpecs[list])) {
        expect(spec.glyph, `${list}.${value} glyph`).toBeDefined();
        expect(spec.label, `${list}.${value} label`).not.toBe('');
        expect(['neutral', 'ok', 'warn', 'danger', 'info', 'brand']).toContain(spec.tone);
        expect(['tint', 'solid']).toContain(spec.weight);
      }
    }
  });

  it('RNF-010 follows the tone and weight table of design-system section 6', () => {
    expect(badgeSpecs.ClaimStatus.Supported).toMatchObject({ tone: 'ok', weight: 'solid' });
    expect(badgeSpecs.ClaimStatus.Rejected).toMatchObject({ tone: 'danger', weight: 'solid' });
    expect(badgeSpecs.ClaimStatus.Proposed).toMatchObject({ tone: 'neutral', weight: 'tint' });
    expect(badgeSpecs.AgentTaskState.Running).toMatchObject({ tone: 'info', weight: 'solid' });
    expect(badgeSpecs.AgentTaskState.StoppedByCap).toMatchObject({ tone: 'warn', weight: 'solid' });
    expect(badgeSpecs.RunEndState.CapReached).toMatchObject({ tone: 'warn', weight: 'solid' });
    expect(badgeSpecs.RunEndState.Interrupted).toMatchObject({ tone: 'neutral', weight: 'solid' });
    expect(badgeSpecs.OpenQuestionState.Open).toMatchObject({ tone: 'warn', weight: 'tint' });
    expect(badgeSpecs.CallStatus.failed).toMatchObject({ tone: 'danger', weight: 'solid' });
    expect(badgeSpecs.CallStatus['refused-by-cap']).toMatchObject({
      tone: 'warn',
      weight: 'solid',
    });
  });

  it('RNF-010 lists the same values in the value lists and in the map', () => {
    for (const [list, values] of Object.entries(stateLists)) {
      const specs: unknown = Reflect.get(badgeSpecs, list);
      expect(Object.keys(specs as object).sort(), list).toEqual([...values].sort());
    }
  });
});

describe('RNF-010 StatusBadge', () => {
  it('RNF-010 shows the word as the label and hides the glyph from assistive technology', () => {
    render(<StatusBadge list="ClaimStatus" value="CitationInvalid" />);
    const badge = screen.getByTestId('status-badge');
    expect(badge.textContent).toBe('Citation invalid');
    expect(badge.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(badge.getAttribute('data-tone')).toBe('danger');
    expect(badge.getAttribute('data-weight')).toBe('tint');
  });

  it('RNF-010 marks the running state with the live dot', () => {
    render(<StatusBadge list="AgentTaskState" value="Running" />);
    expect(screen.getByTestId('status-badge').querySelector('.rst-live-dot')).not.toBeNull();
  });

  it('RNF-010 puts an optional detail such as an HTTP status before the word', () => {
    render(<StatusBadge list="CallStatus" value="failed" detail="429" />);
    expect(screen.getByTestId('status-badge').textContent).toBe('429 Failed');
  });

  it('RNF-010 shows a classification such as a role as a word without a glyph', () => {
    render(<StatusBadge list="Role" value="admin" />);
    const badge = screen.getByTestId('status-badge');
    expect(badge.textContent).toBe('admin');
    expect(badge.querySelector('svg')).toBeNull();
  });
});
