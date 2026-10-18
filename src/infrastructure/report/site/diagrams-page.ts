import { h, type ComponentChild } from 'preact';
import type { ReportDiagram } from '../../../application/report/report-diagrams.js';
import type { ReportModel } from '../../../application/report/report-model.js';
import { renderPage } from '../page-shell.js';
import { Crumbs } from './crumbs.js';
import { renderStatic } from './static-render.js';

// RF-508, RF-507, RF-1013, ADR-013, ADR-021: `diagrams.html`, the page that draws the flows, the
// screen map, the data model and the package's diagrams. Each diagram is a figure that holds its
// Mermaid source as text; `diagrams.js` (loaded after the vendored Mermaid build, both files of the
// report folder) draws it with `securityLevel: 'strict'`. Without the script, or for a diagram that
// cannot be drawn, the source stays on the page and a note says so. The title and the source are
// repository text: the renderer escapes them and nothing here builds markup from them.

/** The version of the Mermaid build in `templates/report/mermaid.min.js` (package.json pins it). */
export const MERMAID_VERSION = '12.2.0';

const NOTE =
  'This diagram could not be drawn, so its source is shown. The rest of the page is not affected.';

function Diagram(props: { readonly diagram: ReportDiagram }): ComponentChild {
  const { diagram } = props;
  return h(
    'figure',
    { class: 'diagram', 'data-diagram': true },
    h(
      'figcaption',
      null,
      h('h2', { class: 'diagram-title' }, diagram.title),
      h('span', { class: 'label mono' }, diagram.document),
    ),
    h('div', { class: 'diagram-drawing', 'data-diagram-drawing': true }),
    h('p', { class: 'diagram-note', role: 'note', 'data-diagram-note': true, hidden: true }, NOTE),
    h(
      'details',
      { class: 'diagram-source', open: true },
      h('summary', null, 'Mermaid source'),
      h('pre', null, h('code', null, diagram.source)),
    ),
  );
}

function DiagramsPage(props: { readonly diagrams: readonly ReportDiagram[] }): ComponentChild {
  return h(
    'div',
    null,
    h(Crumbs, { items: [{ href: 'report.html', label: 'Dashboard' }, { label: 'Diagrams' }] }),
    h('h1', null, 'Diagrams'),
    h(
      'p',
      { class: 'lede' },
      'The flows, the screen map and the data model of the run, and the diagrams of the hand-off package, drawn in your browser by a copy of Mermaid shipped with this report. Nothing is fetched from the network.',
    ),
    h(
      'p',
      { class: 'label' },
      `Drawn with Mermaid ${MERMAID_VERSION} (MIT). `,
      h('a', { href: 'mermaid.LICENSE.txt' }, 'Mermaid licence notice'),
    ),
    props.diagrams.map((diagram) => h(Diagram, { diagram })),
  );
}

/** The page of the diagrams of a run. */
// RF-508, RF-507
export function renderDiagramsPage(model: ReportModel): string {
  const main = renderStatic(h(DiagramsPage, { diagrams: model.diagrams ?? [] }));
  return renderPage({
    page: 'diagrams',
    runKey: model.runKey,
    title: 'Diagrams',
    main,
    scripts: ['mermaid.min.js', 'diagrams.js'],
  });
}
