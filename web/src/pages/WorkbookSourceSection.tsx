import type { JSX } from 'preact';
import type { Project } from '../api/project-schemas.js';
import { sourceLabel } from '../lib/source-label.js';
import { WorkbookUploadForm } from './WorkbookUploadForm.js';

// RF-150, RFC-005 section 4.9, design-system.md section 14 (Start run): the source card of a project
// made from Excel workbooks. It names the workbooks and their date instead of a GitHub address, says
// when the code changed since the last run, and says so when there is no source yet. The form stores
// a new batch, which replaces the source for the runs that follow; earlier runs keep their own copy.

export interface WorkbookSourceProps {
  readonly project: Project;
  readonly onStored: (project: Project) => void;
}

// RF-150
export function WorkbookSourceSection(props: WorkbookSourceProps): JSX.Element {
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
          <span class="rst-mono rst-zip__file">{project.name}</span> has no source. Upload workbooks
          to start.
        </p>
      ) : null}
      {project.codeChangedSinceLastRun ? (
        <p class="rst-settings__note">The code changed since the last run.</p>
      ) : null}
      {project.renderedWithOlderRenderer ? (
        <p class="rst-settings__note">
          Rendered with an older renderer: upload the workbook again.
        </p>
      ) : null}
      <WorkbookUploadForm
        existing={project}
        onStored={(summary) => {
          const { uploadedAt = new Date().toISOString() } = summary;
          const fileName = summary.workbooks[0]?.name ?? project.name;
          const workbooks = summary.workbooks.length;
          const { codeChangedSinceLastRun = project.codeChangedSinceLastRun } = summary;
          onStored({
            ...project,
            source: { fileName, uploadedAt, workbooks },
            codeChangedSinceLastRun,
            renderedWithOlderRenderer: false,
          });
        }}
      />
    </section>
  );
}
