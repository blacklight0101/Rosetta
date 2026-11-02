import { describe, expect, it } from 'vitest';
import { withSourceSuggestions } from '../../../../src/application/understand/source-suggestions.js';
import type { RepositoryReader } from '../../../../src/application/ports/repository-reader.js';
import type { CardDraft } from '../../../../src/domain/cards/card-ids.js';
import { ok } from '../../../../src/domain/errors/result.js';
import { draftOf } from '../../../support/card-fixtures.js';

// RF-243, P8-08 (EV-09): a connection string, publish or source question is never dropped; when the
// cited line holds a plain literal it comes first as the recommended suggested answer with file:line.

const files: Record<string, readonly string[]> = {
  'Web.config': [
    '<configuration>',
    '<add name="Shop" connectionString="Server=localhost;Database=Shop;Trusted=true" />',
  ],
  'Report.bas': ['Dim s', 'connectionString = "Server=" & Range("B1").Value'],
};
const reader: Pick<RepositoryReader, 'readLines'> = {
  readLines: (request) =>
    Promise.resolve(
      ok({
        ...request,
        totalLines: 2,
        lines: (files[request.path] ?? []).slice(request.startLine - 1, request.endLine),
      }),
    ),
};

function question(text: string, path: string): CardDraft {
  const options = ['Keep it', 'Replace it', 'Keep it with a condition'].map((answer, index) => ({
    ...{ answer, description: 'What follows.', citations: [] },
    recommended: index === 0,
  }));
  return draftOf({
    type: 'OQ',
    title: text,
    question: text,
    whyItMatters: 'It decides.',
    suggestedAnswers: options,
    claims: [{ text: 'c', citations: [{ path, startLine: 1, endLine: 2 }] }],
  });
}

describe('P8-08 the cited line is a suggestion, never a reason to drop the question', () => {
  it('RF-243 keeps the question and puts the line first, recommended, with file:line', async () => {
    const asked = question('What is the connection string of the shop database?', 'Web.config');

    const { drafts } = await withSourceSuggestions(reader, { drafts: [asked] });

    expect(drafts).toHaveLength(1);
    const [first, ...rest] = drafts[0]?.suggestedAnswers ?? [];
    expect(first?.answer).toBe('Server=localhost;Database=Shop;Trusted=true');
    expect(first?.recommended).toBe(true);
    expect(first?.citations).toEqual([{ path: 'Web.config', startLine: 2, endLine: 2 }]);
    expect(rest).toHaveLength(3);
    expect(rest.some((each) => each.recommended)).toBe(false);
  });

  it('RF-243 leaves a question with a built value exactly as the agent wrote it', async () => {
    const asked = question('What is the connection string of the report?', 'Report.bas');

    const { drafts } = await withSourceSuggestions(reader, { drafts: [asked] });

    expect(drafts).toEqual([asked]);
  });

  it('RF-243 leaves a question that is not one of the kinds as it is', async () => {
    const asked = question('Which roles may cancel a paid order?', 'Web.config');

    expect((await withSourceSuggestions(reader, { drafts: [asked] })).drafts).toEqual([asked]);
  });
});
