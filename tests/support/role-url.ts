/**
 * The test database URL with every connection switched to `role` at start-up (`-c role=...`), so
 * code that builds its own pool from a URL runs with that role's rights, as it does in the
 * deployment where the URL names the role (data-model.md section 6).
 */
export function asRole(url: string, role: string): string {
  const parsed = new URL(url);
  const options = parsed.searchParams.get('options') ?? '';
  parsed.searchParams.set('options', `${options} -c role=${role}`.trim());
  return parsed.toString();
}
