import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { renderDiagramsPage } from '../../../../src/infrastructure/report/site/diagrams-page.js';
import { reportModel } from '../../../support/report-fixtures.js';

// RF-508, RF-507: the diagrams script draws each source with Mermaid (here a stand-in that answers
// like it) and, for a diagram that does not draw, keeps the source and shows a note while the other
// diagrams are drawn. It runs here in happy-dom against the page the writer produces; the end-to-end
// spec runs it with the real build in a browser.

const script = await readFile(
  fileURLToPath(new URL('../../../../templates/report/diagrams.js', import.meta.url)),
  'utf8',
);

const good = { document: 'spec.md', title: 'Good', source: 'flowchart LR\n  s1["Home"]' };
const bad = { document: 'spec.md', title: 'Bad', source: 'flowchart LR\n  a --- (((' };
// happy-dom drops a style element of an svg and has no content security policy: that the style rules
// leave the drawing and reach the page through the CSSOM is checked in a browser
// (tests/e2e/report-diagrams.spec.ts).
const svg = '<svg id="rosetta-diagram-1"><g class="n"></g></svg>';

const sanitiserConfig = z.object({
  dompurifyConfig: z.object({ FORBID_TAGS: z.array(z.string()), FORBID_ATTR: z.array(z.string()) }),
});

interface Calls {
  readonly config: unknown[];
  readonly parsed: string[];
  readonly rendered: [string, string][];
}

function pageWith(
  diagrams: readonly (typeof good)[],
  options: { mermaid?: boolean; renderFails?: boolean } = {},
): { window: Window; calls: Calls } {
  const window = new Window({ settings: { disableJavaScriptEvaluation: false } });
  window.document.write(renderDiagramsPage(reportModel({ diagrams })));
  const calls: Calls = { config: [], parsed: [], rendered: [] };
  const stand = {
    initialize: (config: unknown) => calls.config.push(config),
    parse: (source: string) => {
      calls.parsed.push(source);
      return source.includes('(((')
        ? Promise.reject(new Error('Parse error'))
        : Promise.resolve(true);
    },
    render: (id: string, source: string) => {
      calls.rendered.push([id, source]);
      return options.renderFails === true
        ? Promise.reject(new Error('Render error'))
        : Promise.resolve({ svg });
    },
  };
  if (options.mermaid !== false) {
    Reflect.set(window, '__esbuild_esm_mermaid_nm', { mermaid: { default: stand } });
  }
  return { window, calls };
}

async function run(window: Window): Promise<void> {
  window.eval(script);
  await window.happyDOM.waitUntilComplete();
  await new Promise((resolve) => setTimeout(resolve, 20));
}

const figures = (window: Window) => [...window.document.querySelectorAll('figure[data-diagram]')];
const noteShown = (figure: ReturnType<typeof figures>[number] | undefined): boolean =>
  figure?.querySelector('[data-diagram-note]')?.hasAttribute('hidden') === false;

describe('the diagrams script', () => {
  it('RF-508 draws every diagram with securityLevel strict and no start on load', async () => {
    const { window, calls } = pageWith([good, good]);

    await run(window);

    expect(calls.config).toHaveLength(1);
    expect(calls.config[0]).toMatchObject({ securityLevel: 'strict', startOnLoad: false });
  });

  it('RF-507 RF-508 keeps images, links and styles out of every label before the drawing exists', async () => {
    const { window, calls } = pageWith([good]);

    await run(window);

    const { dompurifyConfig } = sanitiserConfig.parse(calls.config[0]);
    expect(dompurifyConfig.FORBID_TAGS).toEqual(
      expect.arrayContaining(['img', 'a', 'style', 'iframe', 'object', 'embed']),
    );
    expect(dompurifyConfig.FORBID_ATTR).toEqual(
      expect.arrayContaining(['src', 'href', 'xlink:href', 'style']),
    );
  });
});

describe('the diagrams script and the drawing it inserts', () => {
  it('RF-508 gives each diagram an id of its own', async () => {
    const { window, calls } = pageWith([good, good]);

    await run(window);

    expect(calls.rendered.map(([, source]) => source)).toEqual([good.source, good.source]);
    expect(new Set(calls.rendered.map(([id]) => id)).size).toBe(2);
  });

  it('RF-508 puts the drawing in the figure, closes the source and keeps the note hidden', async () => {
    const { window } = pageWith([good]);

    await run(window);

    const [figure] = figures(window);
    expect(figure?.querySelector('[data-diagram-drawing] svg')).not.toBeNull();
    expect(figure?.querySelector('details')?.hasAttribute('open')).toBe(false);
    expect(noteShown(figure)).toBe(false);
  });
});

describe('the diagrams script and a diagram that does not draw', () => {
  it('RF-508 shows a diagram that does not parse as its source with a note, and draws the others', async () => {
    const { window } = pageWith([bad, good]);

    await run(window);

    const [first, second] = figures(window);
    expect(noteShown(first)).toBe(true);
    expect(first?.querySelector('details')?.hasAttribute('open')).toBe(true);
    expect(first?.querySelector('pre')?.textContent).toBe(bad.source);
    expect(first?.querySelector('svg')).toBeNull();
    expect(noteShown(second)).toBe(false);
    expect(second?.querySelector('svg')).not.toBeNull();
  });

  it('RF-508 shows a diagram whose drawing fails as its source with a note', async () => {
    const { window } = pageWith([good], { renderFails: true });

    await run(window);

    const [figure] = figures(window);
    expect(noteShown(figure)).toBe(true);
    expect(figure?.querySelector('details')?.hasAttribute('open')).toBe(true);
    expect(figure?.querySelector('svg')).toBeNull();
  });

  it('RF-508 removes the error drawing Mermaid leaves in the page when a diagram fails', async () => {
    const { window } = pageWith([good], { renderFails: true });
    const stray = window.document.createElement('div');
    stray.id = 'drosetta-diagram-1';
    window.document.body.append(stray);

    await run(window);

    expect(window.document.getElementById('drosetta-diagram-1')).toBeNull();
  });
});

describe('the diagrams script and what it never trusts', () => {
  it('RF-508 shows every source with a note when the Mermaid build did not load', async () => {
    const { window } = pageWith([good, bad], { mermaid: false });

    await run(window);

    expect(figures(window).map((figure) => noteShown(figure))).toEqual([true, true]);
  });

  it('RF-507 never reads a source as markup: a hostile source is parsed as the text it is', async () => {
    const hostile = {
      ...good,
      source: 'flowchart LR\n  a["<img src=x onerror=window.__pwned=1>"]',
    };
    const { window, calls } = pageWith([hostile]);

    await run(window);

    expect(calls.parsed).toEqual([hostile.source]);
    expect(window.document.querySelectorAll('main img')).toHaveLength(0);
  });
});
