import type { Run } from '../../domain/runs/run.js';

// RF-408, data-model.md section 3.10: the identifiers every call of a run shares.

/** One trace per run (32 hexadecimal characters): the run's UUID without its dashes. */
export function traceIdOf(run: Run): string {
  const hex = run.id.replace(/-/gu, '').toLowerCase();
  return /^[0-9a-f]{32}$/u.test(hex)
    ? hex
    : hex
        .replace(/[^0-9a-f]/gu, '0')
        .padEnd(32, '0')
        .slice(0, 32);
}

/** `<runKey>#<n>`, one numbering for every call of the run. */
export function callIds(run: Run): () => string {
  let count = 0;
  return () => {
    count += 1;
    return `${run.runKey}#${String(count)}`;
  };
}
