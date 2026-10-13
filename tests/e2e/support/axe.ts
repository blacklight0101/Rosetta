import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';

// RNF-010, DEC-52: WCAG 2.1 AA by axe on the page as it is now. Serious and critical violations
// fail; minor and moderate ones are for the verifier's page walk.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const FAILING: ReadonlySet<string> = new Set(['serious', 'critical']);

/** Throws, listing rule ids and impact, when axe finds a serious or critical violation. */
// RNF-010
export async function expectNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const failing = results.violations.filter(
    (violation) =>
      violation.impact !== undefined && violation.impact !== null && FAILING.has(violation.impact),
  );
  if (failing.length === 0) return;
  const lines = failing.map(
    (violation) =>
      `${String(violation.impact)} ${violation.id}: ${violation.help} (${String(violation.nodes.length)} node(s): ${violation.nodes.map((node) => `${node.target.join(' ')} ${node.any.map((check) => check.message).join(' ')}`).join('; ')})`,
  );
  throw new Error(`Accessibility violations on ${page.url()}:\n${lines.join('\n')}`);
}

/**
 * Opens a page as a browser with JavaScript off sees it, and leaves it ready for axe. axe is itself
 * a script, so it cannot run in a context that has JavaScript off (`javaScriptEnabled: false` makes
 * `analyze` wait until the test times out). Script execution is therefore switched off for the page
 * load only: the scripts of the page pass unrun, and switching it back on afterwards leaves the
 * document exactly as a JavaScript-free browser shows it, with none of them running later.
 */
// RNF-010
export async function gotoWithoutScripts(page: Page, url: string): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Emulation.setScriptExecutionDisabled', { value: true });
    await page.goto(url);
    await session.send('Emulation.setScriptExecutionDisabled', { value: false });
  } finally {
    await session.detach();
  }
}
