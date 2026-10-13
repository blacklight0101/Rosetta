import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  isGitHubLink,
  renderModelText,
} from '../../../../src/infrastructure/report/html-text.js';
import { auditHtml } from '../../../support/html-audit.js';
import { hostileText } from '../../../support/report-fixtures.js';

// RF-507: repository and model text is shown as text; only https://github.com/ links stay links.

describe('escapeHtml', () => {
  it('RF-507 turns the characters that open markup or end an attribute into entities', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('isGitHubLink', () => {
  it.each([
    'https://github.com/octo/demo',
    'https://github.com/octo/demo/blob/3f786850/src/Orders/Checkout.cs#L10-L24',
    'https://github.com/',
  ])('RF-507 keeps %s', (address) => {
    expect(isGitHubLink(address)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://github.com/octo/demo',
    'https://evil.example/phish',
    'https://github.com.evil.example/octo/demo',
    'https://github.com@evil.example/octo/demo',
    'https://user:secret@github.com/octo/demo',
    'https://github.com:8443/octo/demo',
    'https://github.com\\@evil.example/',
    'https://gist.github.com/octo/1',
    '//github.com/octo/demo',
    'github.com/octo/demo',
    'https://github.com',
    '',
  ])('RF-507 shows %s as plain text', (address) => {
    expect(isGitHubLink(address)).toBe(false);
  });
});

describe('renderModelText', () => {
  it('RF-507 shows markup in the text as text', () => {
    const html = renderModelText(hostileText);

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=');
  });

  it('RF-507 keeps a link to github.com as a link with a safe rel', () => {
    const html = renderModelText('See [the lines](https://github.com/octo/demo/blob/abc/a.cs#L1).');

    expect(html).toBe(
      'See <a href="https://github.com/octo/demo/blob/abc/a.cs#L1" rel="noopener noreferrer nofollow">the lines</a>.',
    );
  });

  it.each([
    '[click](javascript:window.__pwned=1)',
    '[click](https://evil.example/phish)',
    '[click](http://github.com/octo/demo)',
    '[click](data:text/html;base64,PHNjcmlwdD4=)',
    '[click](https://github.com@evil.example/)',
  ])('RF-507 shows %s as plain text, with no link', (text) => {
    const html = renderModelText(text);

    expect(html).not.toContain('<a');
    expect(html).toBe(escapeHtml(text));
  });

  it('RF-507 escapes the label and the address of a kept link', () => {
    const html = renderModelText('[<b>x</b>](https://github.com/o/r?a="b"&c=d)');

    expect(auditHtml(`<p>${html}</p>`).document.querySelectorAll('a')).toHaveLength(1);
    expect(html).not.toContain('<b>');
    expect(html).toContain('href="https://github.com/o/r?a=&quot;b&quot;&amp;c=d"');
  });

  it('RF-507 handles several links, a lone bracket and text without links', () => {
    expect(renderModelText('a [b](https://github.com/x) c [d](javascript:1) [e')).toBe(
      'a <a href="https://github.com/x" rel="noopener noreferrer nofollow">b</a> c [d](javascript:1) [e',
    );
    expect(renderModelText('plain & simple')).toBe('plain &amp; simple');
  });
});
