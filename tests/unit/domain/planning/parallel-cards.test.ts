import { describe, expect, it } from 'vitest';
import {
  allocateIdentifiers,
  dependenciesOf,
  parallelGroups,
  type IdentifierKind,
  type OrderedCard,
} from '../../../../src/domain/planning/parallel-cards.js';

// RF-634, DEC-135: shared identifiers are allocated once by the plan, and two cards whose files
// overlap are ordered by a dependency, so they never share a parallel group.

function need(kind: IdentifierKind, purpose: string): { kind: IdentifierKind; purpose: string } {
  return { kind, purpose };
}

function card(files: readonly string[], overrides: Partial<OrderedCard> = {}): OrderedCard {
  return { phase: 1, files, declared: [], ...overrides };
}

describe('allocateIdentifiers', () => {
  it('RF-634 two cards that need an error code get two different codes', () => {
    const [first, second] = allocateIdentifiers([
      [need('error code', 'order not found')],
      [need('error code', 'payment declined')],
    ]);

    expect(first).toEqual([{ ...need('error code', 'order not found'), value: 'ERR-001' }]);
    expect(second).toEqual([{ ...need('error code', 'payment declined'), value: 'ERR-002' }]);
  });

  it('RF-634 two cards that need the same thing still get two different values', () => {
    const [first, second] = allocateIdentifiers([
      [need('error code', 'order not found')],
      [need('error code', 'Order  not found')],
    ]);

    expect(first?.[0]?.value).toBe('ERR-001');
    expect(second?.[0]?.value).toBe('ERR-002');
  });

  it('RF-634 one card that names a need twice, in another spelling, gets one value', () => {
    const [only] = allocateIdentifiers([
      [need('port', 'the web server'), need('port', ' The  WEB server '), need('port', 'queue')],
    ]);

    expect(only?.map((each) => each.value)).toEqual(['5001', '5002']);
  });
});

describe('allocateIdentifiers: kinds and shapes', () => {
  it('RF-634 every kind counts on its own and has its own shape', () => {
    const [first, second] = allocateIdentifiers([
      [
        need('error code', 'a'),
        need('migration number', 'create orders'),
        need('configuration key', 'tax rate'),
        need('port', 'api'),
      ],
      [need('migration number', 'add index'), need('configuration key', 'locale')],
    ]);

    expect(first?.map((each) => each.value)).toEqual(['ERR-001', '0001', 'SETTING_001', '5001']);
    expect(second?.map((each) => each.value)).toEqual(['0002', 'SETTING_002']);
  });

  it('RF-634 a card that needs nothing gets nothing and takes nothing from the next', () => {
    const [none, next] = allocateIdentifiers([[], [need('error code', 'x')]]);

    expect(none).toEqual([]);
    expect(next?.[0]?.value).toBe('ERR-001');
  });

  it('RF-634 numbers past 999 keep their shape and stay different', () => {
    const many = Array.from({ length: 1001 }, (_, at) => [
      need('error code', `code ${String(at)}`),
    ]);

    const values = allocateIdentifiers(many).flatMap((each) => each.map((one) => one.value));

    expect(new Set(values).size).toBe(1001);
    expect(values[999]).toBe('ERR-1000');
  });
});

describe('dependenciesOf: cards whose files overlap', () => {
  it('RF-634 the later of two cards that list the same file depends on the earlier', () => {
    expect(dependenciesOf([card(['src/orders/order.ts']), card(['src/orders/order.ts'])])).toEqual([
      [],
      [0],
    ]);
  });

  it.each([
    './src/orders/order.ts',
    'SRC/Orders/Order.ts',
    'src\\orders\\order.ts',
    'src//orders/order.ts',
    'src/orders/../orders/order.ts',
    '  src/orders/order.ts  ',
    'src/orders/order.ts/',
    '/src/orders/order.ts',
  ])('RF-634 the spelling %j of a file is still the same file', (spelling) => {
    expect(dependenciesOf([card(['src/orders/order.ts']), card([spelling])])).toEqual([[], [0]]);
  });
});

describe('dependenciesOf: folders and the root', () => {
  it('RF-634 a folder overlaps the files and folders inside it, and the other way round', () => {
    expect(dependenciesOf([card(['src/orders/']), card(['src/orders/order.ts'])])).toEqual([
      [],
      [0],
    ]);
    expect(dependenciesOf([card(['src/orders/order.ts']), card(['src/orders'])])).toEqual([
      [],
      [0],
    ]);
  });

  it.each([
    ['src/orders', 'src/orders.ts'],
    ['src/order', 'src/orders'],
    ['src/orders/a.ts', 'src/orders/b.ts'],
    ['src/a', 'tests/a'],
  ])('RF-634 %s and %s do not overlap', (left, right) => {
    expect(dependenciesOf([card([left]), card([right])])).toEqual([[], []]);
  });

  it.each(['.', './', '/', 'src/..'])(
    'RF-634 the root of the repository (%j) overlaps every card that lists a file',
    (root) => {
      expect(dependenciesOf([card(['src/a.ts']), card([root]), card(['docs/b.md'])])).toEqual([
        [],
        [0],
        [1],
      ]);
    },
  );

  it('RF-634 a card that lists no file overlaps nothing', () => {
    expect(dependenciesOf([card([]), card(['src/a.ts']), card([])])).toEqual([[], [], []]);
  });
});

describe('dependenciesOf: chains and phases', () => {
  it('RF-634 three cards on one file form a chain, each waiting for the one before', () => {
    expect(dependenciesOf([card(['a.ts']), card(['a.ts']), card(['a.ts'])])).toEqual([
      [],
      [0],
      [1],
    ]);
  });

  it('RF-634 a pair the planner already ordered through another card is not ordered twice', () => {
    const cards = [
      card(['a.ts']),
      card(['b.ts'], { declared: [0] }),
      card(['a.ts'], { declared: [1] }),
    ];

    expect(dependenciesOf(cards)).toEqual([[], [0], [1]]);
  });

  it('RF-634 cards of different phases that overlap are ordered too', () => {
    const cards = [card(['a.ts'], { phase: 1 }), card(['a.ts'], { phase: 2 })];

    expect(dependenciesOf(cards)).toEqual([[], [0]]);
  });

  it('RF-634 the earlier phase comes first even when its card is listed later', () => {
    const cards = [card(['a.ts'], { phase: 2 }), card(['a.ts'], { phase: 1 })];

    expect(dependenciesOf(cards)).toEqual([[1], []]);
  });
});

describe('dependenciesOf: what the planner declared', () => {
  it('RF-634 keeps a declared dependency on an earlier card of the phase', () => {
    expect(dependenciesOf([card(['a']), card(['b'], { declared: [0] })])).toEqual([[], [0]]);
  });

  it.each([
    ['itself', 1],
    ['a later card', 2],
    ['a card that does not exist', 9],
    ['a negative position', -1],
    ['a fraction', 0.5],
  ])('RF-634 drops a declared dependency on %s', (_, position) => {
    const cards = [card(['a']), card(['b'], { declared: [position] }), card(['c'])];

    expect(dependenciesOf(cards)[1]).toEqual([]);
  });

  it('RF-634 drops a declared dependency on a card of a later phase', () => {
    const cards = [card(['a'], { declared: [1] }), card(['b'], { phase: 2 })];

    expect(dependenciesOf(cards)).toEqual([[], []]);
  });

  it('RF-634 lists each dependency once, in card order', () => {
    const cards = [card(['a']), card(['b']), card(['c'], { declared: [1, 0, 1, 0] })];

    expect(dependenciesOf(cards)[2]).toEqual([0, 1]);
  });
});

function grouped(
  id: string,
  dependsOn: readonly string[] = [],
  phase = 1,
): { id: string; phase: number; dependsOn: readonly string[] } {
  return { id, phase, dependsOn };
}

describe('parallelGroups', () => {
  it('RF-634 cards that wait for nobody run together', () => {
    expect(parallelGroups([grouped('T-001'), grouped('T-002'), grouped('T-003')], 1)).toEqual([
      ['T-001', 'T-002', 'T-003'],
    ]);
  });

  it('RF-634 a card that waits for another comes in a later group', () => {
    const cards = [grouped('T-001'), grouped('T-002', ['T-001']), grouped('T-003')];

    expect(parallelGroups(cards, 1)).toEqual([['T-001', 'T-003'], ['T-002']]);
  });

  it('RF-634 a chain gives one group per card, and a card waits for its slowest dependency', () => {
    const cards = [
      grouped('T-001'),
      grouped('T-002', ['T-001']),
      grouped('T-003', ['T-002']),
      grouped('T-004', ['T-001', 'T-003']),
    ];

    expect(parallelGroups(cards, 1)).toEqual([['T-001'], ['T-002'], ['T-003'], ['T-004']]);
  });

  it('RF-634 a dependency on a card of an earlier phase does not delay the card', () => {
    const cards = [grouped('T-001'), grouped('T-002', ['T-001'], 2), grouped('T-003', [], 2)];

    expect(parallelGroups(cards, 2)).toEqual([['T-002', 'T-003']]);
  });

  it('RF-634 a phase without cards has no group', () => {
    expect(parallelGroups([grouped('T-001')], 2)).toEqual([]);
  });

  it('RF-634 cards the planner ordered with overlapping files are never in one group', () => {
    const cards = [card(['src/a.ts']), card(['SRC/A.ts']), card(['src/b.ts'])];
    const dependencies = dependenciesOf(cards);
    const ids = ['T-001', 'T-002', 'T-003'];
    const tasks = ids.map((id, at) =>
      grouped(
        id,
        (dependencies[at] ?? []).map((on) => ids[on] ?? ''),
      ),
    );

    expect(parallelGroups(tasks, 1)).toEqual([['T-001', 'T-003'], ['T-002']]);
  });
});
