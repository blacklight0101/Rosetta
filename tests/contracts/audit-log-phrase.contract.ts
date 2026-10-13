import { expect, it } from 'vitest';
import type { AuditLog } from '../../src/application/ports/audit-log.js';
import { fixturePassword } from '../support/account-fixtures.js';

// RF-1109, RNF-003, P1-101: no word of a multi-word password reaches a stored row, whether the
// phrase is quoted (any pair of quotes) or not. An unquoted phrase is masked up to the next comma,
// semicolon or newline, or the end of the text.

const M = '[MASKED:password]';

/** The words of a fake phrase, built at run time; one of them holds an apostrophe. */
function phraseWords(): string[] {
  return ['One', 'Two', 'Three'].map(fixturePassword);
}

async function storedDetail(audit: AuditLog, detail: Record<string, string>) {
  await audit.record({
    at: new Date('2026-10-11T09:00:00.000Z'),
    actorUserId: null,
    action: 'auth.sign_in',
    targetType: null,
    targetId: null,
    ip: '203.0.113.7',
    outcome: 'failed',
    detail,
  });
  return audit.list({ since: new Date('2026-10-11T08:59:00.000Z').getTime() });
}

export function phraseContractTests(name: string, fresh: () => Promise<AuditLog>): void {
  it(`RNF-003 ${name} masks an unquoted multi-word password up to the next delimiter`, async () => {
    const audit = await fresh();
    const words = phraseWords();
    const phrase = words.join(' ');

    const listed = await storedDetail(audit, {
      card: `password is ${['a', 'long', 'phrase'].join(' ')}`,
      colon: `password is: ${phrase}`,
      comma: `the passphrase was ${phrase}, then retry`,
      semicolon: `pw is ${phrase}; next`,
      newline: `secret is ${phrase}\nnext line`,
    });

    const stored = JSON.stringify(listed);
    for (const word of words) expect(stored).not.toContain(word);
    expect(stored).not.toContain('long');
    expect(listed[0]?.detail).toEqual({
      card: `password is ${M}`,
      colon: `password is: ${M}`,
      comma: `the passphrase was ${M}, then retry`,
      semicolon: `pw is ${M}; next`,
      newline: `secret is ${M}\nnext line`,
    });
  });

  it(`RNF-003 ${name} masks a quoted phrase with an apostrophe or typographic quotes`, async () => {
    const audit = await fresh();
    const [one = '', two = '', three = ''] = phraseWords();
    const inner = `${one}'s ${two} ${three}`;
    const plain = `${one} ${two} ${three}`;

    const listed = await storedDetail(audit, {
      apostrophe: `password is '${inner}' done`,
      singleCurly: `password is ‘${plain}’ done`,
      doubleCurly: `password is “${plain}” done`,
      guillemets: `password is «${plain}» done`,
    });

    const stored = JSON.stringify(listed);
    for (const word of [one, two, three]) expect(stored).not.toContain(word);
    expect(listed[0]?.detail).toEqual({
      apostrophe: `password is ${M} done`,
      singleCurly: `password is ${M} done`,
      doubleCurly: `password is ${M} done`,
      guillemets: `password is ${M} done`,
    });
  });
}
