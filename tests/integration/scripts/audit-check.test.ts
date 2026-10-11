import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';

const run = promisify(execFile);
const script = join(process.cwd(), 'scripts', 'audit-check.mjs');
const today = '2026-10-11';

interface Advisory {
  readonly url: string;
  readonly severity: string;
}

const advisory = (id: string, severity = 'high'): Advisory => ({
  url: `https://github.com/advisories/${id}`,
  severity,
});

// The shape of `npm audit --json`: one entry per package; `via` holds advisories or package names.
function report(vulnerabilities: Record<string, { severity: string; via: unknown[] }>): string {
  return JSON.stringify({ auditReportVersion: 2, vulnerabilities, metadata: {} });
}

async function audit(
  root: string,
  auditJson: string,
  exceptions: unknown,
): Promise<{ code: number; output: string }> {
  const reportPath = join(root, 'audit.json');
  const exceptionsPath = join(root, 'audit-exceptions.json');
  await writeFile(reportPath, auditJson);
  await writeFile(exceptionsPath, JSON.stringify(exceptions));
  try {
    const { stdout, stderr } = await run('node', [
      script,
      '--report',
      reportPath,
      '--exceptions',
      exceptionsPath,
      '--today',
      today,
    ]);
    return { code: 0, output: stdout + stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code, output: failure.stdout + failure.stderr };
  }
}

const exception = (id: string, expires = '2026-12-31') => ({ id, reason: 'no fix yet', expires });
const lodashHigh = report({ lodash: { severity: 'high', via: [advisory('GHSA-aaaa-bbbb-cccc')] } });

describe('scripts/audit-check.mjs', () => {
  const tmp = useTempRoot('rosetta-audit-');

  it('RNF-003 passes when the report has no vulnerabilities', async () => {
    const result = await audit(tmp.path, report({}), []);

    expect(result.code).toBe(0);
  });

  it('RNF-003 fails on a high advisory that has no exception and names it', async () => {
    const result = await audit(tmp.path, lodashHigh, []);

    expect(result.code).toBe(1);
    expect(result.output).toContain('lodash');
    expect(result.output).toContain('GHSA-aaaa-bbbb-cccc');
  });

  it('RNF-003 fails on a critical advisory', async () => {
    const vulnerable = report({
      lodash: { severity: 'critical', via: [advisory('GHSA-aaaa-bbbb-cccc', 'critical')] },
    });

    const result = await audit(tmp.path, vulnerable, []);

    expect(result.code).toBe(1);
  });

  it('RNF-003 ignores moderate and low advisories', async () => {
    const vulnerable = report({
      lodash: { severity: 'moderate', via: [advisory('GHSA-aaaa-bbbb-cccc', 'moderate')] },
    });

    const result = await audit(tmp.path, vulnerable, []);

    expect(result.code).toBe(0);
  });

  it('RNF-003 passes a high advisory that has an unexpired exception', async () => {
    const result = await audit(tmp.path, lodashHigh, [exception('GHSA-aaaa-bbbb-cccc')]);

    expect(result.code).toBe(0);
    expect(result.output).toContain('GHSA-aaaa-bbbb-cccc');
  });

  it('RNF-003 fails again once the exception has expired', async () => {
    const result = await audit(tmp.path, lodashHigh, [
      exception('GHSA-aaaa-bbbb-cccc', '2026-10-10'),
    ]);

    expect(result.code).toBe(1);
    expect(result.output).toContain('expired');
  });

  it('RNF-003 follows a transitive package to the advisory it inherits', async () => {
    const vulnerable = report({
      lodash: { severity: 'high', via: [advisory('GHSA-aaaa-bbbb-cccc')] },
      express: { severity: 'high', via: ['lodash'] },
    });

    const open = await audit(tmp.path, vulnerable, []);
    const excepted = await audit(tmp.path, vulnerable, [exception('GHSA-aaaa-bbbb-cccc')]);

    expect(open.code).toBe(1);
    expect(excepted.code).toBe(0);
  });

  it('RNF-003 one exception does not cover a second high advisory on the same package', async () => {
    const vulnerable = report({
      lodash: {
        severity: 'high',
        via: [advisory('GHSA-aaaa-bbbb-cccc'), advisory('GHSA-dddd-eeee-ffff')],
      },
    });

    const result = await audit(tmp.path, vulnerable, [exception('GHSA-aaaa-bbbb-cccc')]);

    expect(result.code).toBe(1);
    expect(result.output).toContain('GHSA-dddd-eeee-ffff');
  });

  it('RNF-003 rejects an exception without a reason or an expiry date', async () => {
    const result = await audit(tmp.path, report({}), [{ id: 'GHSA-aaaa-bbbb-cccc' }]);

    expect(result.code).toBe(2);
  });

  it('RNF-003 rejects an audit report that carries an error', async () => {
    const failed = JSON.stringify({ error: { code: 'ENOTFOUND', summary: 'offline' } });

    const result = await audit(tmp.path, failed, []);

    expect(result.code).toBe(2);
    expect(result.output).toContain('ENOTFOUND');
  });
});
