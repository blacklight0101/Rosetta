import { describe, expect, it } from 'vitest';
import { KeptFileParse } from '../../../../src/infrastructure/files/kept-file-parse.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-604, RF-1011 (P5-28): the kept parses are bounded and the least recently read goes first.

async function setup(most: number) {
  const files = new MemoryOutputWriter();
  for (const name of ['a', 'b', 'c']) await files.writeText({ userId: 'u', path: name }, name);
  const kept = new KeptFileParse<string>(files, files, most);
  const read = async (name: string): Promise<number> => {
    const before = files.reads.length;
    await kept.read({ userId: 'u', path: name }, (text) => text);
    return files.reads.length - before;
  };
  return { read };
}

describe('KeptFileParse', () => {
  it('RF-604 with room for two files, the third evicts exactly the oldest', async () => {
    const { read } = await setup(2);
    expect([await read('a'), await read('b'), await read('c')]).toEqual([1, 1, 1]);

    expect(await read('b')).toBe(0);
    expect(await read('c')).toBe(0);
    expect(await read('a')).toBe(1);
  });

  it('RF-604 a file read again is the most recent, so another one is evicted', async () => {
    const { read } = await setup(2);
    await read('a');
    await read('b');
    await read('a');
    await read('c');

    expect(await read('a')).toBe(0);
    expect(await read('b')).toBe(1);
  });

  it('RF-604 a user does not get the kept parse of another user', async () => {
    const files = new MemoryOutputWriter();
    await files.writeText({ userId: 'u', path: 'a' }, 'a');
    const kept = new KeptFileParse<string>(files, files);
    await kept.read({ userId: 'u', path: 'a' }, (text) => text);
    files.reads.length = 0;

    await kept.read({ userId: 'v', path: 'a' }, (text) => text);

    expect(files.reads).toHaveLength(1);
  });
});
