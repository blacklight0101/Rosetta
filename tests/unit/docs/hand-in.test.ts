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

const slideSection = (slides: string, title: string): string =>
  slides.split(/^# /mu).find((section) => section.startsWith(title)) ?? '';

it('RF-802 the README links the slides and the video script with their URL placeholders', async () => {
  const readme = await readRepoFile('README.md');

  expect(readme).toContain('docs/hand-in/slides/');
  expect(readme).toContain('docs/hand-in/video-script.md');
  expect(readme).toContain('Slides URL: [PENDIENTE');
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
  expect(script).not.toMatch(/yo reviso/u);
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

it('RF-802 every video segment states its narration seconds and what fills the rest of the time', async () => {
  const script = await readRepoFile('docs/hand-in/video-script.md');
  const segments = [...script.matchAll(/\[(\d+):(\d{2})-(\d+):(\d{2})\]/gu)];
  const timing = [
    ...script.matchAll(/\*\*Tiempo:\*\* narración ~\d+ s; resto \(imagen o clip\): \d+ s\./gu),
  ];

  expect(timing.length).toBe(segments.length);
});

it('RF-802 the video script placeholders for the hosted URL, sample report and teacher account are marked', async () => {
  const script = await readRepoFile('docs/hand-in/video-script.md');

  expect(script).toMatch(/\[PENDIENTE: URL definitiva de la aplicación alojada/u);
  expect(script).toMatch(/\[PENDIENTE: URL definitiva del informe de ejemplo/u);
  expect(script).toMatch(/cuenta de evaluación/iu);
});
