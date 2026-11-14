import { getDb } from '@/lib/db';
import seedEntriesJson from '@/data/orgJobTitleSeed.json';

export type OrgJobClassLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface OrgJobLevelMetaItem {
  level: OrgJobClassLevel;
  code: string;
  shortLabelTr: string;
  shortLabelRu: string;
  titleTr: string;
  titleRu: string;
  descriptionTr: string;
}

export const ORG_JOB_LEVEL_META: OrgJobLevelMetaItem[] = [
  {
    level: 1,
    code: 'L1',
    shortLabelTr: 'Başkan',
    shortLabelRu: 'Председатель',
    titleTr: 'Yönetim Kurulu & Genel Başkan',
    titleRu: 'Председатель правления',
    descriptionTr: 'Şirket en üst yönetim kurulu ve genel başkanlık kademesi',
  },
  {
    level: 2,
    code: 'L2',
    shortLabelTr: 'CEO & Genel Müdür',
    shortLabelRu: 'CEO и Ген. директор',
    titleTr: 'İcra Kurulu (CEO / COO / Genel Müdür)',
    titleRu: 'Исполнительное руководство (CEO / COO / Ген. директор)',
    descriptionTr: 'CEO, COO, CFO ve Genel Müdür icra liderliği kademesi',
  },
  {
    level: 3,
    code: 'L3',
    shortLabelTr: 'Direktör & Koord.',
    shortLabelRu: 'Директора',
    titleTr: 'Direktör & Koordinatör',
    titleRu: 'Директора и координаторы',
    descriptionTr: 'Proje, Ticari, Operasyon, Satınalma Direktörleri ve Koordinatörler',
  },
  {
    level: 4,
    code: 'L4',
    shortLabelTr: 'Müdür & Şantiye Şefi',
    shortLabelRu: 'Руководители проектов и отделов',
    titleTr: 'Müdür, Proje Müdürü & Şantiye Lideri',
    titleRu: 'Директора проектов, начальники участков и отделов',
    descriptionTr: 'Proje Müdürü, Şantiye Şefi, Yapım Müdürü, Merkez ve Saha Birim Müdürleri',
  },
  {
    level: 5,
    code: 'L5',
    shortLabelTr: 'Grup & Kısım Şefi',
    shortLabelRu: 'Начальники групп и смен',
    titleTr: 'Grup, Kısım & Birim Şefi',
    titleRu: 'Начальники групп, участков и главные инженеры',
    descriptionTr: 'Grup Şefi, Kısım Şefi, Saha Şefi, Birim Şefi ve Baş Mühendisler',
  },
  {
    level: 6,
    code: 'L6',
    shortLabelTr: 'Mühendis & Uzman',
    shortLabelRu: 'Инженеры и специалисты',
    titleTr: 'Mühendis, Uzman & İdari Kadro',
    titleRu: 'Инженеры, супервайзеры, специалисты и служащие',
    descriptionTr: 'Kıdemli Mühendis, Mühendis, Süpervizör, Uzman, İnspektör, Tekniker, Doktor, Avukat, Memur',
  },
  {
    level: 7,
    code: 'L7',
    shortLabelTr: 'Formen & Sorumlu',
    shortLabelRu: 'Формены и коменданты',
    titleTr: 'Formen, Saha Amiri & Sorumlu',
    titleRu: 'Формены, коменданты и ответственные на площадке',
    descriptionTr: 'Saha İmalat Formenleri, Kamp/Güvenlik Amirleri ve Saha Sorumluları',
  },
  {
    level: 8,
    code: 'L8',
    shortLabelTr: 'Saha İşçileri (Liste)',
    shortLabelRu: 'Рабочий персонал',
    titleTr: 'Saha Ekip, Usta & İşçi Kadrosu',
    titleRu: 'Бригадиры, мастера, монтажники и рабочие',
    descriptionTr: 'Saha usta, ekipbaşı, montajcı, kaynakçı, operatör ve mavi yaka işçi kadrosu',
  },
];

export interface OrgJobTitleLevelRecord {
  normTitle: string;
  displayTitle: string;
  levelNo: OrgJobClassLevel;
  isConfirmed: boolean;
  source: 'seed' | 'new_detected' | 'manual';
  updatedBy: string;
  updatedAt: string;
  activeCount: number;
  totalCount: number;
  sampleEmployees: string[];
}

export function normalizeOrgJobTitle(raw?: string | null): string {
  if (!raw) return '';
  return String(raw)
    .trim()
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'C')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function clampOrgJobLevel(val: unknown, fallback: OrgJobClassLevel = 6): OrgJobClassLevel {
  const n = Math.round(Number(val));
  if (n >= 1 && n <= 8) return n as OrgJobClassLevel;
  return fallback;
}

export function formatNowDdMmYyyyHhMm(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
}

export function suggestJobClassLevel(
  gorevi: string,
  endirektDirekt?: string
): OrgJobClassLevel {
  const g = normalizeOrgJobTitle(gorevi);
  if (!g) {
    return endirektDirekt === 'Endirekt' ? 6 : 8;
  }
  const words = g.split(/[\s/\-(),.]+/).filter(Boolean);
  const hasWord = (w: string) => words.includes(w);

  if (g.includes('GENEL BASKAN') || g.includes('YONETIM KURULU BASKAN') || hasWord('BASKAN')) {
    return 1;
  }

  if (
    hasWord('CEO') ||
    hasWord('COO') ||
    hasWord('CFO') ||
    hasWord('CTO') ||
    g.includes('GENEL MUDUR')
  ) {
    return 2;
  }

  if (g.includes('DIREKTOR') || g.includes('KOORDINATOR')) {
    return 3;
  }

  if (
    g.includes('MUDUR') ||
    g.includes('SANTIYE SEFI') ||
    g.includes('PROJE BAS MUHENDISI') ||
    hasWord('GIP') ||
    g.includes('SUPERINTENDENT')
  ) {
    return 4;
  }

  if (
    hasWord('SEFI') ||
    hasWord('SEF') ||
    (hasWord('BAS') && (g.includes('MUHENDIS') || hasWord('PUANTOR'))) ||
    g === 'ISKELE VE IZOLASYON GRUP SORUMLUSU'
  ) {
    return 5;
  }

  if (g.includes('FORMEN') || hasWord('AMIRI') || hasWord('AMIR') || g.includes('SORUMLUSU')) {
    return 7;
  }

  if (
    g.includes('EKIPBASI') ||
    g.includes('POSTABASI') ||
    g.includes('ISCISI') ||
    hasWord('ISCI') ||
    g.includes('USTASI') ||
    hasWord('USTA') ||
    g.includes('MONTAJCISI') ||
    g.includes('KAYNAKCI') ||
    g.includes('KAYNAKCISI') ||
    hasWord('ELEKTRIKCI') ||
    hasWord('ELEKTRICISI') ||
    hasWord('KALIPCI') ||
    hasWord('BOYACI') ||
    hasWord('PUNTACI') ||
    hasWord('DEMIRCI') ||
    hasWord('SOFOR') ||
    hasWord('SOFORU') ||
    hasWord('BEKCI') ||
    hasWord('BEKCISI') ||
    g.includes('TEMIZLIKCI') ||
    hasWord('ASCI') ||
    hasWord('CAYCI') ||
    hasWord('SAPANCI') ||
    hasWord('BETONCU') ||
    hasWord('ALPINIST') ||
    hasWord('KUMLAMACI') ||
    hasWord('TAMIRCISI') ||
    hasWord('TAMIRCI') ||
    hasWord('TESISATCI') ||
    hasWord('AMBARCI') ||
    hasWord('AMBARCISI') ||
    hasWord('SENOR') ||
    hasWord('HIZMETLI') ||
    hasWord('ITFAIYECI') ||
    hasWord('KALAYCI') ||
    hasWord('SIVACI') ||
    hasWord('DUVARCI') ||
    hasWord('SERAMIKCI') ||
    hasWord('ALCIPANCI') ||
    hasWord('NUMARATOR') ||
    g === 'GUVENLIK MEMURU' ||
    g === 'AILE UYESI' ||
    g.includes('HAVALANDIRMA') ||
    g.includes('YEMEKHANE') ||
    g.includes('KANTIN') ||
    g.includes('CAMASIRHANE') ||
    g.includes('TEZGAH ELEMANI') ||
    g.includes('IDARI ISLER ELEMANI') ||
    g.includes('OFIS CALISANI') ||
    g.includes('TOPRAK ISLERI') ||
    g.includes('IMALATCISI') ||
    g.includes('PERMITCI') ||
    g.includes('PERMITCISI') ||
    g.includes('VINC OPERATORU') ||
    g.includes('FORKLIFT OPERATORU') ||
    g.includes('HIUP OPERATORU') ||
    g.includes('PEKANISKA OPERATORU') ||
    g.includes('PLAZMA KESIM OPERATORU') ||
    g.includes('BORU KESIM OPERATORU') ||
    g.includes('EKSKAVATOR OPERATORU') ||
    g.includes('KOMPRESOR OPERATORU') ||
    g.includes('CNC OPERATORU') ||
    g.includes('KAYNAK MAKINASI OPERATORU') ||
    g.includes('KAYNAK OTOMASYON OPERATORU') ||
    g.includes('PWHT OPERATORU') ||
    g.includes('ISIL ISLEM OPERATORU') ||
    g.includes('OPERATOR YARDIMCISI') ||
    g.includes('TRANSPORT YARDIMCISI') ||
    g.includes('TEKNISYENI')
  ) {
    return 8;
  }

  if (
    endirektDirekt === 'Endirekt' ||
    g.includes('MUHENDIS') ||
    g.includes('SUPERVIZOR') ||
    g.includes('UZMAN') ||
    g.includes('INSPEKTOR') ||
    g.includes('TEKNIKER') ||
    g.includes('MEMUR') ||
    g.includes('DOKTOR') ||
    g.includes('AVUKAT') ||
    g.includes('MUHASEBECI') ||
    g.includes('PUANTOR') ||
    g.includes('TOPOGRAF') ||
    g.includes('TERCUMAN') ||
    g.includes('SEKRETER') ||
    g.includes('DANISMAN') ||
    g.includes('RESSAM') ||
    g.includes('SAGLIK GOREVLISI') ||
    g.includes('LABORANT') ||
    g.includes('EGITMENI') ||
    g.includes('DOKUMANTASYON') ||
    g.includes('DOKÜMAN') ||
    g.includes('OPERATORU') ||
    g.includes('STAJYER')
  ) {
    return 6;
  }

  return 8;
}

interface SeedEntry {
  normTitle: string;
  displayTitle: string;
  levelNo: number;
}

export function ensureOrgJobTitleLevelsTable(dbArg?: any) {
  const db = dbArg || getDb();
  const gState = globalThis as unknown as { __ponderaOrgJobLevelsEnsured?: boolean };
  if (gState.__ponderaOrgJobLevelsEnsured) {
    return db;
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS org_job_title_levels (
        norm_title TEXT PRIMARY KEY,
        display_title TEXT NOT NULL,
        level_no INTEGER NOT NULL CHECK (level_no BETWEEN 1 AND 8),
        is_confirmed INTEGER NOT NULL DEFAULT 1,
        source TEXT NOT NULL DEFAULT 'seed',
        updated_by TEXT DEFAULT '',
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_org_job_levels_lvl ON org_job_title_levels(level_no);
      CREATE INDEX IF NOT EXISTS idx_org_job_levels_conf ON org_job_title_levels(is_confirmed);
    `);

    const countRow = db
      .prepare('SELECT COUNT(*) as cnt FROM org_job_title_levels')
      .get() as { cnt: number };

    const seeds = seedEntriesJson as SeedEntry[];
    if ((countRow?.cnt || 0) < seeds.length) {
      const ins = db.prepare(`
        INSERT OR IGNORE INTO org_job_title_levels (
          norm_title, display_title, level_no, is_confirmed, source, updated_by, updated_at
        ) VALUES (?, ?, ?, 1, 'seed', 'Sistem Başlangıç Analizi', '14.11.2026 20:00')
      `);
      db.exec('BEGIN');
      try {
        for (const s of seeds) {
          const nk = normalizeOrgJobTitle(s.normTitle || s.displayTitle);
          if (!nk) continue;
          ins.run(nk, String(s.displayTitle || nk).trim(), clampOrgJobLevel(s.levelNo));
        }
        db.exec('COMMIT');
      } catch (e) {
        try {
          db.exec('ROLLBACK');
        } catch {}
        throw e;
      }
    }

    gState.__ponderaOrgJobLevelsEnsured = true;
  } catch {
    // Read-only fallback safety
  }

  return db;
}

export function getOrgJobLevelsRevision(dbArg?: any): string {
  try {
    const db = dbArg || getDb();
    const row = db
      .prepare("SELECT value FROM system_info WHERE key = 'org_job_levels_rev'")
      .get() as { value?: string } | undefined;
    return row?.value || '0';
  } catch {
    return '0';
  }
}

export function syncAndGetJobTitleLevels(dbArg?: any): {
  levelMap: Record<string, OrgJobClassLevel>;
  items: OrgJobTitleLevelRecord[];
  unconfirmedTitles: OrgJobTitleLevelRecord[];
  revision: string;
} {
  const db = ensureOrgJobTitleLevelsTable(dbArg);

  // Aggregate distinct job titles currently present in personnel
  const personnelStats = new Map<
    string,
    {
      displayTitle: string;
      activeCount: number;
      totalCount: number;
      endirektCount: number;
      direktCount: number;
      sampleEmployees: string[];
    }
  >();

  try {
    const pRows = db
      .prepare(
        `
        SELECT
          TRIM(COALESCE(gorevi, '')) as gorevi,
          TRIM(COALESCE(ad_soyad, '')) as ad_soyad,
          TRIM(COALESCE(genel_durum, '')) as genel_durum,
          TRIM(COALESCE(endirekt_direkt, '')) as yaka
        FROM personnel
        WHERE TRIM(COALESCE(gorevi, '')) != ''
      `
      )
      .all() as Array<{
      gorevi: string;
      ad_soyad: string;
      genel_durum: string;
      yaka: string;
    }>;

    for (const r of pRows) {
      const nk = normalizeOrgJobTitle(r.gorevi);
      if (!nk) continue;
      let st = personnelStats.get(nk);
      if (!st) {
        st = {
          displayTitle: r.gorevi,
          activeCount: 0,
          totalCount: 0,
          endirektCount: 0,
          direktCount: 0,
          sampleEmployees: [],
        };
        personnelStats.set(nk, st);
      }
      st.totalCount += 1;
      const isActive = r.genel_durum === 'Mevcut';
      if (isActive) {
        st.activeCount += 1;
        st.displayTitle = r.gorevi;
        if (st.sampleEmployees.length < 3 && r.ad_soyad) {
          st.sampleEmployees.push(r.ad_soyad);
        }
      }
      if (r.yaka === 'Endirekt') st.endirektCount += 1;
      else st.direktCount += 1;
    }
  } catch {}

  // Load existing rows from org_job_title_levels
  let dbRows: Array<{
    norm_title: string;
    display_title: string;
    level_no: number;
    is_confirmed: number;
    source: string;
    updated_by: string;
    updated_at: string;
  }> = [];

  try {
    dbRows = db
      .prepare(
        `
        SELECT norm_title, display_title, level_no, is_confirmed, source, updated_by, updated_at
        FROM org_job_title_levels
      `
      )
      .all() as typeof dbRows;
  } catch {}

  const existingSet = new Set(dbRows.map((r) => r.norm_title));

  // Auto-detect any brand-new job titles from personnel not yet in org_job_title_levels -> mark is_confirmed = 0!
  const newlyDetected: Array<{ normTitle: string; displayTitle: string; suggestedLevel: OrgJobClassLevel }> = [];
  for (const [nk, st] of Array.from(personnelStats.entries())) {
    if (!existingSet.has(nk)) {
      const yaka = st.endirektCount >= st.direktCount ? 'Endirekt' : 'Direkt';
      newlyDetected.push({
        normTitle: nk,
        displayTitle: st.displayTitle,
        suggestedLevel: suggestJobClassLevel(st.displayTitle, yaka),
      });
    }
  }

  if (newlyDetected.length > 0) {
    try {
      const nowStr = formatNowDdMmYyyyHhMm();
      const insNew = db.prepare(`
        INSERT OR IGNORE INTO org_job_title_levels (
          norm_title, display_title, level_no, is_confirmed, source, updated_by, updated_at
        ) VALUES (?, ?, ?, 0, 'new_detected', 'Sistem (Yeni Görev Tespiti)', ?)
      `);
      db.exec('BEGIN');
      try {
        for (const nd of newlyDetected) {
          insNew.run(nd.normTitle, nd.displayTitle, nd.suggestedLevel, nowStr);
          dbRows.push({
            norm_title: nd.normTitle,
            display_title: nd.displayTitle,
            level_no: nd.suggestedLevel,
            is_confirmed: 0,
            source: 'new_detected',
            updated_by: 'Sistem (Yeni Görev Tespiti)',
            updated_at: nowStr,
          });
        }
        db.exec('COMMIT');
      } catch {
        try {
          db.exec('ROLLBACK');
        } catch {}
      }
    } catch {}
  }

  const levelMap: Record<string, OrgJobClassLevel> = {};
  const items: OrgJobTitleLevelRecord[] = [];

  if (dbRows.length === 0) {
    // Fallback to seed list if DB is unavailable
    for (const s of seedEntriesJson as SeedEntry[]) {
      const nk = normalizeOrgJobTitle(s.normTitle || s.displayTitle);
      const lvl = clampOrgJobLevel(s.levelNo);
      levelMap[nk] = lvl;
      const st = personnelStats.get(nk);
      items.push({
        normTitle: nk,
        displayTitle: st?.displayTitle || s.displayTitle,
        levelNo: lvl,
        isConfirmed: true,
        source: 'seed',
        updatedBy: 'Sistem Başlangıç Analizi',
        updatedAt: '14.11.2026 20:00',
        activeCount: st?.activeCount || 0,
        totalCount: st?.totalCount || 0,
        sampleEmployees: st?.sampleEmployees || [],
      });
    }
  } else {
    for (const r of dbRows) {
      const nk = r.norm_title;
      const lvl = clampOrgJobLevel(r.level_no);
      levelMap[nk] = lvl;
      const st = personnelStats.get(nk);
      items.push({
        normTitle: nk,
        displayTitle: st?.displayTitle || r.display_title || nk,
        levelNo: lvl,
        isConfirmed: Number(r.is_confirmed) === 1,
        source:
          r.source === 'manual'
            ? 'manual'
            : r.source === 'new_detected'
              ? 'new_detected'
              : 'seed',
        updatedBy: r.updated_by || '',
        updatedAt: r.updated_at || '',
        activeCount: st?.activeCount || 0,
        totalCount: st?.totalCount || 0,
        sampleEmployees: st?.sampleEmployees || [],
      });
    }
  }

  items.sort((a, b) => {
    if (a.isConfirmed !== b.isConfirmed) return a.isConfirmed ? 1 : -1;
    if (a.levelNo !== b.levelNo) return a.levelNo - b.levelNo;
    if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
    return a.displayTitle.localeCompare(b.displayTitle, 'tr');
  });

  const unconfirmedTitles = items.filter((it) => !it.isConfirmed);
  const revision = getOrgJobLevelsRevision(db);

  return {
    levelMap,
    items,
    unconfirmedTitles,
    revision,
  };
}

export function saveJobTitleLevels(
  updates: Array<{ title: string; displayTitle?: string; levelNo: number }>,
  actorName: string
): { savedCount: number; revision: string } {
  const db = ensureOrgJobTitleLevelsTable();
  const nowStr = formatNowDdMmYyyyHhMm();
  const nextRev = String(Date.now());

  const upsertStmt = db.prepare(`
    INSERT INTO org_job_title_levels (
      norm_title, display_title, level_no, is_confirmed, source, updated_by, updated_at
    ) VALUES (?, ?, ?, 1, 'manual', ?, ?)
    ON CONFLICT(norm_title) DO UPDATE SET
      display_title = COALESCE(NULLIF(excluded.display_title, ''), org_job_title_levels.display_title),
      level_no = excluded.level_no,
      is_confirmed = 1,
      source = 'manual',
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `);

  let savedCount = 0;
  db.exec('BEGIN');
  try {
    for (const u of updates) {
      const rawDisplay = String(u.displayTitle || u.title || '').trim();
      const nk = normalizeOrgJobTitle(u.title || rawDisplay);
      if (!nk) continue;
      const lvl = clampOrgJobLevel(u.levelNo);
      upsertStmt.run(nk, rawDisplay || nk, lvl, actorName, nowStr);
      savedCount += 1;
    }

    db.exec(`CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT);`);
    db.prepare(
      "INSERT OR REPLACE INTO system_info (key, value) VALUES ('org_job_levels_rev', ?)"
    ).run(nextRev);
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw err;
  }

  const gCache = globalThis as unknown as { __ponderaOrgChartCache?: Map<string, any> };
  if (gCache.__ponderaOrgChartCache) {
    gCache.__ponderaOrgChartCache.clear();
  }

  return { savedCount, revision: nextRev };
}
