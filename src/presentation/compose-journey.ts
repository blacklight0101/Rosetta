import type { AnswersFile } from '../application/ports/answers-file.js';
import type { PriorCards } from '../application/ports/prior-cards.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { RunEventHistory } from '../application/ports/run-events.js';
import type { RunIndex } from '../application/ports/run-index.js';
import type { RunManifestStore } from '../application/ports/run-manifest-store.js';
import type { OutputWriter } from '../application/ports/output-writer.js';
import { GetJourney } from '../application/use-cases/get-journey.js';
import { FileRunCards } from '../infrastructure/cards/file-run-cards.js';
import { FilePlanningBriefStore } from '../infrastructure/files/file-planning-brief-store.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';

// RF-615, architecture section 2 (composition root): the facts of the journey strip, over the run
// index, the manifests, the events, the saved brief and the card and answer files of the runs.

export interface JourneyParts {
  readonly projects: ProjectRepository;
  readonly runs: Pick<RunIndex, 'list'>;
  readonly manifests: Pick<RunManifestStore, 'read'>;
  /** The event log of the runs. */
  readonly log: Pick<RunEventHistory, 'read' | 'lastSeq'>;
  readonly answers: Pick<AnswersFile, 'questionsOf'>;
  readonly priorCards: PriorCards;
  readonly writer: OutputWriter;
  readonly parts: { readonly masker: TextMasker };
}

// RF-615
export function composeJourney(parts: JourneyParts): GetJourney {
  const { projects, runs, manifests, log, answers, priorCards, writer } = parts;
  const briefs = new FilePlanningBriefStore({ writer, masker: parts.parts.masker });
  return new GetJourney({
    ...{ projects, runs, manifests, history: log, answers, priorCards, briefs },
    cards: new FileRunCards(writer),
  });
}
