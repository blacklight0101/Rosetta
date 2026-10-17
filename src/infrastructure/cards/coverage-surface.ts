import type { AreaCoverage, SurfaceCoverage } from '../../domain/cards/area-coverage.js';
import type { MarkdownEscaper } from './markdown-text.js';

// RF-261, RF-263, data-model 3.8: the flow and screen cards of each area in `coverage.md`. An area
// the code map found no entry point (or no page) in says "no flows found" (or "no screens found"),
// so the absence is a finding and not a gap; an area marked for them that wrote none says 0.

function cards(count: number, noun: string, incomplete = 0): string {
  const plural = `${String(count)} ${noun} card${count === 1 ? '' : 's'}`;
  return incomplete === 0 ? plural : `${plural} (${String(incomplete)} incomplete)`;
}

function surfaceText(surface: SurfaceCoverage): string {
  const flows =
    surface.flowsMarked || surface.flowCards > 0
      ? cards(surface.flowCards, 'flow', surface.incompleteFlows)
      : 'no flows found';
  const screens =
    surface.screensMarked || surface.screenCards > 0
      ? cards(surface.screenCards, 'screen')
      : 'no screens found';
  return `${flows}; ${screens}`;
}

/** The `## Flows and screens` section; nothing when no area has flow and screen coverage. */
export function surfaceSection(coverage: readonly AreaCoverage[], esc: MarkdownEscaper): string[] {
  const lines = coverage.flatMap((area) =>
    area.surface === undefined ? [] : [`- ${esc.inline(area.area)}: ${surfaceText(area.surface)}`],
  );
  if (lines.length === 0) return [];
  return [
    '## Flows and screens',
    '',
    'The flow and screen cards of each area. An area without entry points or pages says so, which is not a gap.',
    '',
    ...lines,
    '',
  ];
}
