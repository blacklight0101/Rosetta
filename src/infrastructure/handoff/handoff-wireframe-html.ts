import type { TargetScreen } from '../../domain/planning/target-ux.js';
import { escapeHtml } from '../report/html-text.js';

// RF-626, RF-507, ADR-013, DEC-134: the wireframe of one target screen as a plain HTML file,
// produced by code from the checked screen and never from model HTML. It is a page of layout boxes
// with the screen's fields, actions and navigation: no script, no event attribute, no external
// resource and no style beyond a border and spacing (a policy in the page refuses everything
// else). Every text value is masked and then escaped, so a hostile screen name is text. The one
// link kind is a link to the wireframe of another target screen, built from a card id the code
// checked (anything else is shown as text).

const STYLE = [
  'body { margin: 1rem; }',
  '.box { border: 1px solid; padding: 0.5rem; margin: 0.5rem 0; }',
].join('\n');
const POLICY = "default-src 'none'; style-src 'unsafe-inline'";
const CARD_ID = /^[A-Z]+-\d+$/u;

type Text = (value: string) => string;

function box(text: Text, items: readonly string[], empty: string): string {
  if (items.length === 0) return `<p>${text(empty)}</p>`;
  return ['<ul>', ...items.map((item) => `<li class="box">${item}</li>`), '</ul>'].join('\n');
}

function section(title: string, body: string): string {
  return [`<section class="box">`, `<h2>${title}</h2>`, body, '</section>'].join('\n');
}

function actionText(action: TargetScreen['actions'][number]): string {
  const how = [
    ...(action.handler === null ? [] : [`handler ${action.handler}`]),
    ...(action.flow === null ? [] : [`starts flow ${action.flow}`]),
  ];
  return how.length === 0 ? action.label : `${action.label} (${how.join(', ')})`;
}

type Field = TargetScreen['fields'][number];

function fieldText(field: Field, text: Text): string {
  return `${text(field.name)} (${text(field.inputKind)}, ${field.required ? 'required' : 'optional'})`;
}

/** The fields: the confirmed ones, then those of an old card, marked "not checked" (RF-626). */
function fieldItems(screen: TargetScreen, text: Text): string[] {
  return [
    ...screen.fields.map((field) => fieldText(field, text)),
    ...screen.uncheckedFields.map((field) => `${fieldText(field, text)} - not checked`),
  ];
}

function emptyFields(screen: TargetScreen): string {
  return screen.fieldsNotConfirmed ? 'fields not confirmed' : 'This screen has no field.';
}

/** The wireframe of a target screen; `mask` hides the secrets in every text first. */
// RF-626
export function wireframeHtml(screen: TargetScreen, mask: Text): string {
  const text: Text = (value) => escapeHtml(mask(value));
  const fields = fieldItems(screen, text);
  const actions = screen.actions.map((action) => text(actionText(action)));
  const navigation = screen.navigation.map((link) =>
    link.screenId !== null && CARD_ID.test(link.screenId)
      ? `<a href="${link.screenId}.html">${text(link.label)}</a>`
      : text(link.label),
  );
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${POLICY}">`,
    `<title>${text(screen.name)} - wireframe</title>`,
    `<style>\n${STYLE}\n</style>`,
    '</head>',
    '<body>',
    '<header class="box">',
    `<h1>${text(screen.name)}</h1>`,
    `<p>${text(screen.purpose)}</p>`,
    `<p>Replaces the legacy screens: ${screen.cards.map(text).join(', ')}.</p>`,
    '</header>',
    `<nav class="box" aria-label="Navigation">`,
    `<h2>Navigation</h2>`,
    box(text, navigation, 'This screen leads nowhere.'),
    '</nav>',
    '<main class="box">',
    section('Fields', box(text, fields, emptyFields(screen))),
    section('Actions', box(text, actions, 'This screen has no action.')),
    '</main>',
    '<footer class="box">',
    `<p>Roles: ${screen.roles.length === 0 ? 'none named' : screen.roles.map(text).join(', ')}.</p>`,
    `<p>Why: ${text(screen.reason)}</p>`,
    '<p>Low-fidelity wireframe: layout boxes only, no visual design (RF-626).</p>',
    '</footer>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
