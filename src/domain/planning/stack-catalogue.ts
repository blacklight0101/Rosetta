import type { StackLayer } from './planning-brief.js';

// RF-609: the technologies Rosetta knows for each stack layer, each with a one-line
// description and the traits the stack check reads. A choice of the brief is free text (untrusted);
// it names a technology here only when one of its aliases appears in it as a whole word. A choice
// no alias names has no trait and takes part in no rule. The descriptions are Rosetta's own words.

export type StackTrait = 'server-rendered' | 'single-page' | 'api-only';

export interface StackTechnology {
  readonly layer: StackLayer;
  readonly name: string;
  /** Lower case; matched as whole words inside the choice. */
  readonly aliases: readonly string[];
  readonly traits: readonly StackTrait[];
  /** One line. */
  readonly description: string;
}

export const stackTechnologies: readonly StackTechnology[] = [
  {
    ...{ layer: 'language-runtime', name: 'C# on .NET', traits: [] },
    aliases: ['c#', '.net', 'dotnet'],
    description:
      'A typed language and runtime with a large standard library; the usual target for ASP.NET Core.',
  },
  {
    ...{ layer: 'language-runtime', name: 'Java', traits: [] },
    aliases: ['java', 'jvm'],
    description: 'A typed language on the JVM with a mature ecosystem for long-lived services.',
  },
  {
    ...{ layer: 'language-runtime', name: 'TypeScript on Node.js', traits: [] },
    aliases: ['typescript', 'node.js', 'node'],
    description: 'One typed language for server and browser code, run on Node.js.',
  },
  {
    ...{ layer: 'language-runtime', name: 'Python', traits: [] },
    aliases: ['python'],
    description: 'A dynamic language with a wide library set, strong for data and scripting work.',
  },
  {
    ...{ layer: 'backend-framework', name: 'ASP.NET Core Minimal APIs', traits: ['api-only'] },
    aliases: ['minimal api', 'minimal apis'],
    description: 'Small HTTP endpoints without controllers; serves data, not pages.',
  },
  {
    ...{ layer: 'backend-framework', name: 'ASP.NET Core Web API', traits: ['api-only'] },
    aliases: ['web api', 'webapi'],
    description:
      'Controller-based HTTP APIs with model binding and validation; serves data, not pages.',
  },
  {
    ...{ layer: 'backend-framework', name: 'FastAPI', traits: ['api-only'] },
    aliases: ['fastapi'],
    description: 'A Python framework for typed HTTP APIs with generated OpenAPI documents.',
  },
  {
    ...{ layer: 'backend-framework', name: 'ASP.NET Core MVC', traits: [] },
    aliases: ['asp.net core mvc', 'aspnet core mvc'],
    description: 'Controllers and views in one application; serves pages and, when needed, data.',
  },
  {
    ...{ layer: 'front-end', name: 'Razor Pages', traits: ['server-rendered'] },
    aliases: ['razor pages', 'razor'],
    description: 'Page-based views rendered on the server; no separate API is needed.',
  },
  {
    ...{ layer: 'front-end', name: 'Blazor Server', traits: ['server-rendered'] },
    aliases: ['blazor server'],
    description: 'Components rendered on the server and updated over a live connection.',
  },
  {
    ...{ layer: 'front-end', name: 'React', traits: ['single-page'] },
    aliases: ['react'],
    description: 'A browser component library; the back end offers an API the pages call.',
  },
  {
    ...{ layer: 'front-end', name: 'Angular', traits: ['single-page'] },
    aliases: ['angular'],
    description: 'A browser application framework; the back end offers an API the pages call.',
  },
  {
    ...{ layer: 'database', name: 'SQL Server', traits: [] },
    aliases: ['sql server', 'mssql'],
    description:
      'A relational database common in .NET estates; the closest match to a legacy SQL Server.',
  },
  {
    ...{ layer: 'database', name: 'PostgreSQL', traits: [] },
    aliases: ['postgresql', 'postgres'],
    description: 'An open-source relational database with strong standards support.',
  },
  {
    ...{ layer: 'database', name: 'SQLite', traits: [] },
    aliases: ['sqlite'],
    description: 'A file-based relational database; fits a small single-node system.',
  },
  {
    ...{ layer: 'data-access', name: 'Entity Framework Core', traits: [] },
    aliases: ['entity framework', 'ef core', 'efcore'],
    description: 'An object-relational mapper with migrations and change tracking.',
  },
  {
    ...{ layer: 'data-access', name: 'Dapper', traits: [] },
    aliases: ['dapper'],
    description: 'A thin mapper over plain SQL; full control of each query.',
  },
  {
    ...{ layer: 'data-access', name: 'ADO.NET', traits: [] },
    aliases: ['ado.net'],
    description: 'The low-level .NET database API; most code, no hidden behaviour.',
  },
  {
    ...{ layer: 'testing', name: 'xUnit', traits: [] },
    aliases: ['xunit'],
    description: 'A .NET test framework with constructor-per-test isolation.',
  },
  {
    ...{ layer: 'testing', name: 'Vitest', traits: [] },
    aliases: ['vitest'],
    description: 'A fast test runner for TypeScript projects.',
  },
  {
    ...{ layer: 'testing', name: 'pytest', traits: [] },
    aliases: ['pytest'],
    description: 'A Python test runner with fixtures and plain assertions.',
  },
  {
    ...{ layer: 'hosting', name: 'IIS', traits: [] },
    aliases: ['iis'],
    description: 'The Windows web server; keeps an existing Windows deployment as it is.',
  },
  {
    ...{ layer: 'hosting', name: 'Docker containers', traits: [] },
    aliases: ['docker', 'container', 'containers'],
    description: 'One image that runs the same locally and on any container host.',
  },
  {
    ...{ layer: 'hosting', name: 'Azure App Service', traits: [] },
    aliases: ['app service', 'azure'],
    description: 'A managed web host that removes server upkeep.',
  },
] as readonly StackTechnology[];

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
export function technologiesNamed(layer: StackLayer, choice: string): StackTechnology[] {
  return stackTechnologies.filter(
    (tech) => tech.layer === layer && tech.aliases.some((alias) => mentions(choice, alias)),
  );
}

/** The traits the free-text choice has for a layer, from the technologies it names. */
// RF-609
export function traitsOf(layer: StackLayer, choice: string): ReadonlySet<StackTrait> {
  return new Set(technologiesNamed(layer, choice).flatMap((tech) => tech.traits));
}
