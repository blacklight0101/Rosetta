import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type {
  RunFileContent,
  RunFileReader,
} from '../../../../src/application/ports/run-file-reader.js';
import { createCard } from '../../../../src/domain/cards/card.js';
import { ok, type Result } from '../../../../src/domain/errors/result.js';
import { renderCardFile } from '../../../../src/infrastructure/cards/card-markdown.js';
import { FileReportCards } from '../../../../src/infrastructure/cards/file-report-cards.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from '../../../support/card-fixtures.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';

// RF-502, RF-507, P3-02 verifier leftovers: how many bytes of a card file are read. The declared size
// and the streamed byte count guard each other, so each gets a reader that lies in one direction
// only; and a path named twice is opened once.

const scope = scopeFor('20261012-100000-understand');
const PATH = 'cards/BR/BR-001.md';

function cardFileWithTitle(title: string): string {
  const created = createCard({
    id: 'BR-001',
    type: 'BR',
    title,
    summary: 's',
    area: 'orders',
    agentTaskId: 'task-orders',
    confidence: 'High',
    claims: [{ text: 'x', citations: [{ path: 'a.cs', startLine: 1, endLine: 2 }] }],
  });
  if (!created.ok) throw new Error('the card does not build');
  return renderCardFile(created.value, cardSource, new SecretMasker(), []);
}

interface Answer {
  readonly declared: number;
  readonly text: string;
}

/** A reader that answers each open with the next scripted body, declaring the size it is told to. */
class ScriptedReader implements RunFileReader {
  opened = 0;
  private readonly answers: readonly Answer[];

  constructor(answers: readonly Answer[]) {
    this.answers = answers;
  }

  open(): Promise<Result<RunFileContent, 'not-found'>> {
    const answer = this.answers[Math.min(this.opened, this.answers.length - 1)];
    this.opened += 1;
    if (answer === undefined) throw new Error('no answer scripted');
    return Promise.resolve(
      ok({ size: answer.declared, body: Readable.from([Buffer.from(answer.text)]) }),
    );
  }
}

const good = cardFileWithTitle('Free shipping');

describe('FileReportCards and a file size that lies', () => {
  it('RF-507 stops at the byte limit when the file declares a small size and streams more', async () => {
    const reader = new ScriptedReader([{ declared: 100, text: `${good}${'x'.repeat(300_000)}` }]);

    expect(await new FileReportCards(reader).read(scope, [PATH])).toEqual([]);
  });

  it('RF-507 refuses a file that declares a size over the limit though its body is small', async () => {
    const reader = new ScriptedReader([{ declared: 300_000, text: good }]);

    expect(await new FileReportCards(reader).read(scope, [PATH])).toEqual([]);
  });

  it('RF-502 reads a file whose declared size is right and under the limit', async () => {
    const reader = new ScriptedReader([{ declared: good.length, text: good }]);

    const read = await new FileReportCards(reader).read(scope, [PATH]);

    expect(read.map((card) => card.title)).toEqual(['Free shipping']);
  });
});

describe('FileReportCards and a path named twice', () => {
  it('RF-502 opens the file once and keeps the first card when a later read would differ', async () => {
    const reader = new ScriptedReader([
      { declared: good.length, text: good },
      { declared: good.length, text: cardFileWithTitle('Changed title') },
    ]);

    const read = await new FileReportCards(reader).read(scope, [PATH, PATH]);

    expect(reader.opened).toBe(1);
    expect(read.map((card) => card.title)).toEqual(['Free shipping']);
  });
});
