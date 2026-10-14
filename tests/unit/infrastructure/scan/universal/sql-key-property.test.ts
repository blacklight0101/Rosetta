import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import { extractScriptStatements } from '../../../../../src/infrastructure/scan/universal/sql-script.js';

// FAKE key markers, built from pieces so no secret-like literal is in the repository (RNF-003).
const begin = ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const end = ['-----END', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const statementLines = [
  'INSERT INTO t VALUES (1);',
  'SELECT a FROM t',
  'UPDATE t SET a = 1;',
  'DELETE FROM t WHERE a = 2;',
];

/** A small seeded generator (no Math.random), so every run builds the same scripts. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * One script of markers, statement lines and key-like lines. A key-like line carries a token unique
 * to its script, and it is only written while a marker is open (a BEGIN was written and no END
 * since), which is where key text occurs in a file.
 */
function scriptWith(next: () => number, script: number): { lines: string[]; tokens: string[] } {
  const lines: string[] = [];
  const tokens: string[] = [];
  let open = false;
  const count = 2 + Math.floor(next() * 10);
  for (let index = 0; index < count; index += 1) {
    const pick = next();
    if (pick < 0.2) {
      lines.push(begin);
      open = true;
    } else if (pick < 0.3) {
      lines.push(end);
      open = false;
    } else if (pick < 0.4) {
      // P1-154: one line that ends a key and begins the next (END then BEGIN).
      lines.push(`${end} ${begin}`);
      open = true;
    } else if (pick < 0.65 || !open) {
      lines.push(statementLines[Math.floor(next() * statementLines.length)] ?? '');
    } else {
      const token = `Qk${String(script)}x${String(index)}Ab7Cd9Ef3Gh`;
      tokens.push(token);
      lines.push(token);
    }
  }
  return { lines, tokens };
}

describe('key-like lines inside markers, over seeded scripts', () => {
  it('RNF-003 no key-like token reaches a statement in 300 generated scripts', () => {
    const next = seededRandom(20261014);
    let tokenCount = 0;
    let statementCount = 0;
    const leaked: string[] = [];

    for (let script = 0; script < 300; script += 1) {
      const { lines, tokens } = scriptWith(next, script);
      const found = extractScriptStatements('db/a.sql', lines, new SecretMasker());
      const text = found.map((statement) => statement.text).join('\n');
      tokenCount += tokens.length;
      statementCount += found.length;
      leaked.push(...tokens.filter((token) => text.includes(token)));
    }

    // The generator must produce both kinds of line, or the check above proves nothing.
    expect(tokenCount).toBeGreaterThan(100);
    expect(statementCount).toBeGreaterThan(100);
    expect(leaked).toEqual([]);
  });
});
