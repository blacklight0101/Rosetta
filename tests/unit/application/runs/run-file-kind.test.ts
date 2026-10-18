import { describe, expect, it } from 'vitest';
import { kindOfRunFile } from '../../../../src/application/runs/run-file-kind.js';

// RF-507, RF-1013: text is shown as text; the pages Rosetta writes into report/ are shown as pages;
// everything else is a download.

describe('kindOfRunFile', () => {
  it.each([
    ['manifest.json', 'application/json; charset=utf-8'],
    ['events.jsonl', 'text/plain; charset=utf-8'],
    ['cards/BR/BR-001.md', 'text/plain; charset=utf-8'],
    ['spec.md', 'text/plain; charset=utf-8'],
    ['cost.md', 'text/plain; charset=utf-8'],
    ['invalid-output/task-1.txt', 'text/plain; charset=utf-8'],
    ['report/report.md', 'text/plain; charset=utf-8'],
    ['transcripts/task-1.jsonl', 'text/plain; charset=utf-8'],
  ])('RF-507 shows %s inline as %s', (path, contentType) => {
    expect(kindOfRunFile(path)).toEqual({ contentType, disposition: 'inline' });
  });

  it.each([
    ['report/report.html', 'text/html; charset=utf-8'],
    ['report/replay.html', 'text/html; charset=utf-8'],
    ['report/report.css', 'text/css; charset=utf-8'],
    ['report/replay.js', 'text/javascript; charset=utf-8'],
    ['report/filters.js', 'text/javascript; charset=utf-8'],
    ['report/area-orders-1c168adb.html', 'text/html; charset=utf-8'],
    ['report/card-BR-001.html', 'text/html; charset=utf-8'],
  ])('RF-506 shows the report file %s inline as %s', (path, contentType) => {
    expect(kindOfRunFile(path)).toEqual({ contentType, disposition: 'inline' });
  });
});

describe('kindOfRunFile downloads', () => {
  it.each([
    'report.html',
    'handoff/page.html',
    'cards/BR/BR-001.html',
    'transcripts/x.js',
    'handoff/x.css',
    'handoff/logo.svg',
    'report/logo.svg',
    'report/nested/page.html',
  ])('RF-507 never shows %s as a page, a script or a style: it is a download', (path) => {
    expect(kindOfRunFile(path)).toEqual({
      contentType: 'application/octet-stream',
      disposition: 'attachment',
    });
  });

  it.each(['archive.zip', 'report/logo.png', 'noextension', 'handoff/README', 'a.MD.exe'])(
    'RF-507 gives %s as a download',
    (path) => {
      expect(kindOfRunFile(path).disposition).toBe('attachment');
    },
  );

  it('RF-507 reads the extension in any case', () => {
    expect(kindOfRunFile('cards/BR/BR-001.MD').contentType).toBe('text/plain; charset=utf-8');
    expect(kindOfRunFile('report/Replay.HTML').contentType).toBe('text/html; charset=utf-8');
  });
});
