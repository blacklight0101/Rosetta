import { afterEach, describe, expect, it } from 'vitest';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// DEC-161, P1-181: the Rosetta logo on the public landing page.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function landing(): Promise<{ html: string }> {
  current = createTestServer();
  const response = await current.server.inject({ method: 'GET', url: '/' });
  return { html: response.body };
}

describe('landing page brand', () => {
  it('DEC-161 links the favicon, the touch icon and the web manifest from public asset paths', async () => {
    const { html } = await landing();

    expect(html).toContain('<link rel="icon" href="/assets/brand/favicon.ico" sizes="any">');
    expect(html).toContain(
      '<link rel="icon" type="image/png" sizes="32x32" href="/assets/brand/rosetta-icon-32.png">',
    );
    expect(html).toContain(
      '<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">',
    );
    expect(html).toContain('<link rel="manifest" href="/assets/brand/site.webmanifest">');
    expect(html).not.toContain('href="data:,"');
  });

  it('DEC-161 shows the full logo on light and the icon with live text on dark, sizes set', async () => {
    const { html } = await landing();

    const picture = /<picture class="brand-hero">([\s\S]*?)<\/picture>/.exec(html)?.[1] ?? '';
    expect(picture).toContain('<source media="(prefers-color-scheme: dark)"');
    expect(picture).toContain('/assets/brand/rosetta-icon-128.png 1x');
    expect(picture).toContain('/assets/brand/rosetta-icon-256.png 2x');
    expect(picture).toContain(
      'srcset="/assets/brand/rosetta-full-320w.png 320w, /assets/brand/rosetta-full-640w.png 640w, /assets/brand/rosetta-full-960w.png 960w"',
    );
    expect(picture).toMatch(/<img [^>]*alt="Rosetta"[^>]*width="160"[^>]*height="160"/);
    expect(html).toMatch(/<span class="brand-hero-text" aria-hidden="true">Rosetta<\/span>/);
  });

  it('DEC-161 shows the icon before the live name in the header link', async () => {
    const { html } = await landing();

    expect(html).toMatch(
      /<a class="brand" href="\/"><img src="\/assets\/brand\/rosetta-icon-32.png" srcset="\/assets\/brand\/rosetta-icon-64.png 2x" alt="" width="32" height="32">Rosetta<\/a>/,
    );
  });
});
