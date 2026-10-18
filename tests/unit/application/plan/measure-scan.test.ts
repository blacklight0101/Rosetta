import { describe, expect, it } from 'vitest';
import type { ReadBytesRequest } from '../../../../src/application/ports/repository-reader.js';
import { measureLimitBytes, measureScan } from '../../../../src/application/plan/measure-scan.js';
import { demoScan, scanOf } from '../../../support/scan-shape-fixtures.js';

// RF-632, DEC-135: the shapes of a scan are measured by code, from the files the scan listed and
// the read-only reader of its snapshot. A model never sees them and nothing is written back.

describe('measureScan', () => {
  it('RF-632 measures the size, encoding and line endings of every file the scan listed', async () => {
    const scan = scanOf({
      'src/a.cs': 'one\r\ntwo\r\n',
      'src/b.txt': 'café\n',
    });

    const shapes = await measureScan(scan.codeMap, scan.reader);

    expect(shapes.files).toBe(2);
    expect(shapes.totalBytes).toBe(10 + 6);
    expect(shapes.encodings).toEqual([
      { name: 'ASCII', files: 1 },
      { name: 'UTF-8', files: 1 },
    ]);
    expect(shapes.lineEndings).toEqual([
      { name: 'CRLF', files: 1 },
      { name: 'LF', files: 1 },
    ]);
  });

  it('RF-632 reads each file once and never more than the measuring limit', async () => {
    const scan = scanOf({ 'a.cs': 'x', 'b.cs': 'y' });
    const seen: number[] = [];
    const reader = {
      ...scan.reader,
      readBytes: (request: ReadBytesRequest) => {
        seen.push(request.maxBytes);
        return scan.reader.readBytes(request);
      },
    };

    await measureScan(scan.codeMap, reader);

    expect(scan.asked).toEqual(['a.cs', 'b.cs']);
    expect(seen).toEqual([measureLimitBytes, measureLimitBytes]);
  });
});

describe('measureScan limits and refusals', () => {
  it('RF-632 states only the size of a file above the limit', async () => {
    const scan = scanOf({ 'big.csv': { size: measureLimitBytes + 1 }, 'a.cs': 'x\n' });

    const shapes = await measureScan(scan.codeMap, scan.reader);

    expect(shapes.largest[0]).toEqual({
      path: 'big.csv',
      kind: 'other',
      bytes: measureLimitBytes + 1,
      encoding: undefined,
      lineEnding: undefined,
    });
    expect(shapes.encodings).toEqual([{ name: 'ASCII', files: 1 }]);
  });

  it('RF-632 counts a file the reader refuses and leaves it out of the sizes', async () => {
    const scan = scanOf({ 'a.cs': 'abc', 'gone.cs': 'abcdef' }, { unreadable: ['gone.cs'] });

    const shapes = await measureScan(scan.codeMap, scan.reader);

    expect(shapes.unreadable).toBe(1);
    expect(shapes.files).toBe(1);
    expect(shapes.totalBytes).toBe(3);
  });

  it('RF-632 lists the names the reader refused among the unusual names', async () => {
    const scan = scanOf({ 'a.cs': 'abc' }, { invalidNames: ['legacy/aux.c', 'legacy/nul.'] });

    const shapes = await measureScan(scan.codeMap, scan.reader);

    expect(shapes.unusualNames.map((each) => each.path)).toEqual(['legacy/aux.c', 'legacy/nul.']);
  });

  it('RF-632 finds the maps, the bundled scripts and the reserved names of the demo scan', async () => {
    const scan = demoScan();

    const shapes = await measureScan(scan.codeMap, scan.reader);

    const kinds = Object.fromEntries(shapes.byKind.map((each) => [each.kind, each.files]));
    expect(kinds['generated map']).toBe(3);
    expect(kinds['bundled third-party script']).toBe(2);
    expect(shapes.unusualNames.map((each) => each.path)).toContain('Orders/aux.c');
    expect(shapes.largest[0]?.path).toBe('Archive/old-export.csv');
  });
});
