/* eslint-disable @typescript-eslint/no-unused-vars -- red-step stub, replaced in the feat commit */
import type { ProjectRef } from '../../application/ports/answers-file.js';
import type { PriorCard, PriorCards } from '../../application/ports/prior-cards.js';

// RF-241: red-step stub of the earlier cards of a run; replaced in the feat commit.
export class FilePriorCards implements PriorCards {
  cardsOf(_project: ProjectRef, _runKey: string): Promise<readonly PriorCard[]> {
    return Promise.resolve([]);
  }

  markAnswered(
    _project: ProjectRef,
    _runKey: string,
    _cardIds: readonly string[],
  ): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
}
