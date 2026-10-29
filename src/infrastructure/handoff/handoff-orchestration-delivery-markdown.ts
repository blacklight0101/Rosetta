import type { SectionWriter } from './handoff-orchestration-gates-markdown.js';

// RF-643, P6-08: the recommended delivery flow of a hosted application. It is written only when the
// brief's project context says the application is hosted (`deployment`), and it is a recommendation
// the team may replace by a decision it records; it never blocks a card. It names no host.

// RF-643
export const deliverySection: SectionWriter = (handoff) =>
  handoff.brief.context.deployment !== 'hosted'
    ? []
    : [
        '## Recommended delivery flow',
        '',
        'This is a recommendation, not a rule of the build. The team may use another flow and record it as a decision; from then on the recorded decision replaces this section. It never blocks a card.',
        '',
        '- Integration branch (for example `develop`): the default branch. Card branches are cut from it and merged into it by the orchestrator under the merge rules.',
        '- Staging: every push to the integration branch is deployed to a staging copy of the application, and a smoke test runs against it (the health check and one main path).',
        '- Release: one pull request from the integration branch to the release branch (for example `main`), labelled `needs-owner`, that lists the cards in it. Only the person merges it, with a merge commit, so the integration branch stays an ancestor of the release branch.',
        '- Production: deployed from the release branch only, on a schedule the team chooses and not on merge.',
        '',
        'Why: a change reaches users only after it ran on a hosted copy and a person approved the batch; a merge commit makes "this tree passed staging" a plain comparison. A hotfix goes through the integration branch too.',
        '',
      ];
