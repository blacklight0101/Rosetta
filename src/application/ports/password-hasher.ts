// ADR-015, RF-1100: hashes and verifies passwords. The stored form carries its parameters, so they
// can be raised later; verification compares in constant time.
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** True when the password matches the stored hash; throws RST-2209 for an unreadable hash. */
  verify(password: string, passwordHash: string): Promise<boolean>;
}
