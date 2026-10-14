import { describe, expect, it } from 'vitest';
import { defaultToolLimits } from '../../../../src/application/agent/tool-limits.js';
import { runGrepBounded } from '../../../../src/application/agent/tool-reads.js';
import type {
  GrepResult,
  ReadRefusal,
} from '../../../../src/application/ports/repository-reader.js';
import { ok, type Result } from '../../../../src/domain/errors/result.js';
import { MemoryRepositoryReader } from '../../../support/memory-repository-reader.js';

// RF-146, RF-201, P1-90: grep keeps only the matches of the files the scan read, even when a
// reader answers with a match in another file (defence in depth against a reader that ignores
// its `paths`).

class ReaderAnsweringAnyFile extends MemoryRepositoryReader {
  override grep(): Promise<Result<GrepResult, ReadRefusal>> {
    const result: GrepResult = {
      cutLines: 0,
      matches: [
        { path: 'src/Orders/Order.cs', line: 1, text: 'public class Order', cut: false },
        { path: 'notes/unmapped.cs', line: 1, text: 'public class Hidden', cut: false },
      ],
    };
    return Promise.resolve(ok(result));
  }
}

describe('grep post-filter', () => {
  it('RF-201 grep drops a match in a file the scan did not read, even when the reader returns it', async () => {
    const reader = new ReaderAnsweringAnyFile({ 'src/Orders/Order.cs': 'public class Order' });

    const result = await runGrepBounded(
      reader,
      { pattern: 'public class', pathGlob: undefined },
      { limits: defaultToolLimits, paths: ['src/Orders/Order.cs'] },
    );

    expect(result).toMatchObject({
      ok: true,
      value: { excerpts: [{ path: 'src/Orders/Order.cs', startLine: 1, endLine: 1 }] },
    });
    expect(JSON.stringify(result)).not.toContain('Hidden');
  });
});
