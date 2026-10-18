// Rosetta diagrams (RF-508, ADR-013). A classic script loaded deferred, after the vendored Mermaid
// build, by `diagrams.html`: without it the page shows every diagram's source as text. With it each
// source is drawn by Mermaid with `securityLevel: 'strict'` and no network. A diagram that does not
// parse or draw keeps its source visible and gets a note; the other diagrams are drawn anyway.
// The source is read as text and the drawing is inserted as parsed nodes, never as markup built
// from text (RF-507). The page's content security policy has no inline style allowance, so the
// style rules Mermaid writes are given to the page through the CSSOM, which the policy does not
// restrict.
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

  /** Takes the style elements out of a drawing and returns their rules. */
  function takeRules(drawing) {
    const rules = [];
    for (const element of Array.from(drawing.querySelectorAll('style'))) {
      rules.push(element.textContent || '');
      element.remove();
    }
    return rules;
  }

  /**
   * Gives the rules to the page as style sheets built in script. The page's content security policy
   * refuses a style element in the page, but does not restrict a style sheet made through the CSSOM.
   */
  async function adoptRules(rules) {
    for (const css of rules) {
      const sheet = new globalThis.CSSStyleSheet();
      await sheet.replace(css);
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    }
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
      const rules = takeRules(drawing);
      const inserted = doc.importNode(drawing, true);
      figure.querySelector('[data-diagram-drawing]').replaceChildren(inserted);
      await adoptRules(rules);
      figure.querySelector('details').open = false;
    } catch {
      // Mermaid can leave its error drawing in the page when a render fails: take it out.
      doc.getElementById('d' + id)?.remove();
      fail(figure);
    }
  }

  /**
   * The elements and attributes a label may not carry. Mermaid's own sanitiser runs on every label
   * in strict mode; this narrows it, so a label that holds an image, a link or a style is shown
   * without it and no request starts before the drawing is in the page (RF-507, RF-508).
   */
  const dompurifyConfig = {
    FORBID_TAGS: ['img', 'a', 'style', 'iframe', 'object', 'embed', 'video', 'audio', 'source'],
    FORBID_ATTR: ['src', 'srcset', 'href', 'xlink:href', 'style'],
  };

  async function drawAll() {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      logLevel: 5,
      dompurifyConfig,
    });
    for (const [index, figure] of figures.entries()) await draw(figure, index);
  }

  if (mermaid === undefined) figures.forEach(fail);
  else void drawAll();
})();
