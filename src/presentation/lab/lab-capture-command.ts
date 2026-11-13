// RF-1404: stub, the behaviour comes with the feature commit.

// RF-1404
export function runLabCapture(
  _argv: readonly string[],
  _labFolder: string,
  print: (line: string) => void,
): Promise<number> {
  print('The capture is not built yet.');
  return Promise.resolve(1);
}
