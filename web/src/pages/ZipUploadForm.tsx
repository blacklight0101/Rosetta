import type { JSX } from 'preact';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { Link } from '../components/Link.js';
import { bytesText } from '../lib/bytes.js';
import { useZipUpload, type ZipUpload, type ZipUploadOptions } from './use-zip-upload.js';

// RF-128, RF-134, RFC-004 section 4.5, design-system.md section 14 (Projects): the Upload a zip
// form. It states the size limit and how to make a zip, checks the file before sending, follows
// the upload, then shows what was kept and what was left out. A failed upload says the project has
// no source and offers Upload again. File and project names are drawn as text, never as HTML.

const plural = (count: number, one: string, many: string): string =>
  `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;

function HowTo({ limitMb }: { readonly limitMb: number }): JSX.Element {
  return (
    <div class="rst-zip__howto">
      <p class="rst-settings__note">
        Largest zip: {limitMb} MB. Leave out folders such as node_modules, bin and obj.
      </p>
      <ul class="rst-zip__steps">
        <li>Windows: right-click the folder, choose Send to, then Compressed (zipped) folder.</li>
        <li>macOS: Control-click the folder, then choose Compress.</li>
      </ul>
    </div>
  );
}

function Progress({ percent }: { readonly percent: number }): JSX.Element {
  return (
    <div
      class="rst-cap-meter"
      role="progressbar"
      aria-label="Upload progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${String(percent)}% sent`}
    >
      <div class="rst-cap-meter__fill" style={{ inlineSize: `${String(percent)}%` }} />
    </div>
  );
}

function Summary(props: {
  readonly upload: ZipUpload;
  readonly summary: NonNullable<ZipUpload['summary']>;
}): JSX.Element {
  const { summary, upload } = props;
  return (
    <div class="rst-callout rst-callout--info rst-zip__summary">
      <p role="status">
        {plural(summary.files, 'file', 'files')} kept ({bytesText(summary.size)}).{' '}
        {plural(summary.skipped, 'entry', 'entries')} left out.
      </p>
      {upload.project === undefined ? null : (
        <Link
          href={`/projects/${encodeURIComponent(upload.project.id)}/start`}
          class="rst-button rst-button--primary"
        >
          Start a run
        </Link>
      )}
    </div>
  );
}

function Outcome({ upload }: { readonly upload: ZipUpload }): JSX.Element | null {
  const { failure, project, summary, phase, percent } = upload;
  if (phase === 'sending') return <Progress percent={percent} />;
  if (summary !== undefined) return <Summary upload={upload} summary={summary} />;
  if (failure === undefined) return null;
  return (
    <>
      <ErrorBanner error={failure} />
      {project?.source !== null ? null : (
        <p class="rst-settings__note">
          <span class="rst-mono rst-zip__file">{project.name}</span> has no source yet.
        </p>
      )}
    </>
  );
}

function reasonToWait(upload: ZipUpload): string | undefined {
  if (upload.file === undefined) return 'Choose a zip file first.';
  if (!upload.ready) return upload.problem ?? 'Checking the file.';
  if (upload.needsName) return 'Enter a project name.';
  return undefined;
}

function ChosenFields(props: {
  readonly upload: ZipUpload;
  readonly hasProject: boolean;
}): JSX.Element {
  const { upload, hasProject } = props;
  const { file } = upload;
  const sending = upload.phase === 'sending';
  return (
    <>
      <Field
        kind="file"
        id="zip-file"
        label="Zip file"
        accept=".zip,application/zip"
        disabled={sending}
        error={upload.problem === undefined ? undefined : { message: upload.problem }}
        onFile={upload.choose}
      />
      {file === undefined ? null : (
        <p class="rst-settings__note">
          Chosen: <span class="rst-mono rst-zip__file">{file.name}</span> ({bytesText(file.size)})
        </p>
      )}
      {file === undefined || hasProject ? null : (
        <Field
          kind="text"
          id="zip-name"
          label="Project name"
          value={upload.name}
          disabled={sending}
          onInput={upload.setName}
        />
      )}
    </>
  );
}

// RF-128
export function ZipUploadForm(props: ZipUploadOptions): JSX.Element {
  const upload = useZipUpload(props);
  const { phase } = upload;
  const reason = reasonToWait(upload);
  return (
    <form
      class="rst-projects__create"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        upload.submit();
      }}
    >
      <HowTo limitMb={upload.limitMb} />
      <ChosenFields upload={upload} hasProject={upload.project !== undefined} />
      <Outcome upload={upload} />
      <div class="rst-projects__actions">
        <Button
          type="submit"
          variant="primary"
          busy={phase === 'sending'}
          {...(reason === undefined ? {} : { disabledReason: reason })}
        >
          {phase === 'failed' && upload.project !== undefined ? 'Upload again' : 'Upload zip'}
        </Button>
      </div>
    </form>
  );
}
