import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { agentFiles } from '../../../support/agent-fixtures.js';
import { blockOf, toolsSetup } from '../../../support/agent-tools-harness.js';

// RF-201, RF-145, RF-146, ADR-006, ADR-013: the reader's tools read only the snapshot and the code
// map, check every argument the model sends, and answer with exactly one data block.

describe('grep', () => {
  it('RF-146 grep refuses a pattern longer than 200 characters before it runs', async () => {
    const { run, reader } = toolsSetup();

    const outcome = await run('grep', { pattern: 'a'.repeat(201) });

    expect(outcome.error?.code).toBe(ERROR_CODES.toolArgumentsInvalid);
    expect(reader.greps).toEqual([]);
  });

  it('RF-201 grep cites every matching line of the code map files', async () => {
    const files = { ...agentFiles, 'notes/unmapped.cs': 'public class Hidden' };
    const { run } = toolsSetup({}, files);

    const outcome = await run('grep', { pattern: 'public class' });
    const block = blockOf(outcome.content);

    expect(block.header).toContain('"source":"grep"');
    expect(block.excerpts.map((excerpt) => excerpt.path)).toEqual([
      'src/Billing/Invoice.cs',
      'src/Orders/Order.cs',
      'src/Orders/OrderService.cs',
    ]);
    expect(block.text).toContain('src/Orders/Order.cs:1: public class Order');
    expect(block.text).not.toContain('Hidden');
  });

  it('RF-146 grep keeps at most the match limit and says so', async () => {
    const { run } = toolsSetup({ maxGrepMatches: 2 });

    const outcome = await run('grep', { pattern: 'class' });
    const block = blockOf(outcome.content);

    expect(block.excerpts).toHaveLength(2);
    expect(block.text).toContain('Only the first 2 matches');
  });
});

describe('codemap_query', () => {
  it('RF-201 codemap_query by symbol lists the symbols and entities of that name', async () => {
    const { run } = toolsSetup();

    const outcome = await run('codemap_query', { symbol: 'order' });
    const block = blockOf(outcome.content);

    expect(block.header).toContain('"source":"codemap_query"');
    expect(block.text).toContain('class Order src/Orders/Order.cs:1-4');
    expect(block.text).toContain('entity Order src/Orders/Order.cs:1');
    expect(block.text).not.toContain('Shipping');
  });

  it('RF-201 codemap_query by path describes the file, its symbols, links and SQL', async () => {
    const { run } = toolsSetup();

    const outcome = await run('codemap_query', { path: 'src/orders/OrderService.cs' });
    const block = blockOf(outcome.content);

    expect(block.text).toContain('file src/Orders/OrderService.cs (csharp, 7 lines, area orders)');
    expect(block.text).toContain('method OrderService.Shipping src/Orders/OrderService.cs:5-5');
    expect(block.text).toContain('import src/Orders/OrderService.cs -> src/Orders/Order.cs');
    expect(block.text).toContain('SELECT src/Orders/OrderService.cs:5: SELECT Total FROM Orders');
    expect(block.excerpts).toEqual([
      { path: 'src/Orders/OrderService.cs', startLine: 5, endLine: 5 },
    ]);
  });

  it('RF-201 codemap_query needs exactly one of symbol and path', async () => {
    const { run } = toolsSetup();

    const both = await run('codemap_query', { symbol: 'Order', path: 'src/Orders/Order.cs' });
    const neither = await run('codemap_query', {});

    expect(both.error?.code).toBe(ERROR_CODES.toolArgumentsInvalid);
    expect(neither.error?.code).toBe(ERROR_CODES.toolArgumentsInvalid);
  });
});

describe('grep answers from the reader', () => {
  it('RF-146 grep passes the reader refusal on as an error result', async () => {
    const { run } = toolsSetup();

    const outcome = await run('grep', { pattern: '(' });

    expect(outcome.error?.code).toBe(ERROR_CODES.grepPatternInvalid);
    expect(blockOf(outcome.content).header).toContain('"source":"grep"');
  });

  it('RF-201 grep says when nothing matched', async () => {
    const { run } = toolsSetup();

    const outcome = await run('grep', { pattern: 'NoSuchName', pathGlob: 'src/**' });

    expect(blockOf(outcome.content)).toMatchObject({ excerpts: [], text: 'No matches.' });
  });

  it("RF-146 grep passes the reader's notice about cut lines on", async () => {
    const { run } = toolsSetup();

    const outcome = await run('grep', { pattern: 'cut' });

    expect(blockOf(outcome.content).text).toContain('Lines were cut before the search.');
  });
});
