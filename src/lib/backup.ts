import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { getDb, resetDb } from '@/lib/db';

export interface PreActionBackupStats {
  personnelTotal: number;
  personnelActive: number;
  sourceFile: string;
  dataFreshness: string;
  vksMasterTotal: number;
  vksSubmissionsTotal: number;
  vksServiceRendered: number;
  vksRegistered: number;
  vksRefused: number;
  vksErrors: number;
}

export interface PreActionBackupMeta {
  id: string;
  createdAt: string;
  createdAtMs: number;
  actionType: string;
  actionLabelTr: string;
  actionLabelRu: string;
  sizeBytes: number;
  sizeMB: string;
  stats: PreActionBackupStats;
}

const MAX_PRE_ACTION_BACKUPS = 15;

export function getPreActionBackupDir(): string {
  const dir = path.join(process.cwd(), 'backups', 'pre_action');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function formatMskTimestamp(date = new Date()): { display: string; fileSlug: string } {
  const mskMs = date.getTime() + 3 * 3600 * 1000;
  const d = new Date(mskMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return {
    display: `${dd}.${mm}.${yyyy} ${hh}:${mi}:${ss} MSK`,
    fileSlug: `${yyyy}${mm}${dd}_${hh}${mi}${ss}`,
  };
}

function collectDatabaseStats(db: any): PreActionBackupStats {
  const stats: PreActionBackupStats = {
    personnelTotal: 0,
    personnelActive: 0,
    sourceFile: '',
    dataFreshness: '',
    vksMasterTotal: 0,
    vksSubmissionsTotal: 0,
    vksServiceRendered: 0,
    vksRegistered: 0,
    vksRefused: 0,
    vksErrors: 0,
  };

  try {
    const pRow = db.prepare('SELECT COUNT(*) AS c FROM personnel').get() as { c?: number } | undefined;
    stats.personnelTotal = Number(pRow?.c || 0);
  } catch {}

  try {
    const paRow = db.prepare("SELECT COUNT(*) AS c FROM personnel WHERE genel_durum = 'Mevcut'").get() as { c?: number } | undefined;
    stats.personnelActive = Number(paRow?.c || 0);
  } catch {}

  try {
    const sysRows = db.prepare("SELECT key, value FROM system_info WHERE key IN ('source_file', 'data_freshness')").all() as Array<{ key: string; value: string }>;
    for (const r of sysRows) {
      if (r.key === 'source_file') stats.sourceFile = String(r.value || '');
      if (r.key === 'data_freshness') stats.dataFreshness = String(r.value || '');
    }
  } catch {}

  try {
    const mRow = db.prepare('SELECT COUNT(*) AS c FROM gosuslugi_vks_master_list').get() as { c?: number } | undefined;
    stats.vksMasterTotal = Number(mRow?.c || 0);
  } catch {}

  try {
    const sRows = db
      .prepare('SELECT gosuslugi_status AS st, COUNT(*) AS c FROM gosuslugi_submissions GROUP BY gosuslugi_status')
      .all() as Array<{ st: string; c: number }>;
    for (const r of sRows) {
      const cnt = Number(r.c || 0);
      const st = String(r.st || '');
      stats.vksSubmissionsTotal += cnt;
      if (st === 'Услуга оказана') stats.vksServiceRendered += cnt;
      else if (st === 'Услуга отказана') stats.vksRefused += cnt;
      else if (st.toLowerCase().startsWith('ошибк')) stats.vksErrors += cnt;
      else stats.vksRegistered += cnt;
    }
  } catch {}

  return stats;
}

export function pruneOldPreActionBackups(): void {
  try {
    const dir = getPreActionBackupDir();
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.db.gz'))
      .map((f) => {
        const fullPath = path.join(dir, f);
        const stat = fs.statSync(fullPath);
        return { name: f, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (files.length <= MAX_PRE_ACTION_BACKUPS) return;

    for (const oldFile of files.slice(MAX_PRE_ACTION_BACKUPS)) {
      const gzPath = path.join(dir, oldFile.name);
      const metaPath = gzPath.replace(/\.db\.gz$/, '.meta.json');
      try {
        if (fs.existsSync(gzPath)) fs.unlinkSync(gzPath);
      } catch {}
      try {
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
      } catch {}
    }
  } catch {}
}

export function createPreActionBackup(
  actionType: string,
  actionLabelTr: string,
  actionLabelRu?: string
): PreActionBackupMeta | null {
  const dbPath = path.join(process.cwd(), 'pondera_hr.db');
  if (!fs.existsSync(dbPath)) return null;

  const dir = getPreActionBackupDir();
  const now = new Date();
  const { display, fileSlug } = formatMskTimestamp(now);
  const safeType = actionType.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'action';
  const baseName = `pondera_hr_pre_${safeType}_${fileSlug}`;
  const tempVacuumPath = path.join(dir, `${baseName}.tmp.db`);
  const gzPath = path.join(dir, `${baseName}.db.gz`);
  const metaPath = path.join(dir, `${baseName}.meta.json`);

  try {
    if (fs.existsSync(tempVacuumPath)) {
      try {
        fs.unlinkSync(tempVacuumPath);
      } catch {}
    }

    const db = getDb();
    const qcRow = db.prepare('PRAGMA quick_check(1)').get() as Record<string, string> | undefined;
    const qcVal = qcRow ? Object.values(qcRow)[0] : '';
    if (qcVal !== 'ok') {
      return null;
    }

    const stats = collectDatabaseStats(db);
    const escapedTarget = tempVacuumPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedTarget}';`);

    if (!fs.existsSync(tempVacuumPath)) {
      return null;
    }

    const rawBytes = fs.readFileSync(tempVacuumPath);
    try {
      fs.unlinkSync(tempVacuumPath);
    } catch {}

    const compressed = zlib.gzipSync(rawBytes, { level: 6 });
    fs.writeFileSync(gzPath, compressed);

    // Keep root pondera_hr.db.gz synchronized with latest verified pre-action backup
    try {
      fs.writeFileSync(path.join(process.cwd(), 'pondera_hr.db.gz'), compressed);
    } catch {}

    const meta: PreActionBackupMeta = {
      id: `${baseName}.db.gz`,
      createdAt: display,
      createdAtMs: now.getTime(),
      actionType: safeType,
      actionLabelTr,
      actionLabelRu: actionLabelRu || actionLabelTr,
      sizeBytes: compressed.length,
      sizeMB: (compressed.length / (1024 * 1024)).toFixed(2),
      stats,
    };

    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    pruneOldPreActionBackups();
    return meta;
  } catch {
    if (fs.existsSync(tempVacuumPath)) {
      try {
        fs.unlinkSync(tempVacuumPath);
      } catch {}
    }
    return null;
  }
}

export function listPreActionBackups(): PreActionBackupMeta[] {
  try {
    const dir = getPreActionBackupDir();
    const gzFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.db.gz'));
    const list: PreActionBackupMeta[] = [];

    for (const gzName of gzFiles) {
      const gzPath = path.join(dir, gzName);
      const metaPath = gzPath.replace(/\.db\.gz$/, '.meta.json');
      try {
        if (fs.existsSync(metaPath)) {
          const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as PreActionBackupMeta;
          if (parsed && parsed.id) {
            list.push(parsed);
            continue;
          }
        }
        const stat = fs.statSync(gzPath);
        const { display } = formatMskTimestamp(new Date(stat.mtimeMs));
        list.push({
          id: gzName,
          createdAt: display,
          createdAtMs: stat.mtimeMs,
          actionType: 'pre_action',
          actionLabelTr: 'İşlem Öncesi Otomatik Koruma Yedeği',
          actionLabelRu: 'Автоматическая резервная копия перед операцией',
          sizeBytes: stat.size,
          sizeMB: (stat.size / (1024 * 1024)).toFixed(2),
          stats: {
            personnelTotal: 0,
            personnelActive: 0,
            sourceFile: '',
            dataFreshness: '',
            vksMasterTotal: 0,
            vksSubmissionsTotal: 0,
            vksServiceRendered: 0,
            vksRegistered: 0,
            vksRefused: 0,
            vksErrors: 0,
          },
        });
      } catch {}
    }

    return list.sort((a, b) => b.createdAtMs - a.createdAtMs);
  } catch {
    return [];
  }
}

export function restorePreActionBackup(backupId?: string): {
  success: boolean;
  message: string;
  restoredMeta?: PreActionBackupMeta;
} {
  const dir = getPreActionBackupDir();
  const allBackups = listPreActionBackups();
  let targetGzPath = '';
  let targetMeta: PreActionBackupMeta | undefined;

  if (backupId) {
    const safeName = path.basename(backupId);
    const candidate = path.join(dir, safeName);
    if (fs.existsSync(candidate)) {
      targetGzPath = candidate;
      targetMeta = allBackups.find((b) => b.id === safeName);
    }
  } else if (allBackups.length > 0) {
    targetMeta = allBackups[0];
    targetGzPath = path.join(dir, targetMeta.id);
  } else {
    const rootGz = path.join(process.cwd(), 'pondera_hr.db.gz');
    if (fs.existsSync(rootGz)) {
      targetGzPath = rootGz;
    }
  }

  if (!targetGzPath || !fs.existsSync(targetGzPath)) {
    return {
      success: false,
      message: 'Geri yüklenecek işlem öncesi koruma yedeği bulunamadı.',
    };
  }

  // Take a safety snapshot of current state unless a backup was just created within the last 30 seconds
  if (!allBackups.length || Date.now() - allBackups[0].createdAtMs > 30000) {
    try {
      createPreActionBackup(
        'pre_restore',
        'Geri Yükleme (Restore) Öncesi Otomatik Koruma Yedeği',
        'Авто-копия перед восстановлением БД'
      );
    } catch {}
  }

  const dbPath = path.join(process.cwd(), 'pondera_hr.db');
  const tempRestorePath = dbPath + '.restore_tmp';

  try {
    const compressed = fs.readFileSync(targetGzPath);
    const decompressed = zlib.gunzipSync(compressed);
    fs.writeFileSync(tempRestorePath, decompressed);

    // Verify integrity of decompressed SQLite file BEFORE replacing pondera_hr.db
    const { DatabaseSync } = require('node:sqlite');
    const testConn = new DatabaseSync(tempRestorePath);
    const qcRow = testConn.prepare('PRAGMA quick_check(1)').get() as Record<string, string> | undefined;
    const qcVal = qcRow ? Object.values(qcRow)[0] : '';
    testConn.close();

    if (qcVal !== 'ok') {
      try {
        fs.unlinkSync(tempRestorePath);
      } catch {}
      return {
        success: false,
        message: 'Seçilen yedek dosyası doğrulama kontrolünden (quick_check) geçemedi.',
      };
    }

    // Close active DB connection and remove any WAL/SHM files before replacing pondera_hr.db
    resetDb();
    for (const suffix of ['-wal', '-shm']) {
      const walPath = dbPath + suffix;
      if (fs.existsSync(walPath)) {
        try {
          fs.unlinkSync(walPath);
        } catch {}
      }
    }

    fs.renameSync(tempRestorePath, dbPath);
    resetDb();

    const label = targetMeta ? `${targetMeta.createdAt} (${targetMeta.actionLabelTr})` : path.basename(targetGzPath);
    return {
      success: true,
      message: `Veritabanı başarıyla "${label}" yedeğine geri yüklendi.`,
      restoredMeta: targetMeta,
    };
  } catch (err: any) {
    if (fs.existsSync(tempRestorePath)) {
      try {
        fs.unlinkSync(tempRestorePath);
      } catch {}
    }
    return {
      success: false,
      message: `Geri yükleme sırasında hata oluştu: ${String(err?.message || '')}`,
    };
  }
}
