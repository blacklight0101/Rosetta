// RF-507: repository and model text is rendered as text, never as HTML. These selectors reject
// every way the front end could hand a string to the HTML parser; `eslint.config.ts` applies
// them to `web/`, and tests/integration/web/unsafe-html-lint.test.ts proves they fire.
// `srcdoc` is matched case-insensitively: HTML attribute names are, and Preact accepts `srcDoc`.

const htmlSinks =
  '/^(innerHTML|outerHTML|insertAdjacentHTML|setHTMLUnsafe|parseHTMLUnsafe|createContextualFragment|srcdoc)$/i';
const htmlProperty = '/^(innerHTML|outerHTML|dangerouslySetInnerHTML|srcdoc)$/i';

export const unsafeHtmlSelectors: readonly {
  readonly selector: string;
  readonly message: string;
}[] = [
  {
    selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
    message: 'RF-507: dangerouslySetInnerHTML is banned; render text and let Preact escape it.',
  },
  {
    selector: 'JSXAttribute[name.name=/^srcdoc$/i]',
    message: 'RF-507: srcdoc renders a document; render text and let Preact escape it.',
  },
  {
    selector: `Property[key.name=${htmlProperty}], Property[key.value=${htmlProperty}]`,
    message: 'RF-507: never pass HTML to an element; render text and let Preact escape it.',
  },
  {
    selector: `MemberExpression[property.name=${htmlSinks}], MemberExpression[computed=true][property.value=${htmlSinks}]`,
    message:
      'RF-507: innerHTML, outerHTML, insertAdjacentHTML, setHTMLUnsafe, parseHTMLUnsafe, createContextualFragment and srcdoc are banned; use text nodes.',
  },
  {
    selector: 'CallExpression[callee.property.name="setAttribute"][arguments.0.value=/^srcdoc$/i]',
    message: 'RF-507: setting srcdoc renders a document; use text nodes.',
  },
  {
    selector: 'CallExpression[callee.name=/^parseHTMLUnsafe$/]',
    message: 'RF-507: parseHTMLUnsafe parses HTML; use text nodes.',
  },
  {
    selector: 'CallExpression[callee.object.name="document"][callee.property.name=/^write(ln)?$/]',
    message: 'RF-507: document.write is banned.',
  },
  {
    selector: 'NewExpression[callee.name="DOMParser"]',
    message: 'RF-507: parsing HTML in the browser is banned; repository and model text is text.',
  },
];
