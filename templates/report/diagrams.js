// Rosetta diagrams (RF-508, ADR-013). A classic script loaded deferred, after the vendored Mermaid
// build, by `diagrams.html`: without it the page shows every diagram's source as text. With it each
// source is drawn by Mermaid with `securityLevel: 'strict'` and no network. A diagram that does not
// parse or draw keeps its source visible and gets a note; the other diagrams are drawn anyway.
// The source is read as text and the drawing is inserted as parsed nodes, never as markup built
// from text (RF-507). The page's content security policy has no inline style allowance, so the
// style rules Mermaid writes are applied through the CSSOM, which the policy does not restrict.
(function () {
  'use strict';

  const doc = globalThis.document;
  const library = globalThis.__esbuild_esm_mermaid_nm;
  const mermaid = library === undefined ? undefined : library.mermaid.default;
  const figures = Array.from(doc.querySelectorAll('[data-diagram]'));

  /** Shows the note of a diagram that cannot be drawn; its source stays open. */
  function fail(figure) {
    const note = figure.querySelector('[data-diagram-note]');
    if (note !== null) note.hidden = false;
  }

  /** The drawing and everything in it, in document order. */
  function elementsOf(drawing) {
    return [drawing, ...Array.from(drawing.querySelectorAll('*'))];
  }

  /** Takes the style rules out of the drawing; the policy would refuse them as inline styles. */
  function takeStyles(drawing) {
    const rules = [];
    for (const element of Array.from(drawing.querySelectorAll('style'))) {
      rules.push(element.textContent || '');
      element.remove();
    }
    const inline = [];
    elementsOf(drawing).forEach((element, position) => {
      const css = element.getAttribute('style');
      if (css === null) return;
      inline.push([position, css]);
      element.removeAttribute('style');
    });
    return { rules, inline };
  }

  /** Applies the rules and the inline styles through the CSSOM, which the policy does not restrict. */
  function applyStyles(inserted, styles) {
    for (const css of styles.rules) {
      const sheet = new globalThis.CSSStyleSheet();
      sheet.replaceSync(css);
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    }
    const elements = elementsOf(inserted);
    for (const [position, css] of styles.inline) elements[position].style.cssText = css;
  }

  async function draw(figure, index) {
    const source = figure.querySelector('pre').textContent || '';
    const id = 'rosetta-diagram-' + String(index + 1);
    try {
      await mermaid.parse(source);
      const { svg } = await mermaid.render(id, source);
      const parsed = new globalThis.DOMParser().parseFromString('<body>' + svg, 'text/html');
      const drawing = parsed.body.firstElementChild;
      if (drawing === null || drawing.localName !== 'svg') throw new Error('No drawing');
      const styles = takeStyles(drawing);
      const inserted = doc.importNode(drawing, true);
      figure.querySelector('[data-diagram-drawing]').replaceChildren(inserted);
      applyStyles(inserted, styles);
      figure.querySelector('details').open = false;
    } catch {
      // Mermaid can leave its error drawing in the page when a render fails: take it out.
      doc.getElementById('d' + id)?.remove();
      fail(figure);
    }
  }

  async function drawAll() {
    mermaid.initialize({
      ...{ startOnLoad: false, securityLevel: 'strict', logLevel: 5 },
      // Labels are drawn as SVG text, not as HTML in a foreign object (RF-507, RF-508).
      ...{ htmlLabels: false, flowchart: { htmlLabels: false } },
    });
    for (const [index, figure] of figures.entries()) await draw(figure, index);
  }

  if (mermaid === undefined) figures.forEach(fail);
  else void drawAll();
})();
