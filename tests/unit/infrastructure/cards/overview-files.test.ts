import { describe, expect, it } from 'vitest';
import {
  parseOverview,
  serialiseOverview,
} from '../../../../src/application/overview/overview-file.js';
import type { Overview } from '../../../../src/domain/overview/overview.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { writeCardOutputs } from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { renderOverview } from '../../../../src/infrastructure/cards/overview-markdown.js';
import { renderReportHtml } from '../../../../src/infrastructure/report/report-html.js';
import { renderReportMarkdown } from '../../../../src/infrastructure/report/report-markdown.js';
import { fullOverview, overviewCards } from '../../../support/app-overview-fixtures.js';
import { auditHtml } from '../../../support/html-audit.js';
import { cardLogger, cardTarget, fileOf } from '../../../support/card-output-harness.js';
import { cardSource } from '../../../support/card-fixtures.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';
import { hostileText, reportModel } from '../../../support/report-fixtures.js';

// RF-264, RF-507: overview.md, overview.json, the top of spec.md and the top of the report. Every
// statement links its cards; text from a model is shown as text.

const masker = new SecretMasker();

async function written(overview: Overview | undefined) {
  const writer = new MemoryOutputWriter();
  const result = await writeCardOutputs(writer, cardTarget, {
    ...{ cards: overviewCards(), source: cardSource, masker, logger: cardLogger() },
    overview,
  });
  expect(result.ok).toBe(true);
  return writer;
}

describe('overview.md', () => {
  it('RF-264 lists each statement with links to its cards and the questions of its section (snapshot)', () => {
    expect(renderOverview(fullOverview(), masker)).toMatchSnapshot();
  });

  it('RF-264 a thin overview opens with its notice and names what was not covered', () => {
    const thin: Overview = {
      state: 'thin',
      notice: 'This run cannot explain the application yet. Next step: run again.',
      sections: [],
      notCovered: ['Vendor: third-party code; nothing about the application was read from it.'],
      questions: [],
    };

    const text = renderOverview(thin, masker);

    expect(text.indexOf('cannot explain the application yet')).toBeLessThan(
      text.indexOf('## What was not covered'),
    );
    expect(text).toContain('- Vendor');
  });
});

describe('overview.md and hostile text', () => {
  it('RF-507 HTML, scripts and links in a statement are shown as text', () => {
    const hostile = fullOverview({
      sections: [
        {
          id: 'application',
          statements: [{ text: hostileText, cards: [{ id: 'FEAT-001', type: 'FEAT' }] }],
        },
      ],
      notCovered: ['<b>Vendor</b>: [x](javascript:alert(1))'],
      questions: [],
    });

    const text = renderOverview(hostile, masker);

    expect(text).not.toMatch(/<script|<img|<b>/u);
    expect(text).not.toContain('](javascript:');
    expect(text).toContain('&lt;script&gt;');
  });

  it('RF-507 a very long statement stays on one list item', () => {
    const long = 'word '.repeat(400);
    const overview = fullOverview({
      sections: [
        { id: 'users', statements: [{ text: long, cards: [{ id: 'FEAT-001', type: 'FEAT' }] }] },
      ],
      questions: [],
    });

    const lines = renderOverview(overview, masker)
      .split('\n')
      .filter((line) => line.startsWith('- word'));

    expect(lines).toHaveLength(1);
  });

  it('RNF-003 a secret in a statement is masked', () => {
    const secret = fakeOpenAiKey;
    const overview = fullOverview({
      sections: [
        { id: 'users', statements: [{ text: secret, cards: [{ id: 'FEAT-001', type: 'FEAT' }] }] },
      ],
    });

    expect(renderOverview(overview, masker)).not.toContain(secret);
  });
});

describe('writeCardOutputs with an overview', () => {
  it('RF-264 writes overview.md and overview.json next to spec.md', async () => {
    const writer = await written(fullOverview());

    expect(fileOf(writer, 'overview.md')).toContain('# Overview');
    expect(parseOverview(fileOf(writer, 'overview.json'))).toEqual(fullOverview());
  });

  it('RF-264 spec.md opens with the overview, before any area', async () => {
    const spec = fileOf(await written(fullOverview()), 'spec.md');

    expect(spec.indexOf('## Overview')).toBeGreaterThan(-1);
    expect(spec.indexOf('## Overview')).toBeLessThan(spec.indexOf('## Area:'));
    expect(spec).toContain('[FEAT-001](cards/FEAT/FEAT-001.md)');
  });

  it('RF-264 a set without an overview writes neither file and a spec without the section', async () => {
    const writer = await written(undefined);

    expect(fileOf(writer, 'overview.md')).toBe('');
    expect(fileOf(writer, 'overview.json')).toBe('');
    expect(fileOf(writer, 'spec.md')).not.toContain('## Overview');
  });
});

describe('overview.json', () => {
  it('RF-264 reads back what it wrote and refuses a torn or foreign file', () => {
    const overview = fullOverview();

    expect(parseOverview(serialiseOverview(overview))).toEqual(overview);
    expect(parseOverview('{"schemaVersion":1')).toBeUndefined();
    expect(parseOverview('{"schemaVersion":2}')).toBeUndefined();
    expect(parseOverview(undefined)).toBeUndefined();
    expect(parseOverview(serialiseOverview(overview).replace('"FEAT"', '"NOPE"'))).toBeUndefined();
  });
});

describe('the report', () => {
  const model = reportModel({ overview: fullOverview() });

  it('RF-264 report.md opens with the overview, its card links one folder up', () => {
    const text = renderReportMarkdown(model, masker);

    expect(text.indexOf('## Overview')).toBeGreaterThan(-1);
    expect(text.indexOf('## Overview')).toBeLessThan(text.indexOf('| Stage |'));
    expect(text).toContain('[FEAT-001](../cards/FEAT/FEAT-001.md)');
  });

  it('RF-264 report.md without an overview is the report it was', () => {
    expect(renderReportMarkdown(reportModel(), masker)).not.toContain('Overview');
  });

  it('RF-507 report.html shows the overview first and escapes a hostile statement', () => {
    const hostile = reportModel({
      overview: fullOverview({
        sections: [
          {
            id: 'application',
            statements: [{ text: hostileText, cards: [{ id: 'FEAT-001', type: 'FEAT' }] }],
          },
        ],
      }),
    });

    const page = auditHtml(renderReportHtml(hostile));

    expect(page.document.querySelector('#overview')).not.toBeNull();
    expect(page.document.querySelector('section')?.getAttribute('aria-labelledby')).toBe(
      'overview',
    );
    expect(page.document.querySelector('#overview script')).toBeNull();
    expect(page.document.querySelector('#overview img')).toBeNull();
    expect(page.document.querySelector('#overview')?.textContent).toContain('<script>');
  });
});
