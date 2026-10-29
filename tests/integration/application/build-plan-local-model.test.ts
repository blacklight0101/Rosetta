import { beforeAll, describe, expect, it } from 'vitest';
import {
  codexMethod,
  singleFileRun,
  type MethodRun,
} from '../../support/single-file-method-run.js';

// RF-639, RF-641, DEC-185, ADR-008, P6-22: a plan run of the single-file application whose brief
// marks the middle tier model as running locally. The planner replays a recording, so no provider
// is called; the RF-641 local-model warning must reach checks.md from the real package.

const warning = /^- T-\d+ \(warning\): a local model builds only cards of difficulty 1 and 2/gmu;

describe('a brief that marks the middle tier model as local', () => {
  let local: MethodRun;
  let plain: MethodRun;
  beforeAll(async () => {
    local = await singleFileRun({ ...codexMethod, local: { middle: true } });
    plain = await singleFileRun(codexMethod);
  }, 120_000);

  it('RF-641 ADR-008 the run completes from recorded planner answers only', () => {
    expect(local.endState).toBe('Completed');
    expect(local.providers.every((task) => task.startsWith('planner'))).toBe(true);
  });

  it('RF-641 checks.md lists the local-model warning for a middle tier card above difficulty 2', () => {
    const checks = local.files['checks.md'] ?? '';

    expect(checks).toContain('## Model of each card');
    expect(checks.match(warning)?.length ?? 0).toBeGreaterThan(0);
  });

  it('RF-641 a brief without the flag gives no such warning', () => {
    expect(plain.files['checks.md'] ?? '').not.toContain('local model');
  });

  it('RF-639 the flag changes checks.md only: every other file is unchanged', () => {
    const changed = Object.keys(local.files).filter(
      (path) => local.files[path] !== plain.files[path],
    );

    expect(changed.sort()).toEqual(['checks.md']);
    expect(Object.keys(local.files).sort()).toEqual(Object.keys(plain.files).sort());
  });
});
