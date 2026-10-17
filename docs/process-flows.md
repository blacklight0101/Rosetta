# Process flows (stakeholder view)

Status: 2026-10-11

| | |
|---|---|
| **Audience** | the teachers evaluating the master's final project first, then prospective customers; plain words, no internal codes (DEC-93) |
| **Source** | derived from [RFC-001](rfc/RFC-001-rosetta.md) and the [requirements](spec/requirements.md); when a flow changes, change the RFC or the spec first and this page in the same branch |
| **Published** | the same diagrams as a private shareable page and as `docs/rosetta-flows.pdf` (A4: a cover page and one landscape page per diagram), regenerated whenever a flow changes (DEC-95); page: https://claude.ai/artifact/1LY8Fx8ZFjxSQXvtRFDoDj (private); last regenerated 2026-10-11 (after the build-plan review) |

## About this page

These diagrams show what Rosetta does, in the order it happens, without implementation detail. Each diagram
has a caption that says the one thing a reader must take away and cites the requirement ids behind the steps.

Rules for editing:

- One flow per business process; a flow that no longer fits on one landscape A4 page is split in two.
- Plain words a stakeholder uses; no class names, table names or internal codes in the boxes.
- `flowchart TB` for long chains, because a long left-to-right chain prints too small on A4; left-to-right only
  for short loops of five or six boxes.
- `sequenceDiagram` for interactions between people and systems over time; `stateDiagram-v2` for the life cycle of
  a record.
- Every caption is a sentence starting with a capital letter, under its diagram, citing its RF ids.
- Flows of a later release go under a "Later releases" heading as third-level headings that name the release.
- Update the Status line when the flows are checked against the spec, and regenerate the PDF and the shareable
  page in the same change.

## 1. From a GitHub URL to a hand-off package

```mermaid
flowchart LR
  subgraph S1[Set up]
    direction TB
    A[Sign in] --> B[Create a project from a public GitHub URL]
    B --> C{Public repository found?}
    C -->|no| C1[Error with its code next to the field, nothing created]
    C -->|yes| D[Commit pinned, snapshot downloaded once, kept read-only]
    D --> E[Scan: files, languages, entry points and areas]
  end
  subgraph S2[Understand]
    direction TB
    F[Agents read each area and write cards that cite file and lines] --> G[Verifier checks every claim against the cited lines]
    G --> H[Open questions answered in the page]
    H --> I{More to learn from the answers?}
    I -->|yes| F
    I -->|no| X[Findings ready]
  end
  subgraph S3[Hand off]
    direction TB
    J[Report: every finding with its evidence and verdict] --> K[Plan setup: principles, architecture, migration and stack]
    K --> L[Hand-off package: specification, architecture, decisions, roadmap, task cards]
  end
  S1 --> S2 --> S3
```

Every finding in the report and every requirement in the package points back to the exact lines of code it comes
from, so a person can check any statement in minutes. Sources RF-010, RF-100..RF-106, RF-120..RF-122,
RF-200..RF-204, RF-240, RF-241, RF-300, RF-301, RF-500..RF-502, RF-602, RF-604, RF-605, RF-1007, RF-1100.

## 2. Understanding an area and checking every claim

```mermaid
sequenceDiagram
  participant U as User
  participant R as Rosetta
  participant G as Guards
  participant M as AI model
  U->>R: Start understand on the chosen areas
  R->>R: Plan one reader per area
  loop Each turn of a reader
    R->>G: Request to read files, with the next call's worst-case cost
    G->>G: Mask secrets, log what leaves, check the remaining cap
    G->>M: Send masked excerpts
    M-->>R: A tool request or a card with citations
  end
  R->>R: Step 1, check that every cited file and line exists
  R->>M: Step 2, ask the verifier whether the lines support the claim
  M-->>R: Supported or rejected, with the reason
  R-->>U: Cards, verdicts, open questions and cost, live in the page
```

Agents can only read, never change, the code, and nothing reaches a model without passing the guards first.
Sources RF-140..RF-147, RF-200..RF-205, RF-300, RF-301, RF-420..RF-422, RF-1002..RF-1004.

## 3. The life of a claim

```mermaid
stateDiagram-v2
  state "Citation invalid" as CitationInvalid
  [*] --> Proposed: an agent writes the claim with its citation
  Proposed --> CitationInvalid: the cited file or lines do not exist
  Proposed --> Supported: the verifier agrees with the evidence
  Proposed --> Rejected: the evidence does not support the claim
  Proposed --> Unverified: the run stopped before the check
  Unverified --> Supported: the run is resumed and the verifier agrees
  Unverified --> Rejected: the run is resumed and the evidence does not hold
  Supported --> [*]
  Rejected --> [*]
  CitationInvalid --> [*]
```

A rejected claim is never deleted: it stays in the report with the verifier's reason, and only supported claims
feed the hand-off package. A claim whose citation holds is shown as "waiting for judgement" only while the
judgement step is queued or running, then with its verdict; a claim the run left unjudged says so (RF-1014). Sources RF-300..RF-304, RF-006, RF-604.

## 4. Cost control from estimate to cap

```mermaid
flowchart TB
  A[User picks the areas and the models per role] --> B[Estimate shown: low, likely and high cost]
  B --> C{Likely cost within the cap that remains?}
  C -->|no| C1[Warning names the cap: lower the scope, raise the cap, or start anyway] --> D
  C -->|yes| D[Run starts]
  D --> E[Every call metered: tokens and cost per role, live meter in the page]
  E --> F{Could the next call pass the cap?}
  F -->|no| E
  F -->|yes| G[Call not made, running agents stop, results so far saved]
  G --> H[Run ends as cap reached, unchecked claims marked unverified]
  H --> I[Raise the cap and resume]
  I --> E
  E --> J[Run finishes: cost report, project and user totals updated]
```

The estimate only warns; the cap itself is never exceeded: the worst case of each call is reserved and checked
before it is made, and every cent is kept in the
project's cost ledger even after runs are deleted. Sources RF-006, RF-420..RF-428, RF-1003, RF-1010, RF-1106.

## 5. Accounts and the teacher account

```mermaid
flowchart TB
  A[Administrator creates an account with a temporary password] --> B[Person signs in]
  B --> C{User name and password correct?}
  C -->|no| C1[One generic message, repeated failures lock the account for a while] --> B
  C -->|yes| D{First sign-in with a required password change?}
  D -->|yes| E[Choose a new password that meets the rules] --> F
  D -->|no| F[Own workspace: only their projects and runs]
  F --> G[Optional: add their own provider keys, stored encrypted]
  F --> H[Runs use their keys first, otherwise the server keys under the caps]
  I[Teacher account created for the evaluators, no change required] --> B
  J[Administrator opens another workspace] --> K[Access recorded in the audit trail]
```

Nobody signs themselves up and nobody sees another person's work; the administrator's access to a workspace is
always audited. Sources RF-1100..RF-1107, RF-1109.

## 6. What leaves the machine

```mermaid
flowchart TB
  A[An agent asks to read a file] --> B{Allowed by the ignore file and the deny list?}
  B -->|no| B1[Refused and logged as a security event]
  B -->|yes| C[Excerpt cut to the size limit]
  C --> D[Secrets masked: keys, passwords, connection strings]
  D --> E{Masking succeeded?}
  E -->|no| E1[Nothing sent, the agent task stops, the event is logged]
  E -->|yes| F{Model runs in the cloud?}
  F -->|no, local model| G[Excerpt sent to the local model]
  F -->|yes| H{User consented for this run?}
  H -->|no| H1[Run does not start]
  H -->|yes| I[Excerpt sent, recorded in the egress log]
```

Every guard fails closed: when in doubt, nothing is sent, and every excerpt that does leave is logged.
Sources RF-140..RF-147, RF-143.

## 7. From the planning brief to the hand-off package

```mermaid
flowchart TB
  A[Understand finished, claims verified] --> B[Plan setup opens with defaults for every question]
  B --> C[Principles from the catalogue: SOLID, KISS, DRY, YAGNI, TDD, SDD and more]
  C --> D[Architecture: two styles recommended from the evidence, user picks one]
  D --> E[Migration strategy and stack per layer]
  E --> F[Optional project context: team, deadline, integrations]
  F --> G[What I recorded: answers and defaults saved as the planning brief]
  G --> H[Estimate shown against the caps]
  H --> I[Planner writes the package from supported claims and the brief]
  I --> J[Each choice becomes a decision record, each principle becomes rules and task-card checks]
  J --> K[Package: unanswered questions listed with their defaults, rejected claims listed as excluded]
```

The package follows the choices the user made, not the model's guesses: anything left unanswered is listed with
its default instead of being invented. Sources RF-601..RF-613.

## Later releases

### 8. Comparing providers on a second target (Release 2)

```mermaid
flowchart TB
  A[Second demo repository in another stack] --> B[Same areas run with several providers and models]
  B --> C[Each run scored against its golden set]
  C --> D[Report comparing quality and cost per provider and model]
```

Release 2 measures which model gives the best findings for the money on more than one stack; its requirements are
reserved, not yet written. Sources Q-05.
