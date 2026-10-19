import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect } from 'vitest';
import { ProjectsPage } from '../../../web/src/pages/ProjectsPage.js';
import { json, renderPage, type Answer, type RenderedPage } from './fake-api.js';
import { overviewRow, projectOf } from './project-fixtures.js';

// P3-39, RF-128, RF-134: the Projects page with its Upload a zip tab, over the fake API and the
// fake upload server. A zip starts with the local file header signature PK\x03\x04.

const noProjects = json(200, { projects: [], truncated: false });

/** The project `POST /api/projects` makes for an upload: it has no source until the zip arrives. */
export const sourceless = projectOf('p-9', 'OrderDesk', {
  sourceUrl: '',
  sourceKind: 'upload',
  source: null,
});

export const withSource = projectOf('p-9', 'OrderDesk', {
  sourceUrl: '',
  sourceKind: 'upload',
  source: { fileName: 'OrderDesk.zip', uploadedAt: '2026-10-19T08:00:00.000Z' },
});

export const summaryBody = {
  files: 70,
  size: 3_200_000,
  skipped: 12,
  snapshotHash: 'a'.repeat(64),
};

export function zipFile(name = 'OrderDesk.zip'): File {
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
  return new File([bytes], name, { type: 'application/zip' });
}

/** A file that claims a size without holding the bytes. */
export function sizedFile(name: string, size: number): File {
  const file = zipFile(name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

export function renderUploadTab(answers: Readonly<Record<string, Answer>> = {}): RenderedPage {
  const view = renderPage(<ProjectsPage />, {
    'GET /api/projects/overview': noProjects,
    ...answers,
  });
  fireEvent.click(screen.getByRole('tab', { name: 'Upload a zip' }));
  return view;
}

export function chooseFile(file: File): void {
  const field = screen.getByLabelText('Zip file');
  fireEvent.change(field, { target: { files: [file] } });
}

export const uploadButton = (): HTMLElement => screen.getByRole('button', { name: 'Upload zip' });

export const overview = (...projects: Record<string, unknown>[]): Response =>
  json(200, { projects: projects.map((project) => overviewRow(project)), truncated: false });

export function nameField(): HTMLInputElement {
  const field = screen.getByLabelText('Project name');
  if (!(field instanceof HTMLInputElement)) throw new Error('The name field is not an input.');
  return field;
}

/** Chooses a zip and waits until the form accepts it. */
export async function chooseValid(name = 'OrderDesk.zip'): Promise<void> {
  chooseFile(zipFile(name));
  await waitFor(() => {
    expect(uploadButton().hasAttribute('disabled')).toBe(false);
  });
}

export async function sendOne(server: { readonly requests: readonly unknown[] }): Promise<void> {
  fireEvent.click(uploadButton());
  await waitFor(() => {
    expect(server.requests.length).toBeGreaterThan(0);
  });
}
