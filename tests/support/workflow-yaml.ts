import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

// The workflows of .github/workflows read as data for the release and ZAP workflow tests: a parsed
// document and safe lookups into it, so a test never casts what the YAML parser returns.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value at `path` inside a parsed document, or undefined when any step of it is missing. */
export function at(node: unknown, ...path: string[]): unknown {
  let current = node;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

/** The keys of a mapping, or none. */
export function keysOf(node: unknown): string[] {
  return isRecord(node) ? Object.keys(node) : [];
}

/** One parsed workflow file of .github/workflows; undefined when it is missing. */
export async function workflowDocument(name: string): Promise<unknown> {
  const text = await readFile(join(process.cwd(), '.github', 'workflows', name), 'utf8').catch(
    () => undefined,
  );
  return text === undefined ? undefined : parse(text);
}

/** The steps of one job as text, one entry per step (its name, `if:`, `run:`, `env:` and `uses:`). */
export function stepTexts(document: unknown, job: string): string[] {
  const steps = at(document, 'jobs', job, 'steps');
  return Array.isArray(steps) ? steps.map((step) => JSON.stringify(step)) : [];
}

/** The index of the first step whose text contains `needle`; -1 when none does. */
export function stepIndex(document: unknown, job: string, needle: string): number {
  return stepTexts(document, job).findIndex((text) => text.includes(needle));
}
