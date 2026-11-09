/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWorker, PSM } from 'tesseract.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PositionMap } from '../domain/types';
import { encodePng, readPng, resize } from '../test/png';
import { findActions, findName, findNameBox, findPitch, NAME_VARIANTS, nameImage, readName, readPositions, type Box, type OcrRead, type Rgba } from './detect';

/**
 * Tests on real FM26 and FM27 screenshots: `npm run test:images` (not part of `npm test`).
 * The images live in src/test/fixtures/, which is git-ignored, so they never go to the
 * repository; cases whose image is missing are skipped. Add a screenshot that reads wrong
 * there and list it below with what it shows.
 */
const FIXTURES = resolve(import.meta.dirname, '../test/fixtures');
const has = (f: string) => existsSync(resolve(FIXTURES, f));
const fixture = (f: string) => readPng(resolve(FIXTURES, f));

if (!existsSync(FIXTURES)) console.warn(`No screenshot fixtures in ${FIXTURES}: image tests are skipped.`);

/**
 * Real FM26 profile screenshots and what they show: Spanish and English UI, 1080p, 4K and a
 * small UI scale, cropped and full-screen, club-coloured squad number badges and no badge.
 */
const CASES: { file: string; name: string; positions: PositionMap; fm27?: boolean }[] = [
  { file: 'fm26-selvi.png', name: 'Selvi', positions: { DC: 'natural', DM: 'natural', MC: 'accomplished' } },
  { file: 'fm26-herrero.png', name: 'Enrique Herrero', positions: { ST: 'natural', AMR: 'accomplished', AML: 'unconvincing' } },
  {
    file: 'fm26-buchmann.png',
    name: 'Tarek Buchmann',
    positions: { DC: 'natural', DM: 'awkward', DR: 'awkward', MC: 'ineffectual', WBR: 'ineffectual' },
  },
  { file: 'fm26-gabriel.png', name: 'Gabriel', positions: { DC: 'natural' } },
  {
    file: 'fm26-symonds.png', // 4K, no squad number
    name: 'Maisie Symonds',
    positions: { DM: 'natural', MC: 'natural', AMC: 'competent', DC: 'unconvincing' },
  },
  {
    file: 'fm26-calafiori.png', // slightly compressed colours
    name: 'Riccardo Calafiori',
    positions: {
      DL: 'natural', DC: 'natural', WBL: 'competent', ML: 'competent', DR: 'unconvincing', DM: 'unconvincing',
      MC: 'unconvincing', WBR: 'ineffectual', MR: 'ineffectual',
    },
  },
  { file: 'fm26-lammens.png', name: 'Senne Lammens', positions: { GK: 'natural' } }, // small UI scale
  { file: 'fm26-ba.png', name: 'Abdoulaye Bâ', positions: { AML: 'natural', AMR: 'natural', ST: 'natural' } }, // â
  { file: 'fm26-bonar.png', name: 'Javier Boñar', positions: { DR: 'natural', DC: 'accomplished', DM: 'accomplished' } }, // ñ
  {
    file: 'fm26-bonar-narrow.png', // cropped so the Actions button is right of the image's middle
    name: 'Javier Boñar',
    positions: { DR: 'natural', DC: 'accomplished', DM: 'accomplished' },
  },
];

/**
 * Real FM27 profile screenshots (Spanish UI): a full screen, the same profile scrolled and
 * cropped down to the photo and pitch (most without the Actions button), and two more players.
 */
const SANNADI = { name: 'Maroan Sannadi', positions: { ST: 'natural' }, fm27: true } as const;
CASES.push(
  { file: 'fm27-sannadi.png', ...SANNADI },
  { file: 'fm27-sannadi-top.png', ...SANNADI },
  { file: 'fm27-sannadi-wide.png', ...SANNADI },
  { file: 'fm27-sannadi-narrow.png', ...SANNADI },
  { file: 'fm27-sannadi-crop.png', ...SANNADI },
  { file: 'fm27-sannadi-small.png', ...SANNADI },
  { file: 'fm27-areso.png', name: 'Jesús Areso', positions: { DR: 'natural', WBR: 'natural', MR: 'awkward' }, fm27: true }, // ú
  {
    file: 'fm27-williams.png', // ñ
    name: 'Iñaki Williams',
    positions: { ML: 'accomplished', MR: 'accomplished', AML: 'natural', AMC: 'accomplished', AMR: 'natural', ST: 'natural' },
    fm27: true,
  },
);

describe('screenshot detection', () => {
  for (const c of CASES) {
    it.skipIf(!has(c.file))(`reads the positions of ${c.name}`, () => {
      expect(readPositions(fixture(c.file))).toEqual(c.positions);
    });

    it.skipIf(!has(c.file))(`reads the positions of ${c.name} at other UI scales`, () => {
      const img = fixture(c.file);
      for (const scale of [0.6, 1.5]) expect(readPositions(resize(img, scale)), `scale ${scale}`).toEqual(c.positions);
    });

    it.skipIf(!has(c.file) || c.fm27)(`finds the name of ${c.name} above the Actions button`, () => {
      const img = fixture(c.file);
      const pitch = findPitch(img)!;
      const actions = findActions(img, pitch)!;
      expect(actions.y + actions.h).toBeLessThan(pitch.y);
      const box = findNameBox(img, actions)!;
      expect(box.y + box.h).toBeLessThan(actions.y);
      expect(box.x).toBeGreaterThanOrEqual(actions.x - actions.h * 0.3); // not the ↑↓ arrows or the photo
      expect(box.w).toBeGreaterThan(actions.h);
      expect(findName(img, pitch)).toEqual(box); // FM26 screenshots use the Actions button
    });

    it.skipIf(!has(c.file) || !c.fm27)(`finds the name of ${c.name} above the pitch (FM27)`, () => {
      for (const scale of [1, 0.6, 1.5]) {
        const img = scale === 1 ? fixture(c.file) : resize(fixture(c.file), scale);
        const pitch = findPitch(img)!;
        expect(findActions(img, pitch), `scale ${scale}`).toBeNull(); // not taken for FM26
        const box = findName(img, pitch)!;
        expect(box.y + box.h, `scale ${scale}`).toBeLessThan(pitch.y - pitch.w * 0.5); // above the position lines
        expect(box.x, `scale ${scale}`).toBeGreaterThan(pitch.x + pitch.w * 0.1); // not the photo
        expect(box.h, `scale ${scale}`).toBeLessThan(pitch.w * 0.25); // one line
        expect(box.w, `scale ${scale}`).toBeGreaterThan(pitch.w * 0.3);
      }
    });
  }
});

describe.skipIf(!existsSync(FIXTURES))('screenshot name OCR (Tesseract, bundled Spanish data)', () => {
  let worker: Awaited<ReturnType<typeof createWorker>>;
  beforeAll(async () => {
    worker = await createWorker('spa', 1, { langPath: resolve(import.meta.dirname, '../../public/tessdata'), cacheMethod: 'none' });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
  }, 30000);
  afterAll(() => worker?.terminate());

  /** The same steps as read.ts: five OCR reads with letter boxes, vote, accents from pixels. */
  const ocrName = async (img: Rgba, box: Box) => {
    const reads: OcrRead[] = [];
    for (const opts of NAME_VARIANTS) {
      const { data } = await worker.recognize(encodePng(nameImage(img, box, opts)), {}, { blocks: true });
      const words = data.blocks?.flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words))) ?? [];
      reads.push({ text: data.text, confidence: data.confidence, words, opts });
    }
    return readName(reads, img, box);
  };

  for (const c of CASES) {
    it.skipIf(!has(c.file))(`reads "${c.name}"`, async () => {
      const img = fixture(c.file);
      expect(await ocrName(img, findName(img)!)).toBe(c.name);
    });
  }

  // Synthetic names (white on an FM-like header, Ubuntu Condensed / DejaVu Sans Bold) for accents
  // that no screenshot shows yet: ç ö ğ é ú â è ë ò ã ć č.
  const accents: { file: string; name: string }[] = has('accents/names.json')
    ? JSON.parse(readFileSync(resolve(FIXTURES, 'accents/names.json'), 'utf8'))
    : [];
  for (const a of accents) {
    it(`reads the accents in "${a.name}"`, async () => {
      const img = fixture(`accents/${a.file}`);
      expect(await ocrName(img, { x: 0, y: 0, w: img.width, h: img.height })).toBe(a.name);
    });
  }
});
