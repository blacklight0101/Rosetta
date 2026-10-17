/* eslint-disable @typescript-eslint/no-unused-vars -- red stub, replaced by the implementation in the next commit */
import type { Overview } from '../../domain/overview/overview.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-264: red stub, replaced by the implementation in the next commit.

export function overviewBody(
  overview: Overview,
  masker: TextMasker,
  options: { readonly base: string; readonly heading: string },
): string[] {
  return [];
}

export function renderOverview(overview: Overview, masker: TextMasker): string {
  return '';
}

export function renderOverviewJson(overview: Overview, masker: TextMasker): string {
  return '{}';
}
