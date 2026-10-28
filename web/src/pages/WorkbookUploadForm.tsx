import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { useWorkbookUpload, type WorkbookUpload } from './use-workbook-upload.js';
import type { WorkbookFlowOptions } from './use-workbook-flow.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';
import { ProcessingProgress } from './ProcessingProgress.js';
import { Announcement, ChosenFiles, Problems, Progress, Summary } from './WorkbookParts.js';

// RF-150, RF-158, RFC-005 section 4.9, design-system.md section 14 (Projects): the Excel workbooks
// form. It states the accepted types and the limits in one line, checks the files before sending,
// follows each file, then the server reading them (RF-159), then shows what was read and what was left out. A failed upload says the
// project has no source and offers Upload again. File and project names are drawn as text.

function reasonToWait(upload: WorkbookUpload): string | undefined {
  if (upload.items.length === 0) return 'Choose one or more workbooks first.';
  if (upload.problems.length > 0) return upload.problems[0];
  if (upload.needsName) return 'Enter a project name.';
  return undefined;
}

function fieldError(problems: readonly string[]): { readonly message: string } | undefined {
  if (problems.length === 0) return undefined;
  const [only] = problems;
  if (problems.length === 1 && only !== undefined) return { message: only };
  return { message: `${String(problems.length)} problems with the chosen files. See the list.` };
}

function Working({ upload }: { readonly upload: WorkbookUpload }): JSX.Element {
  const { phase, current, items, processing } = upload;
  if (phase === 'sending') {
    const percent = items[Math.max(current, 1) - 1]?.percent ?? 0;
    return <Progress current={Math.max(current, 1)} total={items.length} percent={percent} />;
  }
  return (
    <ProcessingProgress
      progress={processing?.progress}
      elapsedMs={processing?.elapsedMs ?? 0}
      onCancel={processing === undefined ? undefined : upload.cancel}
    />
  );
}

function Outcome({ upload }: { readonly upload: WorkbookUpload }): JSX.Element | null {
  const { failure, project, summary, phase } = upload;
  if (phase === 'sending' || phase === 'finishing') return <Working upload={upload} />;
  if (summary !== undefined) return <Summary summary={summary} projectId={project?.id} />;
  if (failure === undefined) return null;
  return (
    <>
      <ErrorBanner error={failure} />
      {project === undefined ? null : (
        <p class="rst-settings__note">
          <span class="rst-mono rst-zip__file">{project.name}</span> has no source yet.
        </p>
      )}
    </>
  );
}

function ChosenFields({ upload }: { readonly upload: WorkbookUpload }): JSX.Element {
  const sending = upload.phase === 'sending' || upload.phase === 'finishing';
  const many = upload.problems.length > 1;
  return (
    <>
      <Field
        kind="files"
        id="workbook-files"
        label="Workbook files"
        accept=".xlsx,.xlsm"
        disabled={sending}
        error={fieldError(upload.problems)}
        describedBy={many ? 'workbook-problems' : undefined}
        onFiles={upload.choose}
      />
      {many ? <Problems problems={upload.problems} /> : null}
      {upload.items.length === 0 ? null : <ChosenFiles items={upload.items} />}
      {upload.items.length === 0 || upload.project !== undefined ? null : (
        <Field
          kind="text"
          id="workbook-name"
          label="Project name"
          value={upload.name}
          disabled={sending}
          onInput={upload.setName}
        />
      )}
    </>
  );
}

// RF-150
export function WorkbookUploadForm(props: WorkbookFlowOptions): JSX.Element {
  const upload = useWorkbookUpload(props);
  const sending = upload.phase === 'sending' || upload.phase === 'finishing';
  const reason = reasonToWait(upload);
  const formRef = useRef<HTMLFormElement>(null);
  useRefusalFocus(formRef, upload.failure);
  return (
    <form
      ref={formRef}
      class="rst-projects__create"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        upload.submit();
      }}
    >
      <p class="rst-settings__note">
        Accepted: .xlsx and .xlsm. At most {upload.maxFiles} files and {upload.limitMb} MB in all.
      </p>
      <ChosenFields upload={upload} />
      <Announcement items={upload.items} />
      <Outcome upload={upload} />
      <div class="rst-projects__actions">
        <Button
          type="submit"
          variant="primary"
          busy={sending}
          {...(reason === undefined ? {} : { disabledReason: reason })}
        >
          {upload.phase === 'failed' && upload.project !== undefined
            ? 'Upload again'
            : 'Upload workbooks'}
        </Button>
      </div>
    </form>
  );
}
