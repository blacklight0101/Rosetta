import { planId } from './plan-content.js';

// P5-34, RF-141, RF-608: the plan lists each file of the analysed code that holds a secret written
// in plain text (the masker replaced it before any model read it), with its path and its line
// numbers and never the value. The wording is the prompt file `shared/secret-risk.v1.md`; this
// fills its two placeholders.

/** A file that holds a masked secret and the numbers of its lines, from 1. */
export interface SecretSite {
  readonly path: string;
  readonly lines: readonly number[];
}

/** The files that hold a masked secret and the wording of the risk for each (the prompt file). */
export interface SecretRisks {
  readonly sites: readonly SecretSite[];
  readonly template: string;
}

/** The two places the prompt file must hold exactly once. */
export const secretRiskPlaceholders = { path: '{{path}}', lines: '{{lines}}' } as const;

/** The most lines named for one file; the rest are counted (the package stays small and bounded). */
const MOST_LINES = 20;

interface SecretRisk {
  readonly id: string;
  readonly text: string;
  readonly sources: readonly string[];
}

function linesText(lines: readonly number[]): string {
  if (lines.length <= MOST_LINES) return lines.join(', ');
  const rest = lines.length - MOST_LINES;
  return `${lines.slice(0, MOST_LINES).join(', ')} and ${String(rest)} more`;
}

/** The template with both placeholders replaced in one pass, so a path never reads as a placeholder. */
function filled(template: string, site: SecretSite): string {
  return template
    .trim()
    .replace(/\{\{(?:path|lines)\}\}/gu, (placeholder) =>
      placeholder === secretRiskPlaceholders.path ? site.path : linesText(site.lines),
    );
}

/** The risks of the plan, then one for each file that holds a masked secret, with no source card. */
// RF-608
export function addSecretRisks<T extends SecretRisk>(
  risks: readonly T[],
  sites: readonly SecretSite[],
  template: string,
): readonly (T | SecretRisk)[] {
  if (sites.length === 0) return risks;
  return [
    ...risks,
    ...sites.map((site, index) => ({
      id: planId('RISK', risks.length + index + 1),
      text: filled(template, site),
      sources: [],
    })),
  ];
}
