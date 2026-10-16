import { fireEvent, screen } from '@testing-library/preact';
import { json } from './fake-api.js';
import { localEstimate } from './start-run-fixtures.js';

// The page of a run while it runs (P1-169): the answers for the code map and the tabs.

export const codeMapPath = '/api/projects/p-1/estimate';

export interface CodeMapArea {
  readonly name: string;
  readonly estimatedTokens: number;
  readonly thirdParty: boolean;
}

/** What `GET /api/projects/p-1/estimate` answers: the areas of the code map, own and library. */
export function codeMapAnswer(areas: readonly CodeMapArea[]): Response {
  // The server always sends the file count of an area (RF-1018).
  return json(200, { ...localEstimate, areas: areas.map((area) => ({ ...area, files: 1 })) });
}

export const ownAreas: readonly CodeMapArea[] = [
  { name: 'Catalog', estimatedTokens: 12_000, thirdParty: false },
  { name: 'Models', estimatedTokens: 8_000, thirdParty: false },
  { name: 'Setup', estimatedTokens: 900, thirdParty: false },
  { name: 'jQuery', estimatedTokens: 40_000, thirdParty: true },
];

/** The tab of the run details with this name. */
export const tab = (name: string | RegExp): HTMLElement =>
  screen.getByRole('tab', { name: typeof name === 'string' ? new RegExp(`^${name}`, 'u') : name });

export function openTab(name: string): HTMLElement {
  fireEvent.click(tab(name));
  return screen.getByRole('tabpanel');
}

/** Waits for the tabs of the page, then opens the one with this name. */
export async function openTabWhenReady(name: string): Promise<HTMLElement> {
  await screen.findByRole('tab', { name: new RegExp(`^${name}`, 'u') });
  return openTab(name);
}
