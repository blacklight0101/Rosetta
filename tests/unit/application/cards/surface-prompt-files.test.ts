import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseCardOutput } from '../../../../src/application/cards/parse-cards.js';

// RF-260, RF-261, DEC-134, RNF-004: the flows and screens fragments are versioned prompt files whose
// example answers must pass the same card schema that checks the model's answers, and that tell
// the agent to read first, to cite every step, to turn a suspected path into an OQ card and never
// to write a diagram.

const read = (name: string): Promise<string> =>
  readFile(`prompts/cards/${name}`, 'utf8').catch(() => '');

// Markdown wraps lines anywhere, so the wording is checked with line ends as spaces.
const flat = (text: string): string => text.replace(/\s+/gu, ' ');
const flowsFile = await read('flows.v1.md');
const screensFile = await read('screens.v2.md');
const flowsPrompt = flat(flowsFile);
const screensPrompt = flat(screensFile);

function exampleOf(prompt: string) {
  const example = /```json\n([\s\S]*?)```/.exec(prompt)?.[1] ?? '';
  const parsed = parseCardOutput(example);
  return parsed.ok ? parsed.value : [];
}

describe('the flows fragment', () => {
  it('RF-260 its example answer is one FLOW card that passes the card schema', () => {
    const [card] = exampleOf(flowsFile);

    expect(card?.type).toBe('FLOW');
    expect(card?.flow?.trigger.length).toBeGreaterThan(0);
  });

  it('RF-260 every step of the example is cited and one step has a cited branch', () => {
    const [card] = exampleOf(flowsFile);

    expect(card?.claims.length).toBeGreaterThan(1);
    expect(card?.claims.every((claim) => claim.citations.length > 0)).toBe(true);
    expect(card?.claims.some((claim) => (claim.branches ?? []).length > 0)).toBe(true);
  });

  it('RF-260 explains that ids are numbered after the answer, so no step names one', () => {
    const [card] = exampleOf(flowsFile);

    expect(card?.claims.every((claim) => claim.target === undefined)).toBe(true);
    expect(flowsPrompt).toContain('numbered after');
  });

  it('RF-260 sends a path the agent only suspects to an OQ card, not a step', () => {
    expect(flowsPrompt).toContain('`OQ`');
    expect(flowsPrompt).toMatch(/only suspect/u);
  });

  it('DEC-134 forbids writing diagrams: Rosetta draws them', () => {
    expect(flowsPrompt).toMatch(/never write (a )?(Mermaid|diagram)/iu);
  });

  it('RF-260 names what an entry point is', () => {
    for (const word of ['page action', 'HTTP handler', 'scheduled job', 'message handler']) {
      expect(flowsPrompt).toContain(word);
    }
  });
});

describe('the screens fragment', () => {
  it('RF-261 its example answer is one SCRN card that passes the card schema', () => {
    const [card] = exampleOf(screensFile);

    expect(card?.type).toBe('SCRN');
    expect(card?.screen?.route.length).toBeGreaterThan(0);
  });

  it('RF-261 the example has a field with a cited validation, an action with a handler and a target', () => {
    const [card] = exampleOf(screensFile);
    const screen = card?.screen;

    expect(screen?.fields.some((field) => field.validations.length > 0)).toBe(true);
    expect(screen?.actions.some((action) => action.handler !== undefined)).toBe(true);
    expect((screen?.leadsTo ?? []).length).toBeGreaterThan(0);
  });

  it('RF-261 asks for the validations the code states and sends a suspected one to an OQ card', () => {
    expect(screensPrompt).toContain('`OQ`');
    expect(screensPrompt).toMatch(/only suspect/u);
    expect(screensPrompt).toMatch(/never invent a validation/iu);
  });

  it('DEC-134 forbids writing diagrams: Rosetta draws the screen map', () => {
    expect(screensPrompt).toMatch(/never write (a )?(Mermaid|diagram)/iu);
  });

  it('RF-261 names pages, forms, views and templates', () => {
    for (const word of ['pages', 'forms', 'views', 'templates']) {
      expect(screensPrompt).toContain(word);
    }
  });
});
