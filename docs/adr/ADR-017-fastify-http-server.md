# ADR-017: Use Fastify as the HTTP server

**Date**: 2026-10-11
**Status**: Accepted (default of Q-17)
**Deciders**: BlackLigth (blacklight0101)

## Context

ADR-012 planned a bare `node:http` server for a loopback-only page with a URL token. The hosted application now
needs cookies, sessions, CSRF protection, rate limiting, security headers, static files with caching, request
validation, body size limits and server-sent events (DEC-62, DEC-69). Writing each of these by hand is where
security bugs come from.

## Options Considered

1. Fastify 5 with the official plugins `@fastify/cookie`, `@fastify/csrf-protection`, `@fastify/rate-limit`,
   `@fastify/helmet` and `@fastify/static`.
2. Hono, a small web-standard framework.
3. `node:http` with hand-written middleware.

## Decision

We choose option 1. Routes live in `src/presentation/web/`, validate input with zod at the boundary, and call use
cases only; plugins are registered in the composition root.

## Rationale

- Fastify's maintained plugins cover the security controls the master's Module 08 lists, with well-known defaults,
  and it is fast and typed.
- Hono would need third-party middleware for the same set; `node:http` would need all of it written and tested by
  us.

## Consequences

**Positive**
- Fewer hand-written security mechanisms; a request lifecycle with hooks for the session and audit.

**Negative**
- Six new runtime dependencies (environments-and-delivery.md section 7).

## References

- Q-17, DEC-62, DEC-69; RF-1009, RF-1013, RF-1100, RF-1101.
- Amends ADR-012 (server implementation).
