import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

const toSeconds = (minutes: string, seconds: string): number =>
  Number(minutes) * 60 + Number(seconds);

describe('hand-in slides and video script (RF-802)', () => {
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

  it('RF-802 the video script runs about five minutes in timed segments', async () => {
    const script = await readRepoFile('docs/hand-in/video-script.md');
    const segments = [...script.matchAll(/\[(\d+):(\d{2})-(\d+):(\d{2})\]/gu)];

    expect(segments.length).toBeGreaterThanOrEqual(6);
    let previousEnd = 0;
    for (const [, startMin, startSec, endMin, endSec] of segments) {
      const start = toSeconds(startMin ?? '0', startSec ?? '0');
      const end = toSeconds(endMin ?? '0', endSec ?? '0');
      expect(start).toBe(previousEnd);
      expect(end).toBeGreaterThan(start);
      previousEnd = end;
    }
    expect(previousEnd).toBeGreaterThanOrEqual(270);
    expect(previousEnd).toBeLessThanOrEqual(330);
  });
});
