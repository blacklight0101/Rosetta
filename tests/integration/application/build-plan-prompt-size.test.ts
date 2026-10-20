import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-401, RF-604, DEC-155: a plan run whose planner prompt is larger than the Ollama context ends
// Failed with the prompt-size code and its message, never with RST-1803.

const temp = useTempRoot('rosetta-plan-prompt-size-');

describe('BuildPlan: a prompt larger than the Ollama context', () => {
  it('RF-401 the run ends Failed with the prompt-size code, and the log names the sizes', async () => {
    const recording = await loadRecording(
      join('tests', 'recordings', 'fake', 'planner-package.json'),
    );
    const specific = 'The planner prompt is about 31361 tokens but the context is 32768.';
    const h = await createPlanHarness(temp.path, recording, {
      beforeCall: () =>
        Promise.reject(new RosettaError(ERROR_CODES.ollamaPromptTooLarge, specific)),
    });
    const understand = await h.understandRun({ cards: planCards(), questions: planQuestions });
    await h.answer(understand, [{ cardId: 'OQ-001', answer: 'Only a manager may cancel.' }]);
    await h.saveBrief({ migration: 'parallel-change' });

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    const entries = h.s.logger.entries;
    expect(entries).toContainEqual(
      expect.objectContaining({ code: 'RST-1522', message: specific }),
    );
    expect(entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1803' }));
    expect(await h.handoffOf(run)).toEqual({});
  });
});
