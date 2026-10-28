import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { RiskClass } from '../../domain/planning/task-card-quality.js';

// RF-640, P6-07: the hard-rule greps of orchestration.md come from what the package states. A rule
// gets a row only when a chosen principle, the chosen style or the risk class of a card states it,
// and a pattern of one language is listed only when the brief's stack names that language. Each
// rule keeps the patterns that hold in any language under `any`.

type Language = 'javascript' | 'dotnet' | 'java' | 'python' | 'php';

/** The order in which a row lists its patterns: any language first, then by language. */
const languageOrder: readonly Language[] = ['javascript', 'dotnet', 'java', 'python', 'php'];

/** How a stack answer (free text) names each language, its runtimes or its main frameworks. */
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
  /** The principle and style ids of the catalogue that state the rule. */
  readonly principles: readonly string[];
  /** The risk classes of a card that call for the rule. */
  readonly risks: readonly RiskClass[];
  readonly patterns: Readonly<Partial<Record<Language | 'any', readonly string[]>>>;
}

const security = ['security-by-design', 'owasp-top-10', 'secure-sdlc', 'stride'];

const grepRules: readonly GrepRule[] = [
  {
    rule: 'Text from users and models is shown as text, never as markup',
    principles: ['owasp-top-10', 'security-by-design'],
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
    principles: ['owasp-top-10', 'security-by-design'],
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
    principles: ['owasp-top-10'],
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
    principles: ['security-by-design'],
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
    principles: ['security-by-design', 'secure-sdlc'],
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
    principles: [...security, 'containers', 'observability'],
    risks: ['security boundary'],
    patterns: { any: ['-----BEGIN', 'password =', 'secret =', 'token ='] },
  },
  {
    rule: 'Logs go through the structured logger',
    principles: ['observability'],
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
    principles: ['containers'],
    risks: [],
    patterns: { any: ['USER root'] },
  },
  {
    rule: 'Data is removed only by a reviewed migration',
    principles: [],
    risks: ['data loss'],
    patterns: { any: ['DROP TABLE', 'TRUNCATE'] },
  },
  {
    rule: 'Amounts of money are never floating-point numbers',
    principles: [],
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

/** A row of the grep table: the patterns, the rule and what in the package states it. */
export interface GrepRow {
  readonly patterns: readonly string[];
  readonly rule: string;
  /** Principle titles (catalogue text) and risk class names, in the package's order. */
  readonly statedBy: readonly string[];
}

/** The languages the stack answers name, in `languageOrder`. */
export function stackLanguages(handoff: HandoffPackage): readonly Language[] {
  const answers = handoff.choices.stack.map((each) => each.choice);
  return languageOrder.filter((language) =>
    answers.some((answer) => languageNames[language].test(answer)),
  );
}

function statedBy(handoff: HandoffPackage, rule: GrepRule): string[] {
  const chosen = [handoff.style, ...handoff.principles];
  const risks = new Set(handoff.content.tasks.map((task) => task.riskClass));
  return [
    ...chosen.filter((each) => rule.principles.includes(each.id)).map((each) => each.title),
    ...rule.risks.filter((risk) => risks.has(risk)).map((risk) => `risk class ${risk}`),
  ];
}

function patternsOf(rule: GrepRule, languages: readonly Language[]): string[] {
  return [...(rule.patterns.any ?? []), ...languages.flatMap((each) => rule.patterns[each] ?? [])];
}

/** RF-640: the rows the package states, each with the patterns of its stack; empty when none applies. */
export function grepRows(handoff: HandoffPackage): readonly GrepRow[] {
  const languages = stackLanguages(handoff);
  return grepRules.flatMap((rule) => {
    const stated = statedBy(handoff, rule);
    const patterns = [...new Set(patternsOf(rule, languages))];
    return stated.length === 0 || patterns.length === 0
      ? []
      : [{ patterns, rule: rule.rule, statedBy: stated }];
  });
}
