import { describe, expect, it } from 'vitest';
import { readingPriorityOf } from '../../../../src/domain/code-map/reading-priority.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-210 (P8-94, DEC-216): the reading priority of an area is whether it holds an entry point
// (the marks of area-surface.ts) and its first-party token count (vendored libraries are left out).

describe('RF-210 reading priority of the areas', () => {
  const files = [
    entry('Shop/OrdersController.cs', 100, { artefactKinds: ['controller'] }),
    entry('Shop/Order.cs', 50),
    entry('Shop/Scripts/jquery-3.4.1.min.js', 4_000),
    entry('Docs/guide.html', 700),
    entry('Setup/install.cs', 30),
  ];
  const areas = [
    { name: 'Shop', files: files.slice(0, 3).map((file) => file.path) },
    { name: 'Docs', files: ['Docs/guide.html'] },
    { name: 'Setup', files: ['Setup/install.cs'] },
  ];

  it('RF-210 marks an area with a controller as holding an entry point', () => {
    const priority = readingPriorityOf(areas, { files, symbols: [] });

    expect(priority.get('Shop')?.entryPoint).toBe(true);
  });

  it('RF-210 marks an area of a static page and a plain class as having none', () => {
    const priority = readingPriorityOf(areas, { files, symbols: [] });

    expect(priority.get('Docs')?.entryPoint).toBe(false);
    expect(priority.get('Setup')?.entryPoint).toBe(false);
  });

  it('RF-210 counts first-party tokens only, leaving a vendored library out', () => {
    const priority = readingPriorityOf(areas, { files, symbols: [] });

    expect(priority.get('Shop')?.firstPartyTokens).toBe(150);
    expect(priority.get('Docs')?.firstPartyTokens).toBe(700);
  });

  it('RF-210 counts a listed file the code map does not know as nothing', () => {
    const priority = readingPriorityOf([{ name: 'Ghost', files: ['Ghost/x.cs'] }], {
      files: [],
      symbols: [],
    });

    expect(priority.get('Ghost')).toEqual({ entryPoint: false, firstPartyTokens: 0 });
  });
});

describe('RF-210 reading priority cost', () => {
  it('RF-210 reads the files and symbols of the code map once, however many areas it ranks', () => {
    const many = Array.from({ length: 50 }, (_, index) => ({
      name: `Area${String(index)}`,
      files: [`Area${String(index)}/a.cs`],
    }));
    const listed = many.map((each) => entry(each.files[0] ?? '', 10));
    const reads = { files: 0, symbols: 0 };
    const map = {
      get files() {
        reads.files += 1;
        return listed;
      },
      get symbols() {
        reads.symbols += 1;
        return [];
      },
    };

    const priority = readingPriorityOf(many, map);

    expect(priority.size).toBe(50);
    expect(reads.files).toBeLessThanOrEqual(2);
    expect(reads.symbols).toBeLessThanOrEqual(1);
  });
});
