import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { LOCAL_OLLAMA_MODEL } from '../../../web/src/pages/local-roles.js';
import { failure, json, type Answer } from './fake-api.js';
import {
  cloudEstimate,
  estimatePath,
  projectPath,
  runAnswer,
  runsPath,
} from './start-run-fixtures.js';
import {
  consentLabel,
  describedText,
  input,
  ready,
  renderStart,
  start,
} from './start-run-helpers.js';
import {
  allLocalRoles,
  oneCloudRole,
  twoCloudProviders,
  uploadProject,
  uploadProjectAnswer,
  uploadProjectOnOllama,
} from './start-run-private-fixtures.js';

// RF-132, RF-143, RF-1001, DEC-118, DEC-148: the second confirmation of the start page, shown for
// a project of kind `upload` whose roles would send code to a cloud provider. It is separate from
// the cloud consent, names the project and each provider, offers one link that switches every
// role to Ollama, and holds Start off until both boxes are ticked.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const noticeName = /Your code is private/u;
const privateLabel = /^I understand that my own code from OrderDesk/u;
const switchName = /every role to Ollama/u;
const uploadAnswers = (estimate: unknown): Readonly<Record<string, Answer>> => ({
  [`GET ${projectPath}`]: uploadProjectAnswer,
  [`GET ${estimatePath}`]: json(200, estimate),
});

function roleField(body: unknown, field: string): readonly unknown[] {
  if (typeof body !== 'object' || body === null || !('roles' in body)) return [];
  const { roles } = body;
  if (typeof roles !== 'object' || roles === null) return [];
  return Object.values(roles).map((role: unknown): unknown => {
    if (typeof role !== 'object' || role === null) return undefined;
    const value: unknown = Reflect.get(role, field);
    return value;
  });
}

const roleProviders = (body: unknown) => roleField(body, 'provider');
const roleModels = (body: unknown) => roleField(body, 'model');

it('RF-132 an uploaded project with a cloud role shows a second notice that names the project and the provider', async () => {
  renderStart(uploadAnswers(oneCloudRole));
  await ready();

  const notice = screen.getByRole('region', { name: noticeName });

  expect(notice.textContent).toContain('OrderDesk');
  expect(notice.textContent).toContain('OpenAI');
  expect(screen.getByText(/Code will leave this machine/u)).not.toBeNull();
  expect(input(privateLabel).checked).toBe(false);
});

it('RF-132 the notice names each cloud provider once', async () => {
  renderStart(uploadAnswers(twoCloudProviders));
  await ready();

  const notice = screen.getByRole('region', { name: noticeName });

  expect(notice.textContent).toContain('OpenAI and Anthropic');
});

it('RF-132 Start stays off until both boxes are ticked, and says which is missing', async () => {
  renderStart(uploadAnswers(oneCloudRole));
  await ready();

  expect(start().disabled).toBe(true);
  fireEvent.click(input(consentLabel));
  expect(start().disabled).toBe(true);
  expect(start().title).toContain('private');
  fireEvent.click(input(privateLabel));
  expect(start().disabled).toBe(false);
});

it('RF-132 ticking only the private-code box leaves Start off because the cloud consent is missing', async () => {
  renderStart(uploadAnswers(oneCloudRole));
  await ready();

  fireEvent.click(input(privateLabel));

  expect(start().disabled).toBe(true);
  expect(start().title).toBe('Confirm the OpenAI notice above to start the run');
});

it('RF-132 the request carries both confirmations', async () => {
  const { calls } = renderStart({
    ...uploadAnswers(oneCloudRole),
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();
  fireEvent.click(input(consentLabel));
  fireEvent.click(input(privateLabel));

  fireEvent.click(start());

  await screen.findByTestId('run-notice');
  expect(calls.at(-1)?.body).toEqual({
    stage: 'understand',
    areas: ['Catalog', 'Models'],
    cloudConsent: true,
    privateCodeConfirmed: true,
  });
});

it('RF-132 an uploaded project whose roles are all local shows neither confirmation', async () => {
  renderStart(uploadAnswers(allLocalRoles));
  await ready();

  expect(screen.queryByText(/Code will leave this machine/u)).toBeNull();
  expect(screen.queryByRole('region', { name: noticeName })).toBeNull();
  expect(start().disabled).toBe(false);
});

it('RF-132 a scan of an uploaded project with cloud roles asks neither confirmation', async () => {
  renderStart(uploadAnswers(oneCloudRole));
  await ready();

  fireEvent.click(input('Scan only'));

  expect(screen.queryByRole('region', { name: noticeName })).toBeNull();
  expect(start().disabled).toBe(false);
});

it('RF-132 a GitHub project with a cloud role shows no second notice and sends no such field', async () => {
  const { calls } = renderStart({
    [`GET ${estimatePath}`]: json(200, cloudEstimate),
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();

  expect(screen.queryByRole('region', { name: noticeName })).toBeNull();
  fireEvent.click(input(consentLabel));
  fireEvent.click(start());
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm and start' }));

  await screen.findByTestId('run-notice');
  expect(calls.at(-1)?.body).toEqual({
    stage: 'understand',
    areas: ['Catalog', 'Models'],
    cloudConsent: true,
  });
});

it('RF-132 a refusal for the missing private-code confirmation shows its code next to the checkbox', async () => {
  renderStart({
    ...uploadAnswers(oneCloudRole),
    [`POST ${runsPath}`]: failure(400, 'RST-1521'),
  });
  await ready();
  fireEvent.click(input(consentLabel));
  fireEvent.click(input(privateLabel));

  fireEvent.click(start());

  await waitFor(() => {
    expect(describedText(input(privateLabel))).toContain('RST-1521');
  });
});

it('RF-132 DEC-118 an Ollama server on another host: the server asks for the consent and both notices then show', async () => {
  renderStart({
    ...uploadAnswers(allLocalRoles),
    [`POST ${runsPath}`]: failure(400, 'RST-1515'),
  });
  await ready();
  expect(screen.queryByRole('region', { name: noticeName })).toBeNull();

  fireEvent.click(start());

  const notice = await screen.findByRole('region', { name: noticeName });
  expect(notice.textContent).toContain('Ollama');
});

it('RF-132 the link is a button that switches every role to Ollama, with no further confirmation', async () => {
  let saved = false;
  const { calls } = renderStart({
    [`GET ${projectPath}`]: () => json(200, saved ? uploadProjectOnOllama : uploadProject),
    [`GET ${estimatePath}`]: () => json(200, saved ? allLocalRoles : oneCloudRole),
    [`PUT ${projectPath}/settings`]: () => {
      saved = true;
      return json(200, uploadProjectOnOllama);
    },
  });
  await ready();
  const notice = screen.getByRole('region', { name: noticeName });

  fireEvent.click(within(notice).getByRole('button', { name: switchName }));

  await waitFor(() => {
    expect(screen.queryByRole('region', { name: noticeName })).toBeNull();
  });
  const put = calls.find((call) => call.method === 'PUT');
  expect(put?.ifMatch).toBe('"1"');
  expect(roleProviders(put?.body)).toEqual(['ollama', 'ollama', 'ollama', 'ollama']);
  expect(roleModels(put?.body)).toEqual(Array(4).fill(LOCAL_OLLAMA_MODEL));
  expect(screen.queryByText(/Code will leave this machine/u)).toBeNull();
  await waitFor(() => {
    expect(start().disabled).toBe(false);
  });
});

it('RF-132 a failed switch keeps the notice and shows the error', async () => {
  renderStart({
    ...uploadAnswers(oneCloudRole),
    [`PUT ${projectPath}/settings`]: failure(409, 'RST-1007'),
  });
  await ready();

  fireEvent.click(screen.getByRole('button', { name: switchName }));

  const banner = await screen.findByTestId('error-banner');
  expect(banner.textContent).toContain('RST-1007');
  expect(screen.getByRole('region', { name: noticeName })).not.toBeNull();
});

it('RF-132 a GitHub project does not offer the switch link', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, cloudEstimate) });
  await ready();

  expect(screen.queryByRole('button', { name: switchName })).toBeNull();
});

it('RF-132 DEC-118 after the switch the notices an Ollama refusal had raised go away', async () => {
  let saved = false;
  renderStart({
    [`GET ${projectPath}`]: () => json(200, saved ? uploadProjectOnOllama : uploadProject),
    [`GET ${estimatePath}`]: json(200, allLocalRoles),
    [`POST ${runsPath}`]: failure(400, 'RST-1515'),
    [`PUT ${projectPath}/settings`]: () => {
      saved = true;
      return json(200, uploadProjectOnOllama);
    },
  });
  await ready();
  fireEvent.click(start());
  const notice = await screen.findByRole('region', { name: noticeName });

  fireEvent.click(within(notice).getByRole('button', { name: switchName }));

  await waitFor(() => {
    expect(screen.queryByRole('region', { name: noticeName })).toBeNull();
  });
});

it('RF-128 RF-132 an uploaded project with a source and a cloud role shows the source and the second confirmation together', async () => {
  renderStart(uploadAnswers(oneCloudRole));
  await ready();

  expect(screen.getByRole('heading', { name: 'Source' })).not.toBeNull();
  expect(screen.getByText('OrderDesk (zip, 19 Oct 2026)')).not.toBeNull();
  expect(screen.getByRole('region', { name: noticeName })).not.toBeNull();
  fireEvent.click(input(consentLabel));
  fireEvent.click(input(privateLabel));
  expect(start().disabled).toBe(false);
});

it('RF-128 RF-132 an uploaded project with no source keeps Start off even with both boxes ticked', async () => {
  renderStart({
    ...uploadAnswers(oneCloudRole),
    [`GET ${projectPath}`]: json(200, { ...uploadProject, source: null }),
  });
  await ready();

  fireEvent.click(input(consentLabel));
  fireEvent.click(input(privateLabel));

  expect(start().disabled).toBe(true);
  expect(start().title).toContain('Upload a zip first');
});

it('RF-132 DEC-151 the link names the model it sets, taken from the one constant', async () => {
  renderStart(uploadAnswers(oneCloudRole));
  await ready();
  const notice = screen.getByRole('region', { name: noticeName });

  const link = within(notice).getByRole('button', { name: switchName });

  expect(link.textContent).toContain(LOCAL_OLLAMA_MODEL);
  expect(LOCAL_OLLAMA_MODEL).toBe('gemma4:e4b');
});
