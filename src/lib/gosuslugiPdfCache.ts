import fs from 'fs';
import path from 'path';

interface CachedPdfMaps {
  dirMtimeMs: number;
  scannedAt: number;
  statusPdfByAppNo: Map<string, string>;
  statusPdfBySicil: Map<string, string>;
  receiptPdfByAppNo: Map<string, string>;
  receiptPdfBySicil: Map<string, string>;
}

interface GlobalGosuslugiCaches {
  __ponderaStatusPdfCache?: CachedPdfMaps;
  __ponderaAnalyticsResponseCache?: Map<string, { expiresAt: number; payload: any }>;
}

const g = globalThis as unknown as GlobalGosuslugiCaches;

/**
 * Returns cached lookup maps for both receipt PDFs and `_STATUS_A4.pdf` files inside `data/gosuslugi_pdfs`.
 * Avoids scanning 5,700+ PDF files synchronously via `fs.readdirSync` on every GET request
 * unless the directory mtime changes or the 20-second TTL expires.
 */
export function getStatusPdfMaps(): {
  statusPdfByAppNo: Map<string, string>;
  statusPdfBySicil: Map<string, string>;
  receiptPdfByAppNo: Map<string, string>;
  receiptPdfBySicil: Map<string, string>;
} {
  const pdfDir = path.join(process.cwd(), 'data', 'gosuslugi_pdfs');
  const now = Date.now();

  try {
    if (!fs.existsSync(pdfDir)) {
      return {
        statusPdfByAppNo: new Map(),
        statusPdfBySicil: new Map(),
        receiptPdfByAppNo: new Map(),
        receiptPdfBySicil: new Map(),
      };
    }

    const stat = fs.statSync(pdfDir);
    const cached = g.__ponderaStatusPdfCache;
    if (
      cached &&
      cached.dirMtimeMs === stat.mtimeMs &&
      now - cached.scannedAt < 20_000
    ) {
      return {
        statusPdfByAppNo: cached.statusPdfByAppNo,
        statusPdfBySicil: cached.statusPdfBySicil,
        receiptPdfByAppNo: cached.receiptPdfByAppNo,
        receiptPdfBySicil: cached.receiptPdfBySicil,
      };
    }

    const statusPdfByAppNo = new Map<string, string>();
    const statusPdfBySicil = new Map<string, string>();
    const receiptPdfByAppNo = new Map<string, string>();
    const receiptPdfBySicil = new Map<string, string>();
    const files = fs.readdirSync(pdfDir);
    for (const f of files) {
      const upper = f.toUpperCase();
      if (!upper.endsWith('.PDF') || f.startsWith('tmp_')) continue;
      const mApp = f.match(/([789]\d{9})/);
      const mSic = f.match(/^(\d{4,8})_/);
      if (upper.includes('_STATUS_A4')) {
        if (mApp) statusPdfByAppNo.set(mApp[1], f);
        if (mSic) statusPdfBySicil.set(mSic[1], f);
      } else {
        if (mApp) receiptPdfByAppNo.set(mApp[1], f);
        if (mSic) receiptPdfBySicil.set(mSic[1], f);
      }
    }

    g.__ponderaStatusPdfCache = {
      dirMtimeMs: stat.mtimeMs,
      scannedAt: now,
      statusPdfByAppNo,
      statusPdfBySicil,
      receiptPdfByAppNo,
      receiptPdfBySicil,
    };

    return { statusPdfByAppNo, statusPdfBySicil, receiptPdfByAppNo, receiptPdfBySicil };
  } catch {
    return {
      statusPdfByAppNo: new Map(),
      statusPdfBySicil: new Map(),
      receiptPdfByAppNo: new Map(),
      receiptPdfBySicil: new Map(),
    };
  }
}

export function invalidateStatusPdfCache(): void {
  g.__ponderaStatusPdfCache = undefined;
  invalidateGosuslugiAnalyticsCache();
}

export function getCachedAnalyticsResponse(cacheKey: string): any | null {
  const map = g.__ponderaAnalyticsResponseCache;
  if (!map) return null;
  const hit = map.get(cacheKey);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    map.delete(cacheKey);
    return null;
  }
  return hit.payload;
}

export function setCachedAnalyticsResponse(cacheKey: string, payload: any, ttlMs = 4000): void {
  if (!g.__ponderaAnalyticsResponseCache) {
    g.__ponderaAnalyticsResponseCache = new Map();
  }
  g.__ponderaAnalyticsResponseCache.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    payload,
  });
}

export function invalidateGosuslugiAnalyticsCache(): void {
  if (g.__ponderaAnalyticsResponseCache) {
    g.__ponderaAnalyticsResponseCache.clear();
  }
}

