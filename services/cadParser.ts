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
      }
    | {
          kind: 'circle';
          layer: string;
          colorHex: string;
          isAdaptiveWhite: boolean;
          cx: number;
          cy: number;
          r: number;
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
      }
    | {
          kind: 'point';
          layer: string;
          colorHex: string;
          isAdaptiveWhite: boolean;
          x: number;
          y: number;
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
    if (aci == null || aci === 7 || aci === 256 || aci === 0 || aci < 0 || aci > 255) {
        return { hex: '#ffffff', isAdaptiveWhite: true };
    }
    const rgb = ACI_PALETTE[Math.abs(aci)] ?? 0xffffff;
    if (rgb === 0xffffff || rgb === 0x000000) {
        return { hex: '#ffffff', isAdaptiveWhite: true };
    }
    return { hex: intToHex(rgb), isAdaptiveWhite: false };
}

export function cleanCadText(rawText: string): string {
    if (!rawText || typeof rawText !== 'string') return '';
    return rawText
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

    // If we have enough points, check if extreme 1% points are massive outliers (e.g. stray point at (0,0) when site coordinates are 500,000)
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
            // If Arabic Windows-1256 characters exist in older DXF files and UTF-8 produced replacement chars
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

    const db = libredwg.convert(dataPtr);
    try {
        libredwg.dwg_free(dataPtr);
    } catch {}

    return convertLibreDwgDatabase(db, isDxfExtension ? 'DXF' : 'DWG', embeddedThumbnailUrl);
}

function convertLibreDwgDatabase(
    db: any,
    format: 'DWG' | 'DXF',
    embeddedThumbnailUrl?: string
): CadDocument {
    const layerMap = new Map<string, CadLayer>();
    const blockMap = new Map<string, { entities: any[]; baseX: number; baseY: number }>();

    const rawLayers = db?.tables?.LAYER?.entries || [];
    for (const l of rawLayers) {
        if (!l || !l.name) continue;
        let resolvedColor = aciToColor(l.colorIndex);
        if (l.color && l.color > 0 && l.color <= 0xffffff && l.colorIndex !== 7) {
            resolvedColor = { hex: intToHex(l.color), isAdaptiveWhite: l.color === 0xffffff };
        }
        layerMap.set(l.name, {
            name: l.name,
            colorHex: resolvedColor.hex,
            colorIndex: l.colorIndex ?? 7,
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
    const MAX_SNAP_POINTS = 15000;

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
        // Direct RGB color
        if (
            entity.color != null &&
            entity.color > 0 &&
            entity.color <= 0xffffff &&
            entity.colorIndex !== 256 &&
            entity.colorIndex !== 0 &&
            entity.colorIndex !== 7
        ) {
            return { hex: intToHex(entity.color), isAdaptiveWhite: entity.color === 0xffffff };
        }
        const ci = entity.colorIndex;
        if (ci === 0 && parentColor) {
            return parentColor;
        }
        if (ci == null || ci === 256 || ci === 0) {
            const layer = ensureLayer(effectiveLayerName);
            return {
                hex: layer.colorHex,
                isAdaptiveWhite: layer.colorIndex === 7 || layer.colorHex.toLowerCase() === '#ffffff',
            };
        }
        return aciToColor(ci);
    };

    const processEntity = (
        entity: any,
        tf: Transform2D,
        inheritedLayer?: string,
        inheritedColor?: { hex: string; isAdaptiveWhite: boolean },
        depth = 0
    ) => {
        if (!entity || entity.isVisible === false || depth > 6) return;

        const rawLayerName = entity.layer || '0';
        const effectiveLayerName =
            rawLayerName === '0' && inheritedLayer ? inheritedLayer : rawLayerName;
        const layerObj = ensureLayer(effectiveLayerName);
        if (depth === 0) {
            layerObj.entityCount++;
        }

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
                });
                addSnap(p1);
                addSnap(p2);
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
                    });
                    for (const v of normalizedVerts) {
                        addSnap(applyTransform({ x: v.x, y: v.y }, localTf));
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
                    });
                }
                break;
            }
            case 'LEADER': {
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
                    });
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
                            });
                        }
                    }
                }
                break;
            }
            case 'TEXT':
            case 'ATTRIB':
            case 'ATTDEF': {
                const rawStr = entity.text || entity.defaultValue || '';
                const text = cleanCadText(rawStr);
                const pt = entity.startPoint || entity.insertionPoint || entity.endPoint;
                if (!text || !pt) break;
                const pos = applyTransform(pt, localTf);
                const height = Math.max(0.05, (entity.textHeight || entity.height || 2.5) * avgScale);
                const rot = (entity.rotation || 0) + localTf.rot;
                let align: 'left' | 'center' | 'right' = 'left';
                if (entity.halign === 1 || entity.halign === 4) align = 'center';
                else if (entity.halign === 2) align = 'right';

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
                });
                break;
            }
            case 'MTEXT': {
                const cleaned = cleanCadText(entity.text || '');
                const pt = entity.insertionPoint || entity.startPoint;
                if (!cleaned || !pt) break;
                const pos = applyTransform(pt, localTf);
                const height = Math.max(0.05, (entity.textHeight || entity.height || 2.5) * avgScale);
                const rot = (entity.rotation || 0) + localTf.rot;
                let align: 'left' | 'center' | 'right' = 'left';
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
                    });
                });
                break;
            }
            case 'INSERT': {
                const block = blockMap.get(entity.name);
                if (!block || !entity.insertionPoint) break;
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
                    processEntity(sub, combinedTf, effectiveLayerName, color, depth + 1);
                }
                break;
            }
            case 'DIMENSION': {
                const block = entity.name ? blockMap.get(entity.name) : null;
                if (block && block.entities.length > 0) {
                    for (const sub of block.entities) {
                        processEntity(sub, localTf, effectiveLayerName, color, depth + 1);
                    }
                } else {
                    // Fallback dimension rendering
                    const p1 = entity.subDefinitionPoint1;
                    const p2 = entity.subDefinitionPoint2 || entity.definitionPoint;
                    if (p1 && p2) {
                        const tp1 = applyTransform(p1, localTf);
                        const tp2 = applyTransform(p2, localTf);
                        primitives.push({
                            kind: 'polyline',
                            layer: effectiveLayerName,
                            colorHex: color.hex,
                            isAdaptiveWhite: color.isAdaptiveWhite,
                            points: [tp1, tp2],
                            closed: false,
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
                        primitives.push({
                            kind: 'text',
                            layer: effectiveLayerName,
                            colorHex: color.hex,
                            isAdaptiveWhite: color.isAdaptiveWhite,
                            x: pos.x,
                            y: pos.y,
                            text: rawDimText,
                            height: 2.5 * avgScale,
                            rotation: localTf.rot,
                            align: 'center',
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
        const aci = l.colorIndex ?? 7;
        const resolved =
            l.color && l.color > 0 && l.color <= 0xffffff && aci !== 7
                ? { hex: intToHex(l.color), isAdaptiveWhite: l.color === 0xffffff }
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
        if (entity.color && entity.color > 0 && entity.color <= 0xffffff && entity.colorIndex !== 7) {
            return { hex: intToHex(entity.color), isAdaptiveWhite: entity.color === 0xffffff };
        }
        if (entity.colorIndex === 0 && parentColor) return parentColor;
        if (entity.colorIndex != null && entity.colorIndex !== 256 && entity.colorIndex !== 0) {
            return aciToColor(entity.colorIndex);
        }
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
        depth = 0
    ) => {
        if (!entity || entity.visible === false || depth > 6) return;
        const rawLayer = entity.layer || '0';
        const effectiveLayer = rawLayer === '0' && inheritedLayer ? inheritedLayer : rawLayer;
        const layerObj = ensureLayer(effectiveLayer);
        if (depth === 0) layerObj.entityCount++;

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
                });
                addSnap(c);
                break;
            }
            case 'ARC': {
                if (!entity.center || !entity.radius) break;
                const c = applyTransform(entity.center, tf);
                // dxf-parser stores startAngle/endAngle in radians (or degrees if > 2*PI)
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
                    });
                }
                break;
            }
            case 'TEXT':
            case 'MTEXT':
            case 'ATTRIB': {
                const cleaned = cleanCadText(entity.text || '');
                const pt = entity.startPoint || entity.position;
                if (!cleaned || !pt) break;
                const pos = applyTransform(pt, tf);
                const height = Math.max(0.05, (entity.textHeight || entity.height || 2.5) * avgScale);
                const rotRad = ((entity.rotation || 0) * Math.PI) / 180 + tf.rot;
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
                        align: 'left',
                    });
                });
                break;
            }
            case 'INSERT': {
                const block = blocks[entity.name];
                if (!block || !Array.isArray(block.entities) || !entity.position) break;
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
                    processDxfEntity(sub, combined, effectiveLayer, color, depth + 1);
                }
                break;
            }
            case 'DIMENSION': {
                const block = entity.block ? blocks[entity.block] : null;
                if (block && Array.isArray(block.entities)) {
                    for (const sub of block.entities) {
                        processDxfEntity(sub, tf, effectiveLayer, color, depth + 1);
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

    // 1. Axes Grid & Bubbles
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

    // 2. Footings (PC & RC) and Columns at intersections
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

            // Plain Concrete (PC)
            addRect('S-PC (الخرسانة العادية)', '#38bdf8', x, y, pcW, pcH);
            // Reinforced Concrete Footing (RC)
            addRect('S-FOOT (القواعد المسلحة)', '#eab308', x, y, rcW, rcH);
            // Column (C1 / C2)
            addRect('S-COLS (الأعمدة الخرسانية)', '#22c55e', x, y, 0.35, 0.7, true);

            // Label
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
            });
        });
    });

    // 3. Ground Beams (الميدات الرابطة)
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

    // 4. Exterior Dimensions & Title Block
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
