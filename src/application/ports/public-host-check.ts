// Architecture section 7, RF-1104, DEC-112, threat model TB5 (SSRF): whether a host name is safe
// to send a user's key to. The adapter resolves the name (through node:dns in infrastructure) and
// answers true only when every address it resolves to is public: not private, loopback,
// link-local, shared, unique-local, IPv4-mapped or a cloud metadata address. A name that does not
// resolve, or not in time, is not public. The same check runs again on every connect.

export interface PublicHostCheck {
  /** `hostname` as the URL parser gives it; an IPv6 literal may keep its brackets. */
  isPublicHost(hostname: string): Promise<boolean>;
}
