import { getDb } from '@/lib/db';
import { resolveEffectiveRegion } from '@/lib/regionSiteHelper';

export type CampType = 'modular' | 'dormitory' | 'staff' | 'apartment';
export type RoomType = 'worker' | 'staff' | 'manager';
export type RoomOperationalStatus = 'active' | 'maintenance' | 'reserved';
export type RoomOccupancyState = 'empty' | 'partial' | 'full' | 'over_capacity' | 'maintenance' | 'reserved';

export interface SafeCampResident {
  sicilNo: string;
  adSoyad: string;
  uyruk: string;
  kategori: string;
  firma: string;
  departman: string;
  gorevi: string;
  cinsiyet: string;
  shift: string;
  genelDurum: string;
  guncelDurum: string;
  statusCategory: 'active' | 'standby';
  region: string;
  projectName: string;
  campCode: string;
  roomNo: string;
  siteEntryDate: string;
  isManualOverride: boolean;
}

export interface CampRoomDetail {
  id: number;
  campId: number;
  roomNo: string;
  floorNo: number;
  capacity: number;
  roomType: RoomType;
  status: RoomOperationalStatus;
  isInferredEmpty: boolean;
  notes: string;
  activeCount: number;
  standbyCount: number;
  totalOccupants: number;
  emptyBeds: number;
  overCapacityBeds: number;
  occupancyState: RoomOccupancyState;
  residents: SafeCampResident[];
}

export interface CampDefinitionDetail {
  id: number;
  region: string;
  projectName: string;
  campCode: string;
  campName: string;
  campType: CampType;
  defaultRoomCapacity: number;
  isAutoSeeded: boolean;
  notes: string;
  updatedBy: string;
  updatedAt: string;
  totalRooms: number;
  emptyRooms: number;
  partialRooms: number;
  fullRooms: number;
  overCapacityRooms: number;
  maintenanceRooms: number;
  reservedRooms: number;
  inferredRooms: number;
  floorsCount: number;
  totalCapacity: number;
  activeOccupants: number;
  standbyOccupants: number;
  totalOccupants: number;
  campUnassignedRoomOccupants: number;
  availableBeds: number;
  overCapacityBeds: number;
  occupancyRate: number;
  unassignedRoomResidents: SafeCampResident[];
  rooms: CampRoomDetail[];
}

export interface SiteCampSummary {
  region: string;
  projectName: string;
  campCount: number;
  totalRooms: number;
  totalBedCapacity: number;
  emptyBeds: number;
  siteTotalActive: number;
  siteTotalStandby: number;
  assignedActive: number;
  assignedStandby: number;
  unassignedActive: number;
  unassignedStandby: number;
  coverageRate: number;
  standbyCoverageGap: number;
}

export interface CampFilterRegionOption {
  name: string;
  activePersonnel: number;
  standbyPersonnel: number;
  campCount: number;
}

export interface CampFilterProjectOption {
  name: string;
  region: string;
  activePersonnel: number;
  standbyPersonnel: number;
  campCount: number;
}

export interface CampAnalyticsKpis {
  totalCamps: number;
  totalRooms: number;
  emptyRoomsCount: number;
  inferredEmptyRoomsCount: number;
  maintenanceRoomsCount: number;
  totalBedCapacity: number;
  activeOccupiedBeds: number;
  standbyOccupiedBeds: number;
  unassignedRoomInCampCount: number;
  totalOccupiedBeds: number;
  availableEmptyBeds: number;
  overCapacityBeds: number;
  occupancyRate: number;
  siteTotalActive: number;
  siteTotalStandby: number;
  unassignedCampActive: number;
  unassignedCampStandby: number;
}

export interface CampNationalityItem {
  nationality: string;
  activeCount: number;
  standbyCount: number;
  total: number;
}

export interface CampAnalyticsPayload {
  filterOptions: {
    regions: CampFilterRegionOption[];
    projects: CampFilterProjectOption[];
  };
  kpis: CampAnalyticsKpis;
  camps: CampDefinitionDetail[];
  siteSummaries: SiteCampSummary[];
  nationalityBreakdown: CampNationalityItem[];
  unassignedPersonnelSample: SafeCampResident[];
  allCampResidents: SafeCampResident[];
}

interface RawPersonnelRow {
  sicil_no: string;
  ad_soyad: string;
  uyruk: string;
  kategori: string;
  firma: string;
  departman: string;
  gorevi: string;
  cinsiyet: string;
  gunduz_gece: string;
  genel_durum: string;
  guncel_durum: string;
  region: string;
  proje_adi: string;
  santiye_giris_tarihi: string;
  ise_giris_tarihi: string;
  kamp_no: string;
  oda_no: string;
  all_data_json: string;
}

interface OverrideRow {
  sicil_no: string;
  region: string;
  project_name: string;
  camp_code: string;
  room_no: string;
}

interface CampDefRow {
  id: number;
  region: string;
  project_name: string;
  camp_code: string;
  camp_name: string;
  camp_type: string;
  default_room_capacity: number;
  initial_rooms_seeded: number;
  is_auto_seeded: number;
  notes: string;
  updated_by: string;
  updated_at: string;
}

interface CampRoomRow {
  id: number;
  camp_id: number;
  room_no: string;
  floor_no: number;
  capacity: number;
  room_type: string;
  status: string;
  is_inferred_empty: number;
  notes: string;
  updated_at: string;
}

const HUB_ALIAS_MAP: Record<string, string[]> = {
  moskova: ['merkez ofis', 'moskova', 'moscow'],
  'nijniy novgorod': ['nizhny novgorod', 'nijniy novgorod', 'нижний новгород'],
};

function cleanCampField(val: unknown): string {
  const s = String(val ?? '').trim();
  if (!s) return '';
  const low = s.toLowerCase();
  if (low === '-' || low === '--' || low === '0' || low === 'nan' || low === 'null' || low === 'undefined' || low === 'yok') {
    return '';
  }
  return s.replace(/\s+/g, ' ');
}

function classifyStandby(genelDurum: string, guncelDurum: string): 'active' | 'standby' {
  const gd = String(genelDurum || '').trim().toLowerCase();
  const gu = String(guncelDurum || '').trim().toLowerCase();
  if (gd === 'bekleniyor' || gd === 'sevke hazır' || gd === 'sevke hazir') {
    return 'standby';
  }
  if (
    gu.includes('bekliyor') ||
    gu.includes('calismiyor') ||
    gu.includes('çalışmıyor')
  ) {
    return 'standby';
  }
  return 'active';
}

export function inferCampTypeAndName(campCode: string, projectName: string): {
  campType: CampType;
  campName: string;
  defaultCapacity: number;
} {
  const upper = campCode.toUpperCase();
  if (campCode === 'MERKEZ-LOJMAN') {
    return {
      campType: 'dormitory',
      campName: `${projectName} Merkez Lojman`,
      defaultCapacity: 4,
    };
  }
  if (/STAFF|MERKEZ|OFIS|OFİS|MÜHENDİS|MUHENDIS|ДОМ/i.test(campCode)) {
    return {
      campType: 'staff',
      campName: `${campCode} Staff Lojmanı`,
      defaultCapacity: 2,
    };
  }
  if (/^2\.[0-9]|^[BВ]\s*-?\d/i.test(upper)) {
    return {
      campType: 'modular',
      campName: `Blok ${campCode} Modüler Kamp`,
      defaultCapacity: 4,
    };
  }
  return {
    campType: 'dormitory',
    campName: `Kamp ${campCode} (${projectName})`,
    defaultCapacity: 4,
  };
}

export function parseRoomFloor(roomNo: string): number {
  const clean = cleanCampField(roomNo);
  if (!clean) return 1;
  const numMatch = clean.match(/^(\d{1,4})(?:[A-Za-zА-Яа-я])?$/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n >= 100 && n <= 999) {
      return Math.max(1, Math.min(9, Math.floor(n / 100)));
    }
    if (n >= 1000) {
      const hundreds = Math.floor((n % 1000) / 100);
      return Math.max(1, Math.min(9, hundreds || 1));
    }
    if (n >= 1 && n <= 99) {
      return Math.min(4, Math.floor((n - 1) / 25) + 1);
    }
  }
  const dashMatch = clean.match(/^(\d{1,2})\s*[-/.]\s*\d+/);
  if (dashMatch) {
    const f = parseInt(dashMatch[1], 10);
    if (f >= 1 && f <= 9) return f;
  }
  return 1;
}

function naturalRoomSort(a: { floorNo: number; roomNo: string }, b: { floorNo: number; roomNo: string }): number {
  if (a.floorNo !== b.floorNo) return a.floorNo - b.floorNo;
  const ma = a.roomNo.match(/^(\d+)(.*)$/);
  const mb = b.roomNo.match(/^(\d+)(.*)$/);
  if (ma && mb) {
    const na = parseInt(ma[1], 10);
    const nb = parseInt(mb[1], 10);
    if (na !== nb) return na - nb;
    return ma[2].localeCompare(mb[2], 'tr');
  }
  return a.roomNo.localeCompare(b.roomNo, 'tr');
}

function buildInferredRoomNumbers(observedRooms: string[]): string[] {
  const numeric3Map = new Map<number, number[]>();
  const numericSmall: number[] = [];

  for (const r of observedRooms) {
    const m = r.match(/^(\d{1,3})$/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n >= 100 && n <= 999) {
      const floor = Math.floor(n / 100);
      const sub = n % 100;
      if (sub >= 1 && sub <= 99) {
        if (!numeric3Map.has(floor)) numeric3Map.set(floor, []);
        numeric3Map.get(floor)!.push(sub);
      }
    } else if (n >= 1 && n <= 99) {
      numericSmall.push(n);
    }
  }

  const inferred = new Set<string>();

  for (const [floor, subsRaw] of Array.from(numeric3Map.entries())) {
    const sorted = Array.from(new Set(subsRaw)).sort((a, b) => a - b);
    const clusters: number[][] = [];
    for (const sub of sorted) {
      const last = clusters[clusters.length - 1];
      if (!last || sub - last[last.length - 1] > 12) {
        clusters.push([sub]);
      } else {
        last.push(sub);
      }
    }
    for (const cluster of clusters) {
      const minS = cluster[0];
      const maxS = cluster[cluster.length - 1];
      const startS = minS <= 10 ? 1 : Math.max(1, minS - 3);
      let endS = Math.min(99, Math.max(maxS + 3, startS + 9));
      if (endS - startS > 17) {
        endS = startS + 17;
      }
      for (let s = startS; s <= endS; s++) {
        inferred.add(String(floor * 100 + s));
      }
    }
  }

  if (numericSmall.length > 0) {
    const sorted = Array.from(new Set(numericSmall)).sort((a, b) => a - b);
    const clusters: number[][] = [];
    for (const num of sorted) {
      const last = clusters[clusters.length - 1];
      if (!last || num - last[last.length - 1] > 10) {
        clusters.push([num]);
      } else {
        last.push(num);
      }
    }
    for (const cluster of clusters) {
      const minN = cluster[0];
      const maxN = cluster[cluster.length - 1];
      const startN = minN <= 8 ? 1 : Math.max(1, minN - 3);
      let endN = Math.max(maxN + 3, startN + 7);
      if (endN - startN > 13) {
        endN = startN + 13;
      }
      for (let n = startN; n <= endN; n++) {
        inferred.add(String(n));
      }
    }
  }

  if (observedRooms.length === 0 || (inferred.size === 0 && observedRooms.length <= 2)) {
    for (let n = 101; n <= 108; n++) {
      inferred.add(String(n));
    }
  }

  return Array.from(inferred);
}

export function matchesCampRlsScope(
  rawRegion: string,
  rawProject: string,
  scopeType: string,
  scopeValue: string
): boolean {
  const st = String(scopeType || 'all').trim().toLowerCase();
  const sv = String(scopeValue || 'all').trim();
  const svLower = sv.toLowerCase();
  if (st === 'all' || !sv || svLower === 'all' || svLower === 'tümü' || svLower === 'tüm şantiyeler') {
    return true;
  }

  const regTrim = String(rawRegion || '').trim();
  const regLower = regTrim.toLowerCase();
  const prjTrim = String(rawProject || '').trim();
  const prjLower = prjTrim.toLowerCase();
  const effLower = resolveEffectiveRegion(regTrim, prjTrim, '').toLowerCase();

  const hubAliases = HUB_ALIAS_MAP[svLower];
  if (hubAliases && (hubAliases.includes(regLower) || hubAliases.includes(prjLower) || hubAliases.includes(effLower))) {
    return true;
  }

  if (st === 'region') {
    return regLower === svLower || effLower === svLower || prjLower === svLower;
  }
  if (st === 'project') {
    return prjLower === svLower || effLower === svLower;
  }
  return true;
}

function ensureCampTablesExist(): void {
  const gState = globalThis as Record<string, any>;
  if (gState.__ponderaCampTablesEnsured) return;

  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS camp_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      region TEXT NOT NULL,
      project_name TEXT NOT NULL,
      camp_code TEXT NOT NULL,
      camp_name TEXT NOT NULL,
      camp_type TEXT NOT NULL DEFAULT 'modular',
      default_room_capacity INTEGER NOT NULL DEFAULT 4,
      initial_rooms_seeded INTEGER NOT NULL DEFAULT 0,
      is_auto_seeded INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(region, project_name, camp_code)
    );

    CREATE TABLE IF NOT EXISTS camp_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camp_id INTEGER NOT NULL,
      room_no TEXT NOT NULL,
      floor_no INTEGER NOT NULL DEFAULT 1,
      capacity INTEGER NOT NULL DEFAULT 4,
      room_type TEXT NOT NULL DEFAULT 'worker',
      status TEXT NOT NULL DEFAULT 'active',
      is_inferred_empty INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(camp_id, room_no)
    );

    CREATE TABLE IF NOT EXISTS camp_deleted_rooms (
      camp_id INTEGER NOT NULL,
      room_no TEXT NOT NULL,
      PRIMARY KEY(camp_id, room_no)
    );

    CREATE TABLE IF NOT EXISTS camp_personnel_overrides (
      sicil_no TEXT PRIMARY KEY,
      region TEXT NOT NULL DEFAULT '',
      project_name TEXT NOT NULL DEFAULT '',
      camp_code TEXT NOT NULL DEFAULT '',
      room_no TEXT NOT NULL DEFAULT '',
      updated_by TEXT DEFAULT '',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_camp_defs_region_proj ON camp_definitions(region, project_name);
    CREATE INDEX IF NOT EXISTS idx_camp_rooms_camp_id ON camp_rooms(camp_id);
  `);

  gState.__ponderaCampTablesEnsured = true;
}

function extractSafeResidents(): SafeCampResident[] {
  ensureCampTablesExist();
  const db = getDb();

  const overridesRows = db
    .prepare('SELECT sicil_no, region, project_name, camp_code, room_no FROM camp_personnel_overrides')
    .all() as unknown as OverrideRow[];
  const overrideMap = new Map<string, OverrideRow>();
  for (const ov of overridesRows) {
    overrideMap.set(String(ov.sicil_no).trim(), ov);
  }

  const rows = db
    .prepare(
      `SELECT sicil_no, ad_soyad, uyruk, kategori, firma, departman, gorevi, cinsiyet, gunduz_gece,
              genel_durum, guncel_durum, region, proje_adi, santiye_giris_tarihi, ise_giris_tarihi,
              kamp_no, oda_no, all_data_json
       FROM personnel
       WHERE COALESCE(genel_durum, '') NOT IN ('Cikis', 'Sevki Iptal')`
    )
    .all() as unknown as RawPersonnelRow[];

  const residents: SafeCampResident[] = [];

  for (const r of rows) {
    const sicilNo = String(r.sicil_no || '').trim();
    const baseRegion = String(r.region || '').trim() || 'Belirsiz';
    const baseProject = String(r.proje_adi || '').trim() || baseRegion;
    const override = sicilNo ? overrideMap.get(sicilNo) : undefined;

    let effRegion = baseRegion;
    let effProject = baseProject;
    let campCode = cleanCampField(r.kamp_no);
    let roomNo = cleanCampField(r.oda_no);

    if ((!campCode || !roomNo) && r.all_data_json && (r.all_data_json.includes('Kamp No') || r.all_data_json.includes('Oda No'))) {
      try {
        const parsed = JSON.parse(r.all_data_json) as Record<string, unknown>;
        if (!campCode) campCode = cleanCampField(parsed['Kamp No'] ?? parsed['KAMP NO']);
        if (!roomNo) roomNo = cleanCampField(parsed['Oda No'] ?? parsed['ODA NO']);
      } catch {
        // ignore malformed json
      }
    }

    let isManualOverride = false;
    if (override) {
      isManualOverride = true;
      if (override.camp_code === '__UNASSIGNED__') {
        campCode = '';
        roomNo = '';
      } else {
        if (override.region) effRegion = override.region;
        if (override.project_name) effProject = override.project_name;
        campCode = cleanCampField(override.camp_code);
        roomNo = cleanCampField(override.room_no);
      }
    } else if (!campCode && roomNo) {
      campCode = 'MERKEZ-LOJMAN';
    }

    residents.push({
      sicilNo,
      adSoyad: String(r.ad_soyad || '').trim() || sicilNo,
      uyruk: String(r.uyruk || '').trim() || 'Belirsiz',
      kategori: String(r.kategori || '').trim() || '-',
      firma: String(r.firma || '').trim() || '-',
      departman: String(r.departman || '').trim() || '-',
      gorevi: String(r.gorevi || '').trim() || '-',
      cinsiyet: String(r.cinsiyet || '').trim() || '-',
      shift: cleanCampField(r.gunduz_gece) || 'Gündüz',
      genelDurum: String(r.genel_durum || '').trim(),
      guncelDurum: String(r.guncel_durum || '').trim(),
      statusCategory: classifyStandby(r.genel_durum, r.guncel_durum),
      region: effRegion,
      projectName: effProject,
      campCode,
      roomNo,
      siteEntryDate: String(r.santiye_giris_tarihi || r.ise_giris_tarihi || '').trim(),
      isManualOverride,
    });
  }

  return residents;
}

export function ensureAndSyncCamps(residents?: SafeCampResident[]): SafeCampResident[] {
  ensureCampTablesExist();
  const allResidents = residents ?? extractSafeResidents();
  const db = getDb();

  // Group observed camp assignments by (region || projectName || campCode)
  const observedCampGroups = new Map<
    string,
    {
      region: string;
      projectName: string;
      campCode: string;
      roomCounts: Map<string, number>;
    }
  >();

  for (const res of allResidents) {
    if (!res.campCode) continue;
    const key = `${res.region}|||${res.projectName}|||${res.campCode}`;
    if (!observedCampGroups.has(key)) {
      observedCampGroups.set(key, {
        region: res.region,
        projectName: res.projectName,
        campCode: res.campCode,
        roomCounts: new Map(),
      });
    }
    if (res.roomNo) {
      const grp = observedCampGroups.get(key)!;
      grp.roomCounts.set(res.roomNo, (grp.roomCounts.get(res.roomNo) || 0) + 1);
    }
  }

  const existingDefs = db
    .prepare('SELECT * FROM camp_definitions')
    .all() as unknown as CampDefRow[];
  const defByKey = new Map<string, CampDefRow>();
  for (const d of existingDefs) {
    defByKey.set(`${d.region}|||${d.project_name}|||${d.camp_code}`, d);
  }

  const insertDefStmt = db.prepare(`
    INSERT INTO camp_definitions (region, project_name, camp_code, camp_name, camp_type, default_room_capacity, initial_rooms_seeded, is_auto_seeded, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, 0, 1, 'auto-seed')
  `);
  const insertRoomIgnoreStmt = db.prepare(`
    INSERT OR IGNORE INTO camp_rooms (camp_id, room_no, floor_no, capacity, room_type, status, is_inferred_empty)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `);
  const markSeededStmt = db.prepare(
    'UPDATE camp_definitions SET initial_rooms_seeded = 1 WHERE id = ?'
  );

  db.exec('BEGIN IMMEDIATE');
  try {
    // 1. Create missing camp definitions for observed camps
    for (const [key, grp] of Array.from(observedCampGroups.entries())) {
      if (!defByKey.has(key)) {
        const meta = inferCampTypeAndName(grp.campCode, grp.projectName);
        const info = insertDefStmt.run(
          grp.region,
          grp.projectName,
          grp.campCode,
          meta.campName,
          meta.campType,
          meta.defaultCapacity
        );
        const insertedId = Number(info.lastInsertRowid);
        defByKey.set(key, {
          id: insertedId,
          region: grp.region,
          project_name: grp.projectName,
          camp_code: grp.campCode,
          camp_name: meta.campName,
          camp_type: meta.campType,
          default_room_capacity: meta.defaultCapacity,
          initial_rooms_seeded: 0,
          is_auto_seeded: 1,
          notes: '',
          updated_by: 'auto-seed',
          updated_at: new Date().toISOString(),
        });
      }
    }

    // 2. Load deleted rooms blacklist so user-deleted rooms are never re-added automatically
    const deletedRows = db
      .prepare('SELECT camp_id, room_no FROM camp_deleted_rooms')
      .all() as unknown as { camp_id: number; room_no: string }[];
    const deletedSet = new Set(deletedRows.map((d) => `${d.camp_id}|||${d.room_no}`));

    // 3. Seed rooms + sequential inferred empty rooms if initial_rooms_seeded === 0;
    //    and ensure newly occupied rooms exist for already-seeded camps
    for (const [key, def] of Array.from(defByKey.entries())) {
      const grp = observedCampGroups.get(key);
      const defaultCap = Math.max(1, Number(def.default_room_capacity) || 4);
      const roomType: RoomType = def.camp_type === 'staff' ? 'staff' : 'worker';

      if (def.initial_rooms_seeded === 0) {
        const observedNames = grp ? Array.from(grp.roomCounts.keys()) : [];
        for (const rNo of observedNames) {
          const occCount = grp!.roomCounts.get(rNo) || 1;
          const cap = Math.max(defaultCap, occCount);
          const floor = parseRoomFloor(rNo);
          if (!deletedSet.has(`${def.id}|||${rNo}`)) {
            insertRoomIgnoreStmt.run(def.id, rNo, floor, cap, roomType, 0);
          }
        }
        const inferredNames = buildInferredRoomNumbers(observedNames);
        for (const rNo of inferredNames) {
          if (grp?.roomCounts.has(rNo)) continue;
          if (deletedSet.has(`${def.id}|||${rNo}`)) continue;
          const floor = parseRoomFloor(rNo);
          insertRoomIgnoreStmt.run(def.id, rNo, floor, defaultCap, roomType, 1);
        }
        markSeededStmt.run(def.id);
      } else if (grp) {
        for (const [rNo, occCount] of Array.from(grp.roomCounts.entries())) {
          if (deletedSet.has(`${def.id}|||${rNo}`)) continue;
          const floor = parseRoomFloor(rNo);
          const cap = Math.max(defaultCap, occCount);
          insertRoomIgnoreStmt.run(def.id, rNo, floor, cap, roomType, 0);
        }
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    throw err;
  }

  return allResidents;
}

export function getCampAnalyticsPayload(options?: {
  region?: string;
  project?: string;
  scopeType?: string;
  scopeValue?: string;
}): CampAnalyticsPayload {
  const scopeType = options?.scopeType || 'all';
  const scopeValue = options?.scopeValue || 'all';
  const filterRegion = String(options?.region || 'all').trim();
  const filterProject = String(options?.project || 'all').trim();

  const allResidentsRaw = ensureAndSyncCamps();
  const db = getDb();

  const defRows = db
    .prepare('SELECT * FROM camp_definitions ORDER BY region ASC, project_name ASC, camp_code ASC')
    .all() as unknown as CampDefRow[];
  const roomRows = db
    .prepare('SELECT * FROM camp_rooms')
    .all() as unknown as CampRoomRow[];

  const roomsByCampId = new Map<number, CampRoomRow[]>();
  for (const r of roomRows) {
    if (!roomsByCampId.has(r.camp_id)) roomsByCampId.set(r.camp_id, []);
    roomsByCampId.get(r.camp_id)!.push(r);
  }

  // Filter residents & camps by RLS scope first so filterOptions only reveal authorized scopes
  const scopedResidents = allResidentsRaw.filter((r) =>
    matchesCampRlsScope(r.region, r.projectName, scopeType, scopeValue)
  );
  const scopedDefs = defRows.filter((d) =>
    matchesCampRlsScope(d.region, d.project_name, scopeType, scopeValue)
  );

  // Build filter options from scoped population
  const regionMap = new Map<string, CampFilterRegionOption>();
  const projectMap = new Map<string, CampFilterProjectOption>();

  for (const res of scopedResidents) {
    if (!regionMap.has(res.region)) {
      regionMap.set(res.region, { name: res.region, activePersonnel: 0, standbyPersonnel: 0, campCount: 0 });
    }
    const rItem = regionMap.get(res.region)!;
    if (res.statusCategory === 'standby') rItem.standbyPersonnel++;
    else rItem.activePersonnel++;

    const prjKey = `${res.region}|||${res.projectName}`;
    if (!projectMap.has(prjKey)) {
      projectMap.set(prjKey, {
        name: res.projectName,
        region: res.region,
        activePersonnel: 0,
        standbyPersonnel: 0,
        campCount: 0,
      });
    }
    const pItem = projectMap.get(prjKey)!;
    if (res.statusCategory === 'standby') pItem.standbyPersonnel++;
    else pItem.activePersonnel++;
  }

  for (const d of scopedDefs) {
    if (!regionMap.has(d.region)) {
      regionMap.set(d.region, { name: d.region, activePersonnel: 0, standbyPersonnel: 0, campCount: 0 });
    }
    regionMap.get(d.region)!.campCount++;

    const prjKey = `${d.region}|||${d.project_name}`;
    if (!projectMap.has(prjKey)) {
      projectMap.set(prjKey, {
        name: d.project_name,
        region: d.region,
        activePersonnel: 0,
        standbyPersonnel: 0,
        campCount: 0,
      });
    }
    projectMap.get(prjKey)!.campCount++;
  }

  const matchesSelection = (region: string, projectName: string): boolean => {
    if (filterRegion !== 'all' && region.toLowerCase() !== filterRegion.toLowerCase()) {
      return false;
    }
    if (filterProject !== 'all' && projectName.toLowerCase() !== filterProject.toLowerCase()) {
      return false;
    }
    return true;
  };

  const filteredResidents = scopedResidents.filter((r) => matchesSelection(r.region, r.projectName));
  const filteredDefs = scopedDefs.filter((d) => matchesSelection(d.region, d.project_name));

  // Index residents per (region || project || campCode) and per roomNo
  const residentsByCampKey = new Map<string, SafeCampResident[]>();
  const siteSummaryMap = new Map<string, SiteCampSummary>();
  const nationalityMap = new Map<string, CampNationalityItem>();
  const unassignedPersonnel: SafeCampResident[] = [];
  const allCampResidents: SafeCampResident[] = [];

  for (const res of filteredResidents) {
    const siteKey = `${res.region}|||${res.projectName}`;
    if (!siteSummaryMap.has(siteKey)) {
      siteSummaryMap.set(siteKey, {
        region: res.region,
        projectName: res.projectName,
        campCount: 0,
        totalRooms: 0,
        totalBedCapacity: 0,
        emptyBeds: 0,
        siteTotalActive: 0,
        siteTotalStandby: 0,
        assignedActive: 0,
        assignedStandby: 0,
        unassignedActive: 0,
        unassignedStandby: 0,
        coverageRate: 0,
        standbyCoverageGap: 0,
      });
    }
    const ss = siteSummaryMap.get(siteKey)!;
    if (res.statusCategory === 'standby') ss.siteTotalStandby++;
    else ss.siteTotalActive++;

    if (res.campCode) {
      allCampResidents.push(res);
      if (res.statusCategory === 'standby') ss.assignedStandby++;
      else ss.assignedActive++;

      const campKey = `${res.region}|||${res.projectName}|||${res.campCode}`;
      if (!residentsByCampKey.has(campKey)) residentsByCampKey.set(campKey, []);
      residentsByCampKey.get(campKey)!.push(res);

      const nat = res.uyruk || 'Belirsiz';
      if (!nationalityMap.has(nat)) {
        nationalityMap.set(nat, { nationality: nat, activeCount: 0, standbyCount: 0, total: 0 });
      }
      const nItem = nationalityMap.get(nat)!;
      if (res.statusCategory === 'standby') nItem.standbyCount++;
      else nItem.activeCount++;
      nItem.total++;
    } else {
      unassignedPersonnel.push(res);
      if (res.statusCategory === 'standby') ss.unassignedStandby++;
      else ss.unassignedActive++;
    }
  }

  // Enrich each camp definition
  const camps: CampDefinitionDetail[] = [];

  for (const d of filteredDefs) {
    const campKey = `${d.region}|||${d.project_name}|||${d.camp_code}`;
    const campResidents = residentsByCampKey.get(campKey) || [];
    const byRoom = new Map<string, SafeCampResident[]>();
    const unassignedRoomResidents: SafeCampResident[] = [];

    for (const res of campResidents) {
      if (res.roomNo) {
        if (!byRoom.has(res.roomNo)) byRoom.set(res.roomNo, []);
        byRoom.get(res.roomNo)!.push(res);
      } else {
        unassignedRoomResidents.push(res);
      }
    }

    const dbRooms = roomsByCampId.get(d.id) || [];
    const enrichedRooms: CampRoomDetail[] = dbRooms.map((r) => {
      const occ = byRoom.get(r.room_no) || [];
      let activeCount = 0;
      let standbyCount = 0;
      for (const person of occ) {
        if (person.statusCategory === 'standby') standbyCount++;
        else activeCount++;
      }
      const totalOccupants = occ.length;
      const cap = Math.max(1, Number(r.capacity) || 4);
      const status = (r.status || 'active') as RoomOperationalStatus;

      let occupancyState: RoomOccupancyState = 'empty';
      let emptyBeds = Math.max(0, cap - totalOccupants);
      let overCapacityBeds = Math.max(0, totalOccupants - cap);

      if (status === 'maintenance') {
        occupancyState = 'maintenance';
        emptyBeds = 0;
      } else if (totalOccupants > cap) {
        occupancyState = 'over_capacity';
        emptyBeds = 0;
      } else if (totalOccupants === cap) {
        occupancyState = 'full';
        emptyBeds = 0;
      } else if (status === 'reserved' && totalOccupants === 0) {
        occupancyState = 'reserved';
      } else if (totalOccupants > 0) {
        occupancyState = 'partial';
      } else {
        occupancyState = 'empty';
      }

      return {
        id: r.id,
        campId: r.camp_id,
        roomNo: r.room_no,
        floorNo: Math.max(1, Number(r.floor_no) || parseRoomFloor(r.room_no)),
        capacity: cap,
        roomType: (r.room_type || 'worker') as RoomType,
        status,
        isInferredEmpty: Boolean(r.is_inferred_empty) && totalOccupants === 0,
        notes: r.notes || '',
        activeCount,
        standbyCount,
        totalOccupants,
        emptyBeds,
        overCapacityBeds,
        occupancyState,
        residents: occ,
      };
    });

    enrichedRooms.sort(naturalRoomSort);

    let totalCapacity = 0;
    let availableBeds = 0;
    let overCapacityBeds = 0;
    let emptyRooms = 0;
    let partialRooms = 0;
    let fullRooms = 0;
    let overCapacityRooms = 0;
    let maintenanceRooms = 0;
    let reservedRooms = 0;
    let inferredRooms = 0;
    let maxFloor = 1;

    for (const rm of enrichedRooms) {
      totalCapacity += rm.capacity;
      availableBeds += rm.emptyBeds;
      overCapacityBeds += rm.overCapacityBeds;
      if (rm.floorNo > maxFloor) maxFloor = rm.floorNo;
      if (rm.isInferredEmpty) inferredRooms++;
      if (rm.occupancyState === 'empty') emptyRooms++;
      else if (rm.occupancyState === 'partial') partialRooms++;
      else if (rm.occupancyState === 'full') fullRooms++;
      else if (rm.occupancyState === 'over_capacity') overCapacityRooms++;
      else if (rm.occupancyState === 'maintenance') maintenanceRooms++;
      else if (rm.occupancyState === 'reserved') reservedRooms++;
    }

    const rawAvailableBeds = availableBeds;
    if (unassignedRoomResidents.length > 0) {
      availableBeds = Math.max(0, rawAvailableBeds - unassignedRoomResidents.length);
      if (unassignedRoomResidents.length > rawAvailableBeds) {
        overCapacityBeds += unassignedRoomResidents.length - rawAvailableBeds;
      }
    }

    let activeOccupants = 0;
    let standbyOccupants = 0;
    for (const res of campResidents) {
      if (res.statusCategory === 'standby') standbyOccupants++;
      else activeOccupants++;
    }
    const totalOccupants = campResidents.length;
    const occupancyRate =
      totalCapacity > 0 ? Math.min(100, Math.round((totalOccupants / totalCapacity) * 1000) / 10) : 0;

    // Update site summary metrics
    const siteKey = `${d.region}|||${d.project_name}`;
    if (!siteSummaryMap.has(siteKey)) {
      siteSummaryMap.set(siteKey, {
        region: d.region,
        projectName: d.project_name,
        campCount: 0,
        totalRooms: 0,
        totalBedCapacity: 0,
        emptyBeds: 0,
        siteTotalActive: 0,
        siteTotalStandby: 0,
        assignedActive: 0,
        assignedStandby: 0,
        unassignedActive: 0,
        unassignedStandby: 0,
        coverageRate: 0,
        standbyCoverageGap: 0,
      });
    }
    const ss = siteSummaryMap.get(siteKey)!;
    ss.campCount++;
    ss.totalRooms += enrichedRooms.length;
    ss.totalBedCapacity += totalCapacity;
    ss.emptyBeds += availableBeds;

    camps.push({
      id: d.id,
      region: d.region,
      projectName: d.project_name,
      campCode: d.camp_code,
      campName: d.camp_name,
      campType: (d.camp_type || 'modular') as CampType,
      defaultRoomCapacity: Math.max(1, Number(d.default_room_capacity) || 4),
      isAutoSeeded: Boolean(d.is_auto_seeded),
      notes: d.notes || '',
      updatedBy: d.updated_by || '',
      updatedAt: d.updated_at || '',
      totalRooms: enrichedRooms.length,
      emptyRooms,
      partialRooms,
      fullRooms,
      overCapacityRooms,
      maintenanceRooms,
      reservedRooms,
      inferredRooms,
      floorsCount: maxFloor,
      totalCapacity,
      activeOccupants,
      standbyOccupants,
      totalOccupants,
      campUnassignedRoomOccupants: unassignedRoomResidents.length,
      availableBeds,
      overCapacityBeds,
      occupancyRate,
      unassignedRoomResidents,
      rooms: enrichedRooms,
    });
  }

  camps.sort((a, b) => {
    if (b.totalOccupants !== a.totalOccupants) return b.totalOccupants - a.totalOccupants;
    if (a.region !== b.region) return a.region.localeCompare(b.region, 'tr');
    return a.campCode.localeCompare(b.campCode, 'tr');
  });

  // Finalize KPI totals & Site Summaries
  let totalRooms = 0;
  let emptyRoomsCount = 0;
  let inferredEmptyRoomsCount = 0;
  let maintenanceRoomsCount = 0;
  let totalBedCapacity = 0;
  let activeOccupiedBeds = 0;
  let standbyOccupiedBeds = 0;
  let unassignedRoomInCampCount = 0;
  let availableEmptyBeds = 0;
  let overCapacityBeds = 0;

  for (const c of camps) {
    totalRooms += c.totalRooms;
    emptyRoomsCount += c.emptyRooms;
    inferredEmptyRoomsCount += c.inferredRooms;
    maintenanceRoomsCount += c.maintenanceRooms;
    totalBedCapacity += c.totalCapacity;
    activeOccupiedBeds += c.activeOccupants;
    standbyOccupiedBeds += c.standbyOccupants;
    unassignedRoomInCampCount += c.campUnassignedRoomOccupants;
    availableEmptyBeds += c.availableBeds;
    overCapacityBeds += c.overCapacityBeds;
  }

  const totalOccupiedBeds = activeOccupiedBeds + standbyOccupiedBeds;
  const siteTotalActive = filteredResidents.filter((r) => r.statusCategory === 'active').length;
  const siteTotalStandby = filteredResidents.filter((r) => r.statusCategory === 'standby').length;
  const unassignedCampActive = unassignedPersonnel.filter((r) => r.statusCategory === 'active').length;
  const unassignedCampStandby = unassignedPersonnel.filter((r) => r.statusCategory === 'standby').length;

  const siteSummaries = Array.from(siteSummaryMap.values())
    .map((s) => {
      const totalSitePeople = s.siteTotalActive + s.siteTotalStandby;
      const assignedTotal = s.assignedActive + s.assignedStandby;
      return {
        ...s,
        coverageRate: totalSitePeople > 0 ? Math.round((assignedTotal / totalSitePeople) * 1000) / 10 : 0,
        standbyCoverageGap: Math.max(0, s.unassignedStandby - s.emptyBeds),
      };
    })
    .sort((a, b) => b.siteTotalActive + b.siteTotalStandby - (a.siteTotalActive + a.siteTotalStandby));

  const nationalityBreakdown = Array.from(nationalityMap.values()).sort((a, b) => b.total - a.total);

  return {
    filterOptions: {
      regions: Array.from(regionMap.values()).sort(
        (a, b) => b.activePersonnel + b.standbyPersonnel - (a.activePersonnel + a.standbyPersonnel)
      ),
      projects: Array.from(projectMap.values()).sort(
        (a, b) => b.activePersonnel + b.standbyPersonnel - (a.activePersonnel + a.standbyPersonnel)
      ),
    },
    kpis: {
      totalCamps: camps.length,
      totalRooms,
      emptyRoomsCount,
      inferredEmptyRoomsCount,
      maintenanceRoomsCount,
      totalBedCapacity,
      activeOccupiedBeds,
      standbyOccupiedBeds,
      unassignedRoomInCampCount,
      totalOccupiedBeds,
      availableEmptyBeds,
      overCapacityBeds,
      occupancyRate:
        totalBedCapacity > 0 ? Math.min(100, Math.round((totalOccupiedBeds / totalBedCapacity) * 1000) / 10) : 0,
      siteTotalActive,
      siteTotalStandby,
      unassignedCampActive,
      unassignedCampStandby,
    },
    camps,
    siteSummaries,
    nationalityBreakdown,
    unassignedPersonnelSample: unassignedPersonnel.slice(0, 400),
    allCampResidents,
  };
}

export function getCampDefinitionById(campId: number): CampDefRow | undefined {
  ensureCampTablesExist();
  const db = getDb();
  return db.prepare('SELECT * FROM camp_definitions WHERE id = ?').get(campId) as CampDefRow | undefined;
}

export function getRoomWithCampById(roomId: number): { room: CampRoomRow; camp: CampDefRow } | null {
  ensureCampTablesExist();
  const db = getDb();
  const room = db.prepare('SELECT * FROM camp_rooms WHERE id = ?').get(roomId) as CampRoomRow | undefined;
  if (!room) return null;
  const camp = db.prepare('SELECT * FROM camp_definitions WHERE id = ?').get(room.camp_id) as CampDefRow | undefined;
  if (!camp) return null;
  return { room, camp };
}

export function upsertCampDefinition(
  input: {
    id?: number;
    region: string;
    projectName: string;
    campCode: string;
    campName: string;
    campType?: CampType;
    defaultRoomCapacity?: number;
    notes?: string;
    initialRoomStart?: number;
    initialRoomEnd?: number;
    initialFloorNo?: number;
  },
  actorName: string
): { campId: number } {
  ensureCampTablesExist();
  const db = getDb();

  const region = cleanCampField(input.region);
  const projectName = cleanCampField(input.projectName) || region;
  const campCode = cleanCampField(input.campCode);
  const campName = cleanCampField(input.campName) || campCode;
  const campType: CampType = input.campType || 'modular';
  const defaultCap = Math.max(1, Math.min(20, Number(input.defaultRoomCapacity) || 4));
  const notes = String(input.notes || '').trim();
  const nowIso = new Date().toISOString();

  if (!region || !campCode) {
    throw new Error('Bölge ve Kamp Kodu zorunludur.');
  }

  let campId = Number(input.id) || 0;

  if (campId > 0) {
    db.prepare(
      `UPDATE camp_definitions
       SET region = ?, project_name = ?, camp_code = ?, camp_name = ?, camp_type = ?,
           default_room_capacity = ?, is_auto_seeded = 0, notes = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`
    ).run(region, projectName, campCode, campName, campType, defaultCap, notes, actorName, nowIso, campId);
  } else {
    const existing = db
      .prepare('SELECT id FROM camp_definitions WHERE region = ? AND project_name = ? AND camp_code = ?')
      .get(region, projectName, campCode) as { id?: number } | undefined;

    if (existing?.id) {
      campId = existing.id;
      db.prepare(
        `UPDATE camp_definitions
         SET camp_name = ?, camp_type = ?, default_room_capacity = ?, is_auto_seeded = 0,
             initial_rooms_seeded = 1, notes = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`
      ).run(campName, campType, defaultCap, notes, actorName, nowIso, campId);
    } else {
      const info = db
        .prepare(
          `INSERT INTO camp_definitions
             (region, project_name, camp_code, camp_name, camp_type, default_room_capacity, initial_rooms_seeded, is_auto_seeded, notes, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)`
        )
        .run(region, projectName, campCode, campName, campType, defaultCap, notes, actorName, nowIso);
      campId = Number(info.lastInsertRowid);
    }
  }

  if (
    typeof input.initialRoomStart === 'number' &&
    typeof input.initialRoomEnd === 'number' &&
    input.initialRoomEnd >= input.initialRoomStart &&
    input.initialRoomEnd - input.initialRoomStart <= 250
  ) {
    addOrUpdateRoomsRange({
      campId,
      startNo: input.initialRoomStart,
      endNo: input.initialRoomEnd,
      floorNo: input.initialFloorNo,
      capacity: defaultCap,
      roomType: campType === 'staff' ? 'staff' : 'worker',
      status: 'active',
    });
  }

  return { campId };
}

export function deleteCampDefinition(campId: number): void {
  ensureCampTablesExist();
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM camp_rooms WHERE camp_id = ?').run(campId);
    db.prepare('DELETE FROM camp_deleted_rooms WHERE camp_id = ?').run(campId);
    db.prepare('DELETE FROM camp_definitions WHERE id = ?').run(campId);
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  }
}

export function addOrUpdateRoomsRange(input: {
  campId: number;
  roomNo?: string;
  startNo?: number;
  endNo?: number;
  prefix?: string;
  floorNo?: number;
  capacity?: number;
  roomType?: RoomType;
  status?: RoomOperationalStatus;
  notes?: string;
}): { count: number } {
  ensureCampTablesExist();
  const db = getDb();
  const campId = Number(input.campId);
  const cap = Math.max(1, Math.min(20, Number(input.capacity) || 4));
  const roomType: RoomType = input.roomType || 'worker';
  const status: RoomOperationalStatus = input.status || 'active';
  const notes = String(input.notes || '').trim();
  const nowIso = new Date().toISOString();
  const prefix = String(input.prefix || '').trim();

  const targets: { roomNo: string; floorNo: number }[] = [];

  if (
    typeof input.startNo === 'number' &&
    typeof input.endNo === 'number' &&
    !Number.isNaN(input.startNo) &&
    !Number.isNaN(input.endNo)
  ) {
    const start = Math.min(input.startNo, input.endNo);
    const end = Math.max(input.startNo, input.endNo);
    if (end - start > 250) {
      throw new Error('Tek seferde en fazla 250 sıralı oda eklenebilir.');
    }
    for (let n = start; n <= end; n++) {
      const rNo = `${prefix}${n}`;
      const fNo = input.floorNo && input.floorNo > 0 ? input.floorNo : parseRoomFloor(String(n));
      targets.push({ roomNo: rNo, floorNo: fNo });
    }
  } else {
    const single = cleanCampField(input.roomNo);
    if (!single) {
      throw new Error('Geçerli bir oda numarası girin.');
    }
    const fNo = input.floorNo && input.floorNo > 0 ? input.floorNo : parseRoomFloor(single);
    targets.push({ roomNo: single, floorNo: fNo });
  }

  const upsertRoom = db.prepare(`
    INSERT INTO camp_rooms (camp_id, room_no, floor_no, capacity, room_type, status, is_inferred_empty, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(camp_id, room_no) DO UPDATE SET
      floor_no = excluded.floor_no,
      capacity = excluded.capacity,
      room_type = excluded.room_type,
      status = excluded.status,
      is_inferred_empty = 0,
      notes = CASE WHEN excluded.notes != '' THEN excluded.notes ELSE camp_rooms.notes END,
      updated_at = excluded.updated_at
  `);
  const removeDeleted = db.prepare('DELETE FROM camp_deleted_rooms WHERE camp_id = ? AND room_no = ?');

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const item of targets) {
      removeDeleted.run(campId, item.roomNo);
      upsertRoom.run(campId, item.roomNo, item.floorNo, cap, roomType, status, notes, nowIso);
    }
    db.prepare('UPDATE camp_definitions SET is_auto_seeded = 0, initial_rooms_seeded = 1 WHERE id = ?').run(campId);
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  }

  return { count: targets.length };
}

export function updateSingleRoom(
  roomId: number,
  patch: {
    capacity?: number;
    roomType?: RoomType;
    status?: RoomOperationalStatus;
    floorNo?: number;
    notes?: string;
  }
): void {
  ensureCampTablesExist();
  const db = getDb();
  const existing = db.prepare('SELECT * FROM camp_rooms WHERE id = ?').get(roomId) as CampRoomRow | undefined;
  if (!existing) {
    throw new Error('Oda kaydı bulunamadı.');
  }
  const capacity = patch.capacity !== undefined ? Math.max(1, Math.min(20, Number(patch.capacity) || 4)) : existing.capacity;
  const roomType = patch.roomType || (existing.room_type as RoomType);
  const status = patch.status || (existing.status as RoomOperationalStatus);
  const floorNo = patch.floorNo !== undefined ? Math.max(1, Math.min(9, Number(patch.floorNo) || 1)) : existing.floor_no;
  const notes = patch.notes !== undefined ? String(patch.notes).trim() : existing.notes || '';
  const nowIso = new Date().toISOString();

  db.prepare(
    `UPDATE camp_rooms
     SET capacity = ?, room_type = ?, status = ?, floor_no = ?, notes = ?, is_inferred_empty = 0, updated_at = ?
     WHERE id = ?`
  ).run(capacity, roomType, status, floorNo, notes, nowIso, roomId);
}

export function confirmInferredRooms(campId: number): number {
  ensureCampTablesExist();
  const db = getDb();
  const res = db
    .prepare('UPDATE camp_rooms SET is_inferred_empty = 0, updated_at = ? WHERE camp_id = ? AND is_inferred_empty = 1')
    .run(new Date().toISOString(), campId);
  db.prepare('UPDATE camp_definitions SET is_auto_seeded = 0 WHERE id = ?').run(campId);
  return Number(res.changes || 0);
}

export function deleteCampRoom(roomId: number): void {
  ensureCampTablesExist();
  const db = getDb();
  const room = db.prepare('SELECT camp_id, room_no FROM camp_rooms WHERE id = ?').get(roomId) as
    | { camp_id: number; room_no: string }
    | undefined;
  if (!room) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT OR IGNORE INTO camp_deleted_rooms (camp_id, room_no) VALUES (?, ?)').run(room.camp_id, room.room_no);
    db.prepare('DELETE FROM camp_rooms WHERE id = ?').run(roomId);
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  }
}

export function assignPersonnelCampRoom(input: {
  sicilNo: string;
  campId: number;
  roomNo: string;
  actorName: string;
}): void {
  ensureCampTablesExist();
  const db = getDb();
  const sicilNo = String(input.sicilNo || '').trim();
  const roomNo = cleanCampField(input.roomNo);
  const camp = getCampDefinitionById(Number(input.campId));
  if (!sicilNo || !camp) {
    throw new Error('Geçersiz personel sicili veya kamp seçimi.');
  }

  const nowIso = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO camp_personnel_overrides (sicil_no, region, project_name, camp_code, room_no, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sicil_no) DO UPDATE SET
         region = excluded.region,
         project_name = excluded.project_name,
         camp_code = excluded.camp_code,
         room_no = excluded.room_no,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`
    ).run(sicilNo, camp.region, camp.project_name, camp.camp_code, roomNo, input.actorName, nowIso);

    if (roomNo) {
      db.prepare('DELETE FROM camp_deleted_rooms WHERE camp_id = ? AND room_no = ?').run(camp.id, roomNo);
      db.prepare(
        `INSERT OR IGNORE INTO camp_rooms (camp_id, room_no, floor_no, capacity, room_type, status, is_inferred_empty, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', 0, ?)`
      ).run(
        camp.id,
        roomNo,
        parseRoomFloor(roomNo),
        Math.max(1, Number(camp.default_room_capacity) || 4),
        camp.camp_type === 'staff' ? 'staff' : 'worker',
        nowIso
      );
      db.prepare('UPDATE camp_rooms SET is_inferred_empty = 0, updated_at = ? WHERE camp_id = ? AND room_no = ?').run(
        nowIso,
        camp.id,
        roomNo
      );
    }

    const pRow = db
      .prepare('SELECT id, all_data_json FROM personnel WHERE sicil_no = ?')
      .get(sicilNo) as { id?: number; all_data_json?: string } | undefined;

    if (pRow?.id) {
      let nextJson = pRow.all_data_json || '';
      if (nextJson) {
        try {
          const parsed = JSON.parse(nextJson) as Record<string, unknown>;
          parsed['Kamp No'] = camp.camp_code;
          parsed['Oda No'] = roomNo;
          nextJson = JSON.stringify(parsed);
        } catch {
          // keep original if not valid JSON
        }
      }
      db.prepare('UPDATE personnel SET kamp_no = ?, oda_no = ?, all_data_json = ? WHERE id = ?').run(
        camp.camp_code,
        roomNo,
        nextJson,
        pRow.id
      );
    }

    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  }

  const gState = globalThis as Record<string, any>;
  if (gState.__ponderaAnalyticsResponseCache?.clear) {
    gState.__ponderaAnalyticsResponseCache.clear();
  }
}

export function unassignPersonnelCampRoom(input: { sicilNo: string; actorName: string }): void {
  ensureCampTablesExist();
  const db = getDb();
  const sicilNo = String(input.sicilNo || '').trim();
  if (!sicilNo) {
    throw new Error('Geçersiz personel sicili.');
  }

  const nowIso = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO camp_personnel_overrides (sicil_no, region, project_name, camp_code, room_no, updated_by, updated_at)
       VALUES (?, '', '', '__UNASSIGNED__', '', ?, ?)
       ON CONFLICT(sicil_no) DO UPDATE SET
         camp_code = '__UNASSIGNED__',
         room_no = '',
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`
    ).run(sicilNo, input.actorName, nowIso);

    const pRow = db
      .prepare('SELECT id, all_data_json FROM personnel WHERE sicil_no = ?')
      .get(sicilNo) as { id?: number; all_data_json?: string } | undefined;

    if (pRow?.id) {
      let nextJson = pRow.all_data_json || '';
      if (nextJson) {
        try {
          const parsed = JSON.parse(nextJson) as Record<string, unknown>;
          parsed['Kamp No'] = '';
          parsed['Oda No'] = '';
          nextJson = JSON.stringify(parsed);
        } catch {
          // ignore
        }
      }
      db.prepare('UPDATE personnel SET kamp_no = ?, oda_no = ?, all_data_json = ? WHERE id = ?').run(
        '',
        '',
        nextJson,
        pRow.id
      );
    }

    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  }

  const gState = globalThis as Record<string, any>;
  if (gState.__ponderaAnalyticsResponseCache?.clear) {
    gState.__ponderaAnalyticsResponseCache.clear();
  }
}
