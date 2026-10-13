import type { PositionMap } from '../domain/types';
import { findActions, findNameBox, findPitch, NAME_VARIANTS, nameImage, readName, readPositions, type OcrRead, type Rgba } from './detect';
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import coreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';

export interface ScreenshotResult {
  name: string | null;
  /** Same map for both phases: FM26 positions don't depend on the phase, only roles do. */
  positions: PositionMap | null;
}

type Worker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
let worker: Promise<Worker> | null = null;

/**
 * Tesseract and its Spanish data (public/tessdata, from @tesseract.js-data/spa 4.0.0_best_int)
 * are served by the app itself, so this works offline. Loaded on first use only.
 */
function getWorker(): Promise<Worker> {
  worker ??= import('tesseract.js')
    .then(async ({ createWorker, PSM }) => {
      const w = await createWorker('spa', 1, {
        workerPath: new URL(workerUrl, location.href).href,
        corePath: new URL(coreUrl, location.href).href,
        langPath: new URL('tessdata', document.baseURI).href,
        workerBlobURL: false,
      });
      await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
      return w;
    })
    .catch((e) => {
      worker = null; // let the next attempt retry
      throw e;
    });
  return worker;
}

export async function loadImage(blob: Blob): Promise<Rgba> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function toCanvas(img: Rgba): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return canvas;
}

/** Reads the player's name and positions from an FM26 profile screenshot. */
export async function readScreenshot(blob: Blob): Promise<ScreenshotResult> {
  const img = await loadImage(blob);
  const pitch = findPitch(img);
  const positions = readPositions(img, pitch);
  const box = findNameBox(img, findActions(img, pitch));
  let name: string | null = null;
  if (box) {
    const w = await getWorker();
    const reads: OcrRead[] = [];
    for (const opts of NAME_VARIANTS) {
      const { data } = await w.recognize(toCanvas(nameImage(img, box, opts)), {}, { blocks: true });
      const words = data.blocks?.flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words))) ?? [];
      reads.push({ text: data.text, confidence: data.confidence, words, opts });
    }
    name = readName(reads, img, box);
  }
  return { name, positions };
}
