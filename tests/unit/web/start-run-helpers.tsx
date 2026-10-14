import { screen } from '@testing-library/preact';
import { StartRunPage } from '../../../web/src/pages/StartRunPage.js';
import { json, renderPage, type Answer, type RenderedPage } from './fake-api.js';
import {
  estimatePath,
  localEstimate,
  projectAnswer,
  projectPath,
  roomyLimits,
} from './start-run-fixtures.js';

// The start page under test (P1-34): the real page over the fake API of fake-api.tsx, with the
// answers every test needs (a project, a local estimate, nothing spent) unless it replaces them.

const baseAnswers: Readonly<Record<string, Answer>> = {
  [`GET ${projectPath}`]: projectAnswer,
  [`GET ${estimatePath}`]: json(200, localEstimate),
  'GET /api/account/limits': roomyLimits,
};

export const renderStart = (answers: Readonly<Record<string, Answer>> = {}): RenderedPage =>
  renderPage(<StartRunPage />, { ...baseAnswers, ...answers }, undefined, { projectId: 'p-1' });

export const consentLabel = 'I understand; send masked excerpts to OpenAI for this run';

export const start = (): HTMLButtonElement => {
  const button = screen.getByRole('button', { name: /^Start run/u });
  if (!(button instanceof HTMLButtonElement)) throw new Error('Start is not a button.');
  return button;
};

export const input = (label: string | RegExp): HTMLInputElement => {
  const field = screen.getByLabelText(label);
  if (!(field instanceof HTMLInputElement)) throw new Error(`${String(label)} is not an input.`);
  return field;
};

export async function ready(): Promise<void> {
  await screen.findByRole('table', { name: 'Estimate per role' });
}

/** The text of everything that describes the control, as a screen reader reads it. */
export function describedText(element: HTMLElement): string {
  const ids = (element.getAttribute('aria-describedby') ?? '').split(' ');
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}
