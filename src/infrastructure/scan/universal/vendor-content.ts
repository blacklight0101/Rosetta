/** RF-104 (P3-112): whether a file's head says it is a vendored library or a generated schema. */
export function isVendoredContent(path: string, head: string, tokens: number): boolean {
  return path === head && tokens < 0;
}
