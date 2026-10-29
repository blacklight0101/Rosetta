import type { RiskClass } from './task-card-quality.js';

// RF-640, P6-28, DEC-190, RNF-004: the hard-rule greps of orchestration.md, read from
// `prompts/catalogue/grep-rules.v<n>.yaml`. The file holds the languages with the aliases that map
// a stack answer to each, and the rules with the patterns per language, so no pattern and no alias
// is a literal in code and a change to either changes the catalogue hash.

/** A language the table has patterns for, and the words a stack answer uses to name it. */
export interface GrepLanguage {
  readonly id: string;
  /** Lower case words or names (`dotnet`, `.net`, `c#`); an answer names the language when it holds one. */
  readonly aliases: readonly string[];
}

export interface GrepRule {
  /** Rosetta's own words for the rule, shown in the table. */
  readonly rule: string;
  /** The principle and style ids whose catalogue text states the rule. */
  readonly stated: readonly string[];
  /** The principle and style ids whose catalogue text names the rule's area but not the rule. */
  readonly suggested: readonly string[];
  /** The risk classes of a card that suggest the rule. */
  readonly risks: readonly RiskClass[];
  /** Search patterns by language id; the key `any` holds those that hold in every language. */
  readonly patterns: Readonly<Record<string, readonly string[]>>;
}

export interface GrepRules {
  /** The `v<n>` of `grep-rules.v<n>.yaml`. */
  readonly version: number;
  /** In the order the table lists a language's patterns. */
  readonly languages: readonly GrepLanguage[];
  readonly rules: readonly GrepRule[];
}

/** No language, no rule: a catalogue built by hand for a test that does not use the table. */
export const noGrepRules: GrepRules = { version: 0, languages: [], rules: [] };

const BS = String.fromCharCode(92);
const wordChar = /[\p{L}\p{N}]/u;
const regexSpecials = new Set([
  BS,
  '^',
  '$',
  '.',
  '*',
  '+',
  '?',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '|',
]);

/** The alias as a pattern: a word edge of the alias must not touch another letter or digit. */
function aliasPattern(alias: string): RegExp {
  const escaped = alias
    .split('')
    .map((char) => (regexSpecials.has(char) ? `${BS}${char}` : char))
    .join('');
  const before = wordChar.test(alias.charAt(0)) ? '(?<![\\p{L}\\p{N}])' : '';
  const after = wordChar.test(alias.charAt(alias.length - 1)) ? '(?![\\p{L}\\p{N}])' : '';
  return new RegExp(`${before}${escaped}${after}`, 'iu');
}

/** Whether a stack answer (free text) names the language by one of its aliases, ignoring case. */
export function languageNamedBy(language: GrepLanguage, answer: string): boolean {
  return language.aliases.some((alias) => aliasPattern(alias).test(answer));
}
