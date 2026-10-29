import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { RiskClass } from '../../domain/planning/task-card-quality.js';

// RF-640, P6-07: the hard-rule greps of orchestration.md come from the package. A rule gets a row
// only when a chosen principle, the chosen style or the risk class of a card calls for it. A row is
// "stated by" a principle whose catalogue text (rule or check) states the rule, and "suggested by" a
// principle that only names the rule's area, or by a risk class (risk-class.v1.md states no rule of
// its own); the team may drop a suggested row. A pattern of one language is listed only when the
// brief's stack names that language; the patterns that hold in any language are under `any`.

type Language = 'javascript' | 'dotnet' | 'java' | 'python' | 'php';

/** The order in which a row lists its patterns: any language first, then by language. */
const languageOrder: readonly Language[] = ['javascript', 'dotnet', 'java', 'python', 'php'];

/**
 * How a stack answer (free text) names each language, its runtimes or its main frameworks. Keep it in
 * step with the aliases of the `language-runtime` layer in prompts/catalogue/stack-technologies.v2.yaml
 * (whether this table moves into the catalogue is an open owner question).
 */
const languageNames: Readonly<Record<Language, RegExp>> = {
  javascript:
    /\b(?:typescript|javascript|node(?:\.js)?|deno|bun|react|angular|vue|svelte|next\.js|nestjs)\b/iu,
  dotnet: /(?:\.net\b|c#|f#|\bblazor\b)/iu,
  java: /\b(?:java|kotlin|spring|jakarta)\b/iu,
  python: /\b(?:python|django|flask|fastapi)\b/iu,
  php: /\b(?:php|laravel|symfony)\b/iu,
};

interface GrepRule {
  readonly rule: string;
  /** The principle and style ids whose catalogue text states the rule. */
  readonly stated: readonly string[];
  /** The principle and style ids whose catalogue text names the rule's area but not the rule. */
  readonly suggested: readonly string[];
  /** The risk classes of a card that suggest the rule. */
  readonly risks: readonly RiskClass[];
  readonly patterns: Readonly<Partial<Record<Language | 'any', readonly string[]>>>;
}

const grepRules: readonly GrepRule[] = [
  {
    rule: 'Text from users and models is shown as text, never as markup',
    stated: [],
    suggested: ['owasp-top-10', 'security-by-design'],
    risks: ['security boundary'],
    patterns: {
      javascript: ['innerHTML', 'dangerouslySetInnerHTML'],
      dotnet: ['Html.Raw(', 'MarkupString'],
      java: ['th:utext'],
      python: ['mark_safe('],
    },
  },
  {
    rule: 'Nothing runs code built from input',
    stated: [],
    suggested: ['owasp-top-10', 'security-by-design'],
    risks: ['security boundary'],
    patterns: {
      javascript: ['eval(', 'new Function'],
      dotnet: ['CSharpScript'],
      java: ['ScriptEngine'],
      python: ['eval(', 'exec('],
      php: ['eval(', 'create_function('],
    },
  },
  {
    rule: 'Queries take parameters, never input joined into the text',
    // owasp-top-10 check: "automated scans and tests cover access control, injection".
    stated: ['owasp-top-10'],
    suggested: [],
    risks: ['security boundary', 'data loss'],
    patterns: {
      dotnet: ['FromSqlRaw(', 'ExecuteSqlRaw('],
      java: ['createStatement(', 'createNativeQuery('],
      python: ['.execute(f"'],
      php: ['mysqli_query(', '->query("'],
    },
  },
  {
    rule: 'No shell commands from application code',
    stated: [],
    suggested: ['security-by-design'],
    risks: ['security boundary'],
    patterns: {
      javascript: ['child_process', 'shell: true'],
      dotnet: ['Process.Start('],
      java: ['Runtime.getRuntime().exec', 'ProcessBuilder'],
      python: ['subprocess', 'os.system('],
      php: ['shell_exec(', 'passthru('],
    },
  },
  {
    rule: 'Certificate checks are never switched off',
    stated: [],
    suggested: ['security-by-design', 'secure-sdlc'],
    risks: ['security boundary'],
    patterns: {
      javascript: ['rejectUnauthorized', 'NODE_TLS_REJECT_UNAUTHORIZED'],
      dotnet: ['ServerCertificateCustomValidationCallback'],
      java: ['X509TrustManager', 'NoopHostnameVerifier'],
      python: ['verify=False'],
      php: ['CURLOPT_SSL_VERIFYPEER'],
    },
  },
  {
    rule: 'No secret in code, tests, images or logs',
    // security-by-design: "secrets never appear in code or logs"; containers: "holds no secrets";
    // observability: "logs carry no secrets". secure-sdlc only names secret scanning in CI.
    stated: ['security-by-design', 'containers', 'observability'],
    suggested: ['owasp-top-10', 'secure-sdlc', 'stride'],
    risks: ['security boundary'],
    patterns: { any: ['-----BEGIN', 'password =', 'secret =', 'token ='] },
  },
  {
    rule: 'Logs go through the structured logger',
    // observability rule: "Emit structured logs".
    stated: ['observability'],
    suggested: [],
    risks: [],
    patterns: {
      javascript: ['console.'],
      dotnet: ['Console.Write'],
      java: ['System.out.print', 'printStackTrace('],
      python: ['print('],
      php: ['var_dump(', 'print_r('],
    },
  },
  {
    rule: 'The image runs as a user without administrator rights',
    // containers check: "runs as a non-root user".
    stated: ['containers'],
    suggested: [],
    risks: [],
    patterns: { any: ['USER root'] },
  },
  {
    rule: 'Data is removed only by a reviewed migration',
    stated: [],
    suggested: [],
    risks: ['data loss'],
    patterns: { any: ['DROP TABLE', 'TRUNCATE'] },
  },
  {
    rule: 'Amounts of money are never floating-point numbers',
    stated: [],
    suggested: [],
    risks: ['money'],
    patterns: {
      javascript: ['parseFloat('],
      dotnet: ['double ', 'float '],
      java: ['double ', 'float '],
      python: ['float('],
      php: ['floatval('],
    },
  },
];

/** What in the package calls for a row: a principle or style that states or suggests it, or a risk class. */
export interface GrepSource {
  readonly kind: 'stated' | 'suggested';
  /** The principle or style title (catalogue text), or `the risk class <name>`. */
  readonly name: string;
}

/** A row of the grep table: the patterns, the rule and what in the package calls for it. */
export interface GrepRow {
  readonly patterns: readonly string[];
  readonly rule: string;
  /** The stated sources first, then the suggested ones, each in the package's order. */
  readonly sources: readonly GrepSource[];
}

/** The languages the stack answers name, in `languageOrder`. */
export function stackLanguages(handoff: HandoffPackage): readonly Language[] {
  const answers = handoff.choices.stack.map((each) => each.choice);
  return languageOrder.filter((language) =>
    answers.some((answer) => languageNames[language].test(answer)),
  );
}

/** The `language-runtime` answers of the stack that name no language of the table, in stack order. */
export function unlistedLanguages(handoff: HandoffPackage): readonly string[] {
  return handoff.choices.stack
    .filter((each) => each.layer === 'language-runtime')
    .map((each) => each.choice)
    .filter((answer) => languageOrder.every((language) => !languageNames[language].test(answer)));
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

function patternsOf(rule: GrepRule, languages: readonly Language[]): string[] {
  return [...(rule.patterns.any ?? []), ...languages.flatMap((each) => rule.patterns[each] ?? [])];
}

/** RF-640: the rows the package calls for, each with the patterns of its stack; empty when none applies. */
export function grepRows(handoff: HandoffPackage): readonly GrepRow[] {
  const languages = stackLanguages(handoff);
  return grepRules.flatMap((rule) => {
    const sources = sourcesOf(handoff, rule);
    const patterns = [...new Set(patternsOf(rule, languages))];
    return sources.length === 0 || patterns.length === 0
      ? []
      : [{ patterns, rule: rule.rule, sources }];
  });
}
