import type { PlanTask } from './plan-content.js';
import type { PlanningBrief } from './planning-brief.js';

// P5-42, P6-27, P7-17, RF-610: the text of the cut-over card for each migration strategy; the title is
// the card's own and is added by `foundation-cards.ts`. With no data the text says nothing of data.

type Strategy = PlanningBrief['migration'];
type CutOverText = Pick<PlanTask, 'invariant' | 'acceptanceCriteria' | 'probes' | 'riskClass'>;

const dataCutOverTexts: Readonly<Record<Strategy, CutOverText>> = {
  'strangler-fig': {
    invariant:
      'Each part of the legacy system goes live on the new system through the routing step before the next part starts, and the legacy system is switched off only after the last part.',
    riskClass: 'data loss',
    acceptanceCriteria: [
      'Given the routing layer between the two systems, when a request for a part that went live arrives, then the routing step sends it to the new system.',
      'Given a part that is not live yet, when a request for it arrives, then the routing step sends it to the legacy system.',
      'Given a part that went live and failed its checks, when the routing rule is reverted, then requests for the part reach the legacy system again.',
      'Given the last part is live, when the legacy system is switched off, then no request is routed to it.',
    ],
    probes: [
      'A request for a part that is live => it is answered by the new system.',
      'A request for a part not yet live => it is answered by the legacy system.',
      'The routing rule of a part is reverted => the next request for the part is answered by the legacy system.',
      'The legacy system is switched off while a part is still routed to it => the switch-off is refused.',
    ],
  },
  'parallel-change': {
    invariant:
      'Both ways work until the old one is removed, users are moved over before it goes, and every step can be undone.',
    riskClass: 'data loss',
    acceptanceCriteria: [
      'Given the new way beside the old one, when a user uses either, then both give the same result.',
      'Given users moved to the new way, when a problem is found, then they can be moved back to the old way.',
      'Given every user is on the new way, when the old way is removed, then nothing calls it any more.',
    ],
    probes: [
      'The same input on the old and the new way => both give the same result.',
      'A user is moved back to the old way => the user keeps the data written on the new way.',
      'The old way is removed while a caller still uses it => the removal is refused and names the caller.',
    ],
  },
  rewrite: {
    invariant:
      'Users move once: the legacy system is frozen, the data is migrated and checked, the new system goes live, and the legacy system stays available for a return.',
    riskClass: 'data loss',
    acceptanceCriteria: [
      'Given the legacy system frozen for writes, when the final data migration runs, then the row counts of every target table equal those of its legacy table.',
      'Given the row counts match, when the new system goes live, then users reach the new system only.',
      'Given a failed check after going live, when the return is run, then users reach the legacy system with no data lost.',
    ],
    probes: [
      'A write to the legacy system after the freeze => it is refused.',
      'A row count that differs after the final run => the go-live is refused.',
      'The return is run after a failed check => users reach the legacy system with the data written before the freeze.',
    ],
  },
};

/** P7-17: the cut-over card of a run with no data model says nothing of migrated data or row counts. */
function withoutDataText(text: CutOverText, strategy: Strategy): CutOverText {
  if (strategy === 'rewrite') {
    return {
      ...text,
      invariant:
        'Users move once: the legacy system is frozen, the new system goes live, and the legacy system stays available for a return.',
      acceptanceCriteria: [
        'Given the legacy system frozen for writes, when the new system goes live, then users reach the new system only.',
        'Given a failed check after going live, when the return is run, then users reach the legacy system again.',
      ],
      probes: [
        'A write to the legacy system after the freeze => it is refused.',
        'The return is run after a failed check => users reach the legacy system.',
      ],
    };
  }
  if (strategy === 'parallel-change') {
    return {
      ...text,
      probes: text.probes.map((probe) =>
        probe.startsWith('A user is moved back')
          ? 'A user is moved back to the old way => the user uses the old way again.'
          : probe,
      ),
    };
  }
  return text;
}

export function cutOverText(strategy: Strategy, hasData: boolean): CutOverText {
  const text = dataCutOverTexts[strategy];
  return hasData ? text : withoutDataText(text, strategy);
}
