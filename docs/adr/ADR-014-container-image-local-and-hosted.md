# ADR-014: Ship Rosetta as one container image, run locally with Docker Compose and hosted later

**Date**: 2026-10-11
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

The owner's teachers must be able to use Rosetta through a URL, while the owner also runs it on their own machine
with Ollama (DEC-61, DEC-67). The command-line interface is out of scope (DEC-59): Rosetta is now a web
application. ADR-002 chose a TypeScript CLI on Node.js and ADR-012 a loopback-only web server; DEC-14 excluded any
hosted service. The hosting provider is not chosen yet (Q-18), and the 2026-10-26 hand-in needs a working
deployment URL.

## Options Considered

1. One container image (Node.js server, built front end, migrations) run with Docker Compose next to PostgreSQL on
   the owner's machine, and the same image deployed later to a container host with managed PostgreSQL and a
   persistent disk.
2. Run from source on the owner's machine and expose it through a tunnel for the teachers.
3. Separate builds: a local package for the owner and a cloud-specific deployment (for example serverless functions)
   for the teachers.

## Decision

We choose option 1.

- **Image**: a multi-stage `Dockerfile` builds the server and the front end and produces a runtime image from a
  Node.js 24 slim base pinned by digest, running as a non-root user, with no secrets and no build tools inside. The
  server listens on `0.0.0.0:8080` inside the container only; exposure is decided by the runtime (RF-1300).
- **Configuration**: environment variables only, validated at start-up (database URL, secret key, data folder,
  public URL, default provider keys, caps); the server refuses to start when a required value is missing (RF-1305).
- **Local simulation**: `compose.yaml` runs the app and PostgreSQL with named volumes, publishes the app on
  `127.0.0.1:8080` only, and reaches Ollama on the host at `http://host.docker.internal:11434` (RF-1301).
- **Hosted**: the same image on a container host chosen in Q-18, behind the host's HTTPS, with managed PostgreSQL, a
  persistent disk mounted at the data folder, and secrets in the host's secret store (RF-1304). No GPU is assumed in
  the hosted mode, so it uses cloud providers.
- **Start-up**: migrations run before the server accepts traffic (RF-1302); `/healthz` reports liveness and database
  reachability without secrets (RF-1303).

## Rationale

- One image means the owner tests exactly what the teachers use; Module 07 of the master teaches this path.
- A tunnel (option 2) depends on the owner's machine being on during evaluation.
- Separate builds (option 3) double the work and the bugs before the deadline.

## Consequences

**Positive**
- Reproducible deployments and a clean rollback: redeploy the previous image tag.
- The provider choice stays open until the deploy card (Q-18).

**Negative**
- Docker becomes a development dependency; CI builds and scans the image.
- The hosted mode costs money (host, database) and needs budget limits on model calls (RF-1106).

## References

- DEC-59, DEC-61, DEC-67, DEC-69; Q-18; RF-1300..RF-1306.
- Amends ADR-002 (no CLI; a server application) and ADR-012 (not loopback-only); reverses the Docker and hosting
  rows of DEC-58.
