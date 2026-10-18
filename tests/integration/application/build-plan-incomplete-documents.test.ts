import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import type { Recording } from '../../../src/infrastructure/providers/fake/recording.js';
import { htmlProblems } from '../../support/html-check.js';
import { seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-604, RF-621, RF-623, RF-624, RF-625, RF-626: each plan document whose planner call stays cut off
// is recorded under its own kind. The notice lands in that document's files, the README lists that
// one document, and the run warning names it. The recording has one answer per planner call, in
// this order: plan (0), PRD (1), data model (2), flows (3), API contract (4), user interface (5).

const temp = useTempRoot('rosetta-incomplete-');

const NOTICE = /^(?:> \*\*Incomplete\.\*\*|# Incomplete\.)|<strong>Incomplete\.<\/strong>/u;

const documents = [
  {
    kind: 'prd',
    at: 1,
    title: 'Product requirements document',
    phrase: 'product requirements document',
    file: 'prd.md',
    prefix: 'prd.md',
  },
  {
    kind: 'dataModel',
    at: 2,
    title: 'Target data model',
    phrase: 'target data model',
    file: 'data-model.md',
    prefix: 'data-model.md',
  },
  {
    kind: 'flows',
    at: 3,
    title: 'Target flows',
    phrase: 'target flows',
    file: 'flows/README.md',
    prefix: 'flows/',
  },
  {
    kind: 'apiContract',
    at: 4,
    title: 'API contract',
    phrase: 'API contract',
    file: 'api/openapi.yaml',
    prefix: 'api/openapi.yaml',
  },
  {
    kind: 'ux',
    at: 5,
    title: 'User-interface material',
    phrase: 'user-interface material',
    file: 'ux/README.md',
    prefix: 'ux/',
  },
] as const;

/** RF-626: what the HTML check finds in every noticed wireframe page, each named by its path. */
function wireframeProblems(files: Readonly<Record<string, string>>, noticed: readonly string[]) {
  return noticed
    .filter((path) => path.endsWith('.html'))
    .flatMap((path) => htmlProblems(files[path] ?? '').map((problem) => `${path}: ${problem}`));
}

function textOf(recording: Recording, at: number): string {
  const attempt = recording.calls[at]?.attempts[0];
  if (attempt === undefined || !('response' in attempt)) throw new Error('No answer recorded');
  return attempt.response.text;
}

/** The answer of call `at` as three pieces, each stopped by the output limit: it stays cut off. */
function cutCall(recording: Recording, at: number): Recording {
  const attempt = recording.calls[at]?.attempts[0];
  if (attempt === undefined || !('response' in attempt)) throw new Error('No answer recorded');
  const size = Math.ceil(textOf(recording, at).length / 4);
  const text = textOf(recording, at);
  const calls = [0, 1, 2].map((index) => ({
    attempts: [
      {
        response: {
          ...attempt.response,
          text: text.slice(index * size, (index + 1) * size),
          usage: { ...attempt.response.usage, outputTokens: 4096 },
          finishReason: 'length' as const,
        },
      },
    ],
  }));
  return {
    ...recording,
    calls: [...recording.calls.slice(0, at), ...calls, ...recording.calls.slice(at + 1)],
  };
}

describe('BuildPlan: each plan document that stays cut off is marked and named', () => {
  it.each(documents)(
    'RF-604 the $kind document opens with the notice, is the only one listed, and the run names it',
    async ({ kind, at, title, phrase, file, prefix }) => {
      const base = await loadRecording(join('tests', 'recordings', 'fake', 'planner-package.json'));
      const h = await seededUxPlan(temp.path, { recording: cutCall(base, at) });

      const run = await h.plan();

      expect(run.endState).toBe('Completed');
      const files = await h.handoffOf(run);
      const noticed = Object.keys(files).filter((path) => NOTICE.test(files[path] ?? ''));
      const readme = files['README.md'] ?? '';
      // No contract file is written for an answer with no usable operation: the notice heads the
      // README's API contract section, where the document is named.
      const apiSection = (readme.split('## API contract')[1] ?? '').trimStart();
      const carried =
        kind === 'apiContract'
          ? NOTICE.test(apiSection)
          : noticed.includes(file) && noticed.every((path) => path.startsWith(prefix));
      expect(carried).toBe(true);
      expect(wireframeProblems(files, noticed)).toEqual([]);
      const limit = String(h.providers.requests()[0]?.maxOutputTokens);
      const listed =
        readme
          .split('## Incomplete documents')[1]
          ?.split('## Reading order')[0]
          ?.match(/^- .*$/gmu) ?? [];
      expect(listed).toHaveLength(1);
      expect(listed[0]).toContain(title);
      expect(listed[0]).toContain(`cut off at ${limit} output tokens`);
      const warnings = h.s.logger.entries.filter((entry) => entry.level === 'warn');
      expect(warnings.some((entry) => entry.message.includes(`The ${phrase} is incomplete`))).toBe(
        true,
      );
    },
  );
});
