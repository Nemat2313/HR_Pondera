import type { OrgRawPerson } from '@/app/api/org-chart/route';

export type OrgHierarchyMode = 'combined' | 'sorumlu' | 'grup_sefi';

/**
 * 6 Visual Role Levels (since employees do not have profile photos):
 * 1 = Üst Yönetim (Başkan, Genel Müdür, Direktör)
 * 2 = Proje Müdürü / Şantiye Şefi / Merkez Müdürü
 * 3 = Grup Şefi / Kısım Şefi / Saha Şefi
 * 4 = Mühendis / Uzman / Süpervizör (Beyaz Yaka)
 * 5 = Formen / Saha Ekip Sorumlusu
 * 6 = Saha İşçileri / Mavi Yaka (Consolidated into single Crew List Box)
 */
export type OrgRoleLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface OrgNode {
  nodeId: string;
  personId: number | null;
  isVirtual: boolean;
  virtualKind?: 'company_root' | 'subcon' | 'pending_pool' | 'external_supervisor';
  sicil_no: string;
  ad_soyad: string;
  gorevi: string;
  ek_gorev: string;
  departman: string;
  region: string;
  effective_site: string;
  proje_adi: string;
  sorumlu_kisi: string;
  grup_sefi: string;
  endirekt_direkt: string;
  kategori: string;
  uyruk: string;
  firma: string;
  ise_giris_tarihi: string;
  roleLevel: OrgRoleLevel;
  parentId: string | null;
  dottedGrupSefiName: string | null;
  /** Child nodes that themselves manage people (or are sub-groups) */
  managerChildren: OrgNode[];
  /** Leaf White-Collar / Specialist direct reports (0 subordinates) */
  specialistLeaves: OrgNode[];
  /** Leaf Blue-Collar / Field Worker direct reports (0 subordinates -> shown in single consolidated list box!) */
  workerLeaves: OrgNode[];
  /** Direct reports count (managerChildren + specialistLeaves + workerLeaves) */
  directCount: number;
  /** Total recursive headcount underneath this node (excluding self) */
  totalSubordinates: number;
  /** Total Endirekt underneath this node */
  subordinateEndirekt: number;
  /** Total Direkt underneath this node */
  subordinateDirekt: number;
  /** Depth from root (0 = root) */
  depth: number;
}

export interface OrgBuildResult {
  roots: OrgNode[];
  nodeById: Map<string, OrgNode>;
  personNodeByDbId: Map<number, OrgNode>;
  totalStaff: number;
  totalManagers: number;
  avgSpanOfControl: number;
  maxDepth: number;
  levelCounts: Record<OrgRoleLevel, number>;
  sites: Array<{ name: string; count: number }>;
  departments: Array<{ name: string; count: number }>;
}

const PLACEHOLDER_TOKENS = new Set([
  '',
  '-',
  '—',
  'YOK',
  'BEKLENIYOR',
  'IZIN',
  'CIKIS',
  'BELIRTILMEMIS',
  'NULL',
  'NONE',
]);

export function normalizeOrgPersonName(raw?: string | null): string {
  if (!raw) return '';
  const stripped = String(raw)
    .trim()
    .replace(/\s+\d+$/, ''); // e.g. "OMER FARUK BOZKURT 2" -> "OMER FARUK BOZKURT"
  return stripped
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

export function classifyRoleLevel(
  gorevi: string,
  endirektDirekt: string,
  isGrupSefiRef: boolean,
  hasSubordinates: boolean
): OrgRoleLevel {
  const g = normalizeOrgPersonName(gorevi);

  if (
    g.includes('GENEL BASKAN') ||
    g.includes('GENEL MUDUR') ||
    g.includes('DIREKTOR') ||
    g.includes('KOORDINATOR')
  ) {
    return 1;
  }

  if (
    g.includes('PROJE MUDURU') ||
    g.includes('SANTIYE SEFI') ||
    g.includes('YAPIM MUDURU') ||
    g.includes('MUDUR')
  ) {
    return 2;
  }

  if (g.includes('SEF') || isGrupSefiRef) {
    return 3;
  }

  if (g.includes('FORMEN')) {
    return 5;
  }

  if (endirektDirekt === 'Endirekt') {
    return 4;
  }

  if (hasSubordinates) {
    return 5;
  }

  return 6;
}

function isPlaceholderSupervisor(norm: string): boolean {
  return !norm || PLACEHOLDER_TOKENS.has(norm);
}

function isSubconSupervisor(norm: string): boolean {
  return norm.startsWith('SUBCON');
}

export function buildOrganizationHierarchy(
  allPeople: OrgRawPerson[],
  options: {
    mode: OrgHierarchyMode;
    siteFilter?: string;
    departmentFilter?: string;
    focusNodeId?: string | null;
  }
): OrgBuildResult {
  const { mode, siteFilter = 'all', departmentFilter = 'all', focusNodeId = null } = options;

  // Compute global site & department counts before filtering so filter pills stay populated
  const siteCounter = new Map<string, number>();
  const deptCounter = new Map<string, number>();
  for (const p of allPeople) {
    const s = p.effective_site || p.proje_adi || p.region || 'Diğer';
    siteCounter.set(s, (siteCounter.get(s) || 0) + 1);
    if (p.departman) {
      deptCounter.set(p.departman, (deptCounter.get(p.departman) || 0) + 1);
    }
  }

  const sites = Array.from(siteCounter.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (a.name === 'Merkez Ofis') return -1;
      if (b.name === 'Merkez Ofis') return 1;
      return b.count - a.count;
    });

  const departments = Array.from(deptCounter.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const filteredPeople = allPeople.filter((p) => {
    if (siteFilter !== 'all') {
      const pSite = p.effective_site || p.proje_adi || p.region;
      if (pSite !== siteFilter && p.proje_adi !== siteFilter && p.region !== siteFilter) {
        return false;
      }
    }
    if (departmentFilter !== 'all' && p.departman !== departmentFilter) {
      return false;
    }
    return true;
  });

  if (filteredPeople.length === 0) {
    return {
      roots: [],
      nodeById: new Map(),
      personNodeByDbId: new Map(),
      totalStaff: 0,
      totalManagers: 0,
      avgSpanOfControl: 0,
      maxDepth: 0,
      levelCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      sites,
      departments,
    };
  }

  // Index people by normalized name (if duplicate names exist, prefer Endirekt / higher seniority)
  const personByNormName = new Map<string, OrgRawPerson[]>();
  const gsRefSet = new Set<string>();
  const skRefSet = new Set<string>();

  for (const p of filteredPeople) {
    const nm = normalizeOrgPersonName(p.ad_soyad);
    if (nm) {
      const arr = personByNormName.get(nm) || [];
      arr.push(p);
      personByNormName.set(nm, arr);
    }
    const gs = normalizeOrgPersonName(p.grup_sefi);
    const sk = normalizeOrgPersonName(p.sorumlu_kisi);
    if (!isPlaceholderSupervisor(gs) && !isSubconSupervisor(gs)) gsRefSet.add(gs);
    if (!isPlaceholderSupervisor(sk) && !isSubconSupervisor(sk)) skRefSet.add(sk);
  }

  const pickBestManagerRecord = (normName: string, preferredSite?: string): OrgRawPerson | null => {
    const candidates = personByNormName.get(normName);
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const sorted = [...candidates].sort((a, b) => {
      if (preferredSite) {
        const aSame = a.effective_site === preferredSite ? 1 : 0;
        const bSame = b.effective_site === preferredSite ? 1 : 0;
        if (aSame !== bSame) return bSame - aSame;
      }
      const aEnd = a.endirekt_direkt === 'Endirekt' ? 1 : 0;
      const bEnd = b.endirekt_direkt === 'Endirekt' ? 1 : 0;
      if (aEnd !== bEnd) return bEnd - aEnd;
      const aLvl = classifyRoleLevel(a.gorevi, a.endirekt_direkt, true, true);
      const bLvl = classifyRoleLevel(b.gorevi, b.endirekt_direkt, true, true);
      return aLvl - bLvl;
    });
    return sorted[0];
  };

  // Create initial nodes for all real employees
  const nodeById = new Map<string, OrgNode>();
  const personNodeByDbId = new Map<number, OrgNode>();

  for (const p of filteredPeople) {
    const nodeId = `emp_${p.id}`;
    const normSelf = normalizeOrgPersonName(p.ad_soyad);
    const prelimLevel = classifyRoleLevel(
      p.gorevi,
      p.endirekt_direkt,
      gsRefSet.has(normSelf),
      skRefSet.has(normSelf)
    );
    const node: OrgNode = {
      nodeId,
      personId: p.id,
      isVirtual: false,
      sicil_no: p.sicil_no,
      ad_soyad: p.ad_soyad,
      gorevi: p.gorevi || 'Belirtilmemiş',
      ek_gorev: p.ek_gorev,
      departman: p.departman,
      region: p.region,
      effective_site: p.effective_site,
      proje_adi: p.proje_adi,
      sorumlu_kisi: p.sorumlu_kisi,
      grup_sefi: p.grup_sefi,
      endirekt_direkt: p.endirekt_direkt,
      kategori: p.kategori,
      uyruk: p.uyruk,
      firma: p.firma,
      ise_giris_tarihi: p.ise_giris_tarihi,
      roleLevel: prelimLevel,
      parentId: null,
      dottedGrupSefiName: null,
      managerChildren: [],
      specialistLeaves: [],
      workerLeaves: [],
      directCount: 0,
      totalSubordinates: 0,
      subordinateEndirekt: 0,
      subordinateDirekt: 0,
      depth: 0,
    };
    nodeById.set(nodeId, node);
    personNodeByDbId.set(p.id, node);
  }

  // Identify top leader per effective_site (Proje Direktörü > Proje Müdürü > Şantiye Şefi > Yapım Müdürü > Teknik Ofis Müdürü)
  const siteLeaderBySite = new Map<string, OrgNode>();
  const getSiteLeaderPriority = (n: OrgNode): number => {
    const g = normalizeOrgPersonName(n.gorevi);
    if (g.includes('GENEL BASKAN')) return 100;
    if (g.includes('GENEL MUDUR')) return 95;
    if (g.includes('PROJE DIREKTORU')) return 90;
    if (g.includes('DIREKTOR')) return 85;
    if (g.includes('PROJE MUDURU')) return 80;
    if (g.includes('SANTIYE SEFI')) return 75;
    if (g.includes('YAPIM MUDURU')) return 70;
    if (g.includes('TEKNIK OFIS MUDURU')) return 65;
    if (n.roleLevel === 2) return 55;
    if (n.roleLevel === 3) return 45;
    return 10;
  };

  for (const n of Array.from(nodeById.values())) {
    const siteKey = n.effective_site || 'Merkez Ofis';
    const curBest = siteLeaderBySite.get(siteKey);
    if (!curBest || getSiteLeaderPriority(n) > getSiteLeaderPriority(curBest)) {
      siteLeaderBySite.set(siteKey, n);
    }
  }

  // Virtual nodes for Subcon & external supervisors (with >= 2 reports) & pending pools
  const getOrCreateVirtualNode = (
    key: string,
    label: string,
    subtitle: string,
    site: string,
    kind: NonNullable<OrgNode['virtualKind']>,
    level: OrgRoleLevel
  ): OrgNode => {
    const existing = nodeById.get(key);
    if (existing) return existing;
    const vNode: OrgNode = {
      nodeId: key,
      personId: null,
      isVirtual: true,
      virtualKind: kind,
      sicil_no: kind === 'subcon' ? 'TAŞERON' : kind === 'pending_pool' ? 'HAVUZ' : 'DIŞ',
      ad_soyad: label,
      gorevi: subtitle,
      ek_gorev: '',
      departman: '',
      region: site,
      effective_site: site,
      proje_adi: site,
      sorumlu_kisi: '',
      grup_sefi: '',
      endirekt_direkt: 'Endirekt',
      kategori: '',
      uyruk: '',
      firma: '',
      ise_giris_tarihi: '-',
      roleLevel: level,
      parentId: null,
      dottedGrupSefiName: null,
      managerChildren: [],
      specialistLeaves: [],
      workerLeaves: [],
      directCount: 0,
      totalSubordinates: 0,
      subordinateEndirekt: 0,
      subordinateDirekt: 0,
      depth: 0,
    };
    nodeById.set(key, vNode);
    return vNode;
  };

  // Count unmatched external supervisor occurrences so we create virtual supervisor nodes for active external leads
  const unmatchedSupCounts = new Map<string, { rawName: string; count: number; grupSefiVotes: Map<string, number>; site: string }>();
  for (const p of filteredPeople) {
    const skNorm = normalizeOrgPersonName(p.sorumlu_kisi);
    if (!isPlaceholderSupervisor(skNorm) && !isSubconSupervisor(skNorm) && !personByNormName.has(skNorm)) {
      const entry = unmatchedSupCounts.get(skNorm) || {
        rawName: p.sorumlu_kisi,
        count: 0,
        grupSefiVotes: new Map<string, number>(),
        site: p.effective_site || p.region || 'Merkez Ofis',
      };
      entry.count += 1;
      const gsNorm = normalizeOrgPersonName(p.grup_sefi);
      if (!isPlaceholderSupervisor(gsNorm) && gsNorm !== skNorm) {
        entry.grupSefiVotes.set(gsNorm, (entry.grupSefiVotes.get(gsNorm) || 0) + 1);
      }
      unmatchedSupCounts.set(skNorm, entry);
    }
  }

  // Track implied upward bridge votes: for any supervisor S, which Grup Şefi G do their subordinates belong to?
  const supervisorToGrupSefiVotes = new Map<string, Map<string, number>>();

  // Pass 1: Assign primary parentId for every real employee
  for (const p of filteredPeople) {
    const node = personNodeByDbId.get(p.id)!;
    const selfNorm = normalizeOrgPersonName(p.ad_soyad);
    const skNorm = normalizeOrgPersonName(p.sorumlu_kisi);
    const gsNorm = normalizeOrgPersonName(p.grup_sefi);

    const validSk = !isPlaceholderSupervisor(skNorm) && skNorm !== selfNorm ? skNorm : '';
    const validGs = !isPlaceholderSupervisor(gsNorm) && gsNorm !== selfNorm ? gsNorm : '';

    if (validSk && validGs && validSk !== validGs && !isSubconSupervisor(validSk) && !isSubconSupervisor(validGs)) {
      node.dottedGrupSefiName = p.grup_sefi;
      const voteMap = supervisorToGrupSefiVotes.get(validSk) || new Map<string, number>();
      voteMap.set(validGs, (voteMap.get(validGs) || 0) + 1);
      supervisorToGrupSefiVotes.set(validSk, voteMap);
    }

    let chosenNorm = '';
    if (mode === 'sorumlu') {
      chosenNorm = validSk || validGs;
    } else if (mode === 'grup_sefi') {
      chosenNorm = validGs || validSk;
    } else {
      // 'combined': immediate parent is Sorumlu Kişi, falling back to Grup Şefi
      chosenNorm = validSk || validGs;
    }

    if (chosenNorm) {
      if (isSubconSupervisor(chosenNorm)) {
        const subNode = getOrCreateVirtualNode(
          `virt_subcon_${p.effective_site}_${chosenNorm}`,
          p.sorumlu_kisi.startsWith('SUBCON') ? p.sorumlu_kisi : p.grup_sefi,
          'Alt Yüklenici / Taşeron Birimi',
          p.effective_site || p.region,
          'subcon',
          3
        );
        node.parentId = subNode.nodeId;
      } else {
        const mgrPerson = pickBestManagerRecord(chosenNorm, p.effective_site);
        if (mgrPerson && mgrPerson.id !== p.id) {
          node.parentId = `emp_${mgrPerson.id}`;
        } else if (mode !== 'grup_sefi' && validGs && validGs !== chosenNorm) {
          // If Sorumlu Kişi was an unmatched 1-off person, try Grup Şefi directly
          const gsPerson = pickBestManagerRecord(validGs, p.effective_site);
          if (gsPerson && gsPerson.id !== p.id) {
            const extInfo = unmatchedSupCounts.get(chosenNorm);
            if (extInfo && extInfo.count >= 2) {
              const extNode = getOrCreateVirtualNode(
                `virt_ext_${chosenNorm}`,
                extInfo.rawName,
                'Saha Sorumlusu (Dış / İzinli)',
                extInfo.site,
                'external_supervisor',
                5
              );
              extNode.parentId = `emp_${gsPerson.id}`;
              node.parentId = extNode.nodeId;
            } else {
              node.parentId = `emp_${gsPerson.id}`;
            }
          }
        } else {
          const extInfo = unmatchedSupCounts.get(chosenNorm);
          if (extInfo && extInfo.count >= 2) {
            const extNode = getOrCreateVirtualNode(
              `virt_ext_${chosenNorm}`,
              extInfo.rawName,
              'Saha Sorumlusu (Dış / İzinli)',
              extInfo.site,
              'external_supervisor',
              5
            );
            node.parentId = extNode.nodeId;
          }
        }
      }
    }
  }

  // Pass 2 (Combined Mode Bridge): If a supervisor S still has no parentId (e.g. their own sorumlu_kisi was self, IZIN, or BEKLENIYOR),
  // bridge S upward to their team's majority Grup Şefi G!
  if (mode === 'combined') {
    for (const node of Array.from(nodeById.values())) {
      if (node.parentId || node.isVirtual) continue;
      const selfNorm = normalizeOrgPersonName(node.ad_soyad);
      const votes = supervisorToGrupSefiVotes.get(selfNorm);
      if (votes && votes.size > 0) {
        const topGsNorm = Array.from(votes.entries()).sort((a, b) => b[1] - a[1])[0][0];
        const gsPerson = pickBestManagerRecord(topGsNorm, node.effective_site);
        if (gsPerson && `emp_${gsPerson.id}` !== node.nodeId) {
          const gsNode = personNodeByDbId.get(gsPerson.id);
          // Only bridge upward if gsNode has higher/equal seniority (smaller/equal roleLevel number)
          if (gsNode && gsNode.roleLevel <= node.roleLevel) {
            node.parentId = gsNode.nodeId;
          }
        }
      }
    }
  }

  // Pass 3: Connect unparented site managers, subcon units, and pending workers cleanly to their Site Leader,
  // and connect Site Leaders & Merkez Ofis Directors under the top Company Root (Genel Başkan: RAIF SENGONUL)
  let crownRoot: OrgNode | null = null;
  for (const n of Array.from(nodeById.values())) {
    if (!n.isVirtual && normalizeOrgPersonName(n.gorevi).includes('GENEL BASKAN')) {
      crownRoot = n;
      break;
    }
  }
  if (!crownRoot && siteFilter === 'all' && departmentFilter === 'all') {
    for (const n of Array.from(nodeById.values())) {
      if (!n.isVirtual && normalizeOrgPersonName(n.gorevi).includes('GENEL MUDUR')) {
        crownRoot = n;
        break;
      }
    }
  }

  for (const node of Array.from(nodeById.values())) {
    if (node.parentId) continue;
    if (crownRoot && node.nodeId === crownRoot.nodeId) continue;

    const siteKey = node.effective_site || 'Merkez Ofis';
    const siteLeader = siteLeaderBySite.get(siteKey);

    // If this node IS the site leader of a project/site (or a Merkez Ofis L1 Director), attach to crownRoot if available
    if (
      (siteLeader && node.nodeId === siteLeader.nodeId) ||
      (siteKey === 'Merkez Ofis' && node.roleLevel === 1)
    ) {
      if (crownRoot && crownRoot.nodeId !== node.nodeId) {
        node.parentId = crownRoot.nodeId;
      }
      continue;
    }

    // If this person is a worker/specialist whose sorumlu_kisi was BEKLENIYOR / IZIN and has 0 reports,
    // group them under a clean collapsible "Atama Bekleyen / İzinli Havuzu" under the Site Leader so they don't clutter top managers
    const skUpper = normalizeOrgPersonName(node.sorumlu_kisi);
    const isPendingOrLeave = skUpper === 'BEKLENIYOR' || skUpper === 'IZIN' || !skUpper;
    const isSubManager =
      node.isVirtual ||
      node.roleLevel <= 3 ||
      skRefSet.has(normalizeOrgPersonName(node.ad_soyad)) ||
      gsRefSet.has(normalizeOrgPersonName(node.ad_soyad));

    if (!isSubManager && isPendingOrLeave && siteLeader && siteLeader.nodeId !== node.nodeId) {
      const poolNode = getOrCreateVirtualNode(
        `virt_pool_${siteKey}`,
        `${siteKey} — Atama Bekleyen / İzinli`,
        'Sorumlu / Grup Şefi Ataması Beklenen Personel',
        siteKey,
        'pending_pool',
        4
      );
      if (!poolNode.parentId && poolNode.nodeId !== siteLeader.nodeId) {
        poolNode.parentId = siteLeader.nodeId;
      }
      node.parentId = poolNode.nodeId;
      continue;
    }

    if (siteLeader && siteLeader.nodeId !== node.nodeId) {
      node.parentId = siteLeader.nodeId;
    } else if (crownRoot && crownRoot.nodeId !== node.nodeId) {
      node.parentId = crownRoot.nodeId;
    }
  }

  // Pass 4: Cycle Detection & Breaking (guarantees strict forest/tree)
  for (const node of Array.from(nodeById.values())) {
    if (!node.parentId) continue;
    const visited = new Set<string>([node.nodeId]);
    let curr: OrgNode | undefined = node;
    while (curr?.parentId) {
      if (visited.has(curr.parentId) || !nodeById.has(curr.parentId)) {
        // Break cycle at curr
        curr.parentId = crownRoot && curr.nodeId !== crownRoot.nodeId ? crownRoot.nodeId : null;
        break;
      }
      visited.add(curr.parentId);
      curr = nodeById.get(curr.parentId);
    }
  }

  // Pass 5: Assemble children & refine final roleLevel based on actual subordinate count
  const tempChildrenMap = new Map<string, OrgNode[]>();
  for (const node of Array.from(nodeById.values())) {
    if (node.parentId && nodeById.has(node.parentId) && node.parentId !== node.nodeId) {
      const list = tempChildrenMap.get(node.parentId) || [];
      list.push(node);
      tempChildrenMap.set(node.parentId, list);
    } else {
      node.parentId = null;
    }
  }

  // Update final role levels now that we know exact subordinate counts
  const levelCounts: Record<OrgRoleLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const node of Array.from(nodeById.values())) {
    const rawChildren = tempChildrenMap.get(node.nodeId) || [];
    if (!node.isVirtual) {
      const normSelf = normalizeOrgPersonName(node.ad_soyad);
      const lvl = classifyRoleLevel(
        node.gorevi,
        node.endirekt_direkt,
        gsRefSet.has(normSelf),
        rawChildren.length > 0
      );
      node.roleLevel = lvl;
      levelCounts[lvl] += 1;
    }
  }

  // Recursive bottom-up metric & child-bucket computation
  let maxDepth = 0;
  const computeSubtree = (node: OrgNode, depth: number, visiting: Set<string>) => {
    if (visiting.has(node.nodeId)) return;
    visiting.add(node.nodeId);

    node.depth = depth;
    if (depth > maxDepth) maxDepth = depth;

    const rawChildren = tempChildrenMap.get(node.nodeId) || [];
    const mgrKids: OrgNode[] = [];
    const specKids: OrgNode[] = [];
    const wrkKids: OrgNode[] = [];

    let totalSub = 0;
    let subEnd = 0;
    let subDir = 0;

    for (const child of rawChildren) {
      computeSubtree(child, depth + 1, visiting);
      const childHasReports = (tempChildrenMap.get(child.nodeId)?.length || 0) > 0;

      if (!child.isVirtual) {
        totalSub += 1 + child.totalSubordinates;
        if (child.endirekt_direkt === 'Endirekt') subEnd += 1;
        else subDir += 1;
        subEnd += child.subordinateEndirekt;
        subDir += child.subordinateDirekt;
      } else {
        totalSub += child.totalSubordinates;
        subEnd += child.subordinateEndirekt;
        subDir += child.subordinateDirekt;
      }

      if (childHasReports || child.isVirtual || child.roleLevel <= 3) {
        mgrKids.push(child);
      } else if (child.endirekt_direkt === 'Endirekt') {
        specKids.push(child);
      } else {
        wrkKids.push(child);
      }
    }

    // Sort manager children: real people before virtual pools, higher level first, larger team first
    mgrKids.sort((a, b) => {
      if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
      if (a.roleLevel !== b.roleLevel) return a.roleLevel - b.roleLevel;
      if (b.totalSubordinates !== a.totalSubordinates) return b.totalSubordinates - a.totalSubordinates;
      return a.ad_soyad.localeCompare(b.ad_soyad, 'tr');
    });

    specKids.sort((a, b) => a.ad_soyad.localeCompare(b.ad_soyad, 'tr'));
    wrkKids.sort((a, b) => {
      if (a.gorevi !== b.gorevi) return a.gorevi.localeCompare(b.gorevi, 'tr');
      return a.ad_soyad.localeCompare(b.ad_soyad, 'tr');
    });

    // Remove empty virtual nodes
    node.managerChildren = mgrKids.filter((c) => !c.isVirtual || c.totalSubordinates > 0);
    node.specialistLeaves = specKids;
    node.workerLeaves = wrkKids;
    node.directCount =
      node.managerChildren.length + node.specialistLeaves.length + node.workerLeaves.length;
    node.totalSubordinates = totalSub;
    node.subordinateEndirekt = subEnd;
    node.subordinateDirekt = subDir;
  };

  let roots = Array.from(nodeById.values()).filter((n) => !n.parentId);
  const visiting = new Set<string>();
  for (const r of roots) {
    computeSubtree(r, 0, visiting);
  }

  roots = roots
    .filter((r) => !r.isVirtual || r.totalSubordinates > 0)
    .sort((a, b) => {
      if (a.roleLevel !== b.roleLevel) return a.roleLevel - b.roleLevel;
      return b.totalSubordinates - a.totalSubordinates;
    });

  // If user focused a specific manager as subtree root, return that node as the active visual root
  if (focusNodeId && nodeById.has(focusNodeId)) {
    roots = [nodeById.get(focusNodeId)!];
  }

  // Count active managers (real people who have >= 1 direct report)
  let totalManagers = 0;
  let totalDirectLinks = 0;
  for (const n of Array.from(nodeById.values())) {
    if (!n.isVirtual && n.directCount > 0) {
      totalManagers += 1;
      totalDirectLinks += n.directCount;
    }
  }
  const avgSpanOfControl =
    totalManagers > 0 ? Math.round((totalDirectLinks / totalManagers) * 10) / 10 : 0;

  return {
    roots,
    nodeById,
    personNodeByDbId,
    totalStaff: filteredPeople.length,
    totalManagers,
    avgSpanOfControl,
    maxDepth,
    levelCounts,
    sites,
    departments,
  };
}
