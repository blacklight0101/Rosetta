import { render, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { RunEndBadge } from '../../../web/src/components/RunEndBadge.js';
import { StatusBadge } from '../../../web/src/components/StatusBadge.js';

// P7-02, DEC-194, design-system section 6: a capped run that left areas unread reads "Partly read".

it('P7-02 shows Partly read for a CapReached run with unread areas', () => {
  render(<RunEndBadge endState="CapReached" unreadAreas={3} />);

  expect(screen.getByTestId('status-badge').textContent).toBe('Partly read');
});

it('P7-02 shows Cap reached for a CapReached run that read every area', () => {
  render(<RunEndBadge endState="CapReached" unreadAreas={0} />);

  expect(screen.getByTestId('status-badge').textContent).toBe('Cap reached');
});

it('P7-02 gives Partly read the warn tone with a glyph', () => {
  render(<StatusBadge list="RunPartlyRead" value="PartlyRead" />);
  const badge = screen.getByTestId('status-badge');

  expect(badge.getAttribute('data-tone')).toBe('warn');
  expect(badge.querySelector('svg')).not.toBeNull();
});
