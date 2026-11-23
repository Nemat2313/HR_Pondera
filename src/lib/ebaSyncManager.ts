import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import util from 'util';
import { getDb, resetDb } from '@/lib/db';
import { createPreActionBackup } from '@/lib/backup';
import { getMoscowTimeParts } from '@/lib/telegramNotifier';

const execFilePromise = util.promisify(execFile);

export interface EbaSyncConfig {
  loginUrl: string;
  username: string;
  password: string;
  reportBtnId: string;
  autoSyncEnabled: boolean;
  autoSyncTimeMsk: string; // e.g. "08:00"
}

export interface EbaSyncStatus {
  isRunning: boolean;
  startedAt: string;
  percent: number;
  stageMessage: string;
  lastSyncAt: string;
  lastSyncStatus: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'ERROR';
  lastSyncMessage: string;
  lastSyncFile: string;
  lastSyncActiveRecords: number;
  lastSyncTotalRecords: number;
  lastTriggeredBy: string;
  lastAutoDateIso: string;
}

export const EBA_REPORT_OPTIONS = [
  { id: 'fileView_ctl01_btnPersonnelReport1', label: 'Personel Rapor 1 (TR) — 198 Kolon (Ana Liste)' },
  { id: 'fileView_ctl01_btnPersonnelReport2', label: 'Personel Rapor 2 (TR)' },
  { id: 'fileView_ctl01_btnPersonnelReport1NoMuaf', label: 'Personel Rapor 1 (TR) Muaf Hariç' },
  { id: 'fileView_ctl01_btnPersonnelReport2NoMuaf', label: 'Personel Rapor 2 (TR) Muaf Hariç' },
  { id: 'fileView_ctl01_btnPersonnelReport', label: 'Saha Raporu' },
  { id: 'fileView_ctl01_btnTest', label: 'Saha Raporu Yeni Format' },
  { id: 'fileView_ctl01_btnRegionReport', label: 'Sirkülasyon Raporu' },
  { id: 'fileView_ctl01_btnTurnOver', label: 'Turn Over Raporu' },
];

const DEFAULT_CONFIG: EbaSyncConfig = {
  loginUrl: 'https://pearl.pondera.network/eba.net/Desktop/Login.aspx',
  username: process.env.EBA_USERNAME || '',
  password: process.env.EBA_PASSWORD || '',
  reportBtnId: 'fileView_ctl01_btnPersonnelReport1',
  autoSyncEnabled: false,
  autoSyncTimeMsk: '08:00',
};

const DEFAULT_STATUS: EbaSyncStatus = {
  isRunning: false,
  startedAt: '',
  percent: 0,
  stageMessage: '',
  lastSyncAt: '',
  lastSyncStatus: 'IDLE',
  lastSyncMessage: '',
  lastSyncFile: '',
  lastSyncActiveRecords: 0,
  lastSyncTotalRecords: 0,
  lastTriggeredBy: '',
  lastAutoDateIso: '',
};

const PROGRESS_FILE = path.join(process.cwd(), 'uploads', 'eba_sync_progress.json');

const PYTHON_BUILD_INLINE = [
  'import sys, build_db',
  'build_db.EXCEL_PATH = sys.argv[1]',
  'build_db.DATA_FRESHNESS = sys.argv[2]',
  'build_db.SOURCE_FILE = sys.argv[3]',
  'build_db.build_database()',
].join('; ');

function getSysVal(key: string): string | null {
  try {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT);`);
    const row = db.prepare('SELECT value FROM system_info WHERE key = ?').get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function setSysVal(key: string, val: string): void {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT);`);
  db.prepare(
    `INSERT INTO system_info (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, val);
}

export function getEbaSyncConfig(): EbaSyncConfig {
  const raw = getSysVal('eba_sync_config_json');
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    return {
      loginUrl: String(parsed.loginUrl || DEFAULT_CONFIG.loginUrl).trim(),
      username: String(parsed.username || DEFAULT_CONFIG.username).trim(),
      password: String(parsed.password || DEFAULT_CONFIG.password),
      reportBtnId: String(parsed.reportBtnId || DEFAULT_CONFIG.reportBtnId).trim(),
      autoSyncEnabled: Boolean(parsed.autoSyncEnabled),
      autoSyncTimeMsk: String(parsed.autoSyncTimeMsk || DEFAULT_CONFIG.autoSyncTimeMsk).trim(),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveEbaSyncConfig(incoming: Partial<EbaSyncConfig>): EbaSyncConfig {
  const current = getEbaSyncConfig();
  const nextPass =
    incoming.password !== undefined && incoming.password !== '' && incoming.password !== '••••••••'
      ? String(incoming.password)
      : current.password;
  const merged: EbaSyncConfig = {
    loginUrl: String(incoming.loginUrl ?? current.loginUrl).trim() || DEFAULT_CONFIG.loginUrl,
    username: String(incoming.username ?? current.username).trim(),
    password: nextPass,
    reportBtnId: String(incoming.reportBtnId ?? current.reportBtnId).trim() || DEFAULT_CONFIG.reportBtnId,
    autoSyncEnabled:
      incoming.autoSyncEnabled !== undefined ? Boolean(incoming.autoSyncEnabled) : current.autoSyncEnabled,
    autoSyncTimeMsk: String(incoming.autoSyncTimeMsk ?? current.autoSyncTimeMsk).trim() || '08:00',
  };
  setSysVal('eba_sync_config_json', JSON.stringify(merged));
  return merged;
}

export function getEbaSyncStatus(): EbaSyncStatus {
  let st: EbaSyncStatus = { ...DEFAULT_STATUS };
  const raw = getSysVal('eba_sync_status_json');
  if (raw) {
    try {
      st = { ...DEFAULT_STATUS, ...JSON.parse(raw) };
    } catch {}
  }

  // Clear stale running flag after 10 minutes
  if (st.isRunning && st.startedAt) {
    const startedMs = Date.parse(st.startedAt);
    if (!Number.isNaN(startedMs) && Date.now() - startedMs > 10 * 60 * 1000) {
      st.isRunning = false;
      st.lastSyncStatus = 'ERROR';
      st.lastSyncMessage = 'Önceki senkronizasyon zaman aşımına uğradı.';
      saveEbaSyncStatus(st);
    }
  }

  // Overlay live progress file if running
  if (st.isRunning && fs.existsSync(PROGRESS_FILE)) {
    try {
      const p = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
      if (typeof p.percent === 'number') st.percent = p.percent;
      if (p.message) st.stageMessage = String(p.message);
    } catch {}
  }
  return st;
}

function saveEbaSyncStatus(next: Partial<EbaSyncStatus>): EbaSyncStatus {
  const cur = getEbaSyncStatus();
  const merged: EbaSyncStatus = { ...cur, ...next };
  setSysVal('eba_sync_status_json', JSON.stringify(merged));
  return merged;
}

function resolvePythonBin(): string {
  if (process.platform === 'win32') return 'python';
  const candidates = [
    path.join(process.cwd(), 'venv', 'bin', 'python3'),
    path.join(process.cwd(), 'venv', 'bin', 'python'),
    path.join(process.cwd(), '.venv', 'bin', 'python3'),
    '/usr/bin/python3',
    'python3',
  ];
  for (const c of candidates) {
    if (!c.startsWith('/') || fs.existsSync(c)) return c;
  }
  return 'python3';
}

export function startEbaAutoSyncBackground(triggeredBy = 'Manuel'): { started: boolean; message: string } {
  const cfg = getEbaSyncConfig();
  if (!cfg.username || !cfg.password) {
    return { started: false, message: 'Lütfen önce eBA kullanıcı adı ve şifresini kaydedin.' };
  }
  const st = getEbaSyncStatus();
  if (st.isRunning) {
    return { started: false, message: 'eBA senkronizasyonu zaten çalışıyor. Lütfen tamamlanmasını bekleyin.' };
  }

  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  try {
    fs.writeFileSync(
      PROGRESS_FILE,
      JSON.stringify({ percent: 5, message: 'eBA otomasyonu başlatılıyor...' }),
      'utf-8'
    );
  } catch {}

  const msk = getMoscowTimeParts();
  saveEbaSyncStatus({
    isRunning: true,
    startedAt: new Date().toISOString(),
    percent: 5,
    stageMessage: 'eBA otomasyonu başlatılıyor...',
    lastSyncStatus: 'RUNNING',
    lastTriggeredBy: triggeredBy,
    lastAutoDateIso: triggeredBy === 'Otomatik Cron' ? msk.dateIso : st.lastAutoDateIso,
  });

  const pyBin = resolvePythonBin();
  const scriptPath = path.join(process.cwd(), 'scripts', 'eba_auto_sync.py');
  const child = spawn(pyBin, [scriptPath], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuf = '';
  let stderrBuf = '';
  child.stdout.on('data', (d) => {
    stdoutBuf += d.toString('utf-8');
  });
  child.stderr.on('data', (d) => {
    stderrBuf += d.toString('utf-8');
  });

  child.stdin.write(
    JSON.stringify({
      login_url: cfg.loginUrl,
      username: cfg.username,
      password: cfg.password,
      report_btn_id: cfg.reportBtnId,
      output_dir: uploadDir,
      progress_file: PROGRESS_FILE,
    })
  );
  child.stdin.end();

  child.on('close', async () => {
    try {
      const lines = stdoutBuf.trim().split(/\r?\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1] || '';
      const parsed = lastLine ? JSON.parse(lastLine) : null;

      if (!parsed || !parsed.success || !parsed.filePath) {
        const errMsg = parsed?.message || stderrBuf.trim().slice(0, 260) || 'eBA dosyası indirilemedi.';
        saveEbaSyncStatus({
          isRunning: false,
          percent: 0,
          stageMessage: errMsg,
          lastSyncStatus: 'ERROR',
          lastSyncMessage: errMsg,
        });
        return;
      }

      const filePath = String(parsed.filePath);
      const fileName = String(parsed.fileName || 'Personel1Raporu.xlsx');
      const mskNow = getMoscowTimeParts();
      const freshness = mskNow.dateDisplay; // DD.MM.YYYY

      try {
        fs.writeFileSync(
          PROGRESS_FILE,
          JSON.stringify({
            percent: 88,
            message: `Yedek alınıyor ve ${fileName} (198 kolon) veritabanına aktarılıyor...`,
          }),
          'utf-8'
        );
      } catch {}

      createPreActionBackup(
        'eba_auto_sync',
        `eBA Otomatik Senkronizasyon Öncesi (${fileName})`,
        `Перед авто-синхронизацией eBA (${fileName})`
      );
      resetDb();

      await execFilePromise(pyBin, ['-c', PYTHON_BUILD_INLINE, filePath, freshness, fileName], {
        cwd: process.cwd(),
        timeout: 300000,
        maxBuffer: 20 * 1024 * 1024,
      });

      resetDb();
      const db = getDb();
      const totalRow = db.prepare('SELECT COUNT(*) as c FROM personnel').get() as { c: number };
      const activeRow = db
        .prepare("SELECT COUNT(*) as c FROM personnel WHERE genel_durum = 'Mevcut'")
        .get() as { c: number };

      const doneMsg = `eBA senkronizasyonu tamamlandı (${parsed.durationSec || 0} sn). Aktif: ${activeRow.c}, Toplam: ${totalRow.c} (${fileName})`;
      saveEbaSyncStatus({
        isRunning: false,
        percent: 100,
        stageMessage: doneMsg,
        lastSyncAt: `${mskNow.dateDisplay} ${mskNow.timeDisplay}`,
        lastSyncStatus: 'SUCCESS',
        lastSyncMessage: doneMsg,
        lastSyncFile: fileName,
        lastSyncActiveRecords: Number(activeRow.c || 0),
        lastSyncTotalRecords: Number(totalRow.c || 0),
      });
    } catch (err: any) {
      const msg = err?.stderr || err?.message || 'eBA veritabanı aktarım hatası.';
      saveEbaSyncStatus({
        isRunning: false,
        percent: 0,
        stageMessage: String(msg).slice(0, 260),
        lastSyncStatus: 'ERROR',
        lastSyncMessage: String(msg).slice(0, 260),
      });
    }
  });

  return {
    started: true,
    message: 'eBA otomatik rapor çekme başlatıldı (~80-100 saniye içinde veritabanı otomatik güncellenecektir).',
  };
}

export function checkAndRunScheduledEbaSync(): { triggered: boolean; reason: string } {
  const cfg = getEbaSyncConfig();
  if (!cfg.autoSyncEnabled || !cfg.username || !cfg.password) {
    return { triggered: false, reason: 'disabled_or_unconfigured' };
  }
  const st = getEbaSyncStatus();
  if (st.isRunning) {
    return { triggered: false, reason: 'already_running' };
  }
  const msk = getMoscowTimeParts();
  if (st.lastAutoDateIso === msk.dateIso) {
    return { triggered: false, reason: 'already_ran_today' };
  }
  const [targetH, targetM] = (cfg.autoSyncTimeMsk || '08:00').split(':').map((n) => parseInt(n, 10) || 0);
  const nowMinutes = msk.hour * 60 + msk.minute;
  const targetMinutes = targetH * 60 + targetM;
  if (nowMinutes >= targetMinutes && nowMinutes <= targetMinutes + 90) {
    const res = startEbaAutoSyncBackground('Otomatik Cron');
    return { triggered: res.started, reason: res.message };
  }
  return { triggered: false, reason: 'outside_schedule_window' };
}
