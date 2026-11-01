import { describe, expect, it } from 'vitest';
import type {
  GitHubRefCheck,
  RefAnswer,
} from '../../../../src/application/ports/github-ref-check.js';
import type { GitHubRepoRef } from '../../../../src/domain/sources/github-repo-ref.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { amy, projectHarness } from '../../../support/project-harness.js';

// RF-010, EV-70, P7-22: Create project asks GitHub whether the branch or tag of an address exists.

class StubRefCheck implements GitHubRefCheck {
  readonly asked: GitHubRepoRef[] = [];
  private readonly answer: RefAnswer;

  constructor(answer: RefAnswer) {
    this.answer = answer;
  }

  check(ref: GitHubRepoRef): Promise<RefAnswer> {
    this.asked.push(ref);
    return Promise.resolve(this.answer);
  }
}

const repository = 'https://github.com/owner/repo';

describe('CreateProject checks the ref', () => {
  it('RF-010 EV-70 a branch GitHub does not have is refused with RST-1901 and nothing is created', async () => {
    const refs = new StubRefCheck('missing');
    const test = projectHarness({}, undefined, refs);

    const outcome = await test.createProject.execute({
      actor: amy,
      url: `${repository}/tree/master`,
    });

    expect(outcome).toEqual({
      ok: false,
      error: { code: ERROR_CODES.githubRefNotFound, reason: 'ref-not-found' },
    });
    expect(refs.asked).toEqual([
      { owner: 'owner', repo: 'repo', ref: 'master', subpath: undefined },
    ]);
    expect(await test.listProjects.execute({ actor: amy })).toEqual([]);
  });

  it.each<RefAnswer>(['found', 'unreachable'])(
    'RF-010 EV-70 a ref GitHub answers %s creates the project',
    async (answer) => {
      const test = projectHarness({}, undefined, new StubRefCheck(answer));

      const outcome = await test.createProject.execute({
        actor: amy,
        url: `${repository}/tree/main`,
      });

      expect(outcome).toMatchObject({ ok: true, value: { created: true } });
    },
  );

  it('RF-010 EV-70 an address with no ref makes no call', async () => {
    const refs = new StubRefCheck('missing');
    const test = projectHarness({}, undefined, refs);

    const outcome = await test.createProject.execute({ actor: amy, url: repository });

    expect(outcome.ok).toBe(true);
    expect(refs.asked).toEqual([]);
  });
});
