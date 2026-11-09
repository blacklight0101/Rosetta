import { runStep } from './workflow-yaml.js';

// RF-1304: runs a workflow step that comments on the issue "Production deploys" against a fake gh.
// The fake is an exported shell function, so it also answers inside the shared script that the step
// starts with bash (scripts/production-deploys-comment.sh); each call goes to a file that outlives
// the subshells and child shells. Nothing reaches GitHub.

const prelude = `
calls_file="$(mktemp)"
export calls_file
gh() {
  printf '|%s' "$*" >> "$calls_file"
  case "$1 $2" in
    'issue list') printf '%s' "$FAKE_ISSUES" ;;
    'issue create') echo 'https://github.com/blacklight0101/Rosetta/issues/77' ;;
  esac
}
export -f gh
trap 'echo "CALLS$(cat "$calls_file")"; rm -f "$calls_file"' EXIT`;

/** What the step did: its exit code and the gh command lines it ran, in order. */
export interface CommentRun {
  readonly code: number;
  readonly calls: string[];
}

/**
 * Runs `script` with `env`, where gh lists `issues` (number<TAB>title, one per line) for
 * `gh issue list` and answers issue 77 for `gh issue create`.
 */
export async function runCommentStep(
  script: string,
  env: Readonly<Record<string, string>>,
  issues: string,
): Promise<CommentRun> {
  const { code, output } = await runStep(script, { ...env, FAKE_ISSUES: issues }, prelude);
  const line = output.split('\n').find((each) => each.startsWith('CALLS')) ?? 'CALLS';
  return { code, calls: line.slice('CALLS'.length).split('|').filter(Boolean) };
}

/** The `gh issue comment` call of a run; empty when there is none. */
export function commentOf(run: CommentRun): string {
  return run.calls.find((call) => call.startsWith('issue comment')) ?? '';
}
