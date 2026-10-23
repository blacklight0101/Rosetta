import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import {
  cloudEstimate,
  estimatePath,
  ownKeyEstimate,
  projectPath,
  projectWithCap,
  runAnswer,
  runsPath,
  unpricedEstimate,
} from './start-run-fixtures.js';
import {
  consentLabel,
  describedText,
  input,
  priced,
  ready,
  renderStart,
  start,
} from './start-run-helpers.js';

// RF-1001, RF-425, RF-1104, DEC-117, P1-107: the start page polish. The meter says which models the
// likely cost leaves out, a role on the server's key warns that the run may be refused, and the
// confirm threshold stands next to the run cap: a cap below it is refused before any request, and
// both are saved together.

const thresholdLabel = 'Ask before a run estimated above (USD)';

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

it('RF-1001 shows the confirm threshold of the project next to the run cap', async () => {
  renderStart(priced);
  await ready();

  expect(input(thresholdLabel).value).toBe('0.25');
  expect(input('Run cap (USD)').value).toBe('0.50');
});

it('RF-1001 a run cap below the confirm threshold is refused next to the threshold without a request', async () => {
  const { calls } = renderStart(priced);
  await ready();

  fireEvent.input(input('Run cap (USD)'), { target: { value: '0.10' } });
  fireEvent.click(input(consentLabel));
  fireEvent.click(start());

  await waitFor(() => {
    expect(input(thresholdLabel).getAttribute('aria-invalid')).toBe('true');
  });
  expect(describedText(input(thresholdLabel))).toContain('not be above the run cap');
  expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
});

it('RF-1001 a lowered threshold is saved with the lowered cap before the run starts', async () => {
  const { calls } = renderStart({
    ...priced,
    [`PUT ${projectPath}/settings`]: json(200, projectWithCap(100_000)),
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();

  fireEvent.input(input('Run cap (USD)'), { target: { value: '0.10' } });
  fireEvent.input(input(thresholdLabel), { target: { value: '0.05' } });
  fireEvent.click(input(consentLabel));
  fireEvent.click(start());

  await screen.findByTestId('run-notice');
  const saved = calls.find((call) => call.method === 'PUT');
  expect(saved?.body).toMatchObject({
    budget: { run: { maxCostMicros: 100_000 }, confirmAboveCostMicros: 50_000 },
  });
});

it('RF-1001 a threshold the server refuses shows next to the threshold field', async () => {
  const { calls } = renderStart({
    ...priced,
    [`PUT ${projectPath}/settings`]: failure(400, 'RST-1005', [
      { field: 'budget.confirmAboveCostMicros', code: 'RST-1006' },
    ]),
  });
  await ready();

  fireEvent.input(input(thresholdLabel), { target: { value: '0.20' } });
  fireEvent.click(input(consentLabel));
  fireEvent.click(start());

  await waitFor(() => {
    expect(input(thresholdLabel).getAttribute('aria-invalid')).toBe('true');
  });
  expect(describedText(input(thresholdLabel))).toContain('RST-1006');
  expect(calls.some((call) => call.path === runsPath)).toBe(false);
});

it('RF-1001 a threshold that is not an amount is refused next to its field without a request', async () => {
  const { calls } = renderStart(priced);
  await ready();

  fireEvent.input(input(thresholdLabel), { target: { value: 'soon' } });
  fireEvent.click(input(consentLabel));
  fireEvent.click(start());

  await waitFor(() => {
    expect(input(thresholdLabel).getAttribute('aria-invalid')).toBe('true');
  });
  expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
});
