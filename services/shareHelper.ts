import JSZip from 'jszip';
import { FileItem, ItemType } from '../types';

export interface CollectedFileEntry {
  item: FileItem;
  relativePath: string;
}

export interface DownloadedFileEntry {
  file: File;
  relativePath: string;
}

export interface ShareResult {
  method: 'native' | 'downloaded' | 'cancelled' | 'unsupported';
  error?: string;
}

const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  dwg: 'application/octet-stream',
  dxf: 'application/octet-stream',
};

export function inferShareMimeType(fileName: string, blobType?: string): string {
  const lower = (fileName || '').toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop() || '' : '';

  if (ext === 'dwg' || ext === 'dxf') {
    return 'application/octet-stream';
  }
  if (blobType && blobType !== 'application/octet-stream' && blobType.trim() !== '') {
    return blobType;
  }
  if (ext && EXTENSION_MIME_MAP[ext]) {
    return EXTENSION_MIME_MAP[ext];
  }
  return blobType || 'application/octet-stream';
}

export function sanitizeShareName(name: string, fallback = 'files'): string {
  const cleaned = (name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

export function isShareableItem(item: FileItem): boolean {
  const name = (item.name || '').toLowerCase();
  if (!name) return false;
  if (name.endsWith('.json')) return false;
  if (name.startsWith('project_data')) return false;
  if (name.startsWith('.')) return false;
  if (item.name === 'الأرشيف الهندسي' || item.name === '.System_Log_Assets') return false;
  return true;
}

function deduplicateRelativePath(rawPath: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(rawPath)) {
    usedPaths.add(rawPath);
    return rawPath;
  }
  const slashIdx = rawPath.lastIndexOf('/');
  const dir = slashIdx >= 0 ? rawPath.slice(0, slashIdx + 1) : '';
  const base = slashIdx >= 0 ? rawPath.slice(slashIdx + 1) : rawPath;
  const dotIdx = base.lastIndexOf('.');
  const stem = dotIdx > 0 ? base.slice(0, dotIdx) : base;
  const ext = dotIdx > 0 ? base.slice(dotIdx) : '';

  let counter = 2;
  while (true) {
    const candidate = `${dir}${stem} (${counter})${ext}`;
    if (!usedPaths.has(candidate)) {
      usedPaths.add(candidate);
      return candidate;
    }
    counter++;
  }
}

export async function collectFolderFilesRecursive(
  folderId: string,
  getContentsFn: (id: string) => Promise<FileItem[]>,
  onScanFolder?: (folderName: string, foundCount: number) => void
): Promise<CollectedFileEntry[]> {
  const collected: CollectedFileEntry[] = [];
  const visitedFolders = new Set<string>();
  const usedPaths = new Set<string>();

  const traverse = async (currentId: string, prefix: string, folderLabel: string, depth: number) => {
    if (!currentId || visitedFolders.has(currentId) || depth > 12) return;
    visitedFolders.add(currentId);

    const children = (await getContentsFn(currentId)).filter(isShareableItem);

    for (const child of children) {
      if (child.type === ItemType.FOLDER) {
        const subName = sanitizeShareName(child.name, 'folder');
        const nextPrefix = prefix ? `${prefix}/${subName}` : subName;
        if (onScanFolder) onScanFolder(child.name, collected.length);
        await traverse(child.id, nextPrefix, child.name, depth + 1);
      } else {
        const safeFileName = sanitizeShareName(child.name, `file_${child.id}`);
        const rawPath = prefix ? `${prefix}/${safeFileName}` : safeFileName;
        const uniquePath = deduplicateRelativePath(rawPath, usedPaths);
        collected.push({ item: child, relativePath: uniquePath });
      }
    }
    if (onScanFolder) onScanFolder(folderLabel, collected.length);
  };

  await traverse(folderId, '', '', 0);
  return collected;
}

export async function downloadItemsAsFiles(
  entries: CollectedFileEntry[],
  downloadBlobFn: (id: string) => Promise<Blob>,
  onProgress?: (percent: number, doneCount: number, totalCount: number, currentName: string) => void
): Promise<DownloadedFileEntry[]> {
  const total = entries.length;
  if (total === 0) return [];

  const results: (DownloadedFileEntry | null)[] = new Array(total).fill(null);
  const usedFlatNames = new Set<string>();
  let completed = 0;
  let nextIndex = 0;
  const concurrency = Math.min(3, total);

  const worker = async () => {
    while (true) {
      const idx = nextIndex++;
      if (idx >= total) break;
      const entry = entries[idx];
      const blob = await downloadBlobFn(entry.item.id);
      const mimeType = inferShareMimeType(entry.item.name, blob.type);
      const safeName = sanitizeShareName(entry.item.name, `file_${idx + 1}`);
      const uniqueFlatName = deduplicateRelativePath(safeName, usedFlatNames);
      const file = new File([blob], uniqueFlatName, { type: mimeType });
      results[idx] = {
        file,
        relativePath: entry.relativePath || uniqueFlatName,
      };
      completed++;
      if (onProgress) {
        const pct = Math.round((completed / total) * 100);
        onProgress(pct, completed, total, entry.item.name);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results.filter((r): r is DownloadedFileEntry => r !== null);
}

export async function createZipFromDownloaded(
  entries: DownloadedFileEntry[],
  zipBaseName: string,
  onProgress?: (percent: number) => void
): Promise<File> {
  const zip = new JSZip();
  for (const entry of entries) {
    const pathInZip = entry.relativePath || entry.file.name;
    zip.file(pathInZip, entry.file);
  }

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 5 },
    },
    (metadata) => {
      if (onProgress) {
        onProgress(Math.round(metadata.percent));
      }
    }
  );

  const safeBase = sanitizeShareName(zipBaseName, 'project_files').replace(/\.zip$/i, '');
  return new File([zipBlob], `${safeBase}.zip`, { type: 'application/zip' });
}

export function downloadFilesLocally(files: File[]): void {
  files.forEach((file, idx) => {
    setTimeout(() => {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, idx * 250);
  });
}

export async function shareFilesWithFallback(files: File[], title?: string): Promise<ShareResult> {
  if (!files || files.length === 0) {
    return { method: 'unsupported', error: 'لا توجد ملفات للمشاركة' };
  }

  const shareTitle = title || files[0].name;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const canShareFiles =
      typeof navigator.canShare === 'function' ? navigator.canShare({ files }) : true;

    if (canShareFiles) {
      try {
        await navigator.share({
          files,
          title: shareTitle,
          text: files.length === 1 ? shareTitle : `${shareTitle} (${files.length} ملفات)`,
        });
        return { method: 'native' };
      } catch (err: any) {
        if (err && err.name === 'AbortError') {
          return { method: 'cancelled' };
        }
        // Fallback below if browser rejects files/gesture/MIME
      }
    }
  }

  downloadFilesLocally(files);
  return { method: 'downloaded' };
}

export function formatShareBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
