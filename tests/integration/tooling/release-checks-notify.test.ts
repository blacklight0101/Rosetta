import { describe, expect, it } from 'vitest';
import { commentOf, runCommentStep, type CommentRun } from '../../support/production-deploys-gh.js';
import {
  at,
  keysOf,
  stepScript,
  stepTexts,
  workflowDocument,
} from '../../support/workflow-yaml.js';

// RF-1304, DEC-207, P8-65: when release-checks.yml has recorded release/ready as failure (or could
// not record it), whatever the cause, its last step comments on the open issue "Production deploys"
// with the owner mentioned, the commit, the cause and the run, so the owner is told before the
// 06:00 release. It shares scripts/production-deploys-comment.sh, and so the issue lookup, with the
// deploy notification of release.yml (release-notify.test.ts). Checks that pass comment nothing.
// The step runs with bash against a fake gh; nothing reaches GitHub.

const checks = (): Promise<unknown> => workflowDocument('release-checks.yml');
const release = (): Promise<unknown> => workflowDocument('release.yml');
const name = 'Tell the owner the checks failed';
const ready = 'Record release/ready on the commit';
const sha = '0123456789abcdef0123456789abcdef01234567';
const runUrl = 'https://github.com/blacklight0101/Rosetta/actions/runs/42';

/** The steps of the checks job, as parsed. */
async function steps(): Promise<unknown[]> {
  const found = at(await checks(), 'jobs', 'checks', 'steps');
  const list: unknown[] = Array.isArray(found) ? found : [];
  return list;
}

/** The step of the checks job named exactly `stepName`. */
async function named(stepName: string): Promise<unknown> {
  return (await steps()).find((step) => at(step, 'name') === stepName);
}

/** Runs the failure comment step with the cause release/ready wrote, against `issues`. */
async function notify(cause: string, issues = '12\tProduction deploys'): Promise<CommentRun> {
  const script = stepScript(await checks(), 'checks', name);
  const env = {
    CAUSE: cause,
    GH_TOKEN: 'token',
    GH_REPO: 'blacklight0101/Rosetta',
    OWNER: 'blacklight0101',
    // The commit of the CI run; GITHUB_SHA is the head of develop under workflow_run.
    COMMIT: sha,
    GITHUB_SHA: 'f'.repeat(40),
    RUN_URL: runUrl,
  };
  return runCommentStep(script, env, issues);
}

describe('release-checks.yml failure comment: the step', () => {
  it('RF-1304 is the last step, after release/ready, and runs only when release/ready did not succeed, whatever failed before', async () => {
    const all = await steps();
    const last: unknown = all.at(-1);

    expect(at(last, 'name')).toBe(name);
    expect(at(all.at(-2), 'name')).toBe(ready);
    expect(at(all.at(-2), 'id')).toBe('ready');
    expect(at(last, 'if')).toBe("always() && steps.ready.outcome != 'success'");
    expect(keysOf(last)).toEqual(['name', 'if', 'run', 'env']);
  });

  it('RF-1304 reads the cause from release/ready, the owner and only the workflow token', async () => {
    expect(at(await named(name), 'env')).toEqual({
      CAUSE: '${{ steps.ready.outputs.cause }}',
      GH_TOKEN: '${{ github.token }}',
      GH_REPO: '${{ github.repository }}',
      OWNER: '${{ github.repository_owner }}',
      RUN_URL:
        '${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}',
    });
  });

  it('RF-1304 comments with the script of the deploy notification, so the issue lookup is the same', async () => {
    const own = stepScript(await checks(), 'checks', name);
    const deploy = stepScript(await release(), 'deploy', 'Tell the owner');
    const both = [
      ...stepTexts(await checks(), 'checks'),
      ...stepTexts(await release(), 'deploy'),
    ].join('\n');

    expect(own).toContain('bash scripts/production-deploys-comment.sh');
    expect(deploy).toContain('bash scripts/production-deploys-comment.sh');
    expect(both).not.toContain('gh issue');
  });
});

describe('release-checks.yml failure comment: what it posts', () => {
  it('RF-1304 comments on the open "Production deploys" issue, mentions the owner and names the commit, the cause and the run', async () => {
    const run = await notify('Not ready: the ZAP baseline did not pass on this commit.');
    const comment = commentOf(run);

    expect(run.code).toBe(0);
    expect(run.calls.some((call) => call.startsWith('issue create'))).toBe(false);
    expect(comment).toMatch(/^issue comment 12 --body @blacklight0101 /u);
    expect(comment).toContain(sha);
    expect(comment).toContain('Not ready: the ZAP baseline did not pass on this commit.');
    expect(comment).toContain('06:00');
    expect(comment).toContain(runUrl);
  });

  it('RF-1304 creates the "Production deploys" issue when none is open, and ignores a title that only contains the words', async () => {
    const none = await notify('Not ready: the checks were cancelled or timed out.', '');
    const lookalike = await notify('Not ready.', '5\tNot about Production deploys');

    expect(
      none.calls.some((call) => call.startsWith('issue create --title Production deploys')),
    ).toBe(true);
    expect(commentOf(none)).toContain('issue comment 77');
    expect(commentOf(lookalike)).toContain('issue comment 77');
  });

  it('RF-1304 still names a cause when release/ready could not be recorded', async () => {
    const comment = commentOf(await notify(''));

    expect(comment).toContain('@blacklight0101');
    expect(comment).toContain('release/ready could not be recorded');
  });
});
