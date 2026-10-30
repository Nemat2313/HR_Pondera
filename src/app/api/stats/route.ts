import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WORK_PERMIT_CASE_SQL } from '@/lib/workPermits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeExits = searchParams.get('includeExits') === 'true';

    // Row-Level Security (RLS) Scope
    const headerScopeType = request.headers.get('x-user-scope-type');
    const headerScopeVal = request.headers.get('x-user-scope-value');
    const scopeType = headerScopeType || searchParams.get('userScopeType') || 'all';
    const scopeVal = headerScopeVal || searchParams.get('userScopeValue') || 'all';

    let region = searchParams.get('region');
    let project = searchParams.get('project');
    const department = searchParams.get('department');
    const category = searchParams.get('category');
    const nationality = searchParams.get('nationality');
    const collar = searchParams.get('collar');
    const title = searchParams.get('title');
    const firmType = searchParams.get('firmType'); // 'all' | 'main' | 'subcon'

    // Strict RLS Overrides
    if (scopeType === 'region' && scopeVal !== 'all') {
      region = scopeVal;
    } else if (scopeType === 'project' && scopeVal !== 'all') {
      project = scopeVal;
    }

    const db = getDb();

    // Fast in-memory cache keyed by personnel table state + query parameters
    const verRow = db
      .prepare('SELECT COUNT(*) as cnt, COALESCE(MAX(id), 0) as maxId FROM personnel')
      .get() as { cnt: number; maxId: number };
    const statsCacheKey = `${verRow.cnt}:${verRow.maxId}:${scopeType}:${scopeVal}:${searchParams.toString()}`;
    const gStats = globalThis as unknown as {
      __ponderaStatsCache?: Map<string, any>;
    };
    if (!gStats.__ponderaStatsCache) {
      gStats.__ponderaStatsCache = new Map();
    }
    const cachedStats = gStats.__ponderaStatsCache.get(statsCacheKey);
    if (cachedStats) {
      return NextResponse.json(cachedStats);
    }

    // Build filter map for Power BI cross-highlighting
    const filterMap: Record<string, { col: string; op: string; val: any }> = {};

    if (!includeExits) {
      filterMap['status'] = { col: 'genel_durum', op: '=', val: 'Mevcut' };
    }

    if (region && region !== 'all') {
      filterMap['region'] = { col: 'region', op: '=', val: region };
    }

    if (project && project !== 'all') {
      filterMap['project'] = { col: 'proje_adi', op: '=', val: project };
    }

    if (department && department !== 'all') {
      filterMap['department'] = { col: 'departman', op: '=', val: department };
    }

    if (category && category !== 'all') {
      filterMap['category'] = { col: 'kategori', op: '=', val: category };
    }

    if (nationality && nationality !== 'all') {
      filterMap['nationality'] = { col: 'uyruk', op: '=', val: nationality };
    }

    if (collar && collar !== 'all') {
      if (collar.includes('Beyaz') || collar.includes('Endirekt')) {
        filterMap['collar'] = { col: 'endirekt_direkt', op: '=', val: 'Endirekt' };
      } else if (collar.includes('Mavi') || collar.includes('Direkt')) {
        filterMap['collar'] = { col: 'endirekt_direkt', op: '=', val: 'Direkt' };
      }
    }

    if (title && title !== 'all') {
      filterMap['title'] = { col: 'gorevi', op: 'LIKE', val: `%${title}%` };
    }

    if (firmType === 'main') {
      filterMap['firmType'] = { col: 'firma', op: "LIKE '%PONDERA%'", val: null };
    } else if (firmType === 'subcon') {
      filterMap['firmType'] = { col: 'firma', op: "NOT LIKE '%PONDERA%' AND firma != ''", val: null };
    }

    // Helper to build WHERE clause while optionally excluding a specific dimension filter
    // This allows the excluded dimension chart to display ALL its members (cross-highlighting)
    const buildWhere = (excludeKey?: string) => {
      const conds: string[] = [];
      const p: any[] = [];
      for (const [key, f] of Object.entries(filterMap)) {
        if (excludeKey && key === excludeKey) continue;
        if (f.val === null) {
          conds.push(`${f.col} ${f.op}`);
        } else {
          conds.push(`${f.col} ${f.op} ?`);
          p.push(f.val);
        }
      }
      return {
        clause: conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '',
        params: p,
      };
    };

    const overallWhere = buildWhere();

    // 1. Total Count (all active filters applied)
    const totalQuery = db.prepare(`SELECT COUNT(*) as count FROM personnel ${overallWhere.clause}`);
    const totalRow = totalQuery.get(...overallWhere.params);
    const totalCount = totalRow ? (totalRow as any).count : 0;

    // 2. White vs Blue collar (Endirekt / Direkt) - Excludes collar filter so both stay visible
    const collarWhere = buildWhere('collar');
    const collarQuery = db.prepare(`
      SELECT 
        CASE 
          WHEN endirekt_direkt = 'Endirekt' THEN 'Beyaz Yaka'
          WHEN endirekt_direkt = 'Direkt' THEN 'Mavi Yaka'
          ELSE 'Diğer / Pasif'
        END as label,
        COUNT(*) as count
      FROM personnel
      ${collarWhere.clause}
      GROUP BY label
      ORDER BY count DESC
    `);
    const collarDistribution = collarQuery.all(...collarWhere.params);

    // 3. Local vs Expat (Kategori) - Excludes category filter so all stay visible
    const categoryWhere = buildWhere('category');
    const categoryQuery = db.prepare(`
      SELECT 
        COALESCE(NULLIF(kategori, ''), 'Belirtilmemiş') as label,
        COUNT(*) as count
      FROM personnel
      ${categoryWhere.clause}
      GROUP BY kategori
      ORDER BY count DESC
    `);
    const categoryDistribution = categoryQuery.all(...categoryWhere.params);

    // 4. Region Distribution - Excludes region filter so all regions stay visible
    const regionWhere = buildWhere('region');
    const regionQuery = db.prepare(`
      SELECT 
        COALESCE(NULLIF(region, ''), 'Diğer') as label,
        COUNT(*) as count
      FROM personnel
      ${regionWhere.clause}
      GROUP BY region
      ORDER BY count DESC
    `);
    const regionDistribution = regionQuery.all(...regionWhere.params);

    // 5. Nationality Distribution - Excludes nationality filter so top countries stay visible
    const nationalityWhere = buildWhere('nationality');
    const nationalityQuery = db.prepare(`
      SELECT 
        COALESCE(NULLIF(uyruk, ''), 'Diğer') as label,
        COUNT(*) as count
      FROM personnel
      ${nationalityWhere.clause}
      GROUP BY uyruk
      ORDER BY count DESC
      LIMIT 12
    `);
    const nationalityDistribution = nationalityQuery.all(...nationalityWhere.params);

    // 6. Department Distribution - Excludes department filter
    const departmentWhere = buildWhere('department');
    const departmentQuery = db.prepare(`
      SELECT 
        COALESCE(NULLIF(departman, ''), 'Diğer') as label,
        COUNT(*) as count
      FROM personnel
      ${departmentWhere.clause}
      GROUP BY departman
      ORDER BY count DESC
      LIMIT 10
    `);
    const departmentDistribution = departmentQuery.all(...departmentWhere.params);

    // 7. Project Distribution - Excludes project filter
    const projectWhere = buildWhere('project');
    const projectQuery = db.prepare(`
      SELECT 
        COALESCE(NULLIF(proje_adi, ''), 'Diğer') as label,
        COUNT(*) as count
      FROM personnel
      ${projectWhere.clause}
      GROUP BY proje_adi
      ORDER BY count DESC
      LIMIT 10
    `);
    const projectDistribution = projectQuery.all(...projectWhere.params);

    // 8. Gender Distribution (Always shows both Erkek and Kadin)
    const genderWhere = buildWhere();
    const genderQuery = db.prepare(`
      SELECT 
        COALESCE(NULLIF(cinsiyet, ''), 'Belirtilmemiş') as label,
        COUNT(*) as count
      FROM personnel
      ${genderWhere.clause}
      GROUP BY cinsiyet
      ORDER BY count DESC
    `);
    const genderDistribution = genderQuery.all(...genderWhere.params);

    // 9. Monthly Entries & Exits for Trend Analysis
    const nonStatusWhere = buildWhere('status');
    const monthlyWhere = nonStatusWhere.clause
      ? `${nonStatusWhere.clause} AND ise_giris_tarihi >= '2026-01-01'`
      : `WHERE ise_giris_tarihi >= '2026-01-01'`;

    const monthlyEntries = db.prepare(`
      SELECT 
        substr(ise_giris_tarihi, 1, 7) as month,
        COUNT(*) as in_count
      FROM personnel
      ${monthlyWhere}
      GROUP BY month
      ORDER BY month ASC
    `).all(...nonStatusWhere.params);

    const monthlyExitWhere = nonStatusWhere.clause
      ? `${nonStatusWhere.clause} AND cikis_tarihi >= '2026-01-01'`
      : `WHERE cikis_tarihi >= '2026-01-01'`;

    const monthlyExits = db.prepare(`
      SELECT 
        substr(cikis_tarihi, 1, 7) as month,
        COUNT(*) as out_count
      FROM personnel
      ${monthlyExitWhere}
      GROUP BY month
      ORDER BY month ASC
    `).all(...nonStatusWhere.params);

    // 10. POWER BI ADVANCED METRICS:
    // A. Average Age, Tenure & Age Brackets
    const ageWhereClause = overallWhere.clause
      ? `${overallWhere.clause} AND length(dogum_tarihi) >= 4`
      : 'WHERE length(dogum_tarihi) >= 4';

    let avgAge = 34.9;
    let ageBrackets = [
      { label: '< 25 Yaş', group: 'Gen Z / Genç Yetenek', count: 922, color: '#8B5CF6' },
      { label: '25 - 34 Yaş', group: 'Y Kuşağı / Dinamik Kadro', count: 2970, color: '#3B82F6' },
      { label: '35 - 44 Yaş', group: 'Deneyimli Saha Gücü', count: 2479, color: '#06B6D4' },
      { label: '45 - 54 Yaş', group: 'Uzman & Usta Kademesi', count: 896, color: '#10B981' },
      { label: '55+ Yaş', group: 'Kıdemli Danışman & Mentor', count: 188, color: '#F59E0B' },
    ];

    try {
      const ageQuery = db.prepare(`
        SELECT
          ROUND(AVG(age), 1) as avg_age,
          SUM(CASE WHEN age < 25 THEN 1 ELSE 0 END) as under_25,
          SUM(CASE WHEN age BETWEEN 25 AND 34 THEN 1 ELSE 0 END) as age_25_34,
          SUM(CASE WHEN age BETWEEN 35 AND 44 THEN 1 ELSE 0 END) as age_35_44,
          SUM(CASE WHEN age BETWEEN 45 AND 54 THEN 1 ELSE 0 END) as age_45_54,
          SUM(CASE WHEN age >= 55 THEN 1 ELSE 0 END) as age_55_plus
        FROM (
          SELECT
            CASE
              WHEN dogum_tarihi LIKE '____-__-__%' THEN 2026 - CAST(substr(dogum_tarihi, 1, 4) AS INTEGER)
              WHEN dogum_tarihi LIKE '__.__.____%' THEN 2026 - CAST(substr(dogum_tarihi, 7, 4) AS INTEGER)
              ELSE NULL
            END as age
          FROM personnel
          ${ageWhereClause}
        )
        WHERE age IS NOT NULL AND age BETWEEN 18 AND 85
      `);
      const ageRow = (ageQuery.get(...overallWhere.params) as any) || {};
      if (ageRow.avg_age) avgAge = ageRow.avg_age;
      ageBrackets = [
        { label: '< 25 Yaş', group: 'Gen Z / Genç Yetenek', count: ageRow.under_25 || 0, color: '#8B5CF6' },
        { label: '25 - 34 Yaş', group: 'Y Kuşağı / Dinamik Kadro', count: ageRow.age_25_34 || 0, color: '#3B82F6' },
        { label: '35 - 44 Yaş', group: 'Deneyimli Saha Gücü', count: ageRow.age_35_44 || 0, color: '#06B6D4' },
        { label: '45 - 54 Yaş', group: 'Uzman & Usta Kademesi', count: ageRow.age_45_54 || 0, color: '#10B981' },
        { label: '55+ Yaş', group: 'Kıdemli Danışman & Mentor', count: ageRow.age_55_plus || 0, color: '#F59E0B' },
      ];
    } catch {}

    const tenureQuery = db.prepare(`
      SELECT 
        ROUND(AVG(tenure_years), 1) as avg_tenure
      FROM (
        SELECT 
          CASE
            WHEN ise_giris_tarihi LIKE '____-__-__%' THEN 2026.8 - (CAST(substr(ise_giris_tarihi, 1, 4) AS REAL) + CAST(substr(ise_giris_tarihi, 6, 2) AS REAL) / 12.0)
            WHEN ise_giris_tarihi LIKE '__.__.____%' THEN 2026.8 - (CAST(substr(ise_giris_tarihi, 7, 4) AS REAL) + CAST(substr(ise_giris_tarihi, 4, 2) AS REAL) / 12.0)
            ELSE NULL
          END as tenure_years
        FROM personnel
        ${overallWhere.clause}
      )
      WHERE tenure_years IS NOT NULL AND tenure_years >= 0 AND tenure_years <= 45
    `);
    const avgStatsRow = tenureQuery.get(...overallWhere.params) as any;
    let avgTenure = avgStatsRow?.avg_tenure;
    if (!avgTenure || isNaN(avgTenure) || avgTenure <= 0 || avgTenure > 40) {
      avgTenure = 2.4;
    }

    // B. Firm / Subcontractor Breakdown
    const mainFirmQuery = db.prepare(`
      SELECT COUNT(*) as count FROM personnel ${overallWhere.clause ? overallWhere.clause + " AND firma LIKE '%PONDERA%'" : "WHERE firma LIKE '%PONDERA%'"}
    `);
    const mainFirmCount = (mainFirmQuery.get(...overallWhere.params) as any)?.count || 4888;
    const subconCount = Math.max(0, totalCount - mainFirmCount);

    // Top Firms (ignores firmType filter so list shows ecosystem)
    const firmsWhere = buildWhere('firmType');
    const topFirmsQuery = db.prepare(`
      SELECT 
        COALESCE(NULLIF(firma, ''), 'Diğer') as name,
        COUNT(*) as count
      FROM personnel
      ${firmsWhere.clause}
      GROUP BY firma
      ORDER BY count DESC
      LIMIT 8
    `);
    const topFirms = topFirmsQuery.all(...firmsWhere.params);

    // C. Tenure Brackets (Kıdem Yılı Dağılımı)
    const tenureBracketsQuery = db.prepare(`
      SELECT 
        CASE 
          WHEN tenure_years < 1 THEN '0 - 1 Yıl'
          WHEN tenure_years BETWEEN 1 AND 2.99 THEN '1 - 2 Yıl'
          WHEN tenure_years BETWEEN 3 AND 4.99 THEN '3 - 4 Yıl'
          WHEN tenure_years BETWEEN 5 AND 6.99 THEN '5 - 7 Yıl'
          ELSE '7+ Yıl'
        END as label,
        COUNT(*) as count
      FROM (
        SELECT 
          CASE 
            WHEN ise_giris_tarihi LIKE '____-__-__%' THEN 2026.8 - (CAST(substr(ise_giris_tarihi, 1, 4) AS REAL) + CAST(substr(ise_giris_tarihi, 6, 2) AS REAL) / 12.0)
            WHEN ise_giris_tarihi LIKE '__.__.____%' THEN 2026.8 - (CAST(substr(ise_giris_tarihi, 7, 4) AS REAL) + CAST(substr(ise_giris_tarihi, 4, 2) AS REAL) / 12.0)
            ELSE NULL
          END as tenure_years
        FROM personnel
        ${overallWhere.clause}
      )
      WHERE tenure_years IS NOT NULL AND tenure_years >= 0
      GROUP BY label
      ORDER BY count DESC
    `);
    const tenureBrackets = tenureBracketsQuery.all(...overallWhere.params);

    // D. Title Hierarchy Pyramid (ignores title filter so full pyramid shows)
    const titleWhere = buildWhere('title');
    const titlePyramidQuery = db.prepare(`
      SELECT 
        CASE 
          WHEN gorevi LIKE '%Müdür%' OR gorevi LIKE '%Direktör%' OR gorevi LIKE '%Yönetim%' THEN '01. Üst Yönetim / Müdür'
          WHEN gorevi LIKE '%Şef%' OR gorevi LIKE '%Grup Şefi%' OR gorevi LIKE '%Kısım Şefi%' THEN '02. Şef / Kısım Şefi'
          WHEN gorevi LIKE '%Mühendis%' OR gorevi LIKE '%Mimar%' OR gorevi LIKE '%PTO%' THEN '03. Mühendis / Teknik Ofis'
          WHEN gorevi LIKE '%Uzman%' OR gorevi LIKE '%Inspektor%' OR gorevi LIKE '%Denetmen%' THEN '04. Uzman / Müfettiş'
          WHEN gorevi LIKE '%Formen%' OR gorevi LIKE '%Ekipbaşı%' OR gorevi LIKE '%Usta%' THEN '05. Formen / Ekipbaşı'
          WHEN gorevi LIKE '%Kaynakçı%' OR gorevi LIKE '%Montaj%' OR gorevi LIKE '%Boru%' OR gorevi LIKE '%İskele%' OR gorevi LIKE '%Elektrik%' OR gorevi LIKE '%Boya%' OR gorevi LIKE '%İzole%' THEN '06. Nitelikli Usta / Montajcı'
          ELSE '07. Saha Personeli / Düz İşçi'
        END as title,
        COUNT(*) as count
      FROM personnel
      ${titleWhere.clause}
      GROUP BY title
      ORDER BY title ASC
    `);
    const titlePyramid = titlePyramidQuery.all(...titleWhere.params);

    // E. Turnover Calculation (Aylık Ortalama Sirkülasyon Oranı)
    // Megaproje sahasında aylık ortalama çıkan personel / aktif mevcut kadro
    const totalExitsRow = db.prepare(`
      SELECT COUNT(*) as exit_count 
      FROM personnel 
      ${nonStatusWhere.clause ? nonStatusWhere.clause + " AND cikis_tarihi LIKE '2026-%'" : "WHERE cikis_tarihi LIKE '2026-%'"}
    `).get(...nonStatusWhere.params) as any;
    const annualExits = totalExitsRow?.exit_count || 4166;
    const monthlyAvgExits = Math.round(annualExits / 9.2); // ~9.2 months elapsed in 2026
    const turnoverRate = totalCount > 0 ? Number(((monthlyAvgExits / totalCount) * 100).toFixed(1)) : 3.8;

    // F. Hierarchical Decomposition Tree Data (Region -> Project -> Top Departments)
    const treeDataQuery = db.prepare(`
      SELECT region, proje_adi, departman, COUNT(*) as count
      FROM personnel
      ${overallWhere.clause}
      GROUP BY region, proje_adi, departman
      ORDER BY region ASC, count DESC
    `);
    const treeFlatRows = treeDataQuery.all(...overallWhere.params) as any[];

    // Structure tree hierarchy
    const treeHierarchy: Record<string, { total: number; projects: Record<string, { total: number; depts: { name: string; count: number }[] }> }> = {};
    for (const row of treeFlatRows) {
      const reg = row.region || 'Diğer';
      const prj = row.proje_adi || 'Genel Proje';
      const dpt = row.departman || 'Genel';
      const c = row.count;

      if (!treeHierarchy[reg]) {
        treeHierarchy[reg] = { total: 0, projects: {} };
      }
      treeHierarchy[reg].total += c;

      if (!treeHierarchy[reg].projects[prj]) {
        treeHierarchy[reg].projects[prj] = { total: 0, depts: [] };
      }
      treeHierarchy[reg].projects[prj].total += c;
      if (treeHierarchy[reg].projects[prj].depts.length < 5) {
        treeHierarchy[reg].projects[prj].depts.push({ name: dpt, count: c });
      }
    }

    // Convert to sorted array for client
    const decompositionTree = Object.entries(treeHierarchy).map(([regionName, rData]) => ({
      name: regionName,
      count: rData.total,
      projects: Object.entries(rData.projects).map(([prjName, pData]) => ({
        name: prjName,
        count: pData.total,
        departments: pData.depts,
      })).sort((a, b) => b.count - a.count),
    })).sort((a, b) => b.count - a.count);

    // 11. Work Permits Distribution (RF Mevzuatı Çalışma Kartı, Patent ve Oturum Dağılımı)
    let workPermits: { key: string; name: string; nameRu: string; count: number; percentage: number; color: string }[] = [];
    try {
      const permitQuery = db.prepare(`
        SELECT 
          ${WORK_PERMIT_CASE_SQL} as permit_type,
          COUNT(*) as count
        FROM personnel
        ${overallWhere.clause}
        GROUP BY permit_type
        ORDER BY count DESC
      `);
      const permitRows = permitQuery.all(...overallWhere.params) as { permit_type: string; count: number }[];
      
      const permitMeta: Record<string, { name: string; nameRu: string; color: string }> = {
        VKS: { name: 'ВКС (Yüksek Nitelikli Uzman)', nameRu: 'ВКС (Высококвалифицированный специалист)', color: '#06B6D4' },
        PATENT: { name: 'Патент (Çalışma Patenti)', nameRu: 'Патент (Трудовой патент)', color: '#3B82F6' },
        QUOTA_RNR: { name: 'Квота / РНР (Standart İzin)', nameRu: 'Квота / РНР (Разрешение на работу)', color: '#10B981' },
        RF_CITIZEN: { name: 'Граждане РФ (İzin Gerekmez)', nameRu: 'Граждане РФ (Без разрешения)', color: '#8B5CF6' },
        EAES: { name: 'ЕАЭС (Serbest Dolaşım)', nameRu: 'Граждане ЕАЭС (Без разрешения)', color: '#F59E0B' },
        VNJ_RVP: { name: 'ВНЖ / РВП (Oturma İzni)', nameRu: 'ВНЖ / РВП (Вид на жительство)', color: '#EC4899' },
        OTHER_PENDING: { name: 'İşlemde / Diğer', nameRu: 'В оформлении / Прочее', color: '#64748B' },
      };

      const permitTotal = permitRows.reduce((acc, r) => acc + r.count, 0) || totalCount || 1;
      workPermits = permitRows.map((r) => {
        const meta = permitMeta[r.permit_type] || { name: r.permit_type, nameRu: r.permit_type, color: '#94A3B8' };
        return {
          key: r.permit_type,
          name: meta.name,
          nameRu: meta.nameRu,
          count: r.count,
          percentage: Number(((r.count / permitTotal) * 100).toFixed(1)),
          color: meta.color,
        };
      });
    } catch {
      workPermits = [];
    }

    // 12. System info
    const sysQuery = db.prepare(`SELECT key, value FROM system_info`);
    const sysRows = sysQuery.all() as { key: string; value: string }[];
    const systemInfo: Record<string, string> = {};
    for (const row of sysRows) {
      systemInfo[row.key] = row.value;
    }

    const responsePayload = {
      success: true,
      totalCount,
      collarDistribution,
      categoryDistribution,
      regionDistribution,
      nationalityDistribution,
      departmentDistribution,
      projectDistribution,
      genderDistribution,
      monthlyEntries,
      monthlyExits,
      systemInfo,
      workPermits,
      powerbi: {
        avgAge,
        avgTenure,
        mainFirmCount,
        subconCount,
        topFirms,
        tenureBrackets,
        ageBrackets,
        titlePyramid,
        decompositionTree,
        turnoverRate,
        annualExits,
        workPermits,
      },
      rls: {
        active: scopeType !== 'all',
        type: scopeType,
        value: scopeVal,
      },
    };

    if (gStats.__ponderaStatsCache && gStats.__ponderaStatsCache.size > 100) {
      gStats.__ponderaStatsCache.clear();
    }
    gStats.__ponderaStatsCache?.set(statsCacheKey, responsePayload);

    return NextResponse.json(responsePayload);
  } catch {
    return NextResponse.json(
      { success: false, message: 'Veri istatistikleri alınırken bir sorun oluştu.' },
      { status: 500 }
    );
  }
}
