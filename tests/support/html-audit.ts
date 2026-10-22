import { Window, type Document } from 'happy-dom';

// RF-507, RF-1013: what a generated page could run or load. The page is parsed (happy-dom runs no
// script), and everything that could execute or reach out is listed, so a test asserts the lists.

export interface HtmlAudit {
  /** The `src` of each external script, or `inline` for a script with content of its own. */
  readonly scripts: readonly string[];
  /** `element.attribute` for every `on...` attribute. */
  readonly handlers: readonly string[];
  /** The `href` of every link that is neither a relative address nor an `https://github.com/` one. */
  readonly foreignLinks: readonly string[];
  readonly inlineStyles: number;
  readonly styleElements: number;
  /** The `content` of `<meta http-equiv="Content-Security-Policy">`. */
  readonly csp: string | undefined;
  readonly referrer: string | undefined;
  readonly document: Document;
}

function isLocal(address: string): boolean {
  // DEC-161: the Rosetta icon is an inline PNG data address; it reaches no other site.
  if (address.startsWith('data:image/png;base64,')) return true;
  return !/^[a-z][a-z0-9+.-]*:/iu.test(address) && !address.startsWith('//');
}

export function auditHtml(html: string): HtmlAudit {
  const window = new Window();
  const document = new window.DOMParser().parseFromString(html, 'text/html');
  const all = [...document.querySelectorAll('*')];
  const handlers = all.flatMap((element) =>
    element
      .getAttributeNames()
      .filter((name) => name.toLowerCase().startsWith('on'))
      .map((name) => `${element.tagName.toLowerCase()}.${name}`),
  );
  const links = [...document.querySelectorAll('[href], [src], [action]')].flatMap((element) =>
    ['href', 'src', 'action'].flatMap((name) => element.getAttribute(name) ?? []),
  );
  return {
    scripts: [...document.querySelectorAll('script')].map(
      (script) => script.getAttribute('src') ?? 'inline',
    ),
    handlers,
    foreignLinks: links.filter(
      (address) => !isLocal(address) && !address.startsWith('https://github.com/'),
    ),
    inlineStyles: document.querySelectorAll('[style]').length,
    styleElements: document.querySelectorAll('style').length,
    csp:
      document
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute('content') ?? undefined,
    referrer: document.querySelector('meta[name="referrer"]')?.getAttribute('content') ?? undefined,
    document,
  };
}
