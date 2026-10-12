import { describe, expect, it } from 'vitest';
import type { CardSet } from '../../../../src/application/ports/card-outputs.js';
import type {
  WorkspaceFile,
  WriteRefusal,
} from '../../../../src/application/ports/output-writer.js';
import type { RunScope } from '../../../../src/application/ports/run-events.js';
import type { Result } from '../../../../src/domain/errors/result.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { FileCardOutputs } from '../../../../src/infrastructure/cards/file-card-outputs.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource, draftOf } from '../../../support/card-fixtures.js';
import { cardLogger, cardsOf } from '../../../support/card-output-harness.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-204, RF-302, RNF-002, P1-32 notes: the card files of a run, written one set at a time per run
// folder, with the areas that ended without a card named in spec.md.

const scope: RunScope = {
  id: '00000000-0000-4000-b000-0000000000b1',
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
  runKey: '20261012-100000-understand',
};
const folder = `projects/${scope.projectId}/runs/${scope.runKey}`;

/** A writer whose first write waits until the test opens it. */
class GatedWriter extends MemoryOutputWriter {
  private release: () => void = () => undefined;
  private gated = true;
  private readonly opened = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  open(): void {
    this.release();
  }

  override async writeText(
    file: WorkspaceFile,
    content: string,
  ): Promise<Result<void, WriteRefusal>> {
    if (this.gated) {
      this.gated = false;
      await this.opened;
    }
    return super.writeText(file, content);
  }
}

class RefusingWriter extends MemoryOutputWriter {
  override writeText(): Promise<Result<void, WriteRefusal>> {
    return Promise.resolve({
      ok: false,
      error: {
        code: ERROR_CODES.writeOutsideWorkspace,
        reason: 'outside-workspace',
        message: 'no',
      },
    });
  }
}

function setOf(titles: readonly string[], areasWithoutCards: readonly string[] = []): CardSet {
  const drafts = titles.map((title) => draftOf({ title }));
  return {
    cards: cardsOf([{ agentTaskId: 'reader-001', area: 'orders', drafts }]),
    source: cardSource,
    areasWithoutCards,
  };
}

function outputs(writer: MemoryOutputWriter): FileCardOutputs {
  return new FileCardOutputs({ writer, masker: new SecretMasker(), logger: cardLogger() });
}

describe('FileCardOutputs', () => {
  it('RF-302 writes of one run folder run one after another, so the later set wins whole', async () => {
    const writer = new GatedWriter();
    const cards = outputs(writer);

    const first = cards.writeCards(scope, setOf(['First']));
    const second = cards.writeCards(scope, setOf(['Second A', 'Second B']));
    writer.open();
    await Promise.all([first, second]);

    expect(writer.files.get(`${folder}/cards/index.json`)).toContain('Second B');
    expect(writer.files.get(`${folder}/spec.md`)).toContain('Second B');
    expect(writer.files.get(`${folder}/cards/FEAT/FEAT-001.md`)).toContain('Second A');
  });

  it('RF-204 spec.md names the areas whose task ended without a card', async () => {
    const writer = new MemoryOutputWriter();

    await outputs(writer).writeCards(scope, setOf(['Only'], ['Controllers']));

    const spec = writer.files.get(`${folder}/spec.md`) ?? '';
    expect(spec).toContain('## Areas without cards');
    expect(spec).toContain('- Controllers');
  });

  it('RNF-002 a refused write rejects with the writer code', async () => {
    const cards = outputs(new RefusingWriter());

    await expect(cards.writeCards(scope, setOf(['Only']))).rejects.toThrow(RosettaError);
    await expect(cards.writeCards(scope, setOf(['Only']))).rejects.toMatchObject({
      code: ERROR_CODES.writeOutsideWorkspace,
    });
  });

  it('RF-202 keeps the raw answers of an InvalidOutput task in invalid-output/<task>.txt', async () => {
    const writer = new MemoryOutputWriter();

    await outputs(writer).writeInvalidOutput(scope, 'reader-002', ['not json', 'still not']);

    expect(writer.files.get(`${folder}/invalid-output/reader-002.txt`)).toBe(
      '=== attempt 1 ===\nnot json\n\n=== attempt 2 ===\nstill not\n',
    );
  });
});
