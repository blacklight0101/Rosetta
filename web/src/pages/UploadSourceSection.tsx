import type { JSX } from 'preact';
import type { Project } from '../api/project-schemas.js';
import { sourceLabel } from '../lib/source-label.js';
import { ZipUploadForm } from './ZipUploadForm.js';

// RF-128, RFC-004 section 4.5, design-system.md section 14 (Start run): the source card of a project
// made from a zip. It names the zip and its date instead of a GitHub address, says when the code
// changed since the last run, and says so when there is no source yet. The form stores a new zip,
// which replaces the source for the runs that follow; earlier runs keep their own copy.

export interface UploadSourceProps {
  readonly project: Project;
  readonly onStored: (project: Project) => void;
}

// RF-128
export function UploadSourceSection(props: UploadSourceProps): JSX.Element {
  const { project, onStored } = props;
  return (
    <section class="rst-card rst-settings__section" aria-labelledby="repository-heading">
      <h2 id="repository-heading" class="rst-visually-hidden">
        Source
      </h2>
      <dl class="rst-start__facts">
        <div class="rst-start__fact">
          <dt>Source</dt>
          <dd class="rst-mono rst-zip__file">{sourceLabel(project)}</dd>
        </div>
      </dl>
      {project.source === null ? (
        <p class="rst-settings__note">
          <span class="rst-mono rst-zip__file">{project.name}</span> has no source. Upload a zip to
          start a run.
        </p>
      ) : null}
      {project.codeChangedSinceLastRun ? (
        <p class="rst-settings__note">The code changed since the last run.</p>
      ) : null}
      <ZipUploadForm existing={project} onStored={onStored} />
    </section>
  );
}
