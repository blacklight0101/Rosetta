import type { JSX } from 'preact';
import type { Project } from '../api/project-schemas.js';
import { Glyph, type GlyphName } from '../components/Glyph.js';
import { Link } from '../components/Link.js';
import type { HeadingTone, ProjectHeading as Heading } from '../lib/journey/project-heading.js';
import { sourceLabel } from '../lib/source-label.js';

// RF-1021, RF-1020, DEC-211 (P8-26, P8Project): the title of the project page and, beside it, the
// current step of the journey as a word and a glyph (never colour alone). A step that waits for a
// live run links to it. A project that has a run also names its source (`OrderDesk (zip, 19 Oct
// 2026)`), which is where the upload form used to say it.

const glyphs: Readonly<Record<HeadingTone, GlyphName>> = {
  ok: 'check',
  warn: 'exclamation',
  info: 'live-dot',
  danger: 'cross',
};

export interface ProjectHeadingProps {
  readonly heading: Heading;
  readonly project: Project;
  /** The project has a run: its source is named beside the title. */
  readonly started: boolean;
}

function Status({ heading }: { readonly heading: Heading }): JSX.Element | null {
  const { status } = heading;
  if (status === undefined) return null;
  const text =
    status.href === undefined ? status.text : <Link href={status.href}>{status.text}</Link>;
  return (
    <span class={`rst-p826-pill rst-p826-pill--${status.tone}`} data-testid="project-status">
      <Glyph name={glyphs[status.tone]} />
      {text}
    </span>
  );
}

// RF-1021
export function ProjectHeading(props: ProjectHeadingProps): JSX.Element {
  const { heading, project, started } = props;
  return (
    <div class="rst-p826-head">
      <h1 class="rst-page__title">{heading.title}</h1>
      <Status heading={heading} />
      {started && project.sourceKind !== 'github' ? (
        <span class="rst-p826-pill rst-p826-source">{sourceLabel(project)}</span>
      ) : null}
    </div>
  );
}
