---
type: journal
date: 2026-10-11
decisions: DEC-59, DEC-60, DEC-61, DEC-62, DEC-63, DEC-64, DEC-65, DEC-66, DEC-67, DEC-68, DEC-69
---

# 2026-10-11 - Rosetta becomes a hosted web application

Curated summary of the working session (DEC-38). No conversation is recorded here.

While reviewing RFC-001, the owner asked for Rosetta to be usable by the master's teachers through a URL, simulated
locally first and then deployed to a server. Ten questions with defaults were answered.

| Topic | Outcome | Why | Ids |
|---|---|---|---|
| Delivery form | A web application; the command-line interface is out of scope | The evaluators use a browser; one interface is enough for the deadline | DEC-59 |
| Plugin mode | Claude Code plugin run mode out of scope until after the hand-in | Focus on the delivery date | DEC-60 |
| Deployment | One container image: Docker Compose locally (Ollama on the host), the same image hosted later | Test exactly what the teachers will use | DEC-61, ADR-014, Q-18 |
| Accounts | User name and password, sign-in page, no self sign-up, administrator creates accounts including a teacher account | Only invited people may use it | DEC-62, ADR-015 |
| Landing page | Product-quality page presenting Rosetta, shared only with the teachers | The project is presented as a product | DEC-63, Q-19, Q-20 |
| Provider keys | Owner's server keys under caps; users may store their own keys, encrypted | Controlled cost with an option for users who pay themselves | DEC-64 |
| Storage | PostgreSQL for accounts and the ledger; files on a disk for snapshots and runs | Transactions for sessions, lockouts and caps | DEC-65, ADR-016 |
| Privacy between users | Users never see each other's work; administrator access is audited | Basic isolation for a multi-user service | DEC-66 |
| Hand-in | Hosted URL and teacher account; GitHub Pages report as fallback | What the evaluators need | DEC-67, RF-803 |
| Scope and security | Milestone scope kept plus hosting; controls for a public endpoint; threat model rewritten | A public URL with paid keys behind it is the main target | DEC-68, DEC-69, ADR-017 |

New requirements: RF-010, RF-803, RF-1100..RF-1109, RF-1200..RF-1201, RF-1300..RF-1306, RNF-016, RNF-017. Withdrawn:
RF-001, RF-004, RF-242, RF-1000. New open questions Q-17..Q-21 run on their defaults.
