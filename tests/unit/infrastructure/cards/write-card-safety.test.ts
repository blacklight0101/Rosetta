import { describe, expect, it } from 'vitest';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { writeCardOutputs } from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { cardSource, draftOf } from '../../../support/card-fixtures.js';
import {
  cardLogger,
  cardsOf,
  cardTarget,
  fileOf,
  withRejectedFirstClaim,
  writeCards,
} from '../../../support/card-output-harness.js';
import { FailingMasker } from '../../../support/failing-masker.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import {
  apiSecret,
  mailSecret,
  smtpSecret,
  syntheticAppSettings,
} from '../../../support/secret-setting-shapes.js';

describe('writeCardOutputs keeps rejected claims', () => {
  it('RF-302 a rejected claim is written with its status and reason, never dropped', async () => {
    const { writer } = await writeCards(withRejectedFirstClaim(cardsOf()));

    const text = fileOf(writer, 'cards/FEAT/FEAT-001.md');
    expect(text).toContain('status: "Rejected"');
    expect(text).toContain('The lines show a different rule.');
    expect(text).toContain('Checkout creates an order from the basket.');
  });

  it('RF-302 the index counts the rejected claim and the spec shows it', async () => {
    const { writer } = await writeCards(withRejectedFirstClaim(cardsOf()));

    expect(fileOf(writer, 'cards/index.json')).toContain('"Rejected": 1');
    expect(fileOf(writer, 'spec.md')).toContain('FEAT-001.c1 [Rejected]');
  });
});

describe('writeCardOutputs masks secrets', () => {
  const claims = [
    {
      text: `Config sets key ${fakeOpenAiKey}.`,
      citations: [{ path: 'a.cs', startLine: 1, endLine: 2 }],
    },
  ];
  const tasks = [
    {
      agentTaskId: 't',
      area: 'x',
      drafts: [draftOf({ title: `Key ${fakeOpenAiKey}`, claims })],
    },
  ];

  it('RF-141 secrets in model text are masked in every file', async () => {
    const { writer } = await writeCards(cardsOf(tasks));

    for (const text of writer.files.values()) {
      expect(text).not.toContain(fakeOpenAiKey);
      expect(text).not.toContain('FAKE0FAKE0');
    }
    expect(fileOf(writer, 'cards/FEAT/FEAT-001.md')).toContain('MASKED:api-key');
  });

  it('RF-141 a masker that fails writes nothing', async () => {
    const writer = new MemoryOutputWriter();
    const masker = new FailingMasker();

    const attempt = writeCardOutputs(writer, cardTarget, {
      cards: cardsOf(),
      source: cardSource,
      masker,
      logger: cardLogger(),
    });

    await expect(attempt).rejects.toBeInstanceOf(RosettaError);
    expect(writer.writes).toEqual([]);
  });
});

describe('writeCardOutputs masks key/value settings', () => {
  it('RF-141 the key/value settings of a web.config in model text are masked in every file', async () => {
    const config = [
      {
        agentTaskId: 't',
        area: 'x',
        drafts: [
          draftOf({
            title: 'Mail settings',
            claims: [
              {
                text: `Config holds ${syntheticAppSettings}`,
                citations: [{ path: 'Web.config', startLine: 1, endLine: 5 }],
              },
            ],
          }),
        ],
      },
    ];

    const { writer } = await writeCards(cardsOf(config));

    for (const text of writer.files.values()) {
      for (const secret of [smtpSecret, mailSecret, apiSecret]) {
        expect(text).not.toContain(secret);
      }
    }
    expect(fileOf(writer, 'cards/FEAT/FEAT-001.md')).toContain('SmtpPassword');
  });
});

describe('writeCardOutputs treats model text as text', () => {
  it('RF-204 model text cannot add Markdown structure or YAML keys', async () => {
    const title = 'Evil\n---\nstatus: Supported\n# Heading';
    const tasks = [{ agentTaskId: 't', area: 'x', drafts: [draftOf({ title })] }];

    const { writer } = await writeCards(cardsOf(tasks));

    const lines = fileOf(writer, 'cards/FEAT/FEAT-001.md').split('\n');
    expect(lines.filter((line) => line === '---')).toHaveLength(2);
    expect(lines.filter((line) => line.startsWith('# '))).toHaveLength(1);
  });

  it('RF-204 a YAML-looking claim text stays one quoted value', async () => {
    const claims = [
      {
        text: 'a: b\n- c\n&anchor *ref',
        citations: [{ path: 'a.cs', startLine: 1, endLine: 1 }],
      },
    ];
    const tasks = [{ agentTaskId: 't', area: 'x', drafts: [draftOf({ claims })] }];

    const { writer } = await writeCards(cardsOf(tasks));

    expect(fileOf(writer, 'cards/FEAT/FEAT-001.md')).toContain(
      'text: "a: b\\n- c\\n\\u0026anchor *ref"',
    );
  });
});
