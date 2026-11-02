import { describe, expect, it } from 'vitest';
import {
  at,
  runStep,
  stepIndex,
  stepScript,
  workflowDocument,
} from '../../support/workflow-yaml.js';

// RF-1304: after a production deploy whose smoke test passed, the deploy job of
// .github/workflows/release.yml comments on the open issue "Production deploys" and mentions the
// owner, so GitHub emails them; a failure to comment never fails a deploy that is already live.

const release = (): Promise<unknown> => workflowDocument('release.yml');
const image = 'ghcr.io/blacklight0101/rosetta';

/** Runs the notification step against a fake gh that lists `issues` (number<TAB>title, one per line). */
async function notify(issues: string): Promise<{ code: number; calls: string[] }> {
  const script = stepScript(await release(), 'deploy', 'Tell the owner');
  const prelude = `
calls=''
gh() {
  calls="$calls|$*"
  case "$1 $2" in
    'issue list') printf '%s' "$FAKE_ISSUES" ;;
    'issue create') echo 'https://github.com/blacklight0101/Rosetta/issues/77' ;;
  esac
}
trap 'echo "CALLS$calls"' EXIT`;
  const env = {
    FAKE_ISSUES: issues,
    GH_TOKEN: 'token',
    GH_REPO: 'blacklight0101/Rosetta',
    OWNER: 'blacklight0101',
    IMAGE: image,
    SHA_TAG: 'sha-1234567',
    GITHUB_SHA: '1234567abcdef',
    ROSETTA_PUBLIC_URL: 'https://rosetta.example',
    RUN_URL: 'https://github.com/blacklight0101/Rosetta/actions/runs/9',
  };
  const { code, output } = await runStep(script, env, prelude);
  const line = output.split('\n').find((each) => each.startsWith('CALLS')) ?? 'CALLS';
  return { code, calls: line.slice('CALLS'.length).split('|').filter(Boolean) };
}

describe('release.yml deploy job notification (RF-1304)', () => {
  it('RF-1304 tells the owner only after the smoke test passed, and a failure to tell never fails the deploy', async () => {
    const document = await release();
    const steps = at(document, 'jobs', 'deploy', 'steps');
    const notifyStep: unknown = (Array.isArray(steps) ? steps : []).find((step: unknown) =>
      String(at(step, 'name')).includes('Tell the owner'),
    );

    expect(stepIndex(document, 'deploy', 'Tell the owner')).toBeGreaterThan(
      stepIndex(document, 'deploy', 'scripts/smoke.mjs'),
    );
    expect(at(notifyStep, 'if')).toBeUndefined();
    expect(at(notifyStep, 'continue-on-error')).toBe(true);
    expect(at(document, 'jobs', 'deploy', 'permissions', 'issues')).toBe('write');
  });

  it('RF-1304 comments on the open "Production deploys" issue and mentions the owner with the image, commit, URL and run', async () => {
    const { code, calls } = await notify('12\tProduction deploys');
    const comment = calls.find((call) => call.startsWith('issue comment')) ?? '';

    expect(code).toBe(0);
    expect(calls.some((call) => call.startsWith('issue create'))).toBe(false);
    expect(comment).toContain('issue comment 12');
    expect(comment).toContain('@blacklight0101');
    expect(comment).toContain(`${image}:sha-1234567`);
    expect(comment).toContain('1234567abcdef');
    expect(comment).toContain('https://rosetta.example');
    expect(comment).toContain('actions/runs/9');
  });

  it('RF-1304 creates the "Production deploys" issue when none is open, then comments on it', async () => {
    const { code, calls } = await notify('');

    expect(code).toBe(0);
    expect(calls.some((call) => call.startsWith('issue create --title Production deploys'))).toBe(
      true,
    );
    expect(calls.find((call) => call.startsWith('issue comment'))).toContain('issue comment 77');
  });

  it('RF-1304 ignores an open issue whose title only contains the words', async () => {
    const { calls } = await notify('5\tNot about Production deploys');

    expect(calls.some((call) => call.startsWith('issue create'))).toBe(true);
    expect(calls.find((call) => call.startsWith('issue comment'))).toContain('issue comment 77');
  });
});
