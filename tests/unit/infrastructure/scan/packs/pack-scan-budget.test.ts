import { describe, expect, it } from 'vitest';
import type {
  LanguagePack,
  PackAnalysis,
  PackFile,
} from '../../../../../src/application/ports/language-pack.js';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import { LanguagePackRegistry } from '../../../../../src/infrastructure/scan/packs/pack-registry.js';
import { analyseWithPacks } from '../../../../../src/infrastructure/scan/packs/pack-scan.js';
import type { ScannedFile } from '../../../../../src/infrastructure/scan/universal/scan-types.js';
import { bytesReader } from '../../../../support/bytes-reader.js';
import { FixedClock } from '../../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../../support/memory-logger.js';
import { TestLanguagePack } from '../../../../support/test-language-pack.js';

// RF-110, P1-75: the scan-wide parse budget. Time is a fake monotonic clock that the test packs move,
// so no test depends on how fast the machine parses.

/** A monotonic clock in milliseconds that only the test moves. */
class FakeTicks {
  private current = 0;

  readonly now = (): number => this.current;

  advance(milliseconds: number): void {
    this.current += milliseconds;
  }
}

/** A test pack whose every file costs a fixed number of milliseconds on the fake clock. */
class CostlyPack implements LanguagePack {
  readonly name = 'test';
  readonly version = '1.0.0';
  readonly extensions: readonly string[] = ['.tst'];
  private readonly inner = new TestLanguagePack();
  private readonly ticks: FakeTicks;
  private readonly costMs: number;

  constructor(ticks: FakeTicks, costMs: number) {
    this.ticks = ticks;
    this.costMs = costMs;
  }

  analyse(file: PackFile): PackAnalysis {
    this.ticks.advance(this.costMs);
    return this.inner.analyse(file);
  }
}

/** A test pack that "parses" in steps of 10 ms until the file's stop signal says to stop. */
class EndlessPack implements LanguagePack {
  readonly name = 'test';
  readonly version = '1.0.0';
  readonly extensions: readonly string[] = ['.tst'];
  readonly steps: number[] = [];
  private readonly ticks: FakeTicks;

  constructor(ticks: FakeTicks) {
    this.ticks = ticks;
  }

  analyse(file: PackFile): PackAnalysis {
    let steps = 0;
    while (file.shouldStop?.() !== true && steps < 1000) {
      this.ticks.advance(10);
      steps += 1;
    }
    this.steps.push(steps);
    throw new Error('stopped');
  }
}

function file(path: string): ScannedFile {
  return { path, language: 'x', lines: 1, estimatedTokens: 1, artefactKinds: [] };
}

function setup(pack: LanguagePack, ticks: FakeTicks, totalMs: number, paths: readonly string[]) {
  const logger = new MemoryLogger(new FixedClock('2026-10-12T09:00:00.000Z'), new SecretMasker());
  const texts = Object.fromEntries(paths.map((path) => [path, `type T${String(path.length)}\n`]));
  const run = () =>
    analyseWithPacks({
      files: paths.map(file),
      reader: bytesReader(texts),
      registry: new LanguagePackRegistry([pack]),
      logger,
      maxFileBytes: 1000,
      parseBudget: { totalMs, now: ticks.now },
    });
  return { run, logger };
}

describe('analysis with language packs (scan-wide parse budget)', () => {
  it('RF-110 finishes the scan and records the files past the parse budget as not analysed', async () => {
    const ticks = new FakeTicks();
    const paths = ['a.tst', 'b.tst', 'c.tst', 'd.tst', 'e.tst'];
    const { run } = setup(new CostlyPack(ticks, 40), ticks, 100, paths);

    const result = await run();

    expect(result.fileLevels).toEqual([
      { path: 'a.tst', mapLevel: 'symbols' },
      { path: 'b.tst', mapLevel: 'symbols' },
      { path: 'c.tst', mapLevel: 'symbols' },
      { path: 'd.tst', mapLevel: 'coarse' },
      { path: 'e.tst', mapLevel: 'coarse' },
    ]);
    expect(result.warnings).toEqual([
      { path: 'd.tst', pack: 'test', code: 'RST-1204' },
      { path: 'e.tst', pack: 'test', code: 'RST-1204' },
    ]);
    expect(ticks.now()).toBe(120);
  });

  it('RF-110 logs one warning with the budget and the file count, not one per file', async () => {
    const ticks = new FakeTicks();
    const paths = ['a.tst', 'b.tst', 'c.tst', 'd.tst'];
    const { run, logger } = setup(new CostlyPack(ticks, 60), ticks, 50, paths);

    await run();

    const warnings = logger.entries.filter((entry) => entry.level === 'warn');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      logger: 'scan',
      code: 'RST-1204',
      data: { budgetMs: 50, files: 3 },
    });
  });
});

describe('analysis with language packs (parse budget details)', () => {
  it('RF-110 stops a parse that runs past the budget through the file stop signal', async () => {
    const ticks = new FakeTicks();
    const pack = new EndlessPack(ticks);
    const { run } = setup(pack, ticks, 50, ['a.tst', 'b.tst']);

    const result = await run();

    expect(pack.steps).toEqual([5]);
    expect(result.fileLevels.map((level) => level.mapLevel)).toEqual(['coarse', 'coarse']);
    expect(result.warnings.map((warning) => warning.code)).toEqual(['RST-1204', 'RST-1204']);
  });

  it('RF-110 counts only the time spent inside the packs, not the files they do not claim', async () => {
    const ticks = new FakeTicks();
    const { run } = setup(new CostlyPack(ticks, 30), ticks, 100, ['a.tst', 'b.cbl', 'c.tst']);

    const result = await run();

    expect(result.fileLevels.map((level) => level.mapLevel)).toEqual([
      'symbols',
      'coarse',
      'symbols',
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('RF-110 keeps the failure code of a pack that fails inside the budget', async () => {
    const ticks = new FakeTicks();
    const failing = new TestLanguagePack({ failOn: (path) => path === 'a.tst' });
    const { run } = setup(failing, ticks, 100, ['a.tst', 'b.tst']);

    const result = await run();

    expect(result.warnings).toEqual([{ path: 'a.tst', pack: 'test', code: 'RST-1200' }]);
  });
});
