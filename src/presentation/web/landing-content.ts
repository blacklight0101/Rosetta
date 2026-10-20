// RF-1200, DEC-63, DEC-70: the words and figures of the landing page, from the approved artboard
// (docs/design/board/Landing.dc.html). The sample run is the public demo application Microsoft
// publishes under the MIT licence (eShopLegacyWebForms); the figures are illustrative and the page
// says so. Nothing here comes from the owner's employer (DEC-03).

type Tone = 'reader' | 'verifier' | 'summariser';

export interface Lane {
  readonly role: string;
  readonly what: string;
  readonly tone: Tone;
  /** The timeline bar of the lane: `seg-<n>` in landing.css. */
  readonly bar: 1 | 2 | 3 | 4 | 5;
  readonly state: string;
  readonly stateClass: 'ok' | 'run' | '';
  /** The state the replay ends on, when the lane is still working at the start. */
  readonly final?: string;
}

export const lanes: readonly Lane[] = [
  {
    role: 'Reader',
    what: 'Catalog · 38 files',
    tone: 'reader',
    bar: 1,
    state: 'Done · 9 cards',
    stateClass: 'ok',
  },
  {
    role: 'Reader',
    what: 'Orders · 21 files',
    tone: 'reader',
    bar: 2,
    state: 'Turn 11',
    stateClass: 'run',
    final: 'Done · 7 cards',
  },
  {
    role: 'Reader',
    what: 'Account · 12 files',
    tone: 'reader',
    bar: 3,
    state: 'Done · 4 cards',
    stateClass: 'ok',
  },
  {
    role: 'Verifier',
    what: '31 claims',
    tone: 'verifier',
    bar: 4,
    state: 'Checking',
    stateClass: 'run',
    final: 'Done · 31 verdicts',
  },
  {
    role: 'Summariser',
    what: 'Waits for the readers',
    tone: 'summariser',
    bar: 5,
    state: 'Planned',
    stateClass: '',
  },
];

export interface ReplayEvent {
  readonly time: string;
  readonly text: string;
}

/** Newest first, as the live view lists them. */
export const events: readonly ReplayEvent[] = [
  { time: '14:03:22', text: 'Verifier: BR-007 supported · Create.aspx.cs:41-47' },
  { time: '14:03:19', text: 'Reader Orders read Services/OrderService.cs, lines 1-120' },
  { time: '14:03:15', text: 'Verifier: BR-011 rejected · the cited lines apply no discount' },
  { time: '14:03:09', text: 'Reader Catalog wrote ENT-003 CatalogItem' },
  { time: '14:03:02', text: 'Reader Orders searched for "Status ="' },
  { time: '14:02:57', text: 'Run started · cap $0.50 · 3 areas' },
];

export interface Step {
  readonly title: string;
  readonly text: string;
  /** The file or folder the stage leaves behind. */
  readonly leaves: string;
  readonly tone?: 'reader' | 'verifier';
}

export const steps: readonly Step[] = [
  {
    title: 'Choose the source',
    leaves: 'snapshot.json',
    text: 'A public GitHub URL is pinned to one commit and downloaded once. A zip or Excel workbooks become a read-only snapshot named by its hash.',
  },
  {
    title: 'Map the code',
    leaves: 'codemap.json',
    text: 'Files, languages, entry points and areas, without AI and with the same result every time.',
  },
  {
    title: 'Agents write cards',
    leaves: 'cards/',
    tone: 'reader',
    text: 'One reader per area explores with read-only tools and writes features, rules, entities and integrations. In workbooks they read formulas, values, the dependency map between sheets and workbooks, and VBA macros as text.',
  },
  {
    title: 'Check every claim',
    leaves: 'a verdict on every claim',
    tone: 'verifier',
    text: 'Citations are checked in code, then a second model judges whether the lines support the claim.',
  },
  {
    title: 'You decide',
    leaves: 'answers.md',
    text: 'What the code cannot tell becomes an open question for you; your answers feed the next pass.',
  },
  {
    title: 'Report and hand-off',
    leaves: 'report/ and handoff/',
    text: 'An HTML report that replays the run, and a package with architecture, decisions, roadmap and task cards.',
  },
];

export interface Safeguard {
  readonly title: string;
  readonly text: string;
}

export const safeguards: readonly Safeguard[] = [
  { title: 'Read-only.', text: 'Agents can list, read and search files. Nothing else.' },
  {
    title: 'Masked before it leaves.',
    text: 'Secrets are masked and every excerpt sent to a provider is logged.',
  },
  {
    title: 'Untrusted text stays text.',
    text: 'Code and model output are never run or rendered as HTML.',
  },
  {
    title: 'Limited uploads.',
    text: 'Zips and workbooks are read under size and content limits. Macros are never run.',
  },
  {
    title: 'Private by account.',
    text: 'Your projects and keys are yours; no one else sees them.',
  },
  {
    title: 'Asked, not assumed.',
    text: 'Cloud providers are used only after you confirm, per run.',
  },
];

export interface CitedLine {
  readonly number: number;
  readonly code: string;
  readonly highlighted: boolean;
}

/** The lines the sample card cites; the line numbers are illustrative (the page says so). */
export const citedLines: readonly CitedLine[] = [
  { number: 41, code: 'if (!ModelState.IsValid) return;', highlighted: false },
  { number: 42, code: 'if (item.Price < 0)', highlighted: true },
  { number: 43, code: '    errors.Add("Price must be positive");', highlighted: true },
  { number: 44, code: 'else', highlighted: false },
  { number: 45, code: '    service.CreateCatalogItem(item);', highlighted: false },
];
