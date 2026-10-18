import type { PromptFile } from '../agent/prompt-file.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { CardOutputs, CardSource } from '../ports/card-outputs.js';
import type { Clock } from '../ports/clock.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { TaskResults } from '../ports/task-results.js';
import type { RoleProvider } from '../providers/provider-set.js';
import type { JudgementContext } from '../understand/claim-judgement.js';
import type { ReaderTaskContext } from '../understand/reader-task.js';
import type { DeepenOptions } from '../understand/understand-options.js';

// RF-209: what a Deepen run needs: what every reader task of an understand run shares, the verifier
// of both steps (the same role and model as any run, Q-I), the summariser for the overview, and the
// stores it reads the completed run from and writes its own outputs to.

interface DeepenDependencies {
  readonly runs: Pick<RunIndex, 'find'>;
  readonly manifests: Pick<RunManifestStore, 'read'>;
  readonly cards: CardOutputs;
  readonly taskResults: TaskResults;
  readonly answers: Pick<AnswersFile, 'addQuestions'>;
  readonly clock: Clock;
}

export interface DeepenParts extends ReaderTaskContext {
  readonly verifier: JudgementContext['verifier'];
  readonly summariser: RoleProvider;
  readonly overviewPrompt: PromptFile;
  readonly source: CardSource;
  readonly request: DeepenOptions;
  readonly deps: DeepenDependencies;
}
