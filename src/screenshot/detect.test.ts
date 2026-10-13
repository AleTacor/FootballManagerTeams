import { describe, expect, it } from 'vitest';
import {
  classifyDot, cleanName, findActions, findNameBox, findPitch, foldAccents, pickRead, readName, readPositions, restoreAccents,
  type Rgba,
} from './detect';

// Image-free tests. The ones on real FM26 screenshots are in detect.images.test.ts
// (`npm run test:images`); their images stay local and out of the repository.
describe('screenshot detection', () => {
  it('returns nothing for images without a pitch or a header', () => {
    const blank = { width: 300, height: 200, data: new Uint8Array(300 * 200 * 4).fill(30) };
    expect(findPitch(blank)).toBeNull();
    expect(readPositions(blank)).toBeNull();
    expect(findActions(blank)).toBeNull();
    expect(findNameBox(blank)).toBeNull();
  });

  it('classifies dot colours, including compressed ones, and ignores grey dots', () => {
    expect(classifyDot([101, 229, 58])).toBe('natural');
    expect(classifyDot([88, 224, 36])).toBe('natural');
    expect(classifyDot([194, 224, 40])).toBe('accomplished');
    expect(classifyDot([238, 253, 28])).toBe('competent');
    expect(classifyDot([237, 200, 0])).toBe('unconvincing');
    expect(classifyDot([245, 134, 16])).toBe('awkward');
    expect(classifyDot([251, 121, 46])).toBe('ineffectual');
    expect(classifyDot([42, 36, 36])).toBeNull();
    expect(classifyDot([40, 90, 200])).toBeNull(); // nothing like an FM dot
  });

  it('cleans OCR noise around the name', () => {
    expect(cleanName('-— Selvi\n')).toBe('Selvi');
    expect(cleanName('  José  Núñez | ')).toBe('José Núñez');
    expect(cleanName("N'Golo Kanté-Ruiz.")).toBe("N'Golo Kanté-Ruiz");
    expect(cleanName('senne Lammens 31')).toBe('Senne Lammens');
  });

  it('votes on the letters without accents, then takes the most confident spelling', () => {
    const r = (text: string, confidence = 80) => ({ text, confidence });
    expect(pickRead([r('Galafiori'), r('Calafiori'), r('Calafiori\n')])?.text.trim()).toBe('Calafiori');
    expect(pickRead([r('Selvl', 60), r('Selvi', 90)])?.text).toBe('Selvi');
    // "Ba" and "Bá" are one vote for "Ba", which beats a single "Be".
    expect(pickRead([r('Bá', 70), r('Ba', 90), r('Be', 95)])?.text).toBe('Ba');
    expect(pickRead([r('—'), r('  ')])).toBeNull();
    expect(readName([r('senne Lammens')])).toBe('Senne Lammens');
  });

  it('folds accents but keeps letters that have no base letter', () => {
    expect(foldAccents('Bâ Núñez Gündoğan Souček')).toBe('Ba Nunez Gundogan Soucek');
    expect(foldAccents('Ødegaard Łukasz')).toBe('Ødegaard Łukasz');
  });

  it('reads accent marks from the pixels above a letter', () => {
    // A hand-drawn "a" with a mark above it, dark on white (strokes 4-connected, as fonts render).
    const draw = (mark: string[]) => {
      const rows = [...mark, '', '', '########', '##    ##', '##    ##', '########', '##    ##', '##    ##', '##    ##', '##    ##', '##    ##', '########'];
      const w = 10, h = rows.length, data = new Uint8Array(w * h * 4).fill(255);
      rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') data.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3); }));
      return { width: w, height: h, data } as Rgba;
    };
    const word = (img: Rgba) => [{ symbols: [{ text: 'a', bbox: { x0: 0, y0: 0, x1: 8, y1: img.height } }] }];
    const read = (mark: string[]) => { const img = draw(mark); return restoreAccents(img, word(img)); };
    expect(read(['   ##', '  ####', ' ##  ##', '##    ##'])).toBe('â');
    expect(read(['     ##', '   ###', '  ##'])).toBe('á');
    expect(read(['##   ##', '##   ##'])).toBe('ä');
    expect(read([])).toBe('a');
    // An accent Tesseract imagined, with nothing in the image, is dropped.
    const img = draw([]);
    expect(restoreAccents(img, [{ symbols: [{ text: 'á', bbox: { x0: 0, y0: 0, x1: 8, y1: img.height } }] }])).toBe('a');
  });
});
