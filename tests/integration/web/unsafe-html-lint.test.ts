import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

// RF-507: `dangerouslySetInnerHTML` and `innerHTML` are banned by a lint rule. The repository's
// own eslint.config.ts is used; only the type information is switched off so a snippet that has
// no file on disk can be linted.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const eslint = new ESLint({
  cwd: root,
  overrideConfig: [
    {
      ...tseslint.configs.disableTypeChecked,
      files: ['web/**/*.{ts,tsx}'],
      languageOptions: { parserOptions: { projectService: false } },
    },
  ],
});

async function restrictedMessages(code: string, path = 'web/src/probe.tsx'): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: `${root}${path}` });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === 'no-restricted-syntax')
    .map((message) => message.message);
}

const sinkCases: [string, string][] = [
  [
    'dangerouslySetInnerHTML as a JSX attribute',
    'export const a = <div dangerouslySetInnerHTML={{ __html: x }} />;',
  ],
  [
    'dangerouslySetInnerHTML in a props object',
    'export const a = h("div", { dangerouslySetInnerHTML: { __html: x } });',
  ],
  ['innerHTML assignment', 'export function a(el: Element, x: string) { el.innerHTML = x; }'],
  ['outerHTML assignment', 'export function a(el: Element, x: string) { el.outerHTML = x; }'],
  [
    'innerHTML by computed key',
    'export function a(el: Element, x: string) { el["innerHTML"] = x; }',
  ],
  [
    'insertAdjacentHTML',
    'export function a(el: Element, x: string) { el.insertAdjacentHTML("beforeend", x); }',
  ],
  ['setHTMLUnsafe', 'export function a(el: Element, x: string) { el.setHTMLUnsafe(x); }'],
  ['parseHTMLUnsafe', 'export function a(x: string) { return Document.parseHTMLUnsafe(x); }'],
  [
    'createContextualFragment',
    'export function a(r: Range, x: string) { return r.createContextualFragment(x); }',
  ],
  ['srcdoc as a JSX attribute', 'export const a = <iframe srcdoc={x} />;'],
  ['srcdoc assignment', 'export function a(el: HTMLIFrameElement, x: string) { el.srcdoc = x; }'],
  ['srcdoc in a props object', 'export const a = h("iframe", { srcdoc: x });'],
  ['srcDoc as a JSX attribute', 'export const a = <iframe srcDoc={x} />;'],
  ['srcDoc in a props object', 'export const a = h("iframe", { srcDoc: x });'],
  ['srcDoc assignment', 'export function a(el: HTMLIFrameElement, x: string) { el.srcDoc = x; }'],
  [
    'srcdoc set by setAttribute',
    'export function a(el: Element, x: string) { el.setAttribute("srcdoc", x); }',
  ],
  [
    'srcDoc set by setAttribute',
    'export function a(el: Element, x: string) { el.setAttribute("srcDoc", x); }',
  ],
  [
    'a bare parseHTMLUnsafe call',
    'import { parseHTMLUnsafe } from "./html.js";\nexport function a(x: string) { return parseHTMLUnsafe(x); }',
  ],
  [
    'srcdoc set by setAttributeNS',
    'export function a(el: Element, x: string) { el.setAttributeNS(null, "srcdoc", x); }',
  ],
  [
    'srcDoc set by an optional setAttributeNS',
    'export function a(el: Element, x: string) { el?.setAttributeNS(null, "srcDoc", x); }',
  ],
  [
    'setHTMLUnsafe taken by destructuring',
    'export function a(el: Element, x: string) { const { setHTMLUnsafe } = el; setHTMLUnsafe.call(el, x); }',
  ],
  [
    'setHTMLUnsafe taken by destructuring under a string key',
    'export function a(el: Element) { const { "setHTMLUnsafe": f } = el; return f; }',
  ],
  [
    'innerHTML taken by destructuring and renamed',
    'export function a(el: Element) { const { innerHTML: html } = el; return html; }',
  ],
  [
    'setHTMLUnsafe by a template-literal computed key',
    'export function a(el: Element, x: string) { el[`setHTMLUnsafe`](x); }',
  ],
  [
    'innerHTML assigned by a template-literal computed key',
    'export function a(el: Element, x: string) { el[`innerHTML`] = x; }',
  ],
  ['document.write', 'export function a(x: string) { document.write(x); }'],
  [
    'DOMParser',
    'export function a(x: string) { return new DOMParser().parseFromString(x, "text/html"); }',
  ],
];

describe('RF-507 lint rule against HTML sinks', () => {
  it.each(sinkCases)('RF-507 rejects %s in web/', async (_name, code) => {
    const messages = await restrictedMessages(code);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((message) => message.startsWith('RF-507'))).toBe(true);
  });

  it('RF-507 accepts destructuring and template keys that are not HTML sinks', async () => {
    const code =
      'export function a(el: Element, k: string) { const { textContent, id } = el; return [textContent, id, el[`title`], el[k]]; }';
    expect(await restrictedMessages(code)).toEqual([]);
  });

  it('RF-507 accepts text rendering', async () => {
    const code =
      'export const a = <p>{text}</p>;\nexport function b(el: Element, x: string) { el.textContent = x; }';
    expect(await restrictedMessages(code)).toEqual([]);
  });

  it('RF-507 applies to every file under web/ and not to the server', async () => {
    const code = 'export function a(el: Element, x: string) { el.innerHTML = x; }';
    expect((await restrictedMessages(code, 'web/src/lib/x.ts')).length).toBeGreaterThan(0);
  });
});
