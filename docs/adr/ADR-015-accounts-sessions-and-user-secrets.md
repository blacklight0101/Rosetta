# ADR-015: Accounts with passwords, server-side sessions and encrypted per-user provider keys

**Date**: 2026-10-11
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

The hosted Rosetta must be usable by invited people only (the owner and the teachers), each signing in with a user
name and a password (DEC-62). Each user can store their own provider API keys; when a user has none, the owner's
server keys are used under caps (DEC-64). Users never see each other's projects or runs; the owner, as
administrator, sees everything (DEC-66). A public URL with stored API keys and paid model calls behind it is the
highest-value target in the system.

## Options Considered

1. Local accounts: passwords hashed with scrypt from `node:crypto`, server-side sessions in PostgreSQL behind a
   secure cookie, provider keys encrypted with AES-256-GCM under a server secret, two roles (admin, user).
2. An external identity provider (GitHub or Google sign-in through OAuth).
3. Invite links without passwords (a long random token per person).

## Decision

We choose option 1.

- **Passwords**: at least 12 characters, checked against a small list of common passwords and the user name; hashed
  with scrypt (N = 2^17, r = 8, p = 1, 16-byte salt, 64-byte key) through `node:crypto`, no native addon; compared in
  constant time; parameters stored with the hash so they can be raised later (RF-1100, RF-1103).
- **Brute force**: sign-in is rate limited per IP and per user name; five failures lock the account for 15 minutes;
  error messages never reveal whether a user exists (RF-1100).
- **Sessions**: a random 256-bit id in the cookie `__Host-rosetta_session` (`HttpOnly`, `Secure`,
  `SameSite=Strict`, `Path=/`); only its SHA-256 is stored; the id is rotated at sign-in; idle timeout 8 hours,
  absolute 7 days; sign-out deletes it (RF-1101). State-changing requests also need a matching `Origin` and a CSRF
  token (RF-1009).
- **Roles**: `admin` (manages users, sees every workspace and the server totals) and `user`. No self sign-up; the
  first admin is created from environment variables at first start, and the admin creates every other account,
  including the teacher account (RF-1102, RF-1107).
- **Provider keys**: stored per user and provider, encrypted with AES-256-GCM using a key derived from the
  `ROSETTA_SECRET_KEY` environment secret, with a key version for rotation; never returned to the browser after
  saving (only the last four characters are shown); decrypted only inside the provider factory for that user's run
  (RF-1104).
- **Isolation**: every query and file path is scoped by the signed-in user; an admin override is explicit and
  logged (RF-1105).

## Rationale

- Local accounts give the teachers a normal sign-in without asking them to own a GitHub or Google account, and
  without registering an OAuth application per deployment host (option 2).
- Invite links (option 3) were declined by the owner, who wants a user name and password.
- scrypt in `node:crypto` meets OWASP's password storage guidance without a native dependency (conventions forbid
  native addons that need a C++ toolchain on Windows).

## Consequences

**Positive**
- Standard, testable controls for OWASP A07 (authentication failures) and A04 (cryptographic failures).

**Negative**
- Rosetta now stores secrets; losing `ROSETTA_SECRET_KEY` makes stored provider keys unreadable (users re-enter
  them), and leaking it exposes them. It lives only in the host's secret store and the git-ignored `.env`.
- Password reset is manual by the admin in release 1 (no e-mail).

## References

- DEC-62, DEC-64, DEC-66, DEC-69; RF-1009, RF-1100..RF-1109.
- Amends ADR-012 (accounts replace the per-session URL token) and ADR-013 (new trust boundaries in the threat
  model).
