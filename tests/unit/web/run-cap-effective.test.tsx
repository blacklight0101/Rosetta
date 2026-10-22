import { render, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { estimateSchema } from '../../../web/src/api/estimate-schemas.js';
import { effectiveRunCapMicros, usesServerKeys } from '../../../web/src/lib/run-cap.js';
import { ServerRunCapNote } from '../../../web/src/pages/ServerRunCapNote.js';
import { cloudEstimate, ownKeyEstimate } from './start-run-fixtures.js';

// RF-1106, DEC-107 (P3-91): the start page and the project settings name the run cap that applies
// to a run on the server's keys when the administrator's run cap is lower than the project's. An
// own key runs under the project's cap alone, so no administrator line is shown for it.

const server = estimateSchema.parse(cloudEstimate);
const own = estimateSchema.parse(ownKeyEstimate);

it('RF-1106 a run on server keys takes the administrator run cap when it is lower than the project cap', () => {
  expect(usesServerKeys(server)).toBe(true);
  expect(
    effectiveRunCapMicros({ typed: 5_000_000n, administrator: 500_000n, serverKeys: true }),
  ).toBe(500_000n);
});

it('RF-1106 an own key run keeps the project cap even when the administrator run cap is lower', () => {
  expect(usesServerKeys(own)).toBe(false);
  expect(
    effectiveRunCapMicros({ typed: 5_000_000n, administrator: 500_000n, serverKeys: false }),
  ).toBe(5_000_000n);
});

it('RF-1106 a project cap lower than the administrator run cap stays the effective cap', () => {
  expect(
    effectiveRunCapMicros({ typed: 300_000n, administrator: 500_000n, serverKeys: true }),
  ).toBe(300_000n);
});

it('RF-1106 the start page names the administrator run cap for a server-key estimate', () => {
  render(<ServerRunCapNote serverKeys administrator={500_000n} typed={5_000_000n} where="start" />);

  expect(screen.getByTestId('server-run-cap-note').textContent).toContain(
    "the run cap is $0.50, the administrator's run cap",
  );
  expect(screen.getByTestId('server-run-cap-note').textContent).toContain('$5.00');
});

it('RF-1106 the project settings name the administrator run cap, lower than the cap typed there', () => {
  render(
    <ServerRunCapNote
      serverKeys={false}
      administrator={500_000n}
      typed={5_000_000n}
      where="settings"
    />,
  );

  expect(screen.getByTestId('server-run-cap-note').textContent).toContain('$0.50');
  expect(screen.getByTestId('server-run-cap-note').textContent).toContain('Only the administrator');
});

it('RF-1106 no administrator line for an own-key run or when the administrator cap is not lower', () => {
  const { container: ownRun } = render(
    <ServerRunCapNote
      serverKeys={false}
      administrator={500_000n}
      typed={5_000_000n}
      where="start"
    />,
  );
  const { container: higher } = render(
    <ServerRunCapNote serverKeys administrator={9_000_000n} typed={5_000_000n} where="start" />,
  );

  expect(ownRun.textContent).toBe('');
  expect(higher.textContent).toBe('');
});
