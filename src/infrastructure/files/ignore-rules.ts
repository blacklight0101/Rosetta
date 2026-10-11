import ignore, { type Ignore } from 'ignore';

// RF-147: common secret files are excluded even without an ignore rule.
export const builtInDenyPatterns = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.pfx',
  '*.p12',
  'id_rsa*',
  '*.kdbx',
] as const;

export type PathVerdict = 'allowed' | 'ignored' | 'denied';

export interface IgnoreRulesInput {
  /** The project's `scan.ignoreRules` (gitignore syntax). */
  readonly settingsRules: string;
  /** The text of a `.rosettaignore` committed in the analysed repository, or ''. */
  readonly repositoryRules: string;
  /** The project's `scan.allowDenied`: built-in deny patterns to lift. */
  readonly allowDenied: readonly string[];
}

function matcher(rules: string | readonly string[]): Ignore {
  // Case is ignored so a differently cased name is never a way round a rule (fails closed).
  return ignore({ ignorecase: true }).add(rules);
}

/**
 * RF-140, RF-147, DEC-109: the deny list, the project's rules and the repository's rules are three
 * separate matchers, so a negation in one can never lift a pattern of another; the repository's
 * file can therefore only add exclusions.
 */
export class IgnoreRules {
  readonly liftedDenyPatterns: readonly string[];
  readonly #deny: Ignore;
  readonly #rules: readonly Ignore[];

  constructor(input: IgnoreRulesInput) {
    this.liftedDenyPatterns = builtInDenyPatterns.filter((pattern) =>
      input.allowDenied.includes(pattern),
    );
    this.#deny = matcher(
      builtInDenyPatterns.filter((pattern) => !this.liftedDenyPatterns.includes(pattern)),
    );
    this.#rules = [matcher(input.settingsRules), matcher(input.repositoryRules)];
  }

  /** The verdict for a checked repository-relative path; the deny list wins over the rules. */
  verdict(path: string): PathVerdict {
    if (this.#deny.ignores(path)) return 'denied';
    return this.#rules.some((rules) => rules.ignores(path)) ? 'ignored' : 'allowed';
  }
}

/** RF-146: a gitignore-style pattern that limits the files a search covers. */
export function pathFilter(pattern: string): (path: string) => boolean {
  const selected = ignore({ ignorecase: true }).add(pattern);
  return (path) => selected.ignores(path);
}
