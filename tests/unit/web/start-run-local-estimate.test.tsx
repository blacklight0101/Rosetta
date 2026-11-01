import { fireEvent, screen, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { json } from './fake-api.js';
import {
  cloudEstimate,
  estimateOf,
  estimatePath,
  localEstimate,
  projectPath,
  roleOf,
  runAnswer,
  runsPath,
} from './start-run-fixtures.js';
import { projectWithTokenCap } from './start-run-limit-fixtures.js';
import { describedText, input, ready, renderStart, start, opened } from './start-run-helpers.js';

// RF-425 (Q-51, P3-79): the start page estimate for roles on a local model reads in tokens, with the
// sentence about the cap in the unit of the cap it is compared with; priced roles keep dollars; a
// mix shows each role in its unit and the total in both; counts read "1 area" and "2 areas".

const meter = (): HTMLElement => screen.getByRole('meter', { name: /against the cap/u });
const table = (): HTMLElement => screen.getByRole('table', { name: 'Estimate per role' });

const twoPriced = estimateOf([
  roleOf({
    role: 'reader',
    provider: 'openai',
    kind: 'openai',
    model: 'gpt-5-nano',
    keySource: 'user',
    costs: ['120000', '390000', '800000'],
  }),
  roleOf({
    role: 'verifier',
    provider: 'openai',
    kind: 'openai',
    model: 'gpt-5-nano',
    keySource: 'user',
    costs: ['10000', '20000', '40000'],
  }),
]);

it('RF-425 with every role local the estimate is in tokens and no dollar figure is shown', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, localEstimate) });
  await ready();

  const reader = within(table()).getByRole('row', { name: /reader/u });
  expect(within(reader).getByText('11,000 tokens')).not.toBeNull();
  expect(within(reader).getByText('22,000 tokens')).not.toBeNull();
  expect(within(reader).getByText('44,000 tokens')).not.toBeNull();
  expect(table().textContent).not.toContain('$');
  const total = within(table()).getByRole('row', { name: /Total/u });
  expect(within(total).getByText('88,000 tokens')).not.toBeNull();
});

it('RF-425 with every role local the cap sentence is in tokens against the run token cap', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, localEstimate) });
  await ready();

  const text = describedText(meter());

  expect(text).toContain('Likely 44,000 tokens is 2% of the run token cap of 2,000,000 tokens');
  expect(text).toContain('the marker shows the high estimate, 88,000 tokens');
  expect(text).not.toContain('$');
});

it('RF-425 with every role local the summary bar shows the likely tokens, not dollars', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, localEstimate) });
  await ready();

  const bar = screen.getByTestId('run-summary');

  expect(bar.textContent).toContain('Likely 44,000 tokens');
  expect(bar.textContent).not.toContain('$');
});

it('RF-425 a priced reader keeps dollars in the table and in the cap sentence', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, twoPriced) });
  await ready();

  const reader = within(table()).getByRole('row', { name: /reader/u });
  expect(within(reader).getByText('$0.39')).not.toBeNull();
  expect(within(reader).getByText('22,000 tokens')).not.toBeNull();
  const text = describedText(meter());
  expect(text).toContain('Likely $0.41 is 82% of the cap');
  expect(text).not.toContain('token cap');
});

it('RF-425 a mix shows each role in its unit and the total in both', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, cloudEstimate) });
  await ready();

  const reader = within(table()).getByRole('row', { name: /reader/u });
  expect(within(reader).getByText('$0.39')).not.toBeNull();
  const verifier = within(table()).getByRole('row', { name: /verifier/u });
  expect(within(verifier).getAllByText(/ tokens$/u)).toHaveLength(3);
  expect(verifier.textContent).not.toContain('$');
  const total = within(table()).getByRole('row', { name: /Total/u });
  expect(within(total).getByText('$0.39')).not.toBeNull();
  expect(within(total).getByText('44,000 tokens')).not.toBeNull();
  expect(describedText(meter())).toContain('Likely $0.39 is 78% of the cap');
});

it('RF-425 the assumptions read 2 areas for two', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, localEstimate) });
  await ready();

  expect(screen.getByText(/Assumptions:/u).textContent).toContain('Assumptions: 2 areas, ');
});

it('RF-425 the assumptions read 1 area for one', async () => {
  const areas = [{ name: 'Catalog', estimatedTokens: 12_000, files: 5, thirdParty: false }];
  renderStart({ [`GET ${estimatePath}`]: json(200, { ...localEstimate, areas }) });
  await ready();

  const note = screen.getByText(/Assumptions:/u).textContent;
  expect(note).toContain('Assumptions: 1 area, ');
  expect(note).not.toContain('1 areas');
});

// P5-07: a local run costs nothing, so the start page asks for a token cap and never for dollars.
const budgetOf = (doc: Record<string, unknown>): Record<string, unknown> =>
  (doc['settings'] as { budget: Record<string, unknown> }).budget;

const estimateCard = (): HTMLElement => {
  const card = document.querySelector<HTMLElement>('[aria-labelledby="estimate-heading"]');
  if (card === null) throw new Error('No estimate card.');
  return card;
};

it('P5-07 a local-only estimate shows the run token cap field and no dollar field', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, localEstimate) });
  await ready();

  expect(input('Run cap (tokens)').value).toBe('2000000');
  expect(screen.queryByLabelText(/Run cap \(USD\)/u)).toBeNull();
  expect(screen.queryByLabelText(/Ask before a run estimated above/u)).toBeNull();
  expect(estimateCard().textContent).not.toContain('$');
  expect(estimateCard().textContent).not.toContain('USD');
});

it('P5-07 saving the token cap changes only maxTokens and leaves the dollar settings', async () => {
  const { calls } = renderStart({
    [`GET ${estimatePath}`]: json(200, localEstimate),
    [`PUT ${projectPath}/settings`]: json(200, projectWithTokenCap(500_000)),
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();

  fireEvent.input(input('Run cap (tokens)'), { target: { value: '500000' } });
  fireEvent.click(start());

  await opened();
  const put = calls.find((call) => call.method === 'PUT');
  const before = budgetOf(projectWithTokenCap(2_000_000));
  expect(budgetOf({ settings: put?.body })).toEqual({
    ...before,
    run: { ...(before['run'] as object), maxTokens: 500_000 },
  });
});

it('P5-07 a token cap that is not a whole number is refused next to its field', async () => {
  const { calls } = renderStart({ [`GET ${estimatePath}`]: json(200, localEstimate) });
  await ready();

  fireEvent.input(input('Run cap (tokens)'), { target: { value: 'lots' } });
  fireEvent.click(start());

  await screen.findByText(/whole number of tokens/u);
  expect(calls.some((call) => call.method !== 'GET')).toBe(false);
});

it('P5-07 a mixed estimate keeps both dollar fields and no token field', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, cloudEstimate) });
  await ready();

  expect(input('Run cap (USD)').value).toBe('0.50');
  expect(input('Ask before a run estimated above (USD)').value).toBe('0.25');
  expect(screen.queryByLabelText('Run cap (tokens)')).toBeNull();
});
