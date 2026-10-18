import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect } from 'vitest';
import { PlanSetupPage } from '../../../web/src/pages/PlanSetupPage.js';
import { failure, json, renderPage, type Answer, type RenderedPage } from './fake-api.js';
import {
  catalogue,
  planEstimate,
  planOptions,
  unsavedBrief,
  savedBrief,
} from './plan-setup-fixtures.js';

// The Plan setup page under test (P3-08): the real page over the fake API of fake-api.tsx, with the
// answers every test needs (the catalogue, an unsaved brief, options, a local estimate) unless it
// replaces them.

export const base = '/api/projects/p-1';

export const baseAnswers: Readonly<Record<string, Answer>> = {
  'GET /api/plan/catalogue': json(200, catalogue),
  [`GET ${base}/planning-brief`]: json(200, unsavedBrief),
  [`PUT ${base}/planning-brief`]: json(200, savedBrief),
  [`POST ${base}/plan-options`]: json(200, planOptions),
  [`GET ${base}/plan-estimate`]: json(200, planEstimate),
};

export const renderPlan = (answers: Readonly<Record<string, Answer>> = {}): RenderedPage =>
  renderPage(<PlanSetupPage />, { ...baseAnswers, ...answers }, undefined, { projectId: 'p-1' });

export const refusal = (status: number, code: string): Answer => failure(status, code);

export async function ready(): Promise<void> {
  await screen.findByRole('heading', { name: 'Plan setup', level: 1 });
  const estimate = await screen.findByRole('region', { name: 'Plan estimate' });
  await waitFor(() => {
    expect(estimate.getAttribute('aria-busy')).not.toBe('true');
  });
}

export const press = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};

export const saves = (page: RenderedPage): unknown[] =>
  page.calls.filter((call) => call.method === 'PUT').map((call) => call.body);

export const stepName = (): string | null =>
  screen.getByRole('navigation', { name: 'Steps' }).querySelector('[aria-current="step"]')
    ?.textContent ?? null;
