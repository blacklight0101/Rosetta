import { fireEvent, screen } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { json, type Answer } from './fake-api.js';
import { projectOf } from './project-fixtures.js';
import { estimatePath, projectPath, runAnswer, runsPath } from './start-run-fixtures.js';
import { consentLabel, input, ready, renderStart, start } from './start-run-helpers.js';
import {
  allLocalRoles,
  oneCloudRole,
  twoCloudProviders,
  uploadProject,
} from './start-run-private-fixtures.js';

// RF-132, RF-157, DEC-150: the second confirmation of the start page for a project of kind `workbook`
// (and for a zip that holds workbooks) says that cell values, formulas and macros will be sent to
// each cloud provider. A zip without workbooks keeps the wording about code (RF-132).

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const noticeName = /Your workbook data is private/u;
const workbookLabel = /^I understand that cell values, formulas and macros from Pricing/u;
const codeNoticeName = /Your code is private/u;

const workbookProject = projectOf('p-1', 'Pricing', {
  ...{ sourceKind: 'workbook', sourceUrl: '', settings: uploadProject['settings'] },
  source: { fileName: 'Pricing.xlsx', uploadedAt: '2026-10-19T09:00:00.000Z', workbooks: 3 },
});
const zipWithWorkbooks = {
  ...uploadProject,
  source: { fileName: 'orderdesk.zip', uploadedAt: '2026-10-19T09:00:00.000Z', workbooks: 2 },
};
const zipWithoutWorkbooks = {
  ...uploadProject,
  source: { fileName: 'orderdesk.zip', uploadedAt: '2026-10-19T09:00:00.000Z', workbooks: 0 },
};

const answers = (project: unknown, estimate: unknown): Readonly<Record<string, Answer>> => ({
  [`GET ${projectPath}`]: json(200, project),
  [`GET ${estimatePath}`]: json(200, estimate),
});

it('RF-157 a workbook project with a cloud role names the cell values, formulas and macros, the project and the provider', async () => {
  renderStart(answers(workbookProject, oneCloudRole));
  await ready();

  const notice = screen.getByRole('region', { name: noticeName });

  expect(notice.textContent).toContain(
    'Cell values, formulas and macros from Pricing will be sent to OpenAI.',
  );
  expect(notice.textContent).not.toContain('your own code');
  expect(screen.queryByRole('region', { name: codeNoticeName })).toBeNull();
  expect(input(workbookLabel).checked).toBe(false);
});

it('RF-157 the notice names each cloud provider once', async () => {
  renderStart(answers(workbookProject, twoCloudProviders));
  await ready();

  const notice = screen.getByRole('region', { name: noticeName });

  expect(notice.textContent).toContain(
    'Cell values, formulas and macros from Pricing will be sent to OpenAI and Anthropic.',
  );
});

it('RF-157 Start stays off until both boxes are ticked', async () => {
  renderStart(answers(workbookProject, oneCloudRole));
  await ready();

  expect(start().disabled).toBe(true);
  fireEvent.click(input(consentLabel));
  expect(start().disabled).toBe(true);
  expect(start().title).toContain('private');
  fireEvent.click(input(workbookLabel));
  expect(start().disabled).toBe(false);
});

it('RF-157 the request carries both confirmations', async () => {
  const { calls } = renderStart({
    ...answers(workbookProject, oneCloudRole),
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();
  fireEvent.click(input(consentLabel));
  fireEvent.click(input(workbookLabel));

  fireEvent.click(start());

  await screen.findByTestId('run-notice');
  expect(calls.at(-1)?.body).toMatchObject({ cloudConsent: true, privateCodeConfirmed: true });
});

it('RF-157 a workbook project whose roles are all local shows neither confirmation', async () => {
  renderStart(answers(workbookProject, allLocalRoles));
  await ready();

  expect(screen.queryByRole('region', { name: noticeName })).toBeNull();
  expect(start().disabled).toBe(false);
});

it('RF-157 a zip that holds workbooks gets the workbook wording', async () => {
  renderStart(answers(zipWithWorkbooks, oneCloudRole));
  await ready();

  const notice = screen.getByRole('region', { name: noticeName });

  expect(notice.textContent).toContain(
    'Cell values, formulas and macros from OrderDesk will be sent to OpenAI.',
  );
});

it('RF-132 a zip without workbooks keeps the wording about code', async () => {
  renderStart(answers(zipWithoutWorkbooks, oneCloudRole));
  await ready();

  const notice = screen.getByRole('region', { name: codeNoticeName });

  expect(notice.textContent).toContain('Excerpts of your own code from OrderDesk');
  expect(screen.queryByRole('region', { name: noticeName })).toBeNull();
});

it('RF-132 a zip whose source does not say how many workbooks it holds keeps the wording about code', async () => {
  renderStart(answers(uploadProject, oneCloudRole));
  await ready();

  expect(screen.getByRole('region', { name: codeNoticeName })).not.toBeNull();
});
