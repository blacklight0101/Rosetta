import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { agentFiles } from '../../../support/agent-fixtures.js';
import { blockOf, toolsSetup } from '../../../support/agent-tools-harness.js';
import { securityCodes } from '../../../support/reader-harness.js';

// RF-201, RF-145, RF-146, ADR-006, ADR-013: the reader's tools read only the snapshot and the code
// map, check every argument the model sends, and answer with exactly one data block.

describe('read_file results', () => {
  it('RF-201 read_file returns the lines in one data block that cites the range', async () => {
    const { run } = toolsSetup();

    const outcome = await run('read_file', {
      path: 'src/Orders/OrderService.cs',
      startLine: 3,
      endLine: 5,
    });
    const block = blockOf(outcome.content);

    expect(block.excerpts).toEqual([
      { path: 'src/Orders/OrderService.cs', startLine: 3, endLine: 5 },
    ]);
    expect(block.text).toBe(
      agentFiles['src/Orders/OrderService.cs']?.split('\n').slice(2, 5).join('\n'),
    );
  });

  it("RF-145 read_file resolves a path to the code map's exact case", async () => {
    const { run, reader } = toolsSetup();

    const outcome = await run('read_file', {
      path: 'SRC/orders/orderservice.cs',
      startLine: 1,
      endLine: 2,
    });

    expect(reader.reads).toEqual(['src/Orders/OrderService.cs']);
    expect(blockOf(outcome.content).excerpts[0]?.path).toBe('src/Orders/OrderService.cs');
  });

  it('RF-201 read_file accepts line numbers sent as numeric strings', async () => {
    const { run } = toolsSetup();

    const outcome = await run('read_file', {
      path: 'src/Orders/Order.cs',
      startLine: '1',
      endLine: ' 2 ',
    });

    expect(outcome.error).toBeUndefined();
    expect(blockOf(outcome.content).excerpts).toEqual([
      { path: 'src/Orders/Order.cs', startLine: 1, endLine: 2 },
    ]);
  });
});

describe('read_file ranges', () => {
  it('RF-201 read_file stops at the last line of the file', async () => {
    const { run } = toolsSetup();

    const outcome = await run('read_file', {
      path: 'src/Orders/Order.cs',
      startLine: 3,
      endLine: 99,
    });

    expect(blockOf(outcome.content).excerpts).toEqual([
      { path: 'src/Orders/Order.cs', startLine: 3, endLine: 4 },
    ]);
  });

  it('RF-201 read_file refuses a start after the end', async () => {
    const { run } = toolsSetup();

    const outcome = await run('read_file', {
      path: 'src/Orders/Order.cs',
      startLine: 3,
      endLine: 1,
    });

    expect(outcome.error?.code).toBe(ERROR_CODES.toolArgumentsInvalid);
  });
});

describe('read_file paths', () => {
  it('RF-145 read_file refuses a path outside the repository and logs a security event', async () => {
    const { run, reader, logger } = toolsSetup();

    const outcome = await run('read_file', { path: '../../.env', startLine: 1, endLine: 5 });

    expect(outcome.error?.code).toBe(ERROR_CODES.pathOutsideRoot);
    expect(reader.reads).toEqual([]);
    expect(securityCodes(logger)).toEqual([ERROR_CODES.pathOutsideRoot]);
  });

  it('RF-145 read_file refuses an absolute or backslash path as invalid and logs it', async () => {
    const { run, logger } = toolsSetup();

    const outcome = await run('read_file', { path: 'C:\\secrets.txt', startLine: 1, endLine: 5 });

    expect(outcome.error?.code).toBe(ERROR_CODES.pathInvalid);
    expect(securityCodes(logger)).toEqual([ERROR_CODES.pathInvalid]);
  });

  it('RF-201 read_file refuses a path that is not in the code map', async () => {
    const { run, reader } = toolsSetup();

    const outcome = await run('read_file', {
      path: 'src/Orders/Missing.cs',
      startLine: 1,
      endLine: 5,
    });

    expect(outcome.error?.code).toBe(ERROR_CODES.fileNotFound);
    expect(blockOf(outcome.content).text).toContain('list_area_files');
    expect(reader.reads).toEqual([]);
  });
});

describe('read_file skipped files and size limits', () => {
  it('RF-201 read_file refuses a file the scan skipped', async () => {
    const { run, reader } = toolsSetup();

    const outcome = await run('read_file', {
      path: 'src/Orders/logo.png',
      startLine: 1,
      endLine: 5,
    });

    expect(outcome.error?.code).toBe(ERROR_CODES.toolFileSkipped);
    expect(reader.reads).toEqual([]);
  });

  it('RF-201 read_file cuts a line longer than the line limit', async () => {
    const { run } = toolsSetup({ maxLineChars: 12 });

    const outcome = await run('read_file', {
      path: 'src/Orders/Order.cs',
      startLine: 3,
      endLine: 3,
    });

    expect(blockOf(outcome.content).text).toBe('    public d');
  });

  it('RF-201 read_file stops at the result size limit and cites only the lines it returns', async () => {
    const { run } = toolsSetup({ maxResultChars: 55 });

    const outcome = await run('read_file', {
      path: 'src/Orders/OrderService.cs',
      startLine: 1,
      endLine: 7,
    });

    expect(blockOf(outcome.content).excerpts).toEqual([
      { path: 'src/Orders/OrderService.cs', startLine: 1, endLine: 3 },
    ]);
  });
});

describe('read_file and codemap_query edge cases', () => {
  it('RF-201 read_file passes a reader refusal on as an error result', async () => {
    const files = Object.fromEntries(
      Object.entries(agentFiles).filter(([path]) => path !== 'src/Orders/Order.cs'),
    );
    const { run } = toolsSetup({}, files);

    const outcome = await run('read_file', {
      path: 'src/Orders/Order.cs',
      startLine: 1,
      endLine: 2,
    });

    expect(outcome.error?.code).toBe(ERROR_CODES.fileNotFound);
  });

  it('RF-201 codemap_query refuses a file the scan skipped', async () => {
    const { run } = toolsSetup();

    const outcome = await run('codemap_query', { path: 'src/Orders/logo.png' });

    expect(outcome.error?.code).toBe(ERROR_CODES.toolFileSkipped);
  });

  it('RF-201 codemap_query says when no symbol has the name', async () => {
    const { run } = toolsSetup();

    const outcome = await run('codemap_query', { symbol: 'Nothing' });

    expect(blockOf(outcome.content).text).toBe(
      'No symbol or entity named "Nothing" in the code map.',
    );
  });
});
