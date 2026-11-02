import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { PackageStack } from '../../domain/planning/brief-decisions.js';
import { languageNamedBy, type GrepRule } from '../../domain/planning/grep-rules.js';

// RF-640, P6-07, P6-28, DEC-190: the hard-rule greps of orchestration.md come from the package and
// from the catalogue file `grep-rules.v<n>.yaml` it carries (patterns, rules and the aliases that
// name a language; no pattern or alias is written here). A rule gets a row only when a chosen
// principle, the chosen style or the risk class of a card calls for it. A row is "stated by" a
// principle whose catalogue text (rule or check) states the rule, and "suggested by" a principle
// that only names the rule's area, or by a risk class (risk-class.v1.md states no rule of its
// own); the team may drop a suggested row. A pattern of one language is listed only when the
// brief's stack names that language; the patterns that hold in any language are under `any`. A
// rule a principle states that has no pattern for the stack is a row with no patterns, which
// orchestration.md calls "checked by reading".

/** What in the package calls for a row: a principle or style that states or suggests it, or a risk class. */
export interface GrepSource {
  readonly kind: 'stated' | 'suggested';
  /** The principle or style title (catalogue text), or `the risk class <name>`. */
  readonly name: string;
}

/** A row of the grep table: the patterns, the rule and what in the package calls for it. */
export interface GrepRow {
  /** Empty when the rule is stated but has no pattern for the stack: it is checked by reading. */
  readonly patterns: readonly string[];
  readonly rule: string;
  /** The stated sources first, then the suggested ones, each in the package's order. */
  readonly sources: readonly GrepSource[];
}

/** The ids of the languages the owner's stack answers name; a layer Rosetta proposed counts for none (P7-21). */
export function stackLanguages(handoff: HandoffPackage): readonly string[] {
  const answers = handoff.choices.stack
    .filter((each) => each.proposed !== true)
    .map((each) => each.choice);
  return handoff.grepRules.languages
    .filter((language) => answers.some((answer) => languageNamedBy(language, answer)))
    .map((language) => language.id);
}

/** A layer Rosetta proposed whose language the owner named in no layer: its patterns are left out. */
export function leftOutLayers(handoff: HandoffPackage): readonly PackageStack[] {
  const owned = new Set(stackLanguages(handoff));
  return handoff.choices.stack.filter(
    (each) =>
      each.proposed === true &&
      handoff.grepRules.languages.some(
        (language) => !owned.has(language.id) && languageNamedBy(language, each.choice),
      ),
  );
}

/** The `language-runtime` answers of the stack that name no language of the table, in stack order. */
export function unlistedLanguages(handoff: HandoffPackage): readonly string[] {
  const { languages } = handoff.grepRules;
  return handoff.choices.stack
    .filter((each) => each.layer === 'language-runtime')
    .map((each) => each.choice)
    .filter((answer) => languages.every((language) => !languageNamedBy(language, answer)));
}

function sourcesOf(handoff: HandoffPackage, rule: GrepRule): GrepSource[] {
  const chosen = [handoff.style, ...handoff.principles];
  const risks = new Set(handoff.content.tasks.map((task) => task.riskClass));
  const by = (kind: GrepSource['kind'], ids: readonly string[]): GrepSource[] =>
    chosen.filter((each) => ids.includes(each.id)).map((each) => ({ kind, name: each.title }));
  const byRisk = rule.risks
    .filter((risk) => risks.has(risk))
    .map((risk): GrepSource => ({ kind: 'suggested', name: `the risk class ${risk}` }));
  return [...by('stated', rule.stated), ...by('suggested', rule.suggested), ...byRisk];
}

function patternsOf(rule: GrepRule, languages: readonly string[]): string[] {
  return [
    ...(rule.patterns['any'] ?? []),
    ...languages.flatMap((each) => rule.patterns[each] ?? []),
  ];
}

/**
 * RF-640: the rows the package calls for, each with the patterns of its stack; empty when none
 * applies. A rule with no pattern for the stack stays as a row only when a principle states it.
 */
export function grepRows(handoff: HandoffPackage): readonly GrepRow[] {
  const languages = stackLanguages(handoff);
  return handoff.grepRules.rules.flatMap((rule) => {
    const sources = sourcesOf(handoff, rule);
    const patterns = [...new Set(patternsOf(rule, languages))];
    const stated = sources.some((each) => each.kind === 'stated');
    return sources.length === 0 || (patterns.length === 0 && !stated)
      ? []
      : [{ patterns, rule: rule.rule, sources }];
  });
}
