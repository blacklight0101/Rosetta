import type { StackLayer } from './planning-brief.js';
import type { StackTechnology, StackTrait } from './stack-data.js';

// RF-609: reading the technologies of the catalogue (`stack-technologies.v<n>.yaml`). A choice of
// the brief is free text (untrusted); it names a technology only when one of its aliases appears in
// it as a whole word. A choice no alias names has no trait and takes part in no rule.

/**
 * The words that mark a source card or a task card as speaking about a layer. A card matches when a
 * term appears in its title, summary or a claim, as a whole word (RF-609).
 */
export const layerTerms: Readonly<Record<StackLayer, readonly string[]>> = {
  'language-runtime': [
    'c#',
    'vb.net',
    '.net framework',
    '.net',
    'java',
    'python',
    'php',
    'runtime',
  ],
  'backend-framework': [
    'asp.net',
    'web api',
    'wcf',
    'web service',
    'spring',
    'django',
    'controller',
  ],
  'front-end': [
    'razor',
    'web forms',
    'webforms',
    'aspx',
    'cshtml',
    'html',
    'javascript',
    'jquery',
    'angular',
    'react',
    'user interface',
  ],
  database: [
    'database',
    'sql server',
    'oracle',
    'mysql',
    'postgresql',
    'postgres',
    'sqlite',
    'stored procedure',
  ],
  'data-access': [
    'entity framework',
    'ef core',
    'dapper',
    'ado.net',
    'nhibernate',
    'hibernate',
    'orm',
    'dbcontext',
    'repository',
  ],
  testing: ['unit test', 'xunit', 'nunit', 'mstest', 'jest', 'test suite'],
  hosting: [
    'iis',
    'azure',
    'docker',
    'container',
    'hosting',
    'deployment',
    'kubernetes',
    'web.config',
  ],
};

function escaped(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

const patterns = new Map<string, RegExp>();

function patternOf(term: string): RegExp {
  const known = patterns.get(term);
  if (known !== undefined) return known;
  const made = new RegExp(`(?:^|[^a-z0-9])${escaped(term)}(?:$|[^a-z0-9])`, 'u');
  patterns.set(term, made);
  return made;
}

/** Whether the text holds the term as a whole word (so `java` is not found in `javascript`). */
// RF-609
export function mentions(text: string, term: string): boolean {
  return patternOf(term).test(text.toLowerCase());
}

/** The known technologies of a layer that the free-text choice names. */
// RF-609
export function technologiesNamed(
  technologies: readonly StackTechnology[],
  layer: StackLayer,
  choice: string,
): StackTechnology[] {
  return technologies.filter(
    (tech) => tech.layer === layer && tech.aliases.some((alias) => mentions(choice, alias)),
  );
}

/** The traits the free-text choice has for a layer, from the technologies it names. */
// RF-609
export function traitsOf(
  technologies: readonly StackTechnology[],
  layer: StackLayer,
  choice: string,
): ReadonlySet<StackTrait> {
  return new Set(technologiesNamed(technologies, layer, choice).flatMap((tech) => tech.traits));
}
