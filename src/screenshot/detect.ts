import type { Familiarity, PosCode, PositionMap } from '../domain/types';

/**
 * Reads an FM26 player profile screenshot: the positions pitch (familiarity dots) and the
 * area holding the player's name. Pure pixel work on RGBA data, no DOM, so it runs in tests.
 *
 * Measured on the default FM26 skin (see the fixtures in src/test/fixtures):
 * - The positions pitch is horizontal (attack to the right), filled with rgb(13 68 57). Its
 *   14 dots sit on a fixed grid relative to the pitch box; the top row is the player's left.
 * - The purple "Actions" button rgb(110 15 215) sits under the name in the header. The name
 *   is the largest white text above it; the squad number badge after it varies by club.
 */
export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Rgb = [number, number, number];

const PITCH: Rgb = [13, 68, 57];
const ACTIONS: Rgb = [110, 15, 215];

/** Dot centres as fractions of the pitch box (measured on 220×153 px pitches). */
const COLS = [0.063, 0.241, 0.413, 0.585, 0.757, 0.927];
const ROWS = [0.158, 0.49, 0.821];
const GK_Y = 0.475;

const DOTS: { code: PosCode; x: number; y: number }[] = [
  { code: 'GK', x: COLS[0], y: GK_Y },
  { code: 'DL', x: COLS[1], y: ROWS[0] }, { code: 'DC', x: COLS[1], y: ROWS[1] }, { code: 'DR', x: COLS[1], y: ROWS[2] },
  { code: 'WBL', x: COLS[2], y: ROWS[0] }, { code: 'DM', x: COLS[2], y: ROWS[1] }, { code: 'WBR', x: COLS[2], y: ROWS[2] },
  { code: 'ML', x: COLS[3], y: ROWS[0] }, { code: 'MC', x: COLS[3], y: ROWS[1] }, { code: 'MR', x: COLS[3], y: ROWS[2] },
  { code: 'AML', x: COLS[4], y: ROWS[0] }, { code: 'AMC', x: COLS[4], y: ROWS[1] }, { code: 'AMR', x: COLS[4], y: ROWS[2] },
  { code: 'ST', x: COLS[5], y: ROWS[1] },
];

/**
 * FM26 dot colours, best to worst. Six distinct colours appear in the screenshots, in hue
 * order from green to red-orange; the profile's "Positions" text lists exactly the first two
 * (natural and accomplished), which fixes where the scale starts.
 */
const FAM_COLOURS: [Familiarity, Rgb][] = [
  ['natural', [101, 229, 58]],
  ['accomplished', [194, 224, 40]],
  ['competent', [230, 246, 25]],
  ['unconvincing', [246, 207, 12]],
  ['awkward', [245, 134, 16]],
  ['ineffectual', [244, 105, 25]],
];

const px = (img: Rgba, x: number, y: number): Rgb => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
const near = (p: Rgb, c: Rgb, tol: number) =>
  Math.abs(p[0] - c[0]) <= tol && Math.abs(p[1] - c[1]) <= tol && Math.abs(p[2] - c[2]) <= tol;
const isWhite = (p: Rgb, min: number) => Math.min(...p) >= min && Math.max(...p) - Math.min(...p) < 40;
const chroma = (p: Rgb) => Math.max(...p) - Math.min(...p);

/** Hue in degrees, value 0–255. */
function hv(p: Rgb): [number, number] {
  const [r, g, b] = p;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return [0, max];
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h < 0 ? h + 360 : h, max];
}

interface Blob extends Box {
  n: number;
}

/** Connected areas of pixels matching `test` inside `area` (4-connectivity). */
function blobs(img: Rgba, area: Box, test: (p: Rgb) => boolean): Blob[] {
  const { x: ax, y: ay, w, h } = area;
  const seen = new Uint8Array(w * h);
  const out: Blob[] = [];
  for (let i0 = 0; i0 < w * h; i0++) {
    if (seen[i0]) continue;
    seen[i0] = 1;
    if (!test(px(img, ax + (i0 % w), ay + Math.floor(i0 / w)))) continue;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0;
    const stack = [i0];
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i - x) / w;
      n++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (seen[j]) continue;
        if (test(px(img, ax + nx, ay + ny))) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    out.push({ x: ax + x0, y: ay + y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n });
  }
  return out;
}

const clampBox = (img: Rgba, b: Box): Box => {
  const x = Math.max(0, Math.round(b.x));
  const y = Math.max(0, Math.round(b.y));
  return { x, y, w: Math.max(0, Math.min(img.width, Math.round(b.x + b.w)) - x), h: Math.max(0, Math.min(img.height, Math.round(b.y + b.h)) - y) };
};

/**
 * Finds the positions pitch: the largest area of pitch colour with a pitch-like shape.
 * Works on cells (bigger for bigger images) so the thin markings don't split the pitch.
 */
export function findPitch(img: Rgba): Box | null {
  const C = Math.max(4, Math.round(Math.max(img.width, img.height) / 480));
  const cw = Math.floor(img.width / C);
  const ch = Math.floor(img.height / C);
  const cells = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      let n = 0;
      for (let y = cy * C; y < cy * C + C; y++) for (let x = cx * C; x < cx * C + C; x++) if (near(px(img, x, y), PITCH, 10)) n++;
      if (n >= C) cells[cy * cw + cx] = 1;
    }
  }
  let best: Box | null = null;
  let bestCount = 0;
  const seen = new Uint8Array(cw * ch);
  for (let start = 0; start < cells.length; start++) {
    if (!cells[start] || seen[start]) continue;
    let x0 = cw, y0 = ch, x1 = 0, y1 = 0, count = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % cw, y = (i - x) / cw;
      count++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      // Step over one empty cell too: a marking line can cover a whole column of cells.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
        const j = ny * cw + nx;
        if (cells[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const ratio = w / h;
    if (w * C >= 60 && ratio > 1.2 && ratio < 1.8 && count > bestCount) {
      bestCount = count;
      best = { x: x0 * C, y: y0 * C, w: w * C, h: h * C };
    }
  }
  if (!best) return null;
  // Tighten to the exact pitch-colour pixels inside the cell box.
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  const ex = Math.min(img.width, best.x + best.w + C), ey = Math.min(img.height, best.y + best.h + C);
  for (let y = Math.max(0, best.y - C); y < ey; y++) {
    for (let x = Math.max(0, best.x - C); x < ex; x++) {
      if (!near(px(img, x, y), PITCH, 10)) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Maps a dot colour to a familiarity level; grey dots (can't play there) give null.
 * Compares hue and brightness rather than raw RGB, which keeps compressed screenshots
 * (shifted channels) on the right level.
 */
export function classifyDot(c: Rgb): Familiarity | null {
  if (chroma(c) < 60) return null;
  const [h, v] = hv(c);
  let best: Familiarity | null = null;
  let bestD = Infinity;
  for (const [fam, ref] of FAM_COLOURS) {
    const [rh, rv] = hv(ref);
    const d = (h - rh) ** 2 + ((v - rv) / 2) ** 2;
    if (d < bestD) {
      bestD = d;
      best = fam;
    }
  }
  return bestD <= 20 ** 2 ? best : null;
}

/** Reads every coloured dot on the pitch. Returns null if there's no positions pitch. */
export function readPositions(img: Rgba, pitch = findPitch(img)): PositionMap | null {
  if (!pitch) return null;
  const r = Math.max(1, Math.round(pitch.w * 0.015));
  const map: PositionMap = {};
  for (const dot of DOTS) {
    const cx = Math.round(pitch.x + dot.x * pitch.w);
    const cy = Math.round(pitch.y + dot.y * pitch.h);
    // Median of the coloured pixels around the centre: skips pitch, markings and the white
    // ring of the selected position, and isn't pulled off by anti-aliased edges.
    const rs: number[] = [], gs: number[] = [], bs: number[] = [];
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
        const p = px(img, x, y);
        if (near(p, PITCH, 14) || isWhite(p, 180)) continue;
        rs.push(p[0]); gs.push(p[1]); bs.push(p[2]);
      }
    }
    if (!rs.length) continue;
    const med = (a: number[]) => a.sort((m, n) => m - n)[a.length >> 1];
    const fam = classifyDot([med(rs), med(gs), med(bs)]);
    if (fam) map[dot.code] = fam;
  }
  return map;
}

/**
 * Finds the purple "Actions" button under the player's name: a button-shaped purple area,
 * the lowest one above the positions pitch (the "In possession" tab is below the pitch).
 */
export function findActions(img: Rgba, pitch = findPitch(img)): Box | null {
  const bottom = pitch ? pitch.y : Math.round(img.height * 0.6);
  const area = clampBox(img, { x: 0, y: 0, w: img.width, h: bottom });
  const found = blobs(img, area, (p) => near(p, ACTIONS, 30) && p[1] < 50).filter((b) => {
    const ratio = b.w / b.h;
    return b.h >= 12 && ratio > 2.8 && ratio < 5 && b.n > b.w * b.h * 0.5;
  });
  if (!found.length) return null;
  return found.reduce((a, b) => (b.y > a.y ? b : a));
}

/**
 * The name's box. Looks at the white text above the Actions button and picks the line with
 * the tallest letters, then keeps the words from its left edge until a gap wider than a word
 * space (which separates the name from the squad number badge or anything after it).
 */
export function findNameBox(img: Rgba, actions = findActions(img)): Box | null {
  if (!actions) return null;
  const u = actions.h;
  const area = clampBox(img, { x: actions.x - u * 0.3, y: actions.y - u * 5, w: u * 11.3, h: u * 4.8 });
  if (!area.w || !area.h) return null;
  // Letters: white blobs of text size (drops box borders and dots).
  const glyphs = blobs(img, area, (p) => isWhite(p, 200)).filter((b) => b.h >= u * 0.15 && b.h <= u * 1.5 && b.w <= b.h * 3 + 2);
  if (!glyphs.length) return null;

  // Group into lines by vertical overlap.
  const lines: Blob[][] = [];
  for (const g of [...glyphs].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2))) {
    const mid = g.y + g.h / 2;
    const line = lines.find((l) => l.some((o) => mid >= o.y && mid <= o.y + o.h));
    if (line) line.push(g);
    else lines.push([g]);
  }
  const capHeight = (l: Blob[]) => {
    const hs = l.map((g) => g.h).sort((a, b) => a - b);
    return hs[Math.floor((hs.length - 1) * 0.8)];
  };
  const name = lines.filter((l) => l.length >= 2).reduce<Blob[] | null>((a, l) => (!a || capHeight(l) > capHeight(a) ? l : a), null);
  if (!name) return null;

  const cap = capHeight(name);
  const sorted = [...name].sort((a, b) => a.x - b.x);
  const words = [sorted[0]];
  for (const g of sorted.slice(1)) {
    const last = words[words.length - 1];
    if (g.x - (last.x + last.w) > cap * 0.6) break;
    words.push(g);
  }
  const x0 = Math.min(...words.map((g) => g.x));
  const x1 = Math.max(...words.map((g) => g.x + g.w));
  const y0 = Math.min(...words.map((g) => g.y));
  const y1 = Math.max(...words.map((g) => g.y + g.h));
  return clampBox(img, { x: x0 - 1, y: y0 - cap * 0.25, w: x1 - x0 + 2, h: y1 - y0 + cap * 0.5 });
}

export interface NameImageOptions {
  /** Height of the name box after scaling, in px. */
  height?: number;
  /** Extra horizontal stretch: FM's name font is condensed. */
  stretch?: number;
  /** Smooth (anti-aliased) greyscale instead of hard black and white. */
  smooth?: boolean;
}

/**
 * Dark-on-white copy of the name area, scaled up with bilinear sampling, which is what
 * Tesseract reads best. Only the box is copied; the margin around it stays white.
 */
/** Scale and margin of a name image: source px → image px is x' = pad + (x - box.x) * sx. */
function nameLayout(box: Box, { height = 64, stretch = 1.2 }: NameImageOptions) {
  const sy = height / box.h;
  return { sx: sy * stretch, sy, pad: Math.round(height * 0.25) };
}

export function nameImage(img: Rgba, box: Box, opts: NameImageOptions = {}): Rgba {
  const { smooth = true } = opts;
  const { sx, sy, pad } = nameLayout(box, opts);
  const w = Math.round(box.w * sx) + pad * 2;
  const h = Math.round(box.h * sy) + pad * 2;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  // "Ink" 0–1: how white (bright and unsaturated) a source pixel is.
  const ink = (x: number, y: number) => {
    const p = px(img, Math.min(box.x + box.w - 1, Math.max(box.x, x)), Math.min(box.y + box.h - 1, Math.max(box.y, y)));
    const v = Math.min(...p) - Math.max(0, chroma(p) - 40) * 2;
    return smooth ? Math.max(0, Math.min(1, (v - 110) / 120)) : v >= 160 ? 1 : 0;
  };
  for (let y = pad; y < h - pad; y++) {
    for (let x = pad; x < w - pad; x++) {
      const fx = box.x + (x - pad + 0.5) / sx - 0.5;
      const fy = box.y + (y - pad + 0.5) / sy - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const ax = fx - x0, ay = fy - y0;
      const k =
        ink(x0, y0) * (1 - ax) * (1 - ay) + ink(x0 + 1, y0) * ax * (1 - ay) +
        ink(x0, y0 + 1) * (1 - ax) * ay + ink(x0 + 1, y0 + 1) * ax * ay;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(255 * (1 - k));
    }
  }
  return { width: w, height: h, data };
}

/**
 * Name image variants to OCR and vote on. One size alone misreads some names (C→G, i→l);
 * across the fixtures at 0.5×–2× scale, voting over these five reads 53 of 56 names right.
 */
export const NAME_VARIANTS: NameImageOptions[] = [
  { height: 36, stretch: 1.1 },
  { height: 48, stretch: 1 },
  { height: 40, stretch: 1 },
  { height: 52, stretch: 1 },
  { height: 48, stretch: 1.1 },
];

/** Cleans OCR output: keeps letters, spaces, apostrophes, dots and hyphens; capital first letter. */
export function cleanName(text: string): string {
  const s = text
    .replace(/[^\p{L}\p{M}' .-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.'-]+|[\s.'-]+$/g, '')
    .slice(0, 80);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Removes accent marks: "Bâ" → "Ba". Letters without a decomposition (ø, ł) stay. */
export const foldAccents = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

export interface OcrSymbol {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** One Tesseract reading of a name image: text, confidence, letter boxes and the image read. */
export interface OcrRead {
  text: string;
  confidence: number;
  /** Letter boxes, in the coordinates of the name image made with `opts`. */
  words?: { symbols: OcrSymbol[] }[];
  opts?: NameImageOptions;
}

/** Large rendering used to read accents: in the OCR images a mark is only 3–4 px tall. */
export const ACCENT_IMAGE: NameImageOptions = { height: 120, stretch: 1 };

/** Moves letter boxes from one name image of `box` to another (different scale/stretch). */
export function mapWords(words: { symbols: OcrSymbol[] }[], box: Box, from: NameImageOptions, to: NameImageOptions) {
  const a = nameLayout(box, from), b = nameLayout(box, to);
  const mx = (x: number) => Math.round(b.pad + ((x - a.pad) * b.sx) / a.sx);
  const my = (y: number) => Math.round(b.pad + ((y - a.pad) * b.sy) / a.sy);
  return words.map((w) => ({
    symbols: w.symbols.map((s) => ({ text: s.text, bbox: { x0: mx(s.bbox.x0), y0: my(s.bbox.y0), x1: mx(s.bbox.x1), y1: my(s.bbox.y1) } })),
  }));
}

/**
 * The winning reading. Votes on the letters without accents, because Tesseract confuses
 * a/á/â and u/ú/ü at this size and that would split the vote; accents are then read from
 * the pixels (restoreAccents). Ties go to the higher total confidence; within the winning
 * spelling, the most confident read is returned.
 */
export function pickRead<T extends OcrRead>(reads: T[]): T | null {
  const groups = new Map<string, { n: number; conf: number; best: T }>();
  for (const r of reads) {
    const key = foldAccents(cleanName(r.text));
    if (!key) continue;
    const g = groups.get(key);
    if (!g) groups.set(key, { n: 1, conf: r.confidence, best: r });
    else {
      g.n++;
      g.conf += r.confidence;
      if (r.confidence > g.best.confidence) g.best = r;
    }
  }
  let win: { n: number; conf: number; best: T } | null = null;
  for (const g of groups.values()) if (!win || g.n > win.n || (g.n === win.n && g.conf > win.conf)) win = g;
  return win?.best ?? null;
}

/**
 * The player's name from several OCR reads of the name box: vote on the letters, then read
 * the accents from a large rendering of the same box.
 */
export function readName(reads: OcrRead[], img?: Rgba, box?: Box): string | null {
  const r = pickRead(reads);
  if (!r) return null;
  let text = r.text;
  if (img && box && r.words?.length && r.opts) {
    text = restoreAccents(nameImage(img, box, ACCENT_IMAGE), mapWords(r.words, box, r.opts, ACCENT_IMAGE));
  }
  return cleanName(text) || null;
}

const MARK = {
  acute: '\u0301', grave: '\u0300', circumflex: '\u0302', tilde: '\u0303', macron: '\u0304', breve: '\u0306',
  dot: '\u0307', diaeresis: '\u0308', ring: '\u030a', caron: '\u030c', cedilla: '\u0327', ogonek: '\u0328',
} as const;

/** True if the mark's box has background enclosed by ink (a ring, as in å). */
function hasHole(b: Box, dark: (x: number, y: number) => boolean): boolean {
  const { x: bx, y: by, w, h } = b;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) stack.push(y * w + x);
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) stack.push(y * w + x);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    const x = i % w, y = (i - x) / w;
    if (dark(bx + x, by + y)) continue;
    seen[i] = 1;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  for (let i = 0; i < w * h; i++) if (!seen[i] && !dark(bx + (i % w), by + Math.floor(i / w))) return true;
  return false;
}

/** A round, solid speck: the dot of i/j, one dot of ¨, or the dot above ż/ė. */
function isDot(m: Box, dark: (x: number, y: number) => boolean): boolean {
  const ratio = m.w / m.h;
  if (ratio > 1.6 || ratio < 0.6) return false;
  let n = 0;
  for (let y = m.y; y < m.y + m.h; y++) for (let x = m.x; x < m.x + m.w; x++) if (dark(x, y)) n++;
  return n / (m.w * m.h) > 0.6;
}

/** Shape of the mark above a letter, from where its ink starts in each column. */
function classifyMarkAbove(m: Box, dark: (x: number, y: number) => boolean): keyof typeof MARK | null {
  if (m.w >= 4 && m.h >= 4 && hasHole(m, dark)) return 'ring';
  if (isDot(m, dark)) return 'dot';
  const ratio = m.w / m.h;
  // Top profile at five points across the mark, 0 = top of the mark box, 1 = bottom.
  const top = (fx: number) => {
    const x = Math.min(m.x + m.w - 1, Math.max(m.x, Math.round(m.x + fx * (m.w - 1))));
    for (let y = m.y; y < m.y + m.h; y++) if (dark(x, y)) return (y - m.y) / m.h;
    return 1;
  };
  const p = [0.05, 0.27, 0.5, 0.73, 0.95].map(top);
  // Ink at both ends but none in the middle: the two dots of ¨ touching the box edges.
  if (p[2] === 1 && p[0] < 1 && p[4] < 1) return 'diaeresis';
  // ^ and ˇ: the peak (or dip) can sit a bit off centre; ^ is clearly wider than tall.
  const mid = [p[1], p[2], p[3]];
  if (ratio >= 1.3 && Math.min(...mid) + 0.25 < Math.min(p[0], p[4])) return 'circumflex';
  if (Math.max(...mid) > Math.max(p[0], p[4]) + 0.25) return 'caron';
  if (ratio >= 1.6 && p[1] + 0.15 < p[3] && p[4] < p[3]) return 'tilde';
  if (ratio >= 2.5 && Math.max(...p) - Math.min(...p) < 0.2) return 'macron';
  if (p[4] + 0.25 < p[0]) return 'acute';
  if (p[0] + 0.25 < p[4]) return 'grave';
  return null;
}

/**
 * Re-reads accents from the pixels of the image Tesseract read (dark text on white).
 * Letter bodies and the small marks above or below them are separate ink blobs; each mark
 * goes to the letter it sits over, and its shape gives the accent. A combination is kept only
 * if Unicode has a single letter for it (â, ğ, ł…), so stray specks don't invent letters.
 * Letters Tesseract read with an accent that isn't in the image lose it.
 */
export function restoreAccents(img: Rgba, words: { symbols: OcrSymbol[] }[]): string {
  // Faint pixels count as ink: thin accent strokes (the legs of ^) break apart otherwise.
  const INK = 160;
  const dark = (x: number, y: number) => x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[(y * img.width + x) * 4] < INK;
  const comps = blobs(img, { x: 0, y: 0, w: img.width, h: img.height }, (p) => p[0] < INK).filter((b) => b.n >= 3);
  if (!comps.length) return words.map((w) => w.symbols.map((s) => s.text).join('')).join(' ');
  const maxH = Math.max(...comps.map((c) => c.h));
  const tall = comps.filter((c) => c.h >= maxH * 0.3).map((c) => c.h).sort((a, b) => a - b);
  const xh = tall[tall.length >> 1]; // about the x-height
  const isBody = (c: Blob) => c.h >= xh * 0.6;
  const bodies = comps.filter(isBody);
  const bottoms = bodies.map((c) => c.y + c.h).sort((a, b) => a - b);
  const baseline = bottoms[bottoms.length >> 1];
  const marks = comps.filter((c) => !isBody(c));

  const symbols = words.flatMap((w, wi) => w.symbols.map((s) => ({ s, wi })));
  const bodyTop = symbols.map(({ s }) => {
    const own = bodies.filter((c) => Math.min(c.x + c.w, s.bbox.x1) - Math.max(c.x, s.bbox.x0) > c.w * 0.5);
    return own.length ? { top: Math.min(...own.map((c) => c.y)), bottom: Math.max(...own.map((c) => c.y + c.h)) } : null;
  });

  const above = symbols.map(() => [] as Blob[]);
  const below = symbols.map(() => [] as Blob[]);
  const reach = (i: number, mx: number) => {
    const b = symbols[i].s.bbox;
    const w = b.x1 - b.x0;
    return mx < b.x0 - w * 0.2 ? b.x0 - mx : mx > b.x1 + w * 0.2 ? mx - b.x1 : 0;
  };
  const isAbove = (m: Blob, i: number) => !!bodyTop[i] && m.y + m.h <= bodyTop[i]!.top + xh * 0.15;
  const free = new Set(marks);
  // An i or j first claims the nearest mark above it (its dot, or the accent replacing it):
  // Tesseract's box for a narrow i often misses its dot, which would land on the next letter.
  symbols.forEach(({ s }, i) => {
    if (!/^[ijı]$/.test(foldAccents(s.text))) return;
    const cx = (s.bbox.x0 + s.bbox.x1) / 2;
    for (const m of [...free].filter((m) => isAbove(m, i) && Math.abs(m.x + m.w / 2 - cx) <= xh * 0.6)) {
      above[i].push(m); // a dot can come out in pieces
      free.delete(m);
    }
  });
  // Every other mark goes to the letter it sits over (nearest centre).
  for (const m of free) {
    const mx = m.x + m.w / 2;
    let best = -1;
    let bestD = Infinity;
    symbols.forEach(({ s }, i) => {
      if (reach(i, mx) > 0) return;
      if (/^[bdfhkl]$/.test(foldAccents(s.text))) return; // tall letters don't carry accents in names
      const d = Math.abs(mx - (s.bbox.x0 + s.bbox.x1) / 2);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0 || !bodyTop[best]) continue;
    if (isAbove(m, best)) above[best].push(m);
    else if (m.y >= baseline - xh * 0.1) below[best].push(m);
  }

  const out: string[][] = words.map(() => []);
  symbols.forEach(({ s, wi }, i) => {
    const base = foldAccents(s.text);
    let mark: keyof typeof MARK | null = null;
    const up = above[i].sort((a, b) => a.x - b.x);
    // Two round dots with a gap = ¨. Anything else above the letter is one mark (a ^ can
    // break into pieces), classified by the shape of all its pieces together.
    if (up.length === 2 && isDot(up[0], dark) && isDot(up[1], dark) && up[1].x - (up[0].x + up[0].w) >= Math.min(up[0].w, up[1].w) * 0.3) {
      mark = 'diaeresis';
    } else if (up.length) {
      const x0 = Math.min(...up.map((m) => m.x)), y0 = Math.min(...up.map((m) => m.y));
      const x1 = Math.max(...up.map((m) => m.x + m.w)), y1 = Math.max(...up.map((m) => m.y + m.h));
      mark = classifyMarkAbove({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, dark);
    }
    // Which marks a letter can carry in names: a single dot only on ż and İ (on other vowels it's
    // a ¨ whose dots merged).
    if (/^[ijı]$/.test(base)) mark = mark === 'acute' || mark === 'diaeresis' ? mark : null; // í, ï; else its dot
    else if (mark === 'dot' && !/^[zZI]$/.test(base)) mark = /^[aeiouyAEOUY]$/.test(base) ? 'diaeresis' : null;
    // A tilde is 2–3 px tall in the screenshot and comes out looking like ˇ: on n it's ñ (ň is
    // almost never seen in names), on a/o it's ã/õ (João, Galvão); on g it's the breve of ğ.
    if (/^[nN]$/.test(base) && mark && mark !== 'acute' && mark !== 'dot') mark = 'tilde';
    else if (/^[aoAO]$/.test(base) && mark === 'caron') mark = 'tilde';
    else if (/^[gG]$/.test(base) && mark === 'caron') mark = 'breve';
    if (!mark && below[i].length) mark = /[cstCST]/.test(base) ? 'cedilla' : /[aeiuAEIU]/.test(base) ? 'ogonek' : null;
    // A cedilla drawn joined to its letter: the letter itself reaches below the baseline.
    if (!mark && /[cstCST]/.test(base) && bodyTop[i] && bodyTop[i]!.bottom > baseline + xh * 0.2) mark = 'cedilla';
    const composed = mark && base.length === 1 ? (base + MARK[mark]).normalize('NFC') : base;
    out[wi].push(composed.length === 1 ? composed : base);
  });
  return out.map((w) => w.join('')).join(' ');
}
