import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// RNF-003, RF-800, environments-and-delivery.md section 4: the security properties of the Pages
// workflow, read as text (no YAML parser is in the package baseline). A mutation of any of them
// (a write scope moved, the main guard removed, a pull request trigger added) fails a test.

const workflowPath = fileURLToPath(
  new URL('../../../.github/workflows/pages.yml', import.meta.url),
);

const indentOf = (line: string): number => line.length - line.trimStart().length;

/** The lines under a header line, nested lines included, up to the next line at its indentation. */
function under(lines: readonly string[], header: string): string[] {
  const start = lines.indexOf(header);
  if (start === -1) return [];
  const headerIndent = indentOf(header);
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue;
    if (indentOf(line) <= headerIndent) break;
    body.push(line);
  }
  return body;
}

const trimmed = (lines: readonly string[]): string[] => lines.map((line) => line.trim());

async function workflowLines(): Promise<string[]> {
  return (await readFile(workflowPath, 'utf8')).split(/\r?\n/u);
}

describe('the Pages workflow permissions', () => {
  it('RNF-003 the workflow grants only contents: read at the top level', async () => {
    expect(trimmed(under(await workflowLines(), 'permissions:'))).toEqual(['contents: read']);
  });

  it('RNF-003 the deploy job holds exactly pages: write and id-token: write', async () => {
    const deploy = under(await workflowLines(), '  deploy:');

    expect(trimmed(under(deploy, '    permissions:'))).toEqual(['pages: write', 'id-token: write']);
  });

  it("RNF-003 the write scopes of the workflow are the deploy job's two and no other", async () => {
    const writes = (await workflowLines())
      .map((line) => line.trim())
      .filter((line) => line.endsWith(': write'));

    expect(writes).toEqual(['pages: write', 'id-token: write']);
  });

  it('RNF-003 the build and the deploy job run only for main', async () => {
    const lines = await workflowLines();

    for (const job of ['  build:', '  deploy:']) {
      expect(trimmed(under(lines, job)).filter((line) => line.startsWith('if:'))).toEqual([
        "if: github.ref == 'refs/heads/main'",
      ]);
    }
  });
});

describe('the Pages workflow triggers', () => {
  it('RNF-003 it runs on push to main and by hand, and on no pull request event', async () => {
    const lines = await workflowLines();
    const triggers = under(lines, 'on:')
      .filter((line) => indentOf(line) === 2)
      .map((line) => line.trim().replace(/:$/u, ''));
    const code = lines.filter((line) => !line.trimStart().startsWith('#'));

    expect(triggers).toEqual(['push', 'workflow_dispatch']);
    expect(trimmed(under(lines, '  push:')).filter((line) => line.startsWith('branches:'))).toEqual(
      ['branches: [main]'],
    );
    expect(code.some((line) => line.includes('pull_request'))).toBe(false);
  });
});
