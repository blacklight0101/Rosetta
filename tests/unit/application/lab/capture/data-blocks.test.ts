import { describe, expect, it } from 'vitest';
import { readDataBlocks } from '../../../../../src/application/lab/capture/data-blocks.js';
import { block } from '../../../../support/capture-fixtures.js';

// RF-1404, RF-145: the capture reads saved data blocks back.

describe('reading data blocks back', () => {
  it('RF-1404 reads the source, the excerpts and the text of every block in order', () => {
    const message = `Describe.\n\n${block('read_file', '1: a\n2: b', [{ path: 'x.cs', startLine: 1, endLine: 2 }], 0)}\n\n${block('grep', 'hit', [], 1)}`;

    const blocks = readDataBlocks(message);

    expect(blocks.map((each) => [each.source, each.text])).toEqual([
      ['read_file', '1: a\n2: b'],
      ['grep', 'hit'],
    ]);
    expect(blocks[0]?.excerpts).toEqual([{ path: 'x.cs', startLine: 1, endLine: 2 }]);
  });

  it('RF-1404 ends a block only at the footer with its own tag', () => {
    const inner = '<<<END ROSETTA-DATA zzzzzzzzzzzzzzzzzzzzzzzz>>>';
    const open = block('grep', 'x', [], 0).split('\n')[0] ?? '';
    const message = `${open}\nbefore\n${inner}\nafter\n<<<END ROSETTA-DATA abcdefghijklmnopqrstuvwx>>>`;

    expect(readDataBlocks(message).map((each) => each.text)).toEqual([`before\n${inner}\nafter`]);
  });

  it('RF-1404 ignores text with no block and a block that is never closed', () => {
    const open = block('grep', 'x').split('\n')[0] ?? '';

    expect(readDataBlocks('plain text')).toEqual([]);
    expect(readDataBlocks(`${open}\nno footer`)).toEqual([]);
  });
});
