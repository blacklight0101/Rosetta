import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { it, expect } from 'vitest';

const readRepoFile = (path: string): Promise<string> =>
  readFile(resolve(process.cwd(), path), 'utf8');

const SLIDE_TOPICS = [
  'Problema',
  'Pipeline',
  'Agentes',
  'Evidencia',
  'Verificador',
  'Coste',
  'Seguridad',
  'Método de construcción',
  'Resultados',
];

const PLACEHOLDERS = [
  'Aplicación alojada: [PENDIENTE',
  'Informe de ejemplo (GitHub Pages): [PENDIENTE',
  'Cuenta de evaluación: [PENDIENTE',
];

const TOTAL_SECONDS = 300;

const toSeconds = (minutes: string, seconds: string): number =>
  Number(minutes) * 60 + Number(seconds);

const segmentLength = (section: string): number => {
  const range = /^\[(\d+):(\d{2})-(\d+):(\d{2})\]/u.exec(section);
  expect(range).not.toBeNull();
  const [startMin = '0', startSec = '0', endMin = '0', endSec = '0'] = range?.slice(1) ?? [];
  return toSeconds(endMin, endSec) - toSeconds(startMin, startSec);
};

const segmentSplit = (section: string): { narration: number; clip: number } => {
  const timing = /\*\*Tiempo:\*\* narración ~(\d+) s; resto \(imagen o clip\): (\d+) s\./u.exec(
    section,
  );
  expect(timing).not.toBeNull();
  return { narration: Number(timing?.[1]), clip: Number(timing?.[2]) };
};

const slideSection = (slides: string, title: string): string =>
  slides.split(/^# /mu).find((section) => section.startsWith(title)) ?? '';

it('RF-802 the README links the published slides and the video script with its URL placeholder', async () => {
  const readme = await readRepoFile('README.md');

  expect(readme).toContain('docs/hand-in/slides/');
  expect(readme).toContain('docs/hand-in/video-script.md');
  expect(readme).toMatch(
    /Slides URL: <https:\/\/github\.com\/blacklight0101\/Rosetta\/blob\/main\/docs\/hand-in\/slides\/Rosetta-Hito1\.pdf>/u,
  );
  expect(readme).toContain('Video URL: [PENDIENTE');
});

it('RF-802 the slides in Spanish cover the problem, the pipeline, the agents, the evidence, the verifier, the cost, the security, the build method and the results', async () => {
  const slides = await readRepoFile('docs/hand-in/slides/slides.md');

  for (const topic of SLIDE_TOPICS) {
    expect(slides).toMatch(new RegExp(`^#+ .*${topic}`, 'imu'));
  }
});

it('RF-802 the slides are a Marp deck: front matter with marp enabled and Spanish language', async () => {
  const slides = await readRepoFile('docs/hand-in/slides/slides.md');
  const frontMatter = /^---\n([\s\S]*?)\n---/u.exec(slides)?.[1] ?? '';

  expect(slides.startsWith('---\n')).toBe(true);
  expect(frontMatter).toMatch(/^marp: true$/mu);
  expect(frontMatter).toMatch(/^lang: es$/mu);
});

it('RF-802 the slides carry the hosted URL, sample report URL and teacher account placeholders', async () => {
  const slides = await readRepoFile('docs/hand-in/slides/slides.md');

  for (const placeholder of PLACEHOLDERS) {
    expect(slides).toContain(placeholder);
  }
});

it('RF-802 the pipeline slide states that Milestone 1 delivers the Markdown report and the GitHub Pages sample, and the HTML report and plan come later', async () => {
  const slides = await readRepoFile('docs/hand-in/slides/slides.md');
  const pipeline = slideSection(slides, 'Pipeline');

  expect(pipeline).toContain('Markdown');
  expect(pipeline).toContain('GitHub Pages');
  expect(pipeline).not.toContain('informe HTML');
  expect(pipeline).toMatch(/P3/u);
});

it('RF-802 the build method describes the orchestrator, the verifier agent and the owner decisions as DEC-96 sets them, not a personal review of every change', async () => {
  const slides = await readRepoFile('docs/hand-in/slides/slides.md');
  const script = await readRepoFile('docs/hand-in/video-script.md');
  const section = slideSection(slides, 'Método de construcción');

  expect(section).toMatch(/agente verificador/u);
  expect(section).toMatch(/orquestador/u);
  expect(section).not.toMatch(/revisa cada cambio/u);
  expect(script).toMatch(/agente verificador/u);
  expect(script).not.toMatch(/yo reviso/iu);
});

it('RF-802 the test-first claim is scoped to the specification behaviour, not to all 182 cards', async () => {
  const slides = await readRepoFile('docs/hand-in/slides/slides.md');
  const script = await readRepoFile('docs/hand-in/video-script.md');

  expect(script).not.toMatch(/182 tarjetas de tarea tiene su prueba/u);
  expect(script).toMatch(/comportamiento de la especificación/u);
  expect(slides).toMatch(/tarjetas de código/u);
});

it('RF-802 the card tiers are labelled as the 182-card total and P1 has its own split', async () => {
  const slides = await readRepoFile('docs/hand-in/slides/slides.md');

  expect(slides).toMatch(/63 haiku, 97 sonnet y 22 opus entre las 182/u);
  expect(slides).toMatch(/58 haiku, 79 sonnet y 15 opus entre las 152 del hito 1/u);
});

it('RF-802 the video script is in Spanish and runs exactly five minutes in contiguous timed segments', async () => {
  const script = await readRepoFile('docs/hand-in/video-script.md');
  const segments = [...script.matchAll(/\[(\d+):(\d{2})-(\d+):(\d{2})\]/gu)];

  expect(script).not.toMatch(/\babout\b/iu);
  expect(segments.length).toBeGreaterThanOrEqual(6);
  let previousEnd = 0;
  for (const [, startMin, startSec, endMin, endSec] of segments) {
    const start = toSeconds(startMin ?? '0', startSec ?? '0');
    const end = toSeconds(endMin ?? '0', endSec ?? '0');
    expect(start).toBe(previousEnd);
    expect(end).toBeGreaterThan(start);
    previousEnd = end;
  }
  expect(previousEnd).toBe(TOTAL_SECONDS);
});

it('RF-802 each video segment has narration and clip seconds that sum to its length, and the segments total 300 seconds', async () => {
  const script = await readRepoFile('docs/hand-in/video-script.md');
  const sections = script.split(/^## /mu).filter((section) => section.startsWith('['));

  expect(sections.length).toBeGreaterThanOrEqual(6);
  let total = 0;
  for (const section of sections) {
    const length = segmentLength(section);
    const { narration, clip } = segmentSplit(section);
    expect(narration + clip).toBe(length);
    total += length;
  }
  expect(total).toBe(TOTAL_SECONDS);
});

it('RF-802 the video script names the hosted URL and the sample report, records with the teacher account and never shows a password', async () => {
  const script = await readRepoFile('docs/hand-in/video-script.md');

  expect(script).toMatch(/https:\/\/ca-rosetta\.[a-z0-9-]+\.spaincentral\.azurecontainerapps\.io/u);
  expect(script).toContain('https://blacklight0101.github.io/Rosetta/');
  expect(script).toMatch(/cuenta de evaluación/iu);
  expect(script).toMatch(/no se ve la contraseña/u);
});

it('RF-802 the results slide quotes the CI verify run on the current head, dated and with its run id', async () => {
  const slides = await readRepoFile('docs/hand-in/slides/slides.md');

  expect(slides).toContain('run 38480431418');
  expect(slides).toMatch(/a fecha 2026-10-13/u);
  expect(slides).toContain('6953 pasadas');
  expect(slides).toContain('2362');
  expect(slides).not.toContain('38478996250');
  expect(slides).toMatch(/96,2 %/u);
  expect(slides).not.toContain('6629');
  expect(slides).not.toContain('91,7 %');
});

it('RF-802 the slides state P1-50 status only as the repository shows it (open PR #361)', async () => {
  const slides = await readRepoFile('docs/hand-in/slides/slides.md');

  expect(slides).toContain('PR #361');
  expect(slides).not.toContain('en curso');
});

const SECRET_PATTERNS: readonly RegExp[] = [
  /password\s*[:=]/iu,
  /passwd\s*[:=]/iu,
  /contrase[ñn]a\s*[:=]/iu,
  /api[_-]?key\s*[:=]/iu,
  /secret\s*[:=]/iu,
  /token\s*[:=]/iu,
  /\bsk-[A-Za-z0-9_-]{8,}/u,
  /\bghp_[A-Za-z0-9]{8,}/u,
  /\bgithub_pat_[A-Za-z0-9_]{8,}/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /https?:\/\/[^\s/@]+:[^\s/@]+@/u,
];

it('RF-803 the hand-in file lists the repository, the teacher user name, the sample report fallback, the slides and video script, the hosted URL of G-06, and leaves the sign-in check to the owner', async () => {
  const m1 = await readRepoFile('docs/hand-in/m1.md');

  expect(m1).toContain('https://github.com/blacklight0101/Rosetta');
  expect(m1).toMatch(/user name:?\**\s*`braismoure`/iu);
  expect(m1).toContain('https://blacklight0101.github.io/Rosetta/');
  expect(m1).toContain('docs/hand-in/slides/slides.md');
  expect(m1).toContain('docs/hand-in/video-script.md');
  expect(m1).not.toContain('PENDING G-06');
  expect(m1).toMatch(
    /Hosted application[^\n]*https:\/\/ca-rosetta\.[a-z0-9-]+\.spaincentral\.azurecontainerapps\.io/u,
  );
  expect(m1).toMatch(/Sign-in check[^\n]*PENDING owner/u);
});

it('RF-803 the hand-in file holds no password, key, token or secret pattern', async () => {
  const m1 = await readRepoFile('docs/hand-in/m1.md');

  for (const pattern of SECRET_PATTERNS) {
    expect(m1).not.toMatch(pattern);
  }
});
