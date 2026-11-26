import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';
import { ensureLoginLogTables, getMoscowDateParts } from '@/lib/loginActivity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function addDaysIso(baseDateIso: string, deltaDays: number): string {
  const [y, m, d] = baseDateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function diffDaysBetweenIso(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 999;
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)));
}

export async function GET(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (!sessionUser || sessionUser.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Bu analitik rapora yalnızca Sistem Yöneticisi (Admin) erişebilir.' },
        { status: 403 }
      );
    }

    const db = getDb();
    ensureLoginLogTables(db);

    const { searchParams } = new URL(request.url);
    const rawDays = Number(searchParams.get('days')) || 30;
    const days = [7, 14, 30, 90].includes(rawDays) ? rawDays : 30;
    const filterUserId = Number(searchParams.get('userId')) || 0;

    const mskNow = getMoscowDateParts();
    const todayIso = mskNow.dateIso;
    const startDateIso = addDaysIso(todayIso, -(days - 1));
    const sevenDaysAgoIso = addDaysIso(todayIso, -6);

    const allUsers = db
      .prepare(`
        SELECT id, name, email, role, scope_type, scope_value, created_at, last_login_at, COALESCE(login_count, 0) AS login_count
        FROM users
        ORDER BY id ASC
      `)
      .all() as Array<{
      id: number;
      name: string;
      email: string;
      role: string;
      scope_type: string;
      scope_value: string;
      created_at: string;
      last_login_at: string | null;
      login_count: number;
    }>;

    const periodLogs = (
      filterUserId > 0
        ? db
            .prepare(
              `SELECT * FROM user_login_logs WHERE login_date >= ? AND user_id = ? ORDER BY login_at DESC`
            )
            .all(startDateIso, filterUserId)
        : db
            .prepare(`SELECT * FROM user_login_logs WHERE login_date >= ? ORDER BY login_at DESC`)
            .all(startDateIso)
    ) as Array<{
      id: number;
      user_id: number;
      email: string;
      name: string;
      role: string;
      scope_value: string;
      event_type: string;
      login_at: string;
      login_date: string;
      login_hour: number;
      day_of_week: number;
      ip_address: string;
      device_label: string;
    }>;

    const allPeriodLogsUnfiltered =
      filterUserId > 0
        ? (db
            .prepare(`SELECT * FROM user_login_logs WHERE login_date >= ? ORDER BY login_at DESC`)
            .all(startDateIso) as typeof periodLogs)
        : periodLogs;

    const last7dLogs = db
      .prepare(`SELECT user_id, login_date FROM user_login_logs WHERE login_date >= ?`)
      .all(sevenDaysAgoIso) as Array<{ user_id: number; login_date: string }>;

    const lastLogPerUserRows = db
      .prepare(`
        SELECT l.user_id, l.login_at, l.device_label, l.ip_address
        FROM user_login_logs l
        INNER JOIN (
          SELECT user_id, MAX(id) AS max_id
          FROM user_login_logs
          GROUP BY user_id
        ) m ON l.id = m.max_id
      `)
      .all() as Array<{ user_id: number; login_at: string; device_label: string; ip_address: string }>;
    const lastMetaByUser = new Map<number, { login_at: string; device_label: string; ip_address: string }>();
    for (const r of lastLogPerUserRows) {
      lastMetaByUser.set(Number(r.user_id), {
        login_at: r.login_at || '',
        device_label: r.device_label || '',
        ip_address: r.ip_address || '',
      });
    }

    const totalLogCountByUserRows = db
      .prepare(`SELECT user_id, COUNT(*) AS cnt FROM user_login_logs GROUP BY user_id`)
      .all() as Array<{ user_id: number; cnt: number }>;
    const totalLogCountByUser = new Map<number, number>();
    for (const r of totalLogCountByUserRows) {
      totalLogCountByUser.set(Number(r.user_id), Number(r.cnt || 0));
    }

    // 1. Daily trend across every calendar day in [startDateIso .. todayIso]
    const dayMap = new Map<
      string,
      { users: Set<number>; totalLogins: number; passwordLogins: number; sessionVisits: number }
    >();
    for (let i = 0; i < days; i++) {
      const dIso = addDaysIso(startDateIso, i);
      dayMap.set(dIso, { users: new Set(), totalLogins: 0, passwordLogins: 0, sessionVisits: 0 });
    }
    for (const row of periodLogs) {
      const bucket = dayMap.get(row.login_date);
      if (!bucket) continue;
      bucket.users.add(Number(row.user_id));
      bucket.totalLogins += 1;
      if (row.event_type === 'session_visit') bucket.sessionVisits += 1;
      else bucket.passwordLogins += 1;
    }
    const dailyTrend = Array.from(dayMap.entries()).map(([date, b]) => ({
      date,
      label: `${date.slice(8, 10)}.${date.slice(5, 7)}`,
      uniqueUsers: b.users.size,
      totalLogins: b.totalLogins,
      passwordLogins: b.passwordLogins,
      sessionVisits: b.sessionVisits,
    }));

    // 2. Hourly distribution (0..23 MSK)
    const hourlyBuckets = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      logins: 0,
      users: new Set<number>(),
    }));
    for (const row of periodLogs) {
      const h = Math.max(0, Math.min(23, Number(row.login_hour) || 0));
      hourlyBuckets[h].logins += 1;
      hourlyBuckets[h].users.add(Number(row.user_id));
    }
    const hourlyDistribution = hourlyBuckets.map((hb) => ({
      hour: hb.hour,
      label: hb.label,
      logins: hb.logins,
      uniqueUsers: hb.users.size,
    }));

    // 3. Weekday distribution (0=Mon .. 6=Sun)
    const WK_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const WK_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const wkBuckets = Array.from({ length: 7 }, (_, d) => ({
      day: d,
      labelTr: WK_TR[d],
      labelRu: WK_RU[d],
      logins: 0,
      users: new Set<number>(),
    }));
    for (const row of periodLogs) {
      const d = Math.max(0, Math.min(6, Number(row.day_of_week) || 0));
      wkBuckets[d].logins += 1;
      wkBuckets[d].users.add(Number(row.user_id));
    }
    const weekdayDistribution = wkBuckets.map((wb) => ({
      day: wb.day,
      labelTr: wb.labelTr,
      labelRu: wb.labelRu,
      logins: wb.logins,
      uniqueUsers: wb.users.size,
    }));

    // 4. Role distribution
    const roleMap = new Map<string, { role: string; totalUsers: number; activeUsers: number; logins: number }>();
    for (const u of allUsers) {
      const cur = roleMap.get(u.role) || { role: u.role, totalUsers: 0, activeUsers: 0, logins: 0 };
      cur.totalUsers += 1;
      roleMap.set(u.role, cur);
    }
    const activeRoleUsers = new Map<string, Set<number>>();
    for (const row of allPeriodLogsUnfiltered) {
      const rKey = row.role || 'user';
      const cur = roleMap.get(rKey) || { role: rKey, totalUsers: 0, activeUsers: 0, logins: 0 };
      cur.logins += 1;
      roleMap.set(rKey, cur);
      let s = activeRoleUsers.get(rKey);
      if (!s) {
        s = new Set();
        activeRoleUsers.set(rKey, s);
      }
      s.add(Number(row.user_id));
    }
    const roleDistribution = Array.from(roleMap.values()).map((r) => ({
      ...r,
      activeUsers: activeRoleUsers.get(r.role)?.size || 0,
    }));

    // 5. Per-user engagement & frequency metrics
    const periodByUser = new Map<number, { count: number; days: Set<string>; passwordCount: number }>();
    for (const row of allPeriodLogsUnfiltered) {
      const uid = Number(row.user_id);
      let cur = periodByUser.get(uid);
      if (!cur) {
        cur = { count: 0, days: new Set(), passwordCount: 0 };
        periodByUser.set(uid, cur);
      }
      cur.count += 1;
      cur.days.add(row.login_date);
      if (row.event_type !== 'session_visit') cur.passwordCount += 1;
    }

    const weeksInPeriod = Math.max(1, days / 7);
    const userStats = allUsers
      .map((u) => {
        const uid = Number(u.id);
        const pInfo = periodByUser.get(uid);
        const lastMeta = lastMetaByUser.get(uid);
        const lastLoginAt = u.last_login_at || lastMeta?.login_at || null;
        const totalAllTime = Math.max(Number(u.login_count || 0), totalLogCountByUser.get(uid) || 0);
        const periodLogins = pInfo?.count || 0;
        const activeDays = pInfo?.days.size || 0;
        const avgPerWeek = Math.round((periodLogins / weeksInPeriod) * 10) / 10;
        const daysSinceLast = lastLoginAt ? diffDaysBetweenIso(lastLoginAt, todayIso) : null;

        let tier: 'power' | 'regular' | 'occasional' | 'inactive' | 'never' = 'never';
        if (!lastLoginAt && totalAllTime === 0) {
          tier = 'never';
        } else if (daysSinceLast !== null && daysSinceLast > 7 && periodLogins === 0) {
          tier = 'inactive';
        } else if (avgPerWeek >= 5 || activeDays >= Math.min(days, 12)) {
          tier = 'power';
        } else if (avgPerWeek >= 2 || activeDays >= 3) {
          tier = 'regular';
        } else if (periodLogins > 0) {
          tier = 'occasional';
        } else {
          tier = 'inactive';
        }

        return {
          id: uid,
          name: u.name,
          email: u.email,
          role: u.role,
          scope_type: u.scope_type,
          scope_value: u.scope_value,
          created_at: u.created_at,
          last_login_at: lastLoginAt,
          days_since_last: daysSinceLast,
          total_logins_all_time: totalAllTime,
          period_logins: periodLogins,
          period_password_logins: pInfo?.passwordCount || 0,
          active_days: activeDays,
          avg_per_week: avgPerWeek,
          engagement_tier: tier,
          last_device: lastMeta?.device_label || '',
          last_ip: lastMeta?.ip_address || '',
        };
      })
      .sort((a, b) => b.period_logins - a.period_logins || b.total_logins_all_time - a.total_logins_all_time);

    // 6. Summary KPIs
    const todayBucket = dayMap.get(todayIso);
    const last7dUniqueSet = new Set(last7dLogs.map((l) => Number(l.user_id)));
    const periodUniqueSet = new Set(allPeriodLogsUnfiltered.map((l) => Number(l.user_id)));
    const neverCount = userStats.filter((u) => u.engagement_tier === 'never').length;
    const inactiveCount = userStats.filter(
      (u) => u.engagement_tier === 'never' || u.engagement_tier === 'inactive' || (u.days_since_last !== null && u.days_since_last >= 7)
    ).length;
    const topUser = userStats[0] && userStats[0].period_logins > 0
      ? { name: userStats[0].name, email: userStats[0].email, logins: userStats[0].period_logins, activeDays: userStats[0].active_days }
      : null;

    const peakHourObj = [...hourlyDistribution].sort((a, b) => b.logins - a.logins)[0];

    return NextResponse.json({
      success: true,
      days,
      todayIso,
      startDateIso,
      summary: {
        totalUsers: allUsers.length,
        todayActiveUsers: todayBucket?.users.size || 0,
        todayLogins: todayBucket?.totalLogins || 0,
        last7dActiveUsers: last7dUniqueSet.size,
        adoptionPct7d: allUsers.length > 0 ? Math.round((last7dUniqueSet.size / allUsers.length) * 100) : 0,
        periodLogins: allPeriodLogsUnfiltered.length,
        periodUniqueUsers: periodUniqueSet.size,
        avgDailyLogins: Math.round((allPeriodLogsUnfiltered.length / days) * 10) / 10,
        neverLoggedInCount: neverCount,
        inactive7dCount: inactiveCount,
        topUser,
        peakHour: peakHourObj && peakHourObj.logins > 0 ? peakHourObj.label : null,
      },
      dailyTrend,
      hourlyDistribution,
      weekdayDistribution,
      roleDistribution,
      userStats,
      recentLogs: periodLogs.slice(0, 200),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Giriş analitiği okunamadı.' },
      { status: 500 }
    );
  }
}
