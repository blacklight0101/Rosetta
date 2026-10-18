import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';

// Threat model section 5, environments-and-delivery.md section 10, P1-55: scripts/zap-summary.mjs
// reads the JSON report of the OWASP ZAP baseline scan, prints one line per alert with its risk,
// appends the same table to the job summary, and fails (exit 1) when an alert is High.

const run = promisify(execFile);
const script = join(process.cwd(), 'scripts', 'zap-summary.mjs');
const root = useTempRoot('rosetta-zap-');

interface Alert {
  readonly name: string;
  readonly riskcode: string;
  readonly count: string;
}

const alert = (name: string, riskcode: string, count = '1'): Alert => ({ name, riskcode, count });

function report(alerts: readonly Alert[]): string {
  const site = { '@name': 'http://127.0.0.1:8080', alerts };
  return JSON.stringify({ '@version': '2.17.0', site: [site] });
}

interface Outcome {
  readonly code: number;
  readonly output: string;
}

async function summarise(reportText: string | undefined): Promise<Outcome> {
  const path = join(root.path, 'zap-report.json');
  if (reportText !== undefined) await writeFile(path, reportText);
  const env = { PATH: process.env['PATH'] ?? '', GITHUB_STEP_SUMMARY: join(root.path, 'summary') };
  try {
    const { stdout, stderr } = await run(process.execPath, [script, path], { env });
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    const field = (name: string): string =>
      typeof error === 'object' && error !== null && name in error
        ? String(Reflect.get(error, name))
        : '';
    return { code: Number(field('code')), output: `${field('stdout')}${field('stderr')}` };
  }
}

describe('scripts/zap-summary.mjs', () => {
  it('threat model 5 passes with no alert and says so', async () => {
    const outcome = await summarise(report([]));

    expect(outcome.code).toBe(0);
    expect(outcome.output).toContain('High: 0');
  });

  it('threat model 5 passes with Medium, Low and Informational alerts and lists them, highest risk first', async () => {
    const outcome = await summarise(
      report([alert('Cookie note', '0'), alert('CSP note', '2', '3'), alert('Header note', '1')]),
    );

    expect(outcome.code).toBe(0);
    const lines = outcome.output.split('\n');
    const at = (text: string): number => lines.findIndex((line) => line.includes(text));
    expect(at('CSP note')).toBeGreaterThan(-1);
    expect(at('CSP note')).toBeLessThan(at('Header note'));
    expect(at('Header note')).toBeLessThan(at('Cookie note'));
    expect(lines[at('CSP note')]).toContain('Medium');
  });

  it('threat model 5 fails when an alert is High and names it', async () => {
    const outcome = await summarise(report([alert('SQL Injection', '3'), alert('CSP note', '2')]));

    expect(outcome.code).toBe(1);
    expect(outcome.output).toContain('High: 1');
    expect(outcome.output).toMatch(/High.*SQL Injection/u);
  });

  it('threat model 5 appends the table to the job summary', async () => {
    await summarise(report([alert('CSP note', '2')]));

    const summary = await readFile(join(root.path, 'summary'), 'utf8');
    expect(summary).toContain('ZAP baseline');
    expect(summary).toContain('| Medium | CSP note | 1 |');
  });

  it('threat model 5 exits 2 when the report is missing or not a ZAP report', async () => {
    expect((await summarise(undefined)).code).toBe(2);
    expect((await summarise('{"site": "nope"}')).code).toBe(2);
  });
});
