// Threat model section 5, environments-and-delivery.md section 10, P1-55: the summary of an OWASP
// ZAP baseline scan. Reads the JSON report that `zap-baseline.py -J` wrote, prints one line per
// alert (highest risk first), appends the same table to the GitHub job summary when
// GITHUB_STEP_SUMMARY is set, and fails (exit 1) when any alert is High. Exit 2 when the report is
// missing or is not a ZAP report.
// Usage: node scripts/zap-summary.mjs <zap-report.json>
import { appendFile, readFile } from 'node:fs/promises';

const RISKS = ['Informational', 'Low', 'Medium', 'High'];
const HIGH = 3;

function inputError(message) {
  return Object.assign(new Error(message), { exitCode: 2 });
}

async function alertsOf(path) {
  if (path === undefined) throw inputError('usage: node scripts/zap-summary.mjs <zap-report.json>');
  const text = await readFile(path, 'utf8').catch(() => {
    throw inputError(`The ZAP report ${path} could not be read.`);
  });
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    throw inputError(`The ZAP report ${path} is not JSON.`);
  }
  if (!Array.isArray(report?.site)) throw inputError(`${path} is not a ZAP JSON report.`);
  return report.site
    .flatMap((site) => (Array.isArray(site?.alerts) ? site.alerts : []))
    .map((alert) => ({
      risk: Number(alert.riskcode),
      name: String(alert.name ?? alert.alert),
      count: String(alert.count ?? ''),
    }))
    .sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name));
}

function table(alerts) {
  const counts = RISKS.map(
    (risk, code) => `${risk}: ${alerts.filter((a) => a.risk === code).length}`,
  );
  const rows = alerts.map((a) => `| ${RISKS[a.risk] ?? 'Unknown'} | ${a.name} | ${a.count} |`);
  return [
    '## ZAP baseline',
    '',
    counts.reverse().join(', '),
    '',
    '| Risk | Alert | Instances |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

async function main(argv, env) {
  const alerts = await alertsOf(argv[0]);
  const summary = table(alerts);
  console.log(summary);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  const high = alerts.filter((alert) => alert.risk >= HIGH);
  if (high.length > 0) {
    console.error(`The ZAP baseline found ${String(high.length)} High alert(s).`);
    return 1;
  }
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2), process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = error?.exitCode ?? 1;
}
