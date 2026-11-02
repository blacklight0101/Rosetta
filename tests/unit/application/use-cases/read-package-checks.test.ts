import { describe, expect, it } from 'vitest';
import type { RunScope } from '../../../../src/application/ports/run-events.js';
import type { RunTextFiles } from '../../../../src/application/ports/run-text-files.js';
import {
  CHECKS_TEXT_LIMIT,
  ReadPackageChecks,
} from '../../../../src/application/use-cases/read-package-checks.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy, userBob } from '../../../support/run-harness.js';

// RF-1015, RF-627, RF-1105, P8-11 (P7-25): Read package checks gives the sections of handoff/checks.md,
// none until the package is written, and at most a fixed amount of text with a note that it was cut.
// Another user's run id and an unknown id give not-found.

class Files implements RunTextFiles {
  readonly asked: string[] = [];
  private readonly text: string | undefined;

  constructor(text: string | undefined) {
    this.text = text;
  }

  read(_scope: RunScope, path: string): Promise<string | undefined> {
    this.asked.push(path);
    return Promise.resolve(this.text);
  }
}

async function readWith(text: string | undefined, userId = userAmy) {
  const run = sampleRun({ userId: userAmy.userId, stage: 'plan', queueState: 'Ended' });
  const runs = new MemoryRunIndex();
  await runs.insert(run);
  const files = new Files(text);
  const outcome = await new ReadPackageChecks({ runs, files }).execute({
    ...{ actor: userId, runId: run.id },
  });
  return { outcome, files };
}

describe('ReadPackageChecks', () => {
  it('RF-1015 splits checks.md into its sections and asks for that file only', async () => {
    const { outcome, files } = await readWith('# Checks\n\n## Gaps\nOne item.\n\n## Notes\nTwo.\n');

    expect(outcome).toEqual({
      ok: true,
      value: {
        sections: [
          { title: 'Gaps', text: 'One item.' },
          { title: 'Notes', text: 'Two.' },
        ],
        truncated: false,
      },
    });
    expect(files.asked).toEqual(['handoff/checks.md']);
  });

  it('RF-1015 gives no section while the package is not written', async () => {
    const { outcome } = await readWith(undefined);

    expect(outcome).toEqual({ ok: true, value: { sections: [], truncated: false } });
  });

  it('P8-11 cuts the answer at the limit and says it was cut', async () => {
    const big = 'x'.repeat(CHECKS_TEXT_LIMIT);
    const { outcome } = await readWith(`## First\n${big}\n\n## Second\nlost\n`);

    if (!outcome.ok) throw new Error('not found');
    const text = outcome.value.sections.map((section) => section.text).join('');
    expect(outcome.value.truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(CHECKS_TEXT_LIMIT);
    expect(outcome.value.sections.map((section) => section.title)).not.toContain('Second');
  });

  it('RF-1105 answers not-found for another user and for an unknown run', async () => {
    expect((await readWith('## A\nb', userBob)).outcome).toEqual({ ok: false, error: 'not-found' });
  });
});
