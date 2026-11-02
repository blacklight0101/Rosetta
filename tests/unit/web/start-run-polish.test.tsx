import { screen } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { json } from './fake-api.js';
import {
  cloudEstimate,
  estimatePath,
  ownKeyEstimate,
  unpricedEstimate,
} from './start-run-fixtures.js';
import { describedText, ready, renderStart } from './start-run-helpers.js';

// RF-1001, RF-425, RF-1104, DEC-117, P1-107: the start page polish. The meter says which models the
// likely cost leaves out, a role on the server's key warns that the run may be refused, and the
// confirm threshold stands next to the run cap: a cap below it is refused before any request, and
// both are saved together.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

it('RF-425 the cap meter says that the likely cost leaves out a model without a price', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, unpricedEstimate) });
  await ready();

  const meter = screen.getByRole('meter', { name: 'Likely cost against the cap' });

  expect(describedText(meter)).toContain('leaves out anthropic / claude-mystery');
});

it('RF-425 the cap meter names no excluded model when every model has a price', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, cloudEstimate) });
  await ready();

  const meter = screen.getByRole('meter', { name: 'Likely cost against the cap' });

  expect(describedText(meter)).not.toContain('leaves out');
});

it("RF-1104 a role on the server's key warns that the run may be refused without a server key", async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, cloudEstimate) });
  await ready();

  const note = screen.getByTestId('server-key-note');

  expect(note.textContent).toContain("OpenAI runs on the server's key");
  expect(note.textContent).toContain('RST-2302');
  expect(screen.getByRole('link', { name: 'Settings and keys' }).getAttribute('href')).toBe(
    '/settings',
  );
});

it('RF-1104 no server key warning when every role uses the own key or a local model', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, ownKeyEstimate) });
  await ready();

  expect(screen.queryByTestId('server-key-note')).toBeNull();
});
