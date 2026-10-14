import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

// RNF-003, F-18: the container images a workflow starts, read from the parsed YAML: the `services`
// of a job (also inside a matrix entry), its `container`, and `uses: docker://` steps.

/** A digest-pinned reference: `name@sha256:<64 hex>` with or without a tag in front. */
const PINNED = /^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9._-]+)?@sha256:[0-9a-f]{64}$/u;

export function isDigestPinned(image: string): boolean {
  return PINNED.test(image);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function imageOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (isRecord(value) && typeof value['image'] === 'string') return [value['image']];
  return [];
}

function usesDocker(value: unknown): string[] {
  return typeof value === 'string' && value.startsWith('docker://')
    ? [value.slice('docker://'.length)]
    : [];
}

/** Every image reference found anywhere in a parsed workflow document. */
export function imagesIn(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(imagesIn);
  if (!isRecord(node)) return [];
  return Object.entries(node).flatMap(([key, value]) => {
    if (key === 'services' && isRecord(value)) return Object.values(value).flatMap(imageOf);
    if (key === 'container') return imageOf(value);
    if (key === 'uses') return usesDocker(value);
    return imagesIn(value);
  });
}

/** The images of one workflow file under .github/workflows. */
export async function workflowImages(name: string): Promise<string[]> {
  const text = await readFile(join(process.cwd(), '.github', 'workflows', name), 'utf8');
  return imagesIn(parse(text));
}

/** `run:` lines that start a container (`docker run`, `pull`, `create`) without a sha256 digest on the line. */
export function unpinnedDockerCommands(lines: readonly string[]): string[] {
  return lines.filter(
    (line) =>
      /\bdocker\s+(?:run|pull|create)\b/u.test(line) && !/@sha256:[0-9a-f]{64}\b/u.test(line),
  );
}
