import { jsPDF } from 'jspdf';

export interface Point2D {
  x: number; // normalized [0..1]
  y: number; // normalized [0..1]
}

// Always ordered: [TopLeft, TopRight, BottomRight, BottomLeft]
export type QuadPoints = [Point2D, Point2D, Point2D, Point2D];

export type ScanFilterMode = 'magic' | 'bw_doc' | 'grayscale' | 'color_boost' | 'original';

export interface ScanAdjustments {
  brightness: number; // -40 .. 40
  contrast: number;   // -40 .. 40
  sharpness: number;  // 0 .. 100
}

export interface ScannedPage {
  id: string;
  originalDataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  rotation: 0 | 90 | 180 | 270;
  corners: QuadPoints;
  filterMode: ScanFilterMode;
  adjustments: ScanAdjustments;
  processedDataUrl: string;
  thumbnailDataUrl: string;
  outputWidth: number;
  outputHeight: number;
}

export interface PdfExportOptions {
  fileName: string;
  pageSizeMode: 'a4' | 'fit';
  quality: 'high' | 'balanced';
}

export const DEFAULT_ADJUSTMENTS_BY_FILTER: Record<ScanFilterMode, ScanAdjustments> = {
  magic: { brightness: 4, contrast: 12, sharpness: 45 },
  bw_doc: { brightness: 6, contrast: 18, sharpness: 55 },
  grayscale: { brightness: 2, contrast: 10, sharpness: 35 },
  color_boost: { brightness: 4, contrast: 14, sharpness: 30 },
  original: { brightness: 0, contrast: 0, sharpness: 0 },
};

export const FULL_PAGE_QUAD: QuadPoints = [
  { x: 0.02, y: 0.02 },
  { x: 0.98, y: 0.02 },
  { x: 0.98, y: 0.98 },
  { x: 0.02, y: 0.98 },
];

export const DEFAULT_INSET_QUAD: QuadPoints = [
  { x: 0.07, y: 0.07 },
  { x: 0.93, y: 0.07 },
  { x: 0.93, y: 0.93 },
  { x: 0.07, y: 0.93 },
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Loads an image File/Blob/DataURL into an HTMLCanvasElement honoring EXIF orientation,
 * capping max dimension to prevent mobile memory exhaustion while preserving crisp document detail.
 */
export async function loadSourceCanvas(
  source: File | Blob | string,
  maxDim: number = 2200
): Promise<{ canvas: HTMLCanvasElement; dataUrl: string; width: number; height: number }> {
  let bitmap: ImageBitmap | null = null;
  let fallbackImg: HTMLImageElement | null = null;
  let objectUrl: string | null = null;

  try {
    if (typeof source === 'string') {
      fallbackImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('تعذر تحميل الصورة'));
        img.src = source;
      });
    } else {
      if (typeof createImageBitmap === 'function') {
        try {
          bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' } as ImageBitmapOptions);
        } catch {
          try {
            bitmap = await createImageBitmap(source);
          } catch {
            bitmap = null;
          }
        }
      }
      if (!bitmap) {
        objectUrl = URL.createObjectURL(source);
        fallbackImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
          img.src = objectUrl!;
        });
      }
    }

    const srcW = bitmap ? bitmap.width : fallbackImg!.naturalWidth || fallbackImg!.width;
    const srcH = bitmap ? bitmap.height : fallbackImg!.naturalHeight || fallbackImg!.height;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (bitmap) {
      ctx.drawImage(bitmap, 0, 0, srcW, srcH, 0, 0, outW, outH);
    } else if (fallbackImg) {
      ctx.drawImage(fallbackImg, 0, 0, srcW, srcH, 0, 0, outW, outH);
    }

    const dataUrl = typeof source === 'string' && scale === 1
      ? source
      : canvas.toDataURL('image/jpeg', 0.93);

    return { canvas, dataUrl, width: outW, height: outH };
  } finally {
    if (bitmap && typeof bitmap.close === 'function') {
      bitmap.close();
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

/**
 * Returns a new canvas rotated clockwise by 0, 90, 180, or 270 degrees.
 */
export function getRotatedCanvas(
  sourceCanvas: HTMLCanvasElement,
  rotation: 0 | 90 | 180 | 270
): HTMLCanvasElement {
  if (rotation === 0) return sourceCanvas;
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const out = document.createElement('canvas');
  out.width = rotation === 90 || rotation === 270 ? h : w;
  out.height = rotation === 90 || rotation === 270 ? w : h;
  const ctx = out.getContext('2d');
  if (!ctx) return sourceCanvas;

  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(sourceCanvas, -w / 2, -h / 2);
  return out;
}

/**
 * Automatic document 4-corner detection using Sobel edge energy & outlier-resistant
 * percentile bounding projection. Fast (<25ms) on a downscaled proxy.
 */
export function detectDocumentCorners(canvas: HTMLCanvasElement): QuadPoints {
  try {
    const maxProxy = 280;
    const scale = Math.min(1, maxProxy / Math.max(canvas.width, canvas.height));
    const pw = Math.max(48, Math.round(canvas.width * scale));
    const ph = Math.max(48, Math.round(canvas.height * scale));

    const proxy = document.createElement('canvas');
    proxy.width = pw;
    proxy.height = ph;
    const pCtx = proxy.getContext('2d');
    if (!pCtx) return DEFAULT_INSET_QUAD;
    pCtx.drawImage(canvas, 0, 0, pw, ph);

    const img = pCtx.getImageData(0, 0, pw, ph).data;
    const len = pw * ph;
    const gray = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const idx = i * 4;
      gray[i] = 0.299 * img[idx] + 0.587 * img[idx + 1] + 0.114 * img[idx + 2];
    }

    // 3x3 Gaussian blur to suppress paper fiber noise
    const blurred = new Float32Array(len);
    for (let y = 1; y < ph - 1; y++) {
      const row = y * pw;
      for (let x = 1; x < pw - 1; x++) {
        const i = row + x;
        blurred[i] =
          (gray[i - pw - 1] + 2 * gray[i - pw] + gray[i - pw + 1] +
            2 * gray[i - 1] + 4 * gray[i] + 2 * gray[i + 1] +
            gray[i + pw - 1] + 2 * gray[i + pw] + gray[i + pw + 1]) /
          16;
      }
    }

    // Estimate center paper luminance vs border to assist edge weighting
    let centerLumSum = 0;
    let centerCount = 0;
    const cx0 = Math.floor(pw * 0.3);
    const cx1 = Math.floor(pw * 0.7);
    const cy0 = Math.floor(ph * 0.3);
    const cy1 = Math.floor(ph * 0.7);
    for (let y = cy0; y < cy1; y++) {
      for (let x = cx0; x < cx1; x++) {
        centerLumSum += blurred[y * pw + x];
        centerCount++;
      }
    }
    const centerMeanLum = centerCount > 0 ? centerLumSum / centerCount : 180;

    // Sobel gradient magnitude
    const grad = new Float32Array(len);
    let maxGrad = 0;
    const margin = 4;
    for (let y = margin; y < ph - margin; y++) {
      for (let x = margin; x < pw - margin; x++) {
        const i = y * pw + x;
        const gx =
          -blurred[i - pw - 1] + blurred[i - pw + 1] +
          -2 * blurred[i - 1] + 2 * blurred[i + 1] +
          -blurred[i + pw - 1] + blurred[i + pw + 1];
        const gy =
          -blurred[i - pw - 1] - 2 * blurred[i - pw] - blurred[i - pw + 1] +
          blurred[i + pw - 1] + 2 * blurred[i + pw] + blurred[i + pw + 1];
        const g = Math.abs(gx) + Math.abs(gy);
        grad[i] = g;
        if (g > maxGrad) maxGrad = g;
      }
    }

    if (maxGrad < 45) return FULL_PAGE_QUAD;

    // Collect strong edge points with brightness-consistency bonus around paper edges
    const thresh = Math.max(42, maxGrad * 0.24);
    const pts: { x: number; y: number; sum: number; diff: number }[] = [];
    for (let y = margin; y < ph - margin; y++) {
      for (let x = margin; x < pw - margin; x++) {
        const i = y * pw + x;
        if (grad[i] >= thresh) {
          // Check if local neighborhood has bright pixels similar to paper
          const lum = blurred[i];
          if (Math.abs(lum - centerMeanLum) < 115 || grad[i] >= maxGrad * 0.4) {
            pts.push({ x, y, sum: x + y, diff: x - y });
          }
        }
      }
    }

    if (pts.length < 30) return DEFAULT_INSET_QUAD;

    // Use 2% / 98% percentiles on diagonal projections (x+y and x-y) to resist single-pixel outliers
    const bySum = [...pts].sort((a, b) => a.sum - b.sum);
    const byDiff = [...pts].sort((a, b) => a.diff - b.diff);

    const lowIdx = Math.min(bySum.length - 1, Math.max(0, Math.floor(bySum.length * 0.015)));
    const highIdx = Math.max(0, Math.min(bySum.length - 1, Math.floor(bySum.length * 0.985)));

    const pickMedianCluster = (arr: typeof pts, start: number, end: number): Point2D => {
      let sx = 0;
      let sy = 0;
      const count = Math.max(1, end - start + 1);
      for (let k = start; k <= end; k++) {
        sx += arr[k].x;
        sy += arr[k].y;
      }
      return { x: clamp01(sx / count / pw), y: clamp01(sy / count / ph) };
    };

    const windowHalf = Math.min(4, Math.floor(pts.length * 0.01));
    const tl = pickMedianCluster(bySum, Math.max(0, lowIdx - windowHalf), Math.min(bySum.length - 1, lowIdx + windowHalf));
    const br = pickMedianCluster(bySum, Math.max(0, highIdx - windowHalf), Math.min(bySum.length - 1, highIdx + windowHalf));
    const bl = pickMedianCluster(byDiff, Math.max(0, lowIdx - windowHalf), Math.min(byDiff.length - 1, lowIdx + windowHalf));
    const tr = pickMedianCluster(byDiff, Math.max(0, highIdx - windowHalf), Math.min(byDiff.length - 1, highIdx + windowHalf));

    // Validate quad geometry & area (Shoelace formula)
    const quad: QuadPoints = [tl, tr, br, bl];
    const area = Math.abs(
      (tl.x * tr.y - tr.x * tl.y) +
      (tr.x * br.y - br.x * tr.y) +
      (br.x * bl.y - bl.x * br.y) +
      (bl.x * tl.y - tl.x * bl.y)
    ) / 2;

    const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const botW = Math.hypot(br.x - bl.x, br.y - bl.y);
    const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);

    if (
      area < 0.22 ||
      area > 0.97 ||
      topW < 0.25 ||
      botW < 0.25 ||
      leftH < 0.25 ||
      rightH < 0.25 ||
      tl.x >= tr.x ||
      bl.x >= br.x ||
      tl.y >= bl.y ||
      tr.y >= br.y
    ) {
      return DEFAULT_INSET_QUAD;
    }

    return quad;
  } catch {
    return DEFAULT_INSET_QUAD;
  }
}

/**
 * Solves an 8x8 linear system A * x = b using Gaussian elimination with partial pivoting.
 */
function solveLinearSystem8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(M[row][col]);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = row;
      }
    }
    if (maxVal < 1e-10) return null;
    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
    }

    const pivot = M[col][col];
    for (let j = col; j <= n; j++) {
      M[col][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      if (Math.abs(factor) < 1e-12) continue;
      for (let j = col; j <= n; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }

  return M.map(row => row[n]);
}

/**
 * Computes inverse homography mapping destination (u, v) -> source (x, y)
 * from 4 correspondence pairs.
 */
function computeHomography(
  dst: [Point2D, Point2D, Point2D, Point2D],
  src: [Point2D, Point2D, Point2D, Point2D]
): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const u = dst[i].x;
    const v = dst[i].y;
    const x = src[i].x;
    const y = src[i].y;

    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }

  const h = solveLinearSystem8(A, b);
  if (!h) return null;
  return [...h, 1];
}

/**
 * Checks if quad covers effectively the full rectangle (axis-aligned within 0.5%).
 */
function isNearFullRect(corners: QuadPoints): boolean {
  return (
    corners[0].x < 0.015 && corners[0].y < 0.015 &&
    corners[1].x > 0.985 && corners[1].y < 0.015 &&
    corners[2].x > 0.985 && corners[2].y > 0.985 &&
    corners[3].x < 0.015 && corners[3].y > 0.985
  );
}

/**
 * Performs exact projective perspective warp (with bilinear interpolation) from
 * an arbitrary 4-corner quadrilateral to a crisp rectangular document canvas.
 */
export function warpPerspective(
  srcCanvas: HTMLCanvasElement,
  corners: QuadPoints,
  maxOutDim: number = 1900
): HTMLCanvasElement {
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;

  const srcPts: [Point2D, Point2D, Point2D, Point2D] = [
    { x: corners[0].x * sw, y: corners[0].y * sh },
    { x: corners[1].x * sw, y: corners[1].y * sh },
    { x: corners[2].x * sw, y: corners[2].y * sh },
    { x: corners[3].x * sw, y: corners[3].y * sh },
  ];

  const widthTop = Math.hypot(srcPts[1].x - srcPts[0].x, srcPts[1].y - srcPts[0].y);
  const widthBottom = Math.hypot(srcPts[2].x - srcPts[3].x, srcPts[2].y - srcPts[3].y);
  const heightLeft = Math.hypot(srcPts[3].x - srcPts[0].x, srcPts[3].y - srcPts[0].y);
  const heightRight = Math.hypot(srcPts[2].x - srcPts[1].x, srcPts[2].y - srcPts[1].y);

  let outW = Math.max(120, Math.round(Math.max(widthTop, widthBottom)));
  let outH = Math.max(120, Math.round(Math.max(heightLeft, heightRight)));

  const scale = Math.min(1, maxOutDim / Math.max(outW, outH));
  outW = Math.max(100, Math.round(outW * scale));
  outH = Math.max(100, Math.round(outH * scale));

  // Fast path if virtually uncropped
  if (isNearFullRect(corners)) {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const oCtx = outCanvas.getContext('2d');
    if (oCtx) {
      oCtx.imageSmoothingEnabled = true;
      oCtx.imageSmoothingQuality = 'high';
      oCtx.drawImage(srcCanvas, 0, 0, outW, outH);
    }
    return outCanvas;
  }

  const dstPts: [Point2D, Point2D, Point2D, Point2D] = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];

  const H = computeHomography(dstPts, srcPts);
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const oCtx = outCanvas.getContext('2d');
  const sCtx = srcCanvas.getContext('2d');

  if (!H || !oCtx || !sCtx) {
    if (oCtx) oCtx.drawImage(srcCanvas, 0, 0, outW, outH);
    return outCanvas;
  }

  const srcData = sCtx.getImageData(0, 0, sw, sh).data;
  const dstImgData = oCtx.createImageData(outW, outH);
  const dstData = dstImgData.data;

  const [h0, h1, h2, h3, h4, h5, h6, h7] = H;
  const maxSx = sw - 1;
  const maxSy = sh - 1;

  for (let v = 0; v < outH; v++) {
    const rowBaseU = h1 * v + h2;
    const rowBaseV = h4 * v + h5;
    const rowBaseW = h7 * v + 1;
    const dstRowOffset = v * outW * 4;

    for (let u = 0; u < outW; u++) {
      const denom = h6 * u + rowBaseW;
      const sx = (h0 * u + rowBaseU) / denom;
      const sy = (h3 * u + rowBaseV) / denom;

      const x0 = sx < 0 ? 0 : sx >= maxSx ? maxSx - 1 : sx | 0;
      const y0 = sy < 0 ? 0 : sy >= maxSy ? maxSy - 1 : sy | 0;
      const x1 = x0 + 1 <= maxSx ? x0 + 1 : maxSx;
      const y1 = y0 + 1 <= maxSy ? y0 + 1 : maxSy;

      const fx = sx - x0;
      const fy = sy - y0;
      const fx1 = 1 - fx;
      const fy1 = 1 - fy;

      const w00 = fx1 * fy1;
      const w10 = fx * fy1;
      const w01 = fx1 * fy;
      const w11 = fx * fy;

      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;

      const di = dstRowOffset + u * 4;
      dstData[di] = srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11;
      dstData[di + 1] = srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11;
      dstData[di + 2] = srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11;
      dstData[di + 3] = 255;
    }
  }

  oCtx.putImageData(dstImgData, 0, 0);
  return outCanvas;
}

/**
 * Estimates smooth local paper background illumination (without dark text halos)
 * by downsampling -> 2-pass morphological dilation (max filter) -> smooth upsampling.
 */
function buildLocalBackgroundMap(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const w = canvas.width;
  const h = canvas.height;

  const gridScale = 18;
  const gw = Math.max(12, Math.round(w / gridScale));
  const gh = Math.max(12, Math.round(h / gridScale));

  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = gw;
  smallCanvas.height = gh;
  const sCtx = smallCanvas.getContext('2d');
  if (!sCtx) return new Uint8ClampedArray(w * h * 4);
  sCtx.drawImage(canvas, 0, 0, gw, gh);

  const img = sCtx.getImageData(0, 0, gw, gh);
  let src = new Uint8ClampedArray(img.data);
  let dst = new Uint8ClampedArray(src.length);

  // 2 passes of 3x3 max filter cleanly bridges over dark handwriting, tables, and lines
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        let maxR = 0;
        let maxG = 0;
        let maxB = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = Math.max(0, Math.min(gh - 1, y + dy));
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.max(0, Math.min(gw - 1, x + dx));
            const idx = (yy * gw + xx) * 4;
            if (src[idx] > maxR) maxR = src[idx];
            if (src[idx + 1] > maxG) maxG = src[idx + 1];
            if (src[idx + 2] > maxB) maxB = src[idx + 2];
          }
        }
        const di = (y * gw + x) * 4;
        dst[di] = maxR;
        dst[di + 1] = maxG;
        dst[di + 2] = maxB;
        dst[di + 3] = 255;
      }
    }
    const tmp = src;
    src = dst;
    dst = tmp;
  }

  img.data.set(src);
  sCtx.putImageData(img, 0, 0);

  // Upscale smoothly back to target dimensions
  const upCanvas = document.createElement('canvas');
  upCanvas.width = w;
  upCanvas.height = h;
  const uCtx = upCanvas.getContext('2d');
  if (!uCtx) return new Uint8ClampedArray(w * h * 4);
  uCtx.imageSmoothingEnabled = true;
  uCtx.imageSmoothingQuality = 'high';
  uCtx.drawImage(smallCanvas, 0, 0, w, h);

  return uCtx.getImageData(0, 0, w, h).data;
}

/**
 * Fast 3x3 Unsharp Mask sharpening in-place on RGBA image buffer.
 */
function applyUnsharpMask(data: Uint8ClampedArray, w: number, h: number, amountPercent: number) {
  if (amountPercent <= 0) return;
  const amount = (amountPercent / 100) * 1.35;
  const copy = new Uint8ClampedArray(data);

  for (let y = 1; y < h - 1; y++) {
    const row = y * w * 4;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x * 4;
      for (let c = 0; c < 3; c++) {
        const center = copy[i + c];
        const neighbors =
          (copy[i - w * 4 + c] +
            copy[i + w * 4 + c] +
            copy[i - 4 + c] +
            copy[i + 4 + c]) *
          0.25;
        const sharpened = center + (center - neighbors) * amount;
        data[i + c] = clamp255(sharpened);
      }
    }
  }
}

/**
 * Applies professional document scan enhancement filters:
 * - Shadow & uneven lighting normalization
 * - Crisp white paper background & rich ink/stamp preservation
 * - Manual brightness, contrast & sharpness tuning
 */
export function enhanceScannedCanvas(
  warpedCanvas: HTMLCanvasElement,
  filterMode: ScanFilterMode,
  adjustments: ScanAdjustments
): HTMLCanvasElement {
  const w = warpedCanvas.width;
  const h = warpedCanvas.height;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const oCtx = outCanvas.getContext('2d');
  if (!oCtx) return warpedCanvas;

  oCtx.drawImage(warpedCanvas, 0, 0);
  const imgData = oCtx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const needsIlluminationFix =
    filterMode === 'magic' || filterMode === 'bw_doc' || filterMode === 'grayscale';
  const bgData = needsIlluminationFix ? buildLocalBackgroundMap(warpedCanvas) : null;

  const brightnessOffset = adjustments.brightness * 1.6;
  const contrastFactor = (259 * (adjustments.contrast * 1.8 + 255)) / (255 * (259 - adjustments.contrast * 1.8));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (filterMode === 'magic' && bgData) {
      const bgR = Math.max(45, bgData[i]);
      const bgG = Math.max(45, bgData[i + 1]);
      const bgB = Math.max(45, bgData[i + 2]);

      // Normalize illumination channel-wise -> neutralizes warm lamps & shadows
      let nr = Math.min(255, (r * 255) / bgR);
      let ng = Math.min(255, (g * 255) / bgG);
      let nb = Math.min(255, (b * 255) / bgB);

      // Gentle highlight white-snap & ink-deepening curve
      const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      const maxC = Math.max(nr, ng, nb);
      const minC = Math.min(nr, ng, nb);
      const chroma = maxC - minC;

      if (lum > 224 && chroma < 24) {
        nr = 255;
        ng = 255;
        nb = 255;
      } else {
        // Stretch [45..232] -> [0..255]
        const stretch = (v: number) => clamp255(((v - 42) * 255) / 188);
        nr = stretch(nr);
        ng = stretch(ng);
        nb = stretch(nb);

        // Preserve & slightly punch color stamps/blue ink
        if (chroma > 16) {
          const newLum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
          const satBoost = 1.24;
          nr = clamp255(newLum + (nr - newLum) * satBoost);
          ng = clamp255(newLum + (ng - newLum) * satBoost);
          nb = clamp255(newLum + (nb - newLum) * satBoost);
        }
      }
      r = nr;
      g = ng;
      b = nb;
    } else if (filterMode === 'bw_doc' && bgData) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const bgLum = Math.max(45, 0.299 * bgData[i] + 0.587 * bgData[i + 1] + 0.114 * bgData[i + 2]);
      const norm = Math.min(255, (lum * 255) / bgLum);

      // Anti-aliased crisp document threshold [132..204]
      let outLum: number;
      if (norm >= 204) outLum = 255;
      else if (norm <= 132) outLum = 12;
      else outLum = ((norm - 132) / 72) * 243 + 12;

      r = g = b = outLum;
    } else if (filterMode === 'grayscale' && bgData) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const bgLum = Math.max(45, 0.299 * bgData[i] + 0.587 * bgData[i + 1] + 0.114 * bgData[i + 2]);
      const norm = Math.min(255, (lum * 255) / bgLum);
      const stretched = clamp255(((norm - 24) * 255) / 214);
      r = g = b = stretched;
    } else if (filterMode === 'color_boost') {
      // Vibrant contrast & subtle saturation lift
      const avg = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = 1.2;
      r = clamp255(avg + (r - avg) * sat);
      g = clamp255(avg + (g - avg) * sat);
      b = clamp255(avg + (b - avg) * sat);
      r = clamp255(((r - 128) * 1.18) + 132);
      g = clamp255(((g - 128) * 1.18) + 132);
      b = clamp255(((b - 128) * 1.18) + 132);
    }

    // Apply fine-tuning brightness & contrast
    if (adjustments.brightness !== 0 || adjustments.contrast !== 0) {
      r = clamp255(contrastFactor * (r + brightnessOffset - 128) + 128);
      g = clamp255(contrastFactor * (g + brightnessOffset - 128) + 128);
      b = clamp255(contrastFactor * (b + brightnessOffset - 128) + 128);
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  if (adjustments.sharpness > 0) {
    applyUnsharpMask(data, w, h, adjustments.sharpness);
  }

  oCtx.putImageData(imgData, 0, 0);
  return outCanvas;
}

/**
 * Full single-page scan processing pipeline:
 * Load original -> Rotate -> Perspective Warp -> Enhance Filter -> Generate output + thumbnail.
 */
export async function processScannedPage(params: {
  originalDataUrl: string;
  rotation: 0 | 90 | 180 | 270;
  corners: QuadPoints;
  filterMode: ScanFilterMode;
  adjustments: ScanAdjustments;
  maxOutDim?: number;
}): Promise<{
  processedDataUrl: string;
  thumbnailDataUrl: string;
  outputWidth: number;
  outputHeight: number;
}> {
  const { canvas } = await loadSourceCanvas(params.originalDataUrl, 2200);
  const rotated = getRotatedCanvas(canvas, params.rotation);
  const warped = warpPerspective(rotated, params.corners, params.maxOutDim ?? 1850);
  const enhanced = enhanceScannedCanvas(warped, params.filterMode, params.adjustments);

  const processedDataUrl = enhanced.toDataURL('image/jpeg', 0.9);

  // Small crisp thumbnail for page filmstrip
  const thumbMax = 240;
  const tScale = Math.min(1, thumbMax / Math.max(enhanced.width, enhanced.height));
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = Math.max(1, Math.round(enhanced.width * tScale));
  thumbCanvas.height = Math.max(1, Math.round(enhanced.height * tScale));
  const tCtx = thumbCanvas.getContext('2d');
  let thumbnailDataUrl = processedDataUrl;
  if (tCtx) {
    tCtx.imageSmoothingEnabled = true;
    tCtx.imageSmoothingQuality = 'medium';
    tCtx.drawImage(enhanced, 0, 0, thumbCanvas.width, thumbCanvas.height);
    thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.78);
  }

  return {
    processedDataUrl,
    thumbnailDataUrl,
    outputWidth: enhanced.width,
    outputHeight: enhanced.height,
  };
}

/**
 * Re-encodes a dataUrl at target JPEG quality for lightweight or high-res PDF embedding.
 */
async function reencodeDataUrlForPdf(
  dataUrl: string,
  jpegQuality: number,
  maxDim: number
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w0 = img.naturalWidth || img.width;
      const h0 = img.naturalHeight || img.height;
      const scale = Math.min(1, maxDim / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * scale));
      const h = Math.max(1, Math.round(h0 * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl, width: w0, height: h0 });
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: c.toDataURL('image/jpeg', jpegQuality), width: w, height: h });
    };
    img.onerror = () => reject(new Error('تعذر تجهيز الصفحة لملف PDF'));
    img.src = dataUrl;
  });
}

/**
 * Builds a real multi-page PDF File from scanned pages using jsPDF.
 */
export async function buildMultiPagePdf(
  pages: ScannedPage[],
  options: PdfExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<{ file: File; blob: Blob }> {
  if (!pages.length) {
    throw new Error('لا توجد صفحات ممسوحة لإنشاء ملف PDF');
  }

  const jpegQuality = options.quality === 'high' ? 0.88 : 0.72;
  const maxDim = options.quality === 'high' ? 1850 : 1350;

  let doc: jsPDF | null = null;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const encoded = await reencodeDataUrlForPdf(page.processedDataUrl, jpegQuality, maxDim);
    const isLandscape = encoded.width > encoded.height;

    if (options.pageSizeMode === 'a4') {
      const orientation = isLandscape ? 'landscape' : 'portrait';
      const pageW = isLandscape ? 297 : 210; // mm
      const pageH = isLandscape ? 210 : 297; // mm

      if (!doc) {
        doc = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
      } else {
        doc.addPage('a4', orientation);
      }

      const margin = 5; // 5mm clean margin
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2;
      const imgAspect = encoded.width / encoded.height;
      const boxAspect = availW / availH;

      let drawW = availW;
      let drawH = availH;
      if (imgAspect > boxAspect) {
        drawH = availW / imgAspect;
      } else {
        drawW = availH * imgAspect;
      }
      const x = (pageW - drawW) / 2;
      const y = (pageH - drawH) / 2;

      doc.addImage(encoded.dataUrl, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');
    } else {
      // Exact fit page matching scanned page aspect ratio
      const refLongMm = 297;
      const scale = refLongMm / Math.max(encoded.width, encoded.height);
      const pageW = Math.max(40, encoded.width * scale);
      const pageH = Math.max(40, encoded.height * scale);
      const orientation = pageW > pageH ? 'landscape' : 'portrait';

      if (!doc) {
        doc = new jsPDF({ orientation, unit: 'mm', format: [pageW, pageH], compress: true });
      } else {
        doc.addPage([pageW, pageH], orientation);
      }
      doc.addImage(encoded.dataUrl, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
    }

    if (onProgress) onProgress(i + 1, pages.length);
  }

  const finalDoc = doc!;
  const safeBaseName =
    options.fileName
      .trim()
      .replace(/\.pdf$/i, '')
      .replace(/[\/\\?%*:|"<>]/g, '_') || `Document_Scan_${Date.now()}`;
  const fullName = `${safeBaseName}.pdf`;

  const blob = finalDoc.output('blob');
  const file = new File([blob], fullName, {
    type: 'application/pdf',
    lastModified: Date.now(),
  });

  return { file, blob };
}

/**
 * Converts a scanned page DataURL into an image File for optional saving as standalone image(s).
 */
export async function dataUrlToImageFile(dataUrl: string, fileName: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], fileName, { type: blob.type || 'image/jpeg', lastModified: Date.now() });
}
