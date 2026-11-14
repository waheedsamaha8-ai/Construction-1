// @ts-nocheck
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';
import DxfParser from 'dxf-parser';

export interface CadPoint {
    x: number;
    y: number;
}

export interface CadLayer {
    name: string;
    colorHex: string;
    colorIndex: number;
    visible: boolean;
    entityCount: number;
}

export type CadPrimitive =
    | {
          kind: 'polyline';
          layer: string;
          colorHex: string;
          isAdaptiveWhite: boolean;
          points: CadPoint[];
          closed: boolean;
          filled?: boolean;
          dashed?: boolean;
          isDimension?: boolean;
      }
    | {
          kind: 'circle';
          layer: string;
          colorHex: string;
          isAdaptiveWhite: boolean;
          cx: number;
          cy: number;
          r: number;
          isDimension?: boolean;
      }
    | {
          kind: 'arc';
          layer: string;
          colorHex: string;
          isAdaptiveWhite: boolean;
          cx: number;
          cy: number;
          r: number;
          startAngle: number; // radians
          endAngle: number;   // radians
          ccw?: boolean;
          isDimension?: boolean;
      }
    | {
          kind: 'ellipse';
          layer: string;
          colorHex: string;
          isAdaptiveWhite: boolean;
          cx: number;
          cy: number;
          rx: number;
          ry: number;
          rotation: number; // radians
          startAngle: number;
          endAngle: number;
          isDimension?: boolean;
      }
    | {
          kind: 'text';
          layer: string;
          colorHex: string;
          isAdaptiveWhite: boolean;
          x: number;
          y: number;
          text: string;
          height: number;
          rotation: number; // radians
          align: 'left' | 'center' | 'right';
          valign?: 'alphabetic' | 'middle' | 'top' | 'bottom';
          widthFactor?: number;
          isDimension?: boolean;
      }
    | {
          kind: 'point';
          layer: string;
          colorHex: string;
          isAdaptiveWhite: boolean;
          x: number;
          y: number;
          isDimension?: boolean;
      };

export interface CadBoundingBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
}

export interface CadDocument {
    format: 'DWG' | 'DXF';
    layers: CadLayer[];
    primitives: CadPrimitive[];
    snapPoints: CadPoint[];
    bounds: CadBoundingBox;
    embeddedThumbnailUrl?: string;
    totalEntities: number;
}

// Standard 256 AutoCAD Color Index (ACI) Table
const ACI_PALETTE: number[] = [
    0x000000, 0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0xffffff, 0x808080,
    0xc0c0c0, 0xff0000, 0xff7f7f, 0xcc0000, 0xcc6666, 0x990000, 0x994c4c, 0x7f0000,
    0x7f3f3f, 0x4c0000, 0x4c2626, 0xff3f00, 0xff9f7f, 0xcc3300, 0xcc7f66, 0x992600,
    0x995f4c, 0x7f1f00, 0x7f4f3f, 0x4c1300, 0x4c2f26, 0xff7f00, 0xffbf7f, 0xcc6600,
    0xcc9966, 0x994c00, 0x99724c, 0x7f3f00, 0x7f5f3f, 0x4c2600, 0x4c3926, 0xffbf00,
    0xffdf7f, 0xcc9900, 0xccb266, 0x997200, 0x99854c, 0x7f5f00, 0x7f6f3f, 0x4c3900,
    0x4c4226, 0xffff00, 0xffff7f, 0xcccc00, 0xcccc66, 0x989800, 0x98984c, 0x7f7f00,
    0x7f7f3f, 0x4c4c00, 0x4c4c26, 0xbfff00, 0xdfff7f, 0x99cc00, 0xb2cc66, 0x729900,
    0x85994c, 0x5f7f00, 0x6f7f3f, 0x394c00, 0x424c26, 0x7fff00, 0xbfff7f, 0x66cc00,
    0x99cc66, 0x4c9900, 0x72994c, 0x3f7f00, 0x5f7f3f, 0x264c00, 0x394c26, 0x3fff00,
    0x9fff7f, 0x33cc00, 0x7fcc66, 0x269900, 0x5f994c, 0x1f7f00, 0x4f7f3f, 0x134c00,
    0x2f4c26, 0x00ff00, 0x7fff7f, 0x00cc00, 0x66cc66, 0x009900, 0x4c994c, 0x007f00,
    0x3f7f3f, 0x004c00, 0x264c26, 0x00ff3f, 0x7fff9f, 0x00cc33, 0x66cc7f, 0x009926,
    0x4c995f, 0x007f1f, 0x3f7f4f, 0x004c13, 0x264c2f, 0x00ff7f, 0x7fffbf, 0x00cc66,
    0x66cc99, 0x00994c, 0x4c9972, 0x007f3f, 0x3f7f5f, 0x004c26, 0x264c39, 0x00ffbf,
    0x7fffdf, 0x00cc99, 0x66ccb2, 0x009972, 0x4c9985, 0x007f5f, 0x3f7f6f, 0x004c39,
    0x264c42, 0x00ffff, 0x7fffff, 0x00cccc, 0x66cccc, 0x009999, 0x4c9999, 0x007f7f,
    0x3f7f7f, 0x004c4c, 0x264c4c, 0x00bfff, 0x7fdfff, 0x0099cc, 0x66b2cc, 0x007299,
    0x4c8599, 0x005f7f, 0x3f6f7f, 0x00394c, 0x26424c, 0x007fff, 0x7fbfff, 0x0066cc,
    0x6699cc, 0x004c99, 0x4c7299, 0x003f7f, 0x3f5f7f, 0x00264c, 0x26394c, 0x003fff,
    0x7f9fff, 0x0033cc, 0x667fcc, 0x002699, 0x4c5f99, 0x001f7f, 0x3f4f7f, 0x00134c,
    0x262f4c, 0x0000ff, 0x7f7fff, 0x0000cc, 0x6666cc, 0x000099, 0x4c4c99, 0x00007f,
    0x3f3f7f, 0x00004c, 0x26264c, 0x3f00ff, 0x9f7fff, 0x3300cc, 0x7f66cc, 0x260099,
    0x5f4c99, 0x1f007f, 0x4f3f7f, 0x13004c, 0x2f264c, 0x7f00ff, 0xbf7fff, 0x6600cc,
    0x9966cc, 0x4c0099, 0x724c99, 0x3f007f, 0x5f3f7f, 0x26004c, 0x39264c, 0xbf00ff,
    0xdf7fff, 0x9900cc, 0xb266cc, 0x720099, 0x854c99, 0x5f007f, 0x6f3f7f, 0x39004c,
    0x42264c, 0xff00ff, 0xff7fff, 0xcc00cc, 0xcc66cc, 0x980098, 0x984c98, 0x7f007f,
    0x7f3f7f, 0x4c004c, 0x4c264c, 0xff00bf, 0xff7fdf, 0xcc0099, 0xcc66b2, 0x980072,
    0x984c85, 0x7f005f, 0x7f3f6f, 0x4c0039, 0x4c2642, 0xff007f, 0xff7fbf, 0xcc0066,
    0xcc6699, 0x98004c, 0x984c72, 0x7f003f, 0x7f3f5f, 0x4c0026, 0x4c2639, 0xff003f,
    0xff7f9f, 0xcc0033, 0xcc667f, 0x980026, 0x984c5f, 0x7f001f, 0x7f3f4f, 0x4c0013,
    0x4c262f, 0x333333, 0x5b5b5b, 0x848484, 0xadadad, 0xd6d6d6, 0xffffff, 0x000000
];

function intToHex(rgb: number): string {
    const clamped = Math.max(0, Math.min(0xffffff, Math.round(rgb)));
    return '#' + clamped.toString(16).padStart(6, '0');
}

function aciToColor(aci: number | undefined | null): { hex: string; isAdaptiveWhite: boolean } {
    if (aci == null || aci === 256 || aci === 0) {
        return { hex: '#ffffff', isAdaptiveWhite: true };
    }
    const absAci = Math.abs(Math.round(aci));
    if (absAci === 7 || absAci < 1 || absAci > 255) {
        return { hex: '#ffffff', isAdaptiveWhite: true };
    }
    const rgb = ACI_PALETTE[absAci] ?? 0xffffff;
    if (absAci === 255) {
        return { hex: '#f8fafc', isAdaptiveWhite: false };
    }
    if (rgb === 0x000000) {
        return { hex: '#ffffff', isAdaptiveWhite: true };
    }
    return { hex: intToHex(rgb), isAdaptiveWhite: false };
}

// Mapping for Arabic AutoCAD SHX fonts (xarab.shx, sosa.shx, arab.shx, etc.)
const SHX_ARABIC_CHAR_MAP: Record<string, string> = {
    H: 'ا',
    h: 'ا',
    B: 'لأ',
    b: 'لا',
    F: 'ب',
    f: 'ب',
    J: 'ت',
    j: 'ت',
    E: 'ث',
    e: 'ث',
    '[': 'ج',
    '{': 'ج',
    P: 'ح',
    p: 'ح',
    O: 'خ',
    o: 'خ',
    ']': 'د',
    '}': 'د',
    '~': 'ذ',
    V: 'ر',
    v: 'ر',
    '>': 'ز',
    S: 'س',
    s: 'س',
    A: 'ش',
    a: 'ش',
    W: 'ص',
    w: 'ص',
    Q: 'ض',
    q: 'ض',
    "'": 'ط',
    '`': 'ط',
    '"': 'ط',
    '/': 'ظ',
    '?': 'ظ',
    U: 'ع',
    u: 'ع',
    Y: 'غ',
    y: 'غ',
    T: 'ف',
    t: 'ف',
    R: 'ق',
    r: 'ق',
    ':': 'ك',
    ';': 'ك',
    G: 'ل',
    g: 'ل',
    L: 'م',
    l: 'م',
    I: 'م',
    K: 'ن',
    k: 'ن',
    i: 'ه',
    ',': 'و',
    D: 'ي',
    d: 'ي',
    M: 'ة',
    m: 'ة',
    N: 'ى',
    n: 'ى',
    Z: 'ئ',
    z: 'ئ',
    C: 'ؤ',
    c: 'ؤ',
    X: 'ء',
    x: 'ء',
};

const STANDARD_ENGLISH_CAD_WORDS = new Set([
    'PLAN', 'SCALE', 'SEC', 'SECTION', 'DETAIL', 'ELEVATION', 'GRID', 'AXIS',
    'LEVEL', 'LVL', 'TOC', 'TOS', 'FFL', 'SSL', 'SFL', 'TYP', 'MIN', 'MAX',
    'BEAM', 'SLAB', 'COL', 'COLUMN', 'FOOTING', 'WALL', 'STAIR', 'NOTE', 'NOTES',
    'DWG', 'DXF', 'CAD', 'NO', 'DATE', 'PROJECT', 'CLIENT', 'REV', 'SHEET',
    'AREA', 'TOTAL', 'DIM', 'DIA', 'PHI', 'R', 'L', 'W', 'H', 'T', 'B', 'M', 'KG', 'CM', 'MM',
]);

export function isLikelyShxArabicLine(line: string): boolean {
    if (!line || /[\u0600-\u06FF]/.test(line)) return false;
    const trimmed = line.trim();
    if (trimmed.length < 2) return false;

    if (/^[\d\s.,+\-*/=():%°⌀×xX]+$/.test(trimmed)) return false;
    if (/^[A-Z]{1,4}\s*[-/]?\s*\d+[A-Z]?$/i.test(trimmed)) return false;

    const upperClean = trimmed.replace(/[^A-Za-z]/g, '').toUpperCase();
    if (STANDARD_ENGLISH_CAD_WORDS.has(upperClean)) return false;

    if (/(Hg|HB|tD|uK|ugD|gH|sL|hJ|dm|km|pm|drG|srT|d>d|d,l|fr'v|lbp\/)/.test(trimmed)) {
        return true;
    }

    if (/[a-z][A-Z]/.test(trimmed)) {
        return true;
    }

    if (/[A-Za-z][\[\]:;,>'`~\/]|[[\]:;,>'`~\/][A-Za-z]/.test(trimmed)) {
        return true;
    }

    return false;
}

function decodeShxWordToken(token: string): string {
    if (/^[\d.,+\-%°⌀]+$/.test(token)) return token;
    if (token === '\\') return '/';
    if (token === '-' || token === '–' || token === '(' || token === ')') return token;

    const unitMatch = token.match(/^([A-Za-z:\[\]]+)(\d+)$/);
    if (unitMatch) {
        return decodeShxWordToken(unitMatch[1]) + unitMatch[2];
    }

    let spaced = token
        .replace(/([^,fgk:\s])(Hg|HB)/g, '$1 $2')
        .replace(/([JLKGTDMUQFPOSAWRYEm;>])(?=[A-Za-z,\[])/g, '$1 ')
        .replace(/(tD|uK|ugD|uk\]|dlL|dlj\])(?=[A-Za-z])/g, '$1 ');

    const subWords = spaced.split(/\s+/);
    const decodedSubWords = subWords.map(sw => {
        let w = sw;
        w = w.replace(/^i\]/, '[i]');
        w = w.replace(/^ugD$/, 'ugN');
        w = w.replace(/^(Hgd|hgd)$/, 'إلى');
        w = w.replace(/^BdrG$/, 'لا يقل');
        w = w.replace(/^HBdrG$/, 'ألا يقل');
        w = w.replace(/^jxHUldU$/, 'يراعى مع');
        w = w.replace(/^jxHU$/, 'يراعى');

        let out = '';
        for (let i = 0; i < w.length; i++) {
            const ch = w[i];
            if (/[\u0600-\u06FF\s\d]/.test(ch)) {
                out += ch;
            } else if (ch === '.' && i > 0 && i < w.length - 1) {
                out += 'ز';
            } else if (SHX_ARABIC_CHAR_MAP[ch] !== undefined) {
                out += SHX_ARABIC_CHAR_MAP[ch];
            } else {
                out += ch;
            }
        }
        return out;
    });

    return decodedSubWords.join(' ');
}

export function decodeShxArabicText(text: string): string {
    if (!text) return '';
    return text
        .split('\n')
        .map(line => {
            if (!isLikelyShxArabicLine(line)) return line;
            const parts = line.split(/(\s+)/);
            return parts
                .map(part => {
                    if (/^\s+$/.test(part)) return part;
                    return decodeShxWordToken(part);
                })
                .join('')
                .replace(/\s{2,}/g, ' ')
                .trim();
        })
        .join('\n');
}

export function cleanCadText(rawText: string): string {
    if (!rawText || typeof rawText !== 'string') return '';
    const cleaned = rawText
        .replace(/\\U\+([0-9A-Fa-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\P/gi, '\n')
        .replace(/\\[LOloKk]/g, '')
        .replace(/\\[Ff][^;\\]*?(?:\|[^;\\]*)*;/g, '')
        .replace(/\\[CcHhWwTtAaQq][^;\\]*;/g, '')
        .replace(/\\p[^;\\]*;/gi, '')
        .replace(/\\S([^;^\\]*)\^([^;\\]*);/g, '$1/$2')
        .replace(/\\[a-zA-Z]+;/g, '')
        .replace(/%%[cC]/g, '⌀')
        .replace(/%%[dD]/g, '°')
        .replace(/%%[pP]/g, '±')
        .replace(/%%[uUoO]/g, '')
        .replace(/%%%/g, '%')
        .replace(/\\~/g, ' ')
        .replace(/\\\\/g, '\\')
        .replace(/[{}]/g, '')
        .trim();
    return decodeShxArabicText(cleaned);
}

// Bulge arc interpolation between two 2D vertices
export function interpolateBulgeArc(
    p1: CadPoint,
    p2: CadPoint,
    bulge: number,
    segments = 14
): CadPoint[] {
    if (!bulge || Math.abs(bulge) < 1e-6) return [];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const chord = Math.hypot(dx, dy);
    if (chord < 1e-9) return [];

    const includedAngle = 4 * Math.atan(bulge);
    const radius = Math.abs(chord / (2 * Math.sin(includedAngle / 2)));
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    const halfAngle = Math.abs(includedAngle / 2);
    const distToCenter = chord / (2 * Math.tan(halfAngle));
    const perpX = -dy / chord;
    const perpY = dx / chord;
    const sign = bulge >= 0 ? 1 : -1;

    const cx = midX + sign * distToCenter * perpX;
    const cy = midY + sign * distToCenter * perpY;

    const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
    const steps = Math.max(4, Math.min(32, Math.ceil((Math.abs(includedAngle) / (Math.PI / 2)) * segments)));
    const pts: CadPoint[] = [];

    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const angle = startAngle + includedAngle * t;
        pts.push({
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
        });
    }
    return pts;
}

export function expandVerticesWithBulge(
    vertices: Array<{ x: number; y: number; bulge?: number }>,
    closed: boolean
): CadPoint[] {
    if (!vertices || vertices.length === 0) return [];
    const pts: CadPoint[] = [];
    const len = vertices.length;
    const count = closed ? len : len - 1;

    for (let i = 0; i < count; i++) {
        const curr = vertices[i];
        const next = vertices[(i + 1) % len];
        if (!Number.isFinite(curr?.x) || !Number.isFinite(curr?.y)) continue;
        pts.push({ x: curr.x, y: curr.y });
        if (curr.bulge && Math.abs(curr.bulge) > 1e-5 && Number.isFinite(next?.x) && Number.isFinite(next?.y)) {
            const arcPts = interpolateBulgeArc(curr, next, curr.bulge);
            pts.push(...arcPts);
        }
    }
    if (!closed && len > 0) {
        const last = vertices[len - 1];
        if (Number.isFinite(last?.x) && Number.isFinite(last?.y)) {
            pts.push({ x: last.x, y: last.y });
        }
    }
    return pts;
}

// Catmull-Rom / De Boor style smooth approximation for spline control points
function approximateSpline(controlPoints: CadPoint[], closed = false): CadPoint[] {
    const valid = (controlPoints || []).filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y));
    if (valid.length <= 2) return valid;
    const result: CadPoint[] = [];
    const steps = 6;
    const n = valid.length;

    for (let i = 0; i < n - 1; i++) {
        const p0 = valid[Math.max(0, i - 1)];
        const p1 = valid[i];
        const p2 = valid[i + 1];
        const p3 = valid[Math.min(n - 1, i + 2)];

        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const t2 = t * t;
            const t3 = t2 * t;
            const x =
                0.5 *
                (2 * p1.x +
                    (-p0.x + p2.x) * t +
                    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
            const y =
                0.5 *
                (2 * p1.y +
                    (-p0.y + p2.y) * t +
                    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
            result.push({ x, y });
        }
    }
    result.push(valid[n - 1]);
    if (closed && result.length > 2) {
        result.push(result[0]);
    }
    return result;
}

interface Transform2D {
    tx: number;
    ty: number;
    sx: number;
    sy: number;
    rot: number; // radians
    baseX: number;
    baseY: number;
}

const IDENTITY_TRANSFORM: Transform2D = {
    tx: 0,
    ty: 0,
    sx: 1,
    sy: 1,
    rot: 0,
    baseX: 0,
    baseY: 0,
};

function applyTransform(pt: CadPoint, tf: Transform2D): CadPoint {
    const dx = (pt.x - tf.baseX) * tf.sx;
    const dy = (pt.y - tf.baseY) * tf.sy;
    const cos = Math.cos(tf.rot);
    const sin = Math.sin(tf.rot);
    return {
        x: tf.tx + dx * cos - dy * sin,
        y: tf.ty + dx * sin + dy * cos,
    };
}

function composeTransforms(parent: Transform2D, child: Transform2D): Transform2D {
    const translatedOrigin = applyTransform({ x: child.tx, y: child.ty }, parent);
    return {
        tx: translatedOrigin.x,
        ty: translatedOrigin.y,
        sx: parent.sx * child.sx,
        sy: parent.sy * child.sy,
        rot: parent.rot + child.rot,
        baseX: child.baseX,
        baseY: child.baseY,
    };
}

function convertBmpToDataUrl(bmpBytes: Uint8Array | null): string | undefined {
    if (!bmpBytes || bmpBytes.byteLength < 32) return undefined;
    try {
        const blob = new Blob([bmpBytes], { type: 'image/bmp' });
        return URL.createObjectURL(blob);
    } catch {
        return undefined;
    }
}

let cachedLibreDwgInstance: any = null;

async function getLibreDwgInstance(): Promise<any> {
    if (cachedLibreDwgInstance) return cachedLibreDwgInstance;
    try {
        cachedLibreDwgInstance = await LibreDwg.create('/wasm');
        return cachedLibreDwgInstance;
    } catch (localErr) {
        console.warn('Local WASM load fallback to CDN:', localErr);
        cachedLibreDwgInstance = await LibreDwg.create(
            'https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.8.8/wasm'
        );
        return cachedLibreDwgInstance;
    }
}

function computeSmartBounds(primitives: CadPrimitive[]): CadBoundingBox {
    const xs: number[] = [];
    const ys: number[] = [];

    const pushPt = (x: number, y: number) => {
        if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 1e11 && Math.abs(y) < 1e11) {
            xs.push(x);
            ys.push(y);
        }
    };

    for (const p of primitives) {
        if (p.kind === 'polyline') {
            for (const pt of p.points) pushPt(pt.x, pt.y);
        } else if (p.kind === 'circle' || p.kind === 'arc') {
            pushPt(p.cx - p.r, p.cy - p.r);
            pushPt(p.cx + p.r, p.cy + p.r);
        } else if (p.kind === 'ellipse') {
            const r = Math.max(p.rx, p.ry);
            pushPt(p.cx - r, p.cy - r);
            pushPt(p.cx + r, p.cy + r);
        } else if (p.kind === 'text' || p.kind === 'point') {
            pushPt(p.x, p.y);
        }
    }

    if (xs.length === 0) {
        return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
    }

    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);

    const n = xs.length;
    let minX = xs[0];
    let maxX = xs[n - 1];
    let minY = ys[0];
    let maxY = ys[n - 1];

    if (n >= 40) {
        const p02X = xs[Math.floor(n * 0.01)];
        const p98X = xs[Math.floor(n * 0.99)];
        const p02Y = ys[Math.floor(n * 0.01)];
        const p98Y = ys[Math.floor(n * 0.99)];

        const coreW = Math.max(1e-3, p98X - p02X);
        const coreH = Math.max(1e-3, p98Y - p02Y);
        const fullW = maxX - minX;
        const fullH = maxY - minY;

        if (fullW > coreW * 6 || fullH > coreH * 6) {
            minX = p02X - coreW * 0.1;
            maxX = p98X + coreW * 0.1;
            minY = p02Y - coreH * 0.1;
            maxY = p98Y + coreH * 0.1;
        }
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    return { minX, minY, maxX, maxY, width, height };
}

interface RawDwgColorInfo {
    colorIndex?: number;
    rgb?: number;
}

// Decode DWG R2000 & R2004+ CMC Color object accurately
// In LibreDWG: 192 (0xC0) = ByLayer, 193 (0xC1) = ByBlock, 194 (0xC2) = TrueColor RGB, 195 (0xC3) = ACI in (rgb & 0xff)
function decodeRawDwgColorObj(c: any, isLayer = false): RawDwgColorInfo {
    if (!c) return { colorIndex: 256 };
    const rgbVal = typeof c.rgb === 'number' ? c.rgb : 0;
    const topByte = (rgbVal >>> 24) & 0xff;
    const method = typeof c.method === 'number' && c.method > 0 ? c.method : topByte;

    if (method === 194 || topByte === 194) {
        return { rgb: rgbVal & 0xffffff, colorIndex: 256 };
    }
    if (method === 195 || topByte === 195) {
        const idx = rgbVal & 0xff;
        if (idx >= 1 && idx <= 255) {
            return { colorIndex: idx };
        }
    }
    if (!isLayer && (method === 192 || topByte === 192)) {
        return { colorIndex: 256 };
    }
    if (!isLayer && (method === 193 || topByte === 193)) {
        return { colorIndex: 0 };
    }
    if (typeof c.index === 'number') {
        const idx = isLayer ? Math.abs(c.index) : c.index;
        if (idx >= 0 && idx <= 256) {
            return { colorIndex: idx };
        }
    }
    return { colorIndex: 256 };
}

function extractRawDwgColorMaps(
    libredwg: any,
    dataPtr: any
): {
    entityColors: Map<string, RawDwgColorInfo>;
    layerColors: Map<string, RawDwgColorInfo>;
} {
    const entityColors = new Map<string, RawDwgColorInfo>();
    const layerColors = new Map<string, RawDwgColorInfo>();
    try {
        const numObjects = libredwg.dwg_get_num_objects(dataPtr);
        for (let i = 0; i < numObjects; i++) {
            const obj = libredwg.dwg_get_object(dataPtr, i);
            if (!obj) continue;
            const supertype = libredwg.dwg_object_get_supertype(obj);
            if (supertype === 1) {
                // DWG_SUPERTYPE_ENTITY
                const etio = libredwg.dwg_object_to_entity_tio(obj);
                if (!etio) continue;
                const hObj = libredwg.dwg_object_entity_get_handle_object(etio);
                const cObj = libredwg.dwg_object_entity_get_color_object(etio);
                if (hObj && hObj.value != null && cObj) {
                    const handleStr = hObj.value.toString(16).toUpperCase();
                    entityColors.set(handleStr, decodeRawDwgColorObj(cObj, false));
                }
            } else if (supertype === 2) {
                // DWG_SUPERTYPE_OBJECT (check if LAYER = 51)
                const fixedType = libredwg.dwg_object_get_fixedtype(obj);
                if (fixedType === 51) {
                    const tio = libredwg.dwg_object_to_object_tio(obj);
                    if (!tio) continue;
                    const name = libredwg.dwg_dynapi_entity_data(tio, 'name');
                    const cObj = libredwg.dwg_dynapi_entity_data(tio, 'color');
                    if (name && cObj) {
                        layerColors.set(name, decodeRawDwgColorObj(cObj, true));
                    }
                }
            }
        }
    } catch (e) {
        console.warn('Raw color extraction fallback:', e);
    }
    return { entityColors, layerColors };
}

// Post-process primitives to detect any exploded dimension lines & start/end ticks/points
function markExplodedDimensions(primitives: CadPrimitive[]) {
    const dimTextPoints: Array<{ x: number; y: number; h: number }> = [];
    const defPoints: CadPoint[] = [];

    for (const p of primitives) {
        if (p.kind === 'point') {
            p.isDimension = true;
            defPoints.push({ x: p.x, y: p.y });
        } else if (p.kind === 'text') {
            const t = p.text.trim();
            // Numeric dimension text e.g. "4.00", "0.25", "1.20 m"
            if (/^\d+([.,]\d+)?(\s*(m|cm|mm|م|سم))?$/i.test(t)) {
                dimTextPoints.push({ x: p.x, y: p.y, h: Math.max(0.08, p.height) });
            }
        }
    }

    if (defPoints.length === 0 && dimTextPoints.length === 0) return;

    // Collect short tick marks (2-point lines or 3/4-point arrow solids with small length)
    const tickEndpoints: CadPoint[] = [...defPoints];
    const shortPolys: Array<{ prim: CadPrimitive & { kind: 'polyline' }; len: number; mid: CadPoint }> = [];

    for (const p of primitives) {
        if (p.kind !== 'polyline' || p.isDimension) continue;
        if (p.points.length >= 2 && p.points.length <= 4) {
            let totalLen = 0;
            for (let i = 0; i < p.points.length - 1; i++) {
                totalLen += Math.hypot(
                    p.points[i + 1].x - p.points[i].x,
                    p.points[i + 1].y - p.points[i].y
                );
            }
            if (totalLen > 1e-4 && totalLen <= 0.45) {
                const mid = {
                    x: (p.points[0].x + p.points[p.points.length - 1].x) / 2,
                    y: (p.points[0].y + p.points[p.points.length - 1].y) / 2,
                };
                shortPolys.push({ prim: p, len: totalLen, mid });
            }
        }
    }

    // Check 2-point lines that start and end at defPoints or near numeric dimension texts
    for (const p of primitives) {
        if (p.kind !== 'polyline' || p.isDimension || p.closed || p.points.length !== 2) continue;
        const a = p.points[0];
        const b = p.points[1];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        if (segLen < 1e-4) continue;

        // Check if endpoints touch a DEFPOINT
        let touchesDefPointA = false;
        let touchesDefPointB = false;
        for (let i = 0; i < defPoints.length; i++) {
            const dp = defPoints[i];
            if (!touchesDefPointA && Math.hypot(dp.x - a.x, dp.y - a.y) < 0.08) {
                touchesDefPointA = true;
            }
            if (!touchesDefPointB && Math.hypot(dp.x - b.x, dp.y - b.y) < 0.08) {
                touchesDefPointB = true;
            }
            if (touchesDefPointA && touchesDefPointB) break;
        }

        // Check if this segment passes right next to a numeric dimension text of matching length or proximity
        let nearDimText = false;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        for (let i = 0; i < dimTextPoints.length; i++) {
            const dt = dimTextPoints[i];
            const distToMid = Math.hypot(dt.x - midX, dt.y - midY);
            if (distToMid <= Math.max(0.6, dt.h * 3.2)) {
                nearDimText = true;
                break;
            }
        }

        // Check if both endpoints have short tick marks crossing them
        let tickAtA: (CadPrimitive & { kind: 'polyline' }) | null = null;
        let tickAtB: (CadPrimitive & { kind: 'polyline' }) | null = null;
        for (let i = 0; i < shortPolys.length; i++) {
            const sp = shortPolys[i];
            if (!tickAtA && Math.hypot(sp.mid.x - a.x, sp.mid.y - a.y) < 0.18) {
                tickAtA = sp.prim;
            }
            if (!tickAtB && Math.hypot(sp.mid.x - b.x, sp.mid.y - b.y) < 0.18) {
                tickAtB = sp.prim;
            }
        }

        if (
            (touchesDefPointA && touchesDefPointB) ||
            (nearDimText && (touchesDefPointA || touchesDefPointB || (tickAtA && tickAtB))) ||
            (tickAtA && tickAtB && nearDimText)
        ) {
            p.isDimension = true;
            if (tickAtA) tickAtA.isDimension = true;
            if (tickAtB) tickAtB.isDimension = true;
            tickEndpoints.push(a, b);
        }
    }

    // Also mark any short tick mark or extension line touching the identified dimension endpoints
    if (tickEndpoints.length > 0) {
        for (const sp of shortPolys) {
            if (sp.prim.isDimension) continue;
            for (let i = 0; i < tickEndpoints.length; i++) {
                const ep = tickEndpoints[i];
                if (Math.hypot(sp.mid.x - ep.x, sp.mid.y - ep.y) < 0.15) {
                    sp.prim.isDimension = true;
                    break;
                }
            }
        }
    }
}

export async function parseCadBuffer(buffer: ArrayBuffer, fileName: string): Promise<CadDocument> {
    const lowerName = (fileName || '').toLowerCase();
    const headerBytes = new Uint8Array(buffer.slice(0, Math.min(64, buffer.byteLength)));
    const headerAscii = Array.from(headerBytes)
        .map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : ' '))
        .join('')
        .trim();

    const isDwgSignature = headerAscii.startsWith('AC10');
    const isDxfExtension = lowerName.endsWith('.dxf') && !isDwgSignature;

    if (isDxfExtension || (!isDwgSignature && headerAscii.includes('SECTION'))) {
        try {
            const decoder = new TextDecoder('utf-8');
            let text = decoder.decode(buffer);
            if (text.includes('\uFFFD')) {
                try {
                    text = new TextDecoder('windows-1256').decode(buffer);
                } catch {}
            }
            const doc = parseDxfText(text);
            if (doc.primitives.length > 0) {
                return doc;
            }
        } catch (dxfErr) {
            console.warn('dxf-parser fallback to LibreDWG:', dxfErr);
        }
    }

    // Parse via LibreDWG WebAssembly (supports DWG and DXF)
    const libredwg = await getLibreDwgInstance();
    const fileType = isDxfExtension ? Dwg_File_Type.DXF : Dwg_File_Type.DWG;
    const dataPtr = libredwg.dwg_read_data(buffer, fileType);
    if (!dataPtr) {
        throw new Error('تعذر قراءة بنية ملف الأوتوكاد (قد يكون الإصدار غير مدعوم أو الملف تالفاً).');
    }

    let embeddedThumbnailUrl: string | undefined;
    try {
        const bmp = libredwg.dwg_bmp(dataPtr);
        embeddedThumbnailUrl = convertBmpToDataUrl(bmp);
    } catch {}

    const rawColorMaps = extractRawDwgColorMaps(libredwg, dataPtr);
    const db = libredwg.convert(dataPtr);
    try {
        libredwg.dwg_free(dataPtr);
    } catch {}

    return convertLibreDwgDatabase(
        db,
        isDxfExtension ? 'DXF' : 'DWG',
        embeddedThumbnailUrl,
        rawColorMaps
    );
}

function isDimensionLayerName(layerName: string): boolean {
    if (!layerName) return false;
    return /(dim|defpoint|anno|leader|ابعاد|أبعاد|مناسيب)/i.test(layerName);
}

function isDimensionBlockName(blockName: string): boolean {
    if (!blockName) return false;
    return /^(\*D|_ARCHTICK|_OBLIQUE|_CLOSED|_OPEN|_DOT|_SMALL|_NONE|_ORIGIN|_BOX|_INTEGRAL|DIM|ARROW|TICK)/i.test(
        blockName
    );
}

function convertLibreDwgDatabase(
    db: any,
    format: 'DWG' | 'DXF',
    embeddedThumbnailUrl?: string,
    rawColorMaps?: {
        entityColors: Map<string, RawDwgColorInfo>;
        layerColors: Map<string, RawDwgColorInfo>;
    }
): CadDocument {
    const layerMap = new Map<string, CadLayer>();
    const blockMap = new Map<string, { entities: any[]; baseX: number; baseY: number }>();

    const rawLayers = db?.tables?.LAYER?.entries || [];
    for (const l of rawLayers) {
        if (!l || !l.name) continue;
        const rawLayerColor = rawColorMaps?.layerColors.get(l.name);
        const effColorIndex =
            rawLayerColor?.colorIndex != null && rawLayerColor.colorIndex !== 256
                ? rawLayerColor.colorIndex
                : l.colorIndex != null
                ? Math.abs(l.colorIndex)
                : 7;

        let resolvedColor = aciToColor(effColorIndex);
        if (rawLayerColor?.rgb != null && rawLayerColor.rgb > 0 && rawLayerColor.rgb < 0xffffff) {
            resolvedColor = { hex: intToHex(rawLayerColor.rgb), isAdaptiveWhite: false };
        } else if (
            l.color != null &&
            l.color > 0 &&
            l.color < 0xffffff &&
            (effColorIndex === 256 || effColorIndex === 0)
        ) {
            resolvedColor = { hex: intToHex(l.color), isAdaptiveWhite: false };
        }

        layerMap.set(l.name, {
            name: l.name,
            colorHex: resolvedColor.hex,
            colorIndex: effColorIndex,
            visible: !l.off && !l.frozen,
            entityCount: 0,
        });
    }

    const ensureLayer = (name: string): CadLayer => {
        const key = name || '0';
        let existing = layerMap.get(key);
        if (!existing) {
            existing = {
                name: key,
                colorHex: '#ffffff',
                colorIndex: 7,
                visible: true,
                entityCount: 0,
            };
            layerMap.set(key, existing);
        }
        return existing;
    };

    ensureLayer('0');

    let modelSpaceEntities: any[] = Array.isArray(db?.entities) ? db.entities : [];
    const blockRecords = db?.tables?.BLOCK_RECORD?.entries || [];
    for (const br of blockRecords) {
        if (!br || !br.name) continue;
        const upper = br.name.toUpperCase();
        if (upper === '*MODEL_SPACE' || upper === '$MODEL_SPACE') {
            if (Array.isArray(br.entities) && br.entities.length > modelSpaceEntities.length) {
                modelSpaceEntities = br.entities;
            }
        } else if (Array.isArray(br.entities)) {
            blockMap.set(br.name, {
                entities: br.entities,
                baseX: br.basePoint?.x || 0,
                baseY: br.basePoint?.y || 0,
            });
        }
    }

    const primitives: CadPrimitive[] = [];
    const snapPoints: CadPoint[] = [];
    const MAX_SNAP_POINTS = 35000;

    const addSnap = (pt: CadPoint) => {
        if (
            snapPoints.length < MAX_SNAP_POINTS &&
            Number.isFinite(pt.x) &&
            Number.isFinite(pt.y)
        ) {
            snapPoints.push(pt);
        }
    };

    const resolveEntityColor = (
        entity: any,
        effectiveLayerName: string,
        parentColor?: { hex: string; isAdaptiveWhite: boolean }
    ): { hex: string; isAdaptiveWhite: boolean } => {
        const handleKey = entity.handle ? String(entity.handle).toUpperCase() : '';
        const rawEntColor = handleKey ? rawColorMaps?.entityColors.get(handleKey) : undefined;

        // 1. TrueColor RGB (method 194)
        const trueRgb = rawEntColor?.rgb ?? (entity.color != null && entity.color < 0xffffff ? entity.color : undefined);
        if (trueRgb != null && trueRgb > 0 && trueRgb < 0xffffff) {
            return { hex: intToHex(trueRgb), isAdaptiveWhite: false };
        }

        // 2. Explicit ACI Color Index on entity (1..255)
        const ci =
            rawEntColor?.colorIndex != null
                ? rawEntColor.colorIndex
                : entity.colorIndex;

        if (ci != null && ci >= 1 && ci <= 255) {
            return aciToColor(ci);
        }

        // 3. ByBlock (0) -> inherit parent block/dimension color if available
        if (ci === 0 && parentColor) {
            return parentColor;
        }

        // 4. ByLayer (256 or default) -> use effective layer's exact color
        const layer = ensureLayer(effectiveLayerName);
        return {
            hex: layer.colorHex,
            isAdaptiveWhite:
                layer.colorIndex === 7 || layer.colorHex.toLowerCase() === '#ffffff',
        };
    };

    const processEntity = (
        entity: any,
        tf: Transform2D,
        inheritedLayer?: string,
        inheritedColor?: { hex: string; isAdaptiveWhite: boolean },
        depth = 0,
        inDimension = false
    ) => {
        if (!entity || entity.isVisible === false || depth > 6) return;

        const rawLayerName = entity.layer || '0';
        const effectiveLayerName =
            rawLayerName === '0' && inheritedLayer ? inheritedLayer : rawLayerName;
        const layerObj = ensureLayer(effectiveLayerName);
        if (depth === 0) {
            layerObj.entityCount++;
        }

        const isDim =
            inDimension ||
            entity.type === 'DIMENSION' ||
            entity.type === 'LEADER' ||
            entity.type === 'MULTILEADER' ||
            entity.type === 'TOLERANCE' ||
            entity.type === 'POINT' ||
            isDimensionLayerName(effectiveLayerName) ||
            isDimensionLayerName(rawLayerName);

        const color = resolveEntityColor(entity, effectiveLayerName, inheritedColor);
        const flipX = entity.extrusionDirection && entity.extrusionDirection.z === -1 ? -1 : 1;
        const localTf: Transform2D =
            flipX === -1
                ? composeTransforms(tf, { tx: 0, ty: 0, sx: -1, sy: 1, rot: 0, baseX: 0, baseY: 0 })
                : tf;
        const avgScale = (Math.abs(localTf.sx) + Math.abs(localTf.sy)) / 2 || 1;

        switch (entity.type) {
            case 'LINE': {
                if (!entity.startPoint || !entity.endPoint) break;
                const p1 = applyTransform(entity.startPoint, localTf);
                const p2 = applyTransform(entity.endPoint, localTf);
                primitives.push({
                    kind: 'polyline',
                    layer: effectiveLayerName,
                    colorHex: color.hex,
                    isAdaptiveWhite: color.isAdaptiveWhite,
                    points: [p1, p2],
                    closed: false,
                    isDimension: isDim,
                });
                addSnap(p1);
                addSnap(p2);
                addSnap({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
                break;
            }
            case 'LWPOLYLINE':
            case 'POLYLINE':
            case 'POLYLINE2D':
            case 'POLYLINE3D': {
                const rawVerts = entity.vertices || [];
                if (rawVerts.length < 2) break;
                const closed = Boolean((entity.flag & 1) || (entity.flag & 0x200));
                const normalizedVerts = rawVerts.map((v: any) => ({
                    x: v.x ?? v.point?.x ?? 0,
                    y: v.y ?? v.point?.y ?? 0,
                    bulge: v.bulge || 0,
                }));
                const expanded = expandVerticesWithBulge(normalizedVerts, closed);
                const transformed = expanded.map(pt => applyTransform(pt, localTf));
                if (transformed.length >= 2) {
                    primitives.push({
                        kind: 'polyline',
                        layer: effectiveLayerName,
                        colorHex: color.hex,
                        isAdaptiveWhite: color.isAdaptiveWhite,
                        points: transformed,
                        closed,
                        isDimension: isDim,
                    });
                    const tfVerts = normalizedVerts.map((v: any) =>
                        applyTransform({ x: v.x, y: v.y }, localTf)
                    );
                    for (let i = 0; i < tfVerts.length; i++) {
                        addSnap(tfVerts[i]);
                        const next = tfVerts[(i + 1) % tfVerts.length];
                        if (closed || i < tfVerts.length - 1) {
                            addSnap({ x: (tfVerts[i].x + next.x) / 2, y: (tfVerts[i].y + next.y) / 2 });
                        }
                    }
                }
                break;
            }
            case 'CIRCLE': {
                if (!entity.center || !entity.radius) break;
                const center = applyTransform(entity.center, localTf);
                const r = entity.radius * avgScale;
                primitives.push({
                    kind: 'circle',
                    layer: effectiveLayerName,
                    colorHex: color.hex,
                    isAdaptiveWhite: color.isAdaptiveWhite,
                    cx: center.x,
                    cy: center.y,
                    r,
                    isDimension: isDim,
                });
                addSnap(center);
                break;
            }
            case 'ARC': {
                if (!entity.center || !entity.radius) break;
                const center = applyTransform(entity.center, localTf);
                const r = entity.radius * avgScale;
                const startAngle = (entity.startAngle || 0) + localTf.rot;
                const endAngle = (entity.endAngle || 0) + localTf.rot;
                primitives.push({
                    kind: 'arc',
                    layer: effectiveLayerName,
                    colorHex: color.hex,
                    isAdaptiveWhite: color.isAdaptiveWhite,
                    cx: center.x,
                    cy: center.y,
                    r,
                    startAngle,
                    endAngle,
                    ccw: localTf.sx * localTf.sy >= 0,
                    isDimension: isDim,
                });
                addSnap({
                    x: center.x + r * Math.cos(startAngle),
                    y: center.y + r * Math.sin(startAngle),
                });
                addSnap({
                    x: center.x + r * Math.cos(endAngle),
                    y: center.y + r * Math.sin(endAngle),
                });
                break;
            }
            case 'ELLIPSE': {
                if (!entity.center || !entity.majorAxisEndPoint) break;
                const center = applyTransform(entity.center, localTf);
                const mx = entity.majorAxisEndPoint.x * localTf.sx;
                const my = entity.majorAxisEndPoint.y * localTf.sy;
                const rx = Math.hypot(mx, my);
                const ry = rx * (entity.axisRatio || 1);
                const rot = Math.atan2(my, mx) + localTf.rot;
                primitives.push({
                    kind: 'ellipse',
                    layer: effectiveLayerName,
                    colorHex: color.hex,
                    isAdaptiveWhite: color.isAdaptiveWhite,
                    cx: center.x,
                    cy: center.y,
                    rx,
                    ry,
                    rotation: rot,
                    startAngle: entity.startAngle ?? 0,
                    endAngle: entity.endAngle ?? Math.PI * 2,
                    isDimension: isDim,
                });
                addSnap(center);
                break;
            }
            case 'SPLINE': {
                const rawPts =
                    entity.controlPoints?.length > 0
                        ? entity.controlPoints
                        : entity.fitPoints || [];
                if (rawPts.length < 2) break;
                const approx = approximateSpline(rawPts, Boolean(entity.flag & 1));
                const transformed = approx.map(p => applyTransform(p, localTf));
                primitives.push({
                    kind: 'polyline',
                    layer: effectiveLayerName,
                    colorHex: color.hex,
                    isAdaptiveWhite: color.isAdaptiveWhite,
                    points: transformed,
                    closed: Boolean(entity.flag & 1),
                    isDimension: isDim,
                });
                break;
            }
            case 'SOLID':
            case '3DFACE':
            case 'TRACE': {
                const corners = [
                    entity.corner1 || entity.firstCorner,
                    entity.corner2 || entity.secondCorner,
                    entity.corner4 || entity.fourthCorner,
                    entity.corner3 || entity.thirdCorner,
                ].filter(Boolean);
                if (corners.length >= 3) {
                    const pts = corners.map(c => applyTransform(c, localTf));
                    primitives.push({
                        kind: 'polyline',
                        layer: effectiveLayerName,
                        colorHex: color.hex,
                        isAdaptiveWhite: color.isAdaptiveWhite,
                        points: pts,
                        closed: true,
                        filled: entity.type === 'SOLID',
                        isDimension: isDim,
                    });
                }
                break;
            }
            case 'LEADER':
            case 'MULTILEADER': {
                const verts = entity.vertices || [];
                if (verts.length >= 2) {
                    const pts = verts.map((v: any) => applyTransform(v, localTf));
                    primitives.push({
                        kind: 'polyline',
                        layer: effectiveLayerName,
                        colorHex: color.hex,
                        isAdaptiveWhite: color.isAdaptiveWhite,
                        points: pts,
                        closed: false,
                        isDimension: true,
                    });
                }
                if (Array.isArray(entity.leaderSections)) {
                    for (const sec of entity.leaderSections) {
                        for (const ll of sec.leaderLines || []) {
                            if (Array.isArray(ll.vertices) && ll.vertices.length >= 2) {
                                primitives.push({
                                    kind: 'polyline',
                                    layer: effectiveLayerName,
                                    colorHex: color.hex,
                                    isAdaptiveWhite: color.isAdaptiveWhite,
                                    points: ll.vertices.map((v: any) => applyTransform(v, localTf)),
                                    closed: false,
                                    isDimension: true,
                                });
                            }
                        }
                    }
                }
                break;
            }
            case 'HATCH': {
                const paths = entity.boundaryPaths || [];
                for (const bp of paths) {
                    if (Array.isArray(bp.vertices) && bp.vertices.length >= 2) {
                        const expanded = expandVerticesWithBulge(bp.vertices, bp.isClosed ?? true);
                        primitives.push({
                            kind: 'polyline',
                            layer: effectiveLayerName,
                            colorHex: color.hex,
                            isAdaptiveWhite: color.isAdaptiveWhite,
                            points: expanded.map(p => applyTransform(p, localTf)),
                            closed: bp.isClosed ?? true,
                            filled: Boolean(entity.solidFill),
                            isDimension: isDim,
                        });
                    } else if (Array.isArray(bp.edges)) {
                        const edgePts: CadPoint[] = [];
                        for (const edge of bp.edges) {
                            if (edge.start && edge.end) {
                                edgePts.push(applyTransform(edge.start, localTf));
                                edgePts.push(applyTransform(edge.end, localTf));
                            }
                        }
                        if (edgePts.length >= 2) {
                            primitives.push({
                                kind: 'polyline',
                                layer: effectiveLayerName,
                                colorHex: color.hex,
                                isAdaptiveWhite: color.isAdaptiveWhite,
                                points: edgePts,
                                closed: true,
                                isDimension: isDim,
                            });
                        }
                    }
                }
                break;
            }
            case 'TEXT':
            case 'ATTRIB':
            case 'ATTDEF': {
                if (entity.type === 'ATTDEF' && depth > 0) break;

                const textBase =
                    entity.text && typeof entity.text === 'object' ? entity.text : entity;
                const rawStr =
                    (typeof textBase.text === 'string' ? textBase.text : '') ||
                    (typeof entity.text === 'string' ? entity.text : '') ||
                    entity.defaultValue ||
                    '';
                const wasShxArabic = isLikelyShxArabicLine(rawStr);
                const text = cleanCadText(rawStr);
                if (!text) break;

                const halign = textBase.halign ?? entity.halign ?? 0;
                const valign = textBase.valign ?? entity.valign ?? 0;
                const startPt = textBase.startPoint || entity.startPoint || entity.insertionPoint;
                const endPt =
                    textBase.endPoint ||
                    entity.endPoint ||
                    entity.alignmentPoint ||
                    textBase.alignmentPoint;
                const hasValidEndPt =
                    endPt &&
                    Number.isFinite(endPt.x) &&
                    Number.isFinite(endPt.y) &&
                    (Math.abs(endPt.x) > 1e-6 || Math.abs(endPt.y) > 1e-6);

                let anchorPt = startPt || endPt;
                if ((halign !== 0 || valign !== 0) && hasValidEndPt) {
                    if ((halign === 3 || halign === 5) && startPt) {
                        anchorPt = {
                            x: (startPt.x + endPt.x) / 2,
                            y: (startPt.y + endPt.y) / 2,
                        };
                    } else {
                        anchorPt = endPt;
                    }
                }
                if (!anchorPt) break;

                const pos = applyTransform(anchorPt, localTf);
                const rawH = textBase.textHeight || entity.textHeight || entity.height || 0.25;
                const height = Math.max(0.02, rawH * avgScale);
                const rot = (textBase.rotation ?? entity.rotation ?? 0) + localTf.rot;
                const rawWidthFactor = textBase.xScale ?? entity.xScale ?? entity.widthFactor ?? 1;
                const widthFactor = Math.max(0.4, Math.min(1.5, rawWidthFactor));

                let align: 'left' | 'center' | 'right' = 'left';
                if (halign === 1 || halign === 4 || halign === 3 || halign === 5) {
                    align = 'center';
                } else if (halign === 2) {
                    align = 'right';
                } else if (wasShxArabic) {
                    align = 'right';
                }

                let vBaseline: 'alphabetic' | 'middle' | 'top' | 'bottom' = 'alphabetic';
                if (valign === 2 || halign === 4) vBaseline = 'middle';
                else if (valign === 3) vBaseline = 'top';
                else if (valign === 1) vBaseline = 'bottom';

                primitives.push({
                    kind: 'text',
                    layer: effectiveLayerName,
                    colorHex: color.hex,
                    isAdaptiveWhite: color.isAdaptiveWhite,
                    x: pos.x,
                    y: pos.y,
                    text,
                    height,
                    rotation: rot,
                    align,
                    valign: vBaseline,
                    widthFactor,
                    isDimension: true,
                });
                break;
            }
            case 'MTEXT': {
                const rawMText = entity.text || '';
                const wasShxArabic = isLikelyShxArabicLine(rawMText);
                const cleaned = cleanCadText(rawMText);
                const pt = entity.insertionPoint || entity.startPoint;
                if (!cleaned || !pt) break;
                const pos = applyTransform(pt, localTf);
                const height = Math.max(0.02, (entity.textHeight || entity.height || 0.25) * avgScale);
                const rot = (entity.rotation || 0) + localTf.rot;
                let align: 'left' | 'center' | 'right' = wasShxArabic ? 'right' : 'left';
                const ap = entity.attachmentPoint;
                if (ap === 2 || ap === 5 || ap === 8) align = 'center';
                else if (ap === 3 || ap === 6 || ap === 9) align = 'right';

                const lines = cleaned.split('\n').filter(Boolean);
                lines.forEach((line, idx) => {
                    primitives.push({
                        kind: 'text',
                        layer: effectiveLayerName,
                        colorHex: color.hex,
                        isAdaptiveWhite: color.isAdaptiveWhite,
                        x: pos.x,
                        y: pos.y - idx * height * 1.35,
                        text: line,
                        height,
                        rotation: rot,
                        align,
                        isDimension: true,
                    });
                });
                break;
            }
            case 'ACAD_TABLE':
            case 'TABLE': {
                const startPt = entity.startPoint || entity.insertionPoint;
                const rowHeights: number[] = entity.rowHeightArr || [];
                const colWidths: number[] = entity.columnWidthArr || [];
                const cells: any[] = entity.cells || [];
                if (startPt && rowHeights.length > 0 && colWidths.length > 0) {
                    let currY = startPt.y;
                    const totalW = colWidths.reduce((s, w) => s + w, 0);
                    const totalH = rowHeights.reduce((s, h) => s + h, 0);
                    for (let r = 0; r < rowHeights.length; r++) {
                        const rh = rowHeights[r];
                        let currX = startPt.x;
                        for (let c = 0; c < colWidths.length; c++) {
                            const cw = colWidths[c];
                            const cell = cells[r * colWidths.length + c];
                            const pTL = applyTransform({ x: currX, y: currY }, localTf);
                            const pTR = applyTransform({ x: currX + cw, y: currY }, localTf);
                            const pBR = applyTransform({ x: currX + cw, y: currY - rh }, localTf);
                            const pBL = applyTransform({ x: currX, y: currY - rh }, localTf);
                            primitives.push({
                                kind: 'polyline',
                                layer: effectiveLayerName,
                                colorHex: color.hex,
                                isAdaptiveWhite: color.isAdaptiveWhite,
                                points: [pTL, pTR, pBR, pBL],
                                closed: true,
                                isDimension: isDim,
                            });
                            if (cell?.text) {
                                const cellText = cleanCadText(String(cell.text));
                                if (cellText) {
                                    const centerPt = applyTransform(
                                        { x: currX + cw / 2, y: currY - rh / 2 },
                                        localTf
                                    );
                                    const th = Math.max(
                                        0.02,
                                        (cell.textHeight || rh * 0.35) * avgScale
                                    );
                                    primitives.push({
                                        kind: 'text',
                                        layer: effectiveLayerName,
                                        colorHex: color.hex,
                                        isAdaptiveWhite: color.isAdaptiveWhite,
                                        x: centerPt.x,
                                        y: centerPt.y,
                                        text: cellText,
                                        height: th,
                                        rotation: localTf.rot,
                                        align: 'center',
                                        valign: 'middle',
                                        isDimension: true,
                                    });
                                }
                            }
                            currX += cw;
                        }
                        currY -= rh;
                    }
                    addSnap(applyTransform(startPt, localTf));
                    addSnap(
                        applyTransform({ x: startPt.x + totalW, y: startPt.y - totalH }, localTf)
                    );
                }
                break;
            }
            case 'INSERT': {
                const block = blockMap.get(entity.name);
                const childIsDim = isDim || isDimensionBlockName(entity.name);
                if (block && entity.insertionPoint) {
                    const childTf: Transform2D = {
                        tx: entity.insertionPoint.x,
                        ty: entity.insertionPoint.y,
                        sx: entity.xScale ?? 1,
                        sy: entity.yScale ?? 1,
                        rot: entity.rotation || 0,
                        baseX: block.baseX,
                        baseY: block.baseY,
                    };
                    const combinedTf = composeTransforms(localTf, childTf);
                    for (const sub of block.entities) {
                        processEntity(
                            sub,
                            combinedTf,
                            effectiveLayerName,
                            color,
                            depth + 1,
                            childIsDim
                        );
                    }
                }
                if (Array.isArray(entity.attribs) && entity.attribs.length > 0) {
                    for (const attr of entity.attribs) {
                        processEntity(
                            attr,
                            localTf,
                            effectiveLayerName,
                            color,
                            depth + 1,
                            childIsDim
                        );
                    }
                }
                break;
            }
            case 'DIMENSION': {
                const block = entity.name ? blockMap.get(entity.name) : null;
                if (block && block.entities.length > 0) {
                    for (const sub of block.entities) {
                        processEntity(sub, localTf, effectiveLayerName, color, depth + 1, true);
                    }
                } else {
                    const p1 = entity.subDefinitionPoint1;
                    const p2 = entity.subDefinitionPoint2 || entity.definitionPoint;
                    let dimLen = 2.0;
                    if (p1 && p2) {
                        const tp1 = applyTransform(p1, localTf);
                        const tp2 = applyTransform(p2, localTf);
                        dimLen = Math.hypot(tp2.x - tp1.x, tp2.y - tp1.y) || 2.0;
                        primitives.push({
                            kind: 'polyline',
                            layer: effectiveLayerName,
                            colorHex: color.hex,
                            isAdaptiveWhite: color.isAdaptiveWhite,
                            points: [tp1, tp2],
                            closed: false,
                            isDimension: true,
                        });
                        addSnap(tp1);
                        addSnap(tp2);
                    }
                    const tPt = entity.textPoint || entity.definitionPoint;
                    const rawDimText =
                        entity.text && entity.text !== '<>'
                            ? cleanCadText(entity.text)
                            : entity.measurement != null
                            ? Number(entity.measurement).toFixed(2)
                            : '';
                    if (tPt && rawDimText) {
                        const pos = applyTransform(tPt, localTf);
                        const dimTextHeight = Math.max(
                            0.06,
                            Math.min(2.5 * avgScale, dimLen * 0.12)
                        );
                        primitives.push({
                            kind: 'text',
                            layer: effectiveLayerName,
                            colorHex: color.hex,
                            isAdaptiveWhite: color.isAdaptiveWhite,
                            x: pos.x,
                            y: pos.y,
                            text: rawDimText,
                            height: dimTextHeight,
                            rotation: (entity.textRotation || 0) + localTf.rot,
                            align: 'center',
                            valign: 'middle',
                            isDimension: true,
                        });
                    }
                }
                break;
            }
            case 'POINT': {
                const pt = entity.position || entity.location || entity.startPoint;
                if (pt) {
                    const pos = applyTransform(pt, localTf);
                    primitives.push({
                        kind: 'point',
                        layer: effectiveLayerName,
                        colorHex: color.hex,
                        isAdaptiveWhite: color.isAdaptiveWhite,
                        x: pos.x,
                        y: pos.y,
                        isDimension: true,
                    });
                    addSnap(pos);
                }
                break;
            }
            default:
                break;
        }
    };

    for (const ent of modelSpaceEntities) {
        processEntity(ent, IDENTITY_TRANSFORM);
    }

    // Mark any exploded dimensions (dimension lines + start/end ticks + defpoints)
    markExplodedDimensions(primitives);

    const layers = Array.from(layerMap.values()).filter(
        l => l.entityCount > 0 || l.name === '0'
    );
    const bounds = computeSmartBounds(primitives);

    return {
        format,
        layers,
        primitives,
        snapPoints,
        bounds,
        embeddedThumbnailUrl,
        totalEntities: primitives.length,
    };
}

export function parseDxfText(dxfText: string): CadDocument {
    const parser = new DxfParser();
    const dxf = parser.parseSync(dxfText);
    if (!dxf) {
        throw new Error('تعذر تحليل ملف DXF');
    }

    const layerMap = new Map<string, CadLayer>();
    const rawLayers = dxf.tables?.layer?.layers || {};
    for (const key of Object.keys(rawLayers)) {
        const l = rawLayers[key];
        const aci = l.colorIndex != null ? Math.abs(l.colorIndex) : 7;
        const resolved =
            l.color && l.color > 0 && l.color < 0xffffff && (aci === 256 || aci === 0)
                ? { hex: intToHex(l.color), isAdaptiveWhite: false }
                : aciToColor(aci);
        layerMap.set(l.name || key, {
            name: l.name || key,
            colorHex: resolved.hex,
            colorIndex: aci,
            visible: l.visible !== false && !l.frozen,
            entityCount: 0,
        });
    }

    const ensureLayer = (name: string): CadLayer => {
        const key = name || '0';
        let existing = layerMap.get(key);
        if (!existing) {
            existing = {
                name: key,
                colorHex: '#ffffff',
                colorIndex: 7,
                visible: true,
                entityCount: 0,
            };
            layerMap.set(key, existing);
        }
        return existing;
    };
    ensureLayer('0');

    const blocks = dxf.blocks || {};
    const primitives: CadPrimitive[] = [];
    const snapPoints: CadPoint[] = [];
    const MAX_SNAP_POINTS = 15000;

    const addSnap = (pt: CadPoint) => {
        if (snapPoints.length < MAX_SNAP_POINTS && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
            snapPoints.push(pt);
        }
    };

    const resolveDxfColor = (
        entity: any,
        layerName: string,
        parentColor?: { hex: string; isAdaptiveWhite: boolean }
    ) => {
        if (entity.colorIndex != null && entity.colorIndex >= 1 && entity.colorIndex <= 255) {
            return aciToColor(entity.colorIndex);
        }
        if (entity.color && entity.color > 0 && entity.color < 0xffffff && entity.colorIndex !== 7) {
            return { hex: intToHex(entity.color), isAdaptiveWhite: false };
        }
        if (entity.colorIndex === 0 && parentColor) return parentColor;
        const layer = ensureLayer(layerName);
        return {
            hex: layer.colorHex,
            isAdaptiveWhite: layer.colorIndex === 7 || layer.colorHex.toLowerCase() === '#ffffff',
        };
    };

    const processDxfEntity = (
        entity: any,
        tf: Transform2D,
        inheritedLayer?: string,
        inheritedColor?: { hex: string; isAdaptiveWhite: boolean },
        depth = 0,
        inDimension = false
    ) => {
        if (!entity || entity.visible === false || depth > 6) return;
        const rawLayer = entity.layer || '0';
        const effectiveLayer = rawLayer === '0' && inheritedLayer ? inheritedLayer : rawLayer;
        const layerObj = ensureLayer(effectiveLayer);
        if (depth === 0) layerObj.entityCount++;

        const isDim =
            inDimension ||
            entity.type === 'DIMENSION' ||
            entity.type === 'LEADER' ||
            entity.type === 'MULTILEADER' ||
            entity.type === 'POINT' ||
            isDimensionLayerName(effectiveLayer) ||
            isDimensionLayerName(rawLayer);

        const color = resolveDxfColor(entity, effectiveLayer, inheritedColor);
        const avgScale = (Math.abs(tf.sx) + Math.abs(tf.sy)) / 2 || 1;

        switch (entity.type) {
            case 'LINE': {
                const v = entity.vertices || [entity.startPoint, entity.endPoint].filter(Boolean);
                if (v.length >= 2) {
                    const p1 = applyTransform(v[0], tf);
                    const p2 = applyTransform(v[1], tf);
                    primitives.push({
                        kind: 'polyline',
                        layer: effectiveLayer,
                        colorHex: color.hex,
                        isAdaptiveWhite: color.isAdaptiveWhite,
                        points: [p1, p2],
                        closed: false,
                        isDimension: isDim,
                    });
                    addSnap(p1);
                    addSnap(p2);
                }
                break;
            }
            case 'LWPOLYLINE':
            case 'POLYLINE': {
                const verts = entity.vertices || [];
                if (verts.length < 2) break;
                const closed = Boolean(entity.shape || entity.closed);
                const expanded = expandVerticesWithBulge(verts, closed);
                primitives.push({
                    kind: 'polyline',
                    layer: effectiveLayer,
                    colorHex: color.hex,
                    isAdaptiveWhite: color.isAdaptiveWhite,
                    points: expanded.map(p => applyTransform(p, tf)),
                    closed,
                    isDimension: isDim,
                });
                for (const v of verts) addSnap(applyTransform(v, tf));
                break;
            }
            case 'CIRCLE': {
                if (!entity.center || !entity.radius) break;
                const c = applyTransform(entity.center, tf);
                primitives.push({
                    kind: 'circle',
                    layer: effectiveLayer,
                    colorHex: color.hex,
                    isAdaptiveWhite: color.isAdaptiveWhite,
                    cx: c.x,
                    cy: c.y,
                    r: entity.radius * avgScale,
                    isDimension: isDim,
                });
                addSnap(c);
                break;
            }
            case 'ARC': {
                if (!entity.center || !entity.radius) break;
                const c = applyTransform(entity.center, tf);
                const toRad = (a: number) => (Math.abs(a) > Math.PI * 2 + 0.01 ? (a * Math.PI) / 180 : a);
                const sa = toRad(entity.startAngle || 0) + tf.rot;
                const ea = toRad(entity.endAngle || 0) + tf.rot;
                const r = entity.radius * avgScale;
                primitives.push({
                    kind: 'arc',
                    layer: effectiveLayer,
                    colorHex: color.hex,
                    isAdaptiveWhite: color.isAdaptiveWhite,
                    cx: c.x,
                    cy: c.y,
                    r,
                    startAngle: sa,
                    endAngle: ea,
                    ccw: true,
                    isDimension: isDim,
                });
                break;
            }
            case 'ELLIPSE': {
                if (!entity.center || !entity.majorAxisEndPoint) break;
                const c = applyTransform(entity.center, tf);
                const mx = entity.majorAxisEndPoint.x * tf.sx;
                const my = entity.majorAxisEndPoint.y * tf.sy;
                const rx = Math.hypot(mx, my);
                const ry = rx * (entity.axisRatio || 1);
                const rot = Math.atan2(my, mx) + tf.rot;
                primitives.push({
                    kind: 'ellipse',
                    layer: effectiveLayer,
                    colorHex: color.hex,
                    isAdaptiveWhite: color.isAdaptiveWhite,
                    cx: c.x,
                    cy: c.y,
                    rx,
                    ry,
                    rotation: rot,
                    startAngle: entity.startAngle ?? 0,
                    endAngle: entity.endAngle ?? Math.PI * 2,
                    isDimension: isDim,
                });
                break;
            }
            case 'SPLINE': {
                const rawPts = entity.controlPoints || entity.fitPoints || [];
                if (rawPts.length >= 2) {
                    const approx = approximateSpline(rawPts, Boolean(entity.closed));
                    primitives.push({
                        kind: 'polyline',
                        layer: effectiveLayer,
                        colorHex: color.hex,
                        isAdaptiveWhite: color.isAdaptiveWhite,
                        points: approx.map(p => applyTransform(p, tf)),
                        closed: Boolean(entity.closed),
                        isDimension: isDim,
                    });
                }
                break;
            }
            case 'SOLID':
            case '3DFACE': {
                const pts = (entity.points || []).filter(Boolean);
                if (pts.length >= 3) {
                    const ordered = pts.length === 4 ? [pts[0], pts[1], pts[3], pts[2]] : pts;
                    primitives.push({
                        kind: 'polyline',
                        layer: effectiveLayer,
                        colorHex: color.hex,
                        isAdaptiveWhite: color.isAdaptiveWhite,
                        points: ordered.map((p: any) => applyTransform(p, tf)),
                        closed: true,
                        filled: entity.type === 'SOLID',
                        isDimension: isDim,
                    });
                }
                break;
            }
            case 'TEXT':
            case 'MTEXT':
            case 'ATTRIB': {
                const rawStr = entity.text || '';
                const wasShxArabic = isLikelyShxArabicLine(rawStr);
                const cleaned = cleanCadText(rawStr);
                const halign = entity.halign ?? 0;
                const valign = entity.valign ?? 0;
                const startPt = entity.startPoint || entity.position;
                const endPt = entity.endPoint;
                const pt =
                    (halign !== 0 || valign !== 0) &&
                    endPt &&
                    (Math.abs(endPt.x) > 1e-6 || Math.abs(endPt.y) > 1e-6)
                        ? endPt
                        : startPt;
                if (!cleaned || !pt) break;
                const pos = applyTransform(pt, tf);
                const height = Math.max(0.02, (entity.textHeight || entity.height || 0.25) * avgScale);
                const rotRad = ((entity.rotation || 0) * Math.PI) / 180 + tf.rot;
                let align: 'left' | 'center' | 'right' = wasShxArabic ? 'right' : 'left';
                if (halign === 1 || halign === 4) align = 'center';
                else if (halign === 2) align = 'right';

                const lines = cleaned.split('\n').filter(Boolean);
                lines.forEach((line, idx) => {
                    primitives.push({
                        kind: 'text',
                        layer: effectiveLayer,
                        colorHex: color.hex,
                        isAdaptiveWhite: color.isAdaptiveWhite,
                        x: pos.x,
                        y: pos.y - idx * height * 1.35,
                        text: line,
                        height,
                        rotation: rotRad,
                        align,
                        isDimension: true,
                    });
                });
                break;
            }
            case 'INSERT': {
                const block = blocks[entity.name];
                if (!block || !Array.isArray(block.entities) || !entity.position) break;
                const childIsDim = isDim || isDimensionBlockName(entity.name);
                const childTf: Transform2D = {
                    tx: entity.position.x,
                    ty: entity.position.y,
                    sx: entity.xScale ?? 1,
                    sy: entity.yScale ?? 1,
                    rot: ((entity.rotation || 0) * Math.PI) / 180,
                    baseX: block.position?.x || 0,
                    baseY: block.position?.y || 0,
                };
                const combined = composeTransforms(tf, childTf);
                for (const sub of block.entities) {
                    processDxfEntity(sub, combined, effectiveLayer, color, depth + 1, childIsDim);
                }
                break;
            }
            case 'DIMENSION': {
                const block = entity.block ? blocks[entity.block] : null;
                if (block && Array.isArray(block.entities)) {
                    for (const sub of block.entities) {
                        processDxfEntity(sub, tf, effectiveLayer, color, depth + 1, true);
                    }
                }
                break;
            }
            default:
                break;
        }
    };

    for (const ent of dxf.entities || []) {
        processDxfEntity(ent, IDENTITY_TRANSFORM);
    }

    markExplodedDimensions(primitives);

    const layers = Array.from(layerMap.values()).filter(l => l.entityCount > 0 || l.name === '0');
    const bounds = computeSmartBounds(primitives);

    return {
        format: 'DXF',
        layers,
        primitives,
        snapPoints,
        bounds,
        totalEntities: primitives.length,
    };
}

// Generate a rich interactive Structural Foundations & Axes CAD sample if the user wants to test or if a placeholder file has no binary content
export function createSampleStructuralCadDocument(drawingTitle = 'مخطط المحاور والقواعد المسلحة'): CadDocument {
    const layers: CadLayer[] = [
        { name: 'A-GRID (المحاور)', colorHex: '#ef4444', colorIndex: 1, visible: true, entityCount: 18 },
        { name: 'S-COLS (الأعمدة الخرسانية)', colorHex: '#22c55e', colorIndex: 3, visible: true, entityCount: 16 },
        { name: 'S-FOOT (القواعد المسلحة)', colorHex: '#eab308', colorIndex: 2, visible: true, entityCount: 16 },
        { name: 'S-PC (الخرسانة العادية)', colorHex: '#38bdf8', colorIndex: 4, visible: true, entityCount: 16 },
        { name: 'S-BEAM (الميدات والشدادات)', colorHex: '#c084fc', colorIndex: 6, visible: true, entityCount: 24 },
        { name: 'A-DIMS (الأبعاد والمناسيب)', colorHex: '#ffffff', colorIndex: 7, visible: true, entityCount: 30 },
    ];

    const primitives: CadPrimitive[] = [];
    const snapPoints: CadPoint[] = [];

    const xCoords = [0, 5.0, 10.5, 16.0];
    const yCoords = [0, 4.5, 9.0, 13.5];
    const xLabels = ['A', 'B', 'C', 'D'];
    const yLabels = ['1', '2', '3', '4'];

    xCoords.forEach((x, i) => {
        primitives.push({
            kind: 'polyline',
            layer: 'A-GRID (المحاور)',
            colorHex: '#ef4444',
            isAdaptiveWhite: false,
            points: [{ x, y: -2.2 }, { x, y: 15.7 }],
            closed: false,
            dashed: true,
        });
        primitives.push({
            kind: 'circle',
            layer: 'A-GRID (المحاور)',
            colorHex: '#ef4444',
            isAdaptiveWhite: false,
            cx: x,
            cy: 16.3,
            r: 0.55,
        });
        primitives.push({
            kind: 'text',
            layer: 'A-GRID (المحاور)',
            colorHex: '#ef4444',
            isAdaptiveWhite: false,
            x,
            y: 16.15,
            text: xLabels[i],
            height: 0.45,
            rotation: 0,
            align: 'center',
        });
    });

    yCoords.forEach((y, j) => {
        primitives.push({
            kind: 'polyline',
            layer: 'A-GRID (المحاور)',
            colorHex: '#ef4444',
            isAdaptiveWhite: false,
            points: [{ x: -2.2, y }, { x: 18.2, y }],
            closed: false,
            dashed: true,
        });
        primitives.push({
            kind: 'circle',
            layer: 'A-GRID (المحاور)',
            colorHex: '#ef4444',
            isAdaptiveWhite: false,
            cx: -2.8,
            cy: y,
            r: 0.55,
        });
        primitives.push({
            kind: 'text',
            layer: 'A-GRID (المحاور)',
            colorHex: '#ef4444',
            isAdaptiveWhite: false,
            x: -2.8,
            y: y - 0.15,
            text: yLabels[j],
            height: 0.45,
            rotation: 0,
            align: 'center',
        });
    });

    const addRect = (
        layer: string,
        colorHex: string,
        cx: number,
        cy: number,
        w: number,
        h: number,
        filled = false
    ) => {
        const hw = w / 2;
        const hh = h / 2;
        const pts = [
            { x: cx - hw, y: cy - hh },
            { x: cx + hw, y: cy - hh },
            { x: cx + hw, y: cy + hh },
            { x: cx - hw, y: cy + hh },
        ];
        primitives.push({
            kind: 'polyline',
            layer,
            colorHex,
            isAdaptiveWhite: false,
            points: pts,
            closed: true,
            filled,
        });
        pts.forEach(p => snapPoints.push(p));
    };

    xCoords.forEach((x, xi) => {
        yCoords.forEach((y, yi) => {
            snapPoints.push({ x, y });
            const isInterior = xi > 0 && xi < 3 && yi > 0 && yi < 3;
            const rcW = isInterior ? 2.4 : 1.9;
            const rcH = isInterior ? 2.2 : 1.8;
            const pcW = rcW + 0.6;
            const pcH = rcH + 0.6;

            addRect('S-PC (الخرسانة العادية)', '#38bdf8', x, y, pcW, pcH);
            addRect('S-FOOT (القواعد المسلحة)', '#eab308', x, y, rcW, rcH);
            addRect('S-COLS (الأعمدة الخرسانية)', '#22c55e', x, y, 0.35, 0.7, true);

            primitives.push({
                kind: 'text',
                layer: 'A-DIMS (الأبعاد والمناسيب)',
                colorHex: '#ffffff',
                isAdaptiveWhite: true,
                x: x + rcW / 2 - 0.15,
                y: y + rcH / 2 - 0.35,
                text: isInterior ? 'F2 - C2' : 'F1 - C1',
                height: 0.24,
                rotation: 0,
                align: 'right',
                isDimension: true,
            });
        });
    });

    for (let xi = 0; xi < xCoords.length; xi++) {
        for (let yi = 0; yi < yCoords.length - 1; yi++) {
            const x = xCoords[xi];
            const y1 = yCoords[yi] + 0.9;
            const y2 = yCoords[yi + 1] - 0.9;
            primitives.push({
                kind: 'polyline',
                layer: 'S-BEAM (الميدات والشدادات)',
                colorHex: '#c084fc',
                isAdaptiveWhite: false,
                points: [{ x: x - 0.15, y: y1 }, { x: x - 0.15, y: y2 }],
                closed: false,
            });
            primitives.push({
                kind: 'polyline',
                layer: 'S-BEAM (الميدات والشدادات)',
                colorHex: '#c084fc',
                isAdaptiveWhite: false,
                points: [{ x: x + 0.15, y: y1 }, { x: x + 0.15, y: y2 }],
                closed: false,
            });
        }
    }

    for (let yi = 0; yi < yCoords.length; yi++) {
        for (let xi = 0; xi < xCoords.length - 1; xi++) {
            const y = yCoords[yi];
            const x1 = xCoords[xi] + 0.95;
            const x2 = xCoords[xi + 1] - 0.95;
            primitives.push({
                kind: 'polyline',
                layer: 'S-BEAM (الميدات والشدادات)',
                colorHex: '#c084fc',
                isAdaptiveWhite: false,
                points: [{ x: x1, y: y - 0.15 }, { x: x2, y: y - 0.15 }],
                closed: false,
            });
            primitives.push({
                kind: 'polyline',
                layer: 'S-BEAM (الميدات والشدادات)',
                colorHex: '#c084fc',
                isAdaptiveWhite: false,
                points: [{ x: x1, y: y + 0.15 }, { x: x2, y: y + 0.15 }],
                closed: false,
            });
        }
    }

    for (let i = 0; i < xCoords.length - 1; i++) {
        const x1 = xCoords[i];
        const x2 = xCoords[i + 1];
        const mid = (x1 + x2) / 2;
        primitives.push({
            kind: 'polyline',
            layer: 'A-DIMS (الأبعاد والمناسيب)',
            colorHex: '#ffffff',
            isAdaptiveWhite: true,
            points: [{ x: x1, y: 14.9 }, { x: x2, y: 14.9 }],
            closed: false,
            isDimension: true,
        });
        primitives.push({
            kind: 'text',
            layer: 'A-DIMS (الأبعاد والمناسيب)',
            colorHex: '#ffffff',
            isAdaptiveWhite: true,
            x: mid,
            y: 15.05,
            text: `${(x2 - x1).toFixed(2)} m`,
            height: 0.32,
            rotation: 0,
            align: 'center',
            isDimension: true,
        });
    }

    for (let j = 0; j < yCoords.length - 1; j++) {
        const y1 = yCoords[j];
        const y2 = yCoords[j + 1];
        const mid = (y1 + y2) / 2;
        primitives.push({
            kind: 'polyline',
            layer: 'A-DIMS (الأبعاد والمناسيب)',
            colorHex: '#ffffff',
            isAdaptiveWhite: true,
            points: [{ x: 17.4, y: y1 }, { x: 17.4, y: y2 }],
            closed: false,
            isDimension: true,
        });
        primitives.push({
            kind: 'text',
            layer: 'A-DIMS (الأبعاد والمناسيب)',
            colorHex: '#ffffff',
            isAdaptiveWhite: true,
            x: 17.85,
            y: mid,
            text: `${(y2 - y1).toFixed(2)} m`,
            height: 0.32,
            rotation: 0,
            align: 'center',
            isDimension: true,
        });
    }

    primitives.push({
        kind: 'text',
        layer: 'A-DIMS (الأبعاد والمناسيب)',
        colorHex: '#ffffff',
        isAdaptiveWhite: true,
        x: 8.0,
        y: -2.9,
        text: `${drawingTitle} - SCALE 1:100`,
        height: 0.45,
        rotation: 0,
        align: 'center',
        isDimension: true,
    });

    return {
        format: 'DWG',
        layers,
        primitives,
        snapPoints,
        bounds: computeSmartBounds(primitives),
        totalEntities: primitives.length,
    };
}
