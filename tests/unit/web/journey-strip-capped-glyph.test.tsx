import { render, screen, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { Glyph, type GlyphName } from '../../../web/src/components/Glyph.js';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { JourneyStrip } from '../../../web/src/pages/JourneyStrip.js';
import { renderPage } from './fake-api.js';
import { facts, projectId, roadSigns } from './journey-fixtures.js';

// RF-1020, DEC-217, P8-125 (follow-up of P8-112): the step of a run at its cap is drawn with the
// warning glyph, the same drawing as the design system's `warning-triangle`, never the cross of a
// failed step. The word says the state; the glyph is pinned here so a changed drawing fails a test.

/** The markup of a glyph as the design system draws it on its own. */
function drawingOf(name: GlyphName): string {
  const { container, unmount } = render(<Glyph name={name} />);
  const markup = container.innerHTML;
  unmount();
  return markup;
}

/** The markup of the glyph of a step of the strip drawn for a road. */
function glyphOfStep(road: string, title: string): string | undefined {
  const view = journeyOf(roadSigns[road] ?? facts(), projectId);
  renderPage(<JourneyStrip view={view} onResumed={() => undefined} />, {});
  const step = within(screen.getByRole('region', { name: 'Journey from code to package' }))
    .getAllByRole('listitem')
    .find((each) => each.querySelector('.rst-road__title')?.textContent === title);
  return step?.querySelector('.rst-road__mark')?.innerHTML;
}

it.each([
  ['capped', 'Understand'],
  ['cappedPartly', 'Understand'],
  ['planCapped', 'Plan'],
] as const)(
  'RF-1020 P8-125 on the %s road the %s step at its cap carries the warning glyph, not the cross',
  (road, title) => {
    const drawn = glyphOfStep(road, title);

    expect(drawn).toBe(drawingOf('warning-triangle'));
    expect(drawn).not.toBe(drawingOf('cross'));
  },
);
