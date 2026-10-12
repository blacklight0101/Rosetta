import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// RF-145: the generated look-alike table is a copy of Unicode data, and the Unicode License v3
// asks that its copyright and permission notice appear with every copy, not only a link to it.

const sources = ['src/domain/egress/marker-confusables.ts', 'scripts/make-marker-confusables.mjs'];

describe('the Unicode notice of the look-alike table', () => {
  it.each(sources)('RF-145 %s carries the full copyright and permission notice', async (path) => {
    const text = await readFile(resolve(process.cwd(), path), 'utf8');

    expect(text).toContain('UNICODE LICENSE V3');
    expect(text).toContain('COPYRIGHT AND PERMISSION NOTICE');
    expect(text).toMatch(/Copyright © 1991-(?:\d{4}|\$\{year\}) Unicode, Inc\./);
    expect(text).toContain('Permission is hereby granted, free of charge, to any person');
    expect(text).toContain('THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS"');
    expect(text).toContain('IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS');
    expect(text).toContain('Except as contained in this notice, the name of a copyright holder');
  });
});
