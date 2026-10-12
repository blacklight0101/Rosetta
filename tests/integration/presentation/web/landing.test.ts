import { afterEach, describe, expect, it } from 'vitest';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1200, RF-1201, RNF-010, Q-19, Q-20: the public landing page at `/`, through fastify.inject.
// It is rendered by the server (no JavaScript needed), answers without a session, sends a signed-in
// visitor to their projects and offers "Request access" only when a contact address is set.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function landing(contactEmail?: string): Promise<{ status: number; html: string }> {
  current = createTestServer(contactEmail === undefined ? {} : { contactEmail });
  const response = await current.server.inject({ method: 'GET', url: '/' });
  return { status: response.statusCode, html: response.body };
}

describe('landing page content', () => {
  it('RF-1200 answers a visitor without a session with an HTML page and says what Rosetta does', async () => {
    const { status, html } = await landing();

    expect(status).toBe(200);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<html lang="en"');
    expect(html).toMatch(/<h1[^>]*>[^<]*legacy code[^<]*<\/h1>/);
    expect(html).toContain('Paste a public GitHub URL');
  });

  it('RF-1200 sends the page as UTF-8 HTML', async () => {
    current = createTestServer();

    const response = await current.server.inject({ method: 'GET', url: '/' });

    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
  });

  it('RF-1200 shows the pipeline from GitHub URL to hand-off as an ordered list of six stages', async () => {
    const { html } = await landing();

    const list = /<ol[^>]*aria-label="Pipeline"[^>]*>([\s\S]*?)<\/ol>/.exec(html);
    expect(list).not.toBeNull();
    expect((list?.[1] ?? '').match(/<li\b/g)).toHaveLength(6);
    for (const stage of [
      'Pin a commit',
      'Map the code',
      'Agents write cards',
      'Check every claim',
      'You decide',
      'Report and hand-off',
    ]) {
      expect(list?.[1]).toContain(stage);
    }
  });

  it('RF-1200 shows the live agent view as a replay labelled "Sample run" with five agent lanes', async () => {
    const { html } = await landing();

    expect(html).toContain('Watch it work');
    expect(html).toMatch(/<span class="badge wn">Sample run<\/span>/);
    expect(html).toContain('eShopLegacyWebForms');
    expect(html).toMatch(/role="meter"/);
    expect(html.match(/class="lane"/g)).toHaveLength(5);
    expect(html).toContain('Event stream');
  });
});

describe('landing page sections', () => {
  it('RF-1200 shows an evidence card with its cited lines and a rejected claim kept and marked', async () => {
    const { html } = await landing();

    expect(html).toContain('No claim without the lines that prove it.');
    expect(html).toContain('Create.aspx.cs:41-47');
    expect(html).toMatch(/aria-label="Cited lines"/);
    expect(html).toContain('Supported');
    expect(html).toContain('Rejected');
  });

  it('RF-1200 explains cost control, security and privacy, the technology and who built it', async () => {
    const { html } = await landing();

    expect(html).toContain('You see the price before, during and after.');
    expect(html).toContain('Built to read code it does not trust.');
    expect(html).toContain('Read-only.');
    expect(html).toContain('Any stack. Any model.');
    expect(html).toContain('TypeScript on Node.js');
    expect(html).toContain('final project, built in the open.');
    expect(html).toContain('BIG School');
  });

  it('RF-1200 has a Sign in button in the header, beside the lede and in the about section', async () => {
    const { html } = await landing();

    const links = [...html.matchAll(/<a [^>]*href="\/sign-in"[^>]*>([^<]*)<\/a>/g)].map(
      (match) => match[1],
    );
    expect(links).toEqual(['Sign in', 'Sign in to try it', 'Sign in']);
  });

  it('RF-1200 answers HEAD like GET without a body', async () => {
    current = createTestServer();

    const response = await current.server.inject({ method: 'HEAD', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('');
  });

  it('RF-1200 names nothing from an employer and no invented customer or quote', async () => {
    const { html } = await landing();

    expect(html).not.toMatch(/mission foods|testimonial|trusted by|customers love/i);
  });
});

describe('landing page without JavaScript', () => {
  it('RF-1200 needs no script, no inline style and no event handler: the policy allows none', async () => {
    const { html } = await landing('owner@example.org');

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it('RF-1200 loads one style sheet from /assets/ and nothing from another origin', async () => {
    const { html } = await landing();

    expect(html).toContain('<link rel="stylesheet" href="/assets/landing.css">');
    expect(html).not.toMatch(/(?:src|href)="(?:https?:)?\/\/(?!github\.com\/blacklight0101\/)/i);
    expect(html).toContain('width=device-width, initial-scale=1');
  });

  it('RF-1200 carries the content security policy of every page', async () => {
    current = createTestServer();

    const response = await current.server.inject({ method: 'GET', url: '/' });

    expect(String(response.headers['content-security-policy'])).toContain("style-src 'self'");
    expect(String(response.headers['content-security-policy'])).toContain("default-src 'self'");
  });
});

describe('landing page for a signed-in visitor', () => {
  it('RF-1200 sends a signed-in user to their projects', async () => {
    current = createTestServer();
    const amy = await addUser(current, { userName: 'amy' });
    const browser = await signedInBrowser(current.server, amy);

    const response = await browser.request({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/projects');
  });

  it('RF-1200 sends an administrator who must change the password to their projects as well', async () => {
    current = createTestServer();
    const mia = await addUser(current, {
      userName: 'mia',
      role: 'admin',
      state: 'MustChangePassword',
    });
    const browser = await signedInBrowser(current.server, mia);

    const response = await browser.request({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/projects');
  });

  it('RF-1200 shows the page to a visitor whose cookie is unknown', async () => {
    current = createTestServer();
    const browser = new TestBrowser(current.server);

    const response = await browser.request({
      method: 'GET',
      url: '/',
      headers: { cookie: '__Host-rosetta_session=not-a-session' },
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('landing page reach', () => {
  it('RF-1201 is never indexed: the header says noindex, nofollow', async () => {
    current = createTestServer();

    const response = await current.server.inject({ method: 'GET', url: '/' });

    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(response.body).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('RF-1201 offers a Request access link that opens an e-mail when a contact address is set', async () => {
    const { html } = await landing('owner@example.org');

    expect(html).toMatch(/<a class="btn sec" href="mailto:owner@example\.org">Request access<\/a>/);
  });

  it('RF-1201 has no Request access link and no sign-up without a contact address', async () => {
    const { html } = await landing();

    expect(html).not.toContain('Request access');
    expect(html).not.toContain('mailto:');
    expect(html).not.toMatch(/sign[ -]?up|register|create an account/i);
  });

  it('RF-1201 writes the contact address as text, so a hostile value cannot break out of the link', async () => {
    const { html } = await landing('a"><script>x</script>@example.org');

    expect(html).not.toContain('<script');
    expect(html).toContain('mailto:a&quot;&gt;&lt;script&gt;x&lt;/script&gt;@example.org');
  });
});
