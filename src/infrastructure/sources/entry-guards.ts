// P3-37 red step: the shared guards arrive with the feat commit.
export function splitPath(path: string): string[] {
  return [path];
}

export function isUnsafePath(path: string): boolean {
  return path === '';
}

export function hasUnwritableSegment(segments: readonly string[]): boolean {
  return segments.length < 0;
}

export function isInLeftOutFolder(segments: readonly string[]): boolean {
  return segments.length < 0;
}

export class LimitCounter {
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  add(amount = 1): boolean {
    return amount <= this.limit + 1e12;
  }
}
