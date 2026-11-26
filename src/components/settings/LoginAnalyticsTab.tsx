'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Users,
  Clock,
  TrendingUp,
  UserX,
  Award,
  RefreshCw,
  Download,
  ShieldCheck,
  Search,
  Monitor,
  CalendarDays,
  Filter,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

interface DailyPoint {
  date: string;
  label: string;
  uniqueUsers: number;
  totalLogins: number;
  passwordLogins: number;
  sessionVisits: number;
}

interface HourlyPoint {
  hour: number;
  label: string;
  logins: number;
  uniqueUsers: number;
}

interface WeekdayPoint {
  day: number;
  labelTr: string;
  labelRu: string;
  logins: number;
  uniqueUsers: number;
}

interface RoleStat {
  role: string;
  totalUsers: number;
  activeUsers: number;
  logins: number;
}

interface UserFrequencyRow {
  id: number;
  name: string;
  email: string;
  role: string;
  scope_type: string;
  scope_value: string;
  created_at: string;
  last_login_at: string | null;
  days_since_last: number | null;
  total_logins_all_time: number;
  period_logins: number;
  period_password_logins: number;
  active_days: number;
  avg_per_week: number;
  engagement_tier: 'power' | 'regular' | 'occasional' | 'inactive' | 'never';
  last_device: string;
  last_ip: string;
}

interface LoginLogRow {
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
  ip_address: string;
  device_label: string;
}

interface AnalyticsPayload {
  success: boolean;
  days: number;
  todayIso: string;
  startDateIso: string;
  summary: {
    totalUsers: number;
    todayActiveUsers: number;
    todayLogins: number;
    last7dActiveUsers: number;
    adoptionPct7d: number;
    periodLogins: number;
    periodUniqueUsers: number;
    avgDailyLogins: number;
    neverLoggedInCount: number;
    inactive7dCount: number;
    topUser: { name: string; email: string; logins: number; activeDays: number } | null;
    peakHour: string | null;
  };
  dailyTrend: DailyPoint[];
  hourlyDistribution: HourlyPoint[];
  weekdayDistribution: WeekdayPoint[];
  roleDistribution: RoleStat[];
  userStats: UserFrequencyRow[];
  recentLogs: LoginLogRow[];
}

export default function LoginAnalyticsTab() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const isRu = lang === 'ru';
  const L = (tr: string, ru: string) => (isRu ? ru : tr);

  const [days, setDays] = useState<7 | 14 | 30 | 90>(30);
  const [selectedUserId, setSelectedUserId] = useState<number>(0);
  const [logSearch, setLogSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchAnalytics = async (rangeDays = days, uid = selectedUserId) => {
    if (user?.role !== 'admin') return;
    setLoading(true);
    setErrorMsg('');
    try {
      const qs = new URLSearchParams({ days: String(rangeDays) });
      if (uid > 0) qs.set('userId', String(uid));
      const res = await fetch(`/api/users/login-analytics?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json?.success) {
        setData(json);
      } else {
        setErrorMsg(json?.message || L('Giriş analitiği yüklenemedi.', 'Не удалось загрузить аналитику входов.'));
      }
    } catch {
      setErrorMsg(L('Sunucu bağlantı hatası.', 'Ошибка соединения с сервером.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAnalytics(days, selectedUserId);
    } else {
      setLoading(false);
    }
  }, [user?.role, days, selectedUserId]);

  const roleLabel = (role: string) => {
    if (role === 'admin') return L('Admin', 'Админ');
    if (role === 'hr_specialist') return L('Personelci (İK)', 'Кадровик (HR)');
    if (role === 'viewer') return L('Gözlemci', 'Наблюдатель');
    if (role === 'idari_isler') return L('İdari İşler', 'АХО и Билеты');
    return L('Kullanıcı', 'Пользователь');
  };

  const tierMeta = (tier: UserFrequencyRow['engagement_tier']) => {
    if (tier === 'power') {
      return {
        label: L('🔥 Çok Aktif', '🔥 Очень активен'),
        cls: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300/80 dark:border-emerald-700',
      };
    }
    if (tier === 'regular') {
      return {
        label: L('✓ Düzenli', '✓ Регулярно'),
        cls: 'bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border-sky-300/80 dark:border-sky-700',
      };
    }
    if (tier === 'occasional') {
      return {
        label: L('⚠ Seyrek', '⚠ Редко'),
        cls: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300/80 dark:border-amber-700',
      };
    }
    if (tier === 'inactive') {
      return {
        label: L('⛔ Pasif (7g+)', '⛔ Неактивен (7д+)'),
        cls: 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300/80 dark:border-rose-700',
      };
    }
    return {
      label: L('— Hiç Girmedi', '— Не входил'),
      cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300/80 dark:border-slate-700',
    };
  };

  const filteredLogs = useMemo(() => {
    const list = data?.recentLogs || [];
    const q = logSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((l) =>
      `${l.name} ${l.email} ${l.role} ${l.device_label} ${l.ip_address} ${l.login_at}`.toLowerCase().includes(q)
    );
  }, [data?.recentLogs, logSearch]);

  const selectedUserObj = useMemo(
    () => (data?.userStats || []).find((u) => u.id === selectedUserId) || null,
    [data?.userStats, selectedUserId]
  );

  const handleExportCsv = () => {
    if (!data) return;
    const rows = data.userStats.map((u, idx) => ({
      '№': idx + 1,
      [L('Kullanıcı', 'Пользователь')]: u.name,
      'E-Mail': u.email,
      [L('Rol', 'Роль')]: roleLabel(u.role),
      [L('Kapsam', 'Область RLS')]: u.scope_value,
      [L('Son Giriş (MSK)', 'Последний вход (MSK)')]: u.last_login_at || '-',
      [L(`Son ${days} Gün Giriş`, `Входов за ${days} дн.`)]: u.period_logins,
      [L(`Aktif Gün (${days}g)`, `Активных дней (${days}д)`)]: u.active_days,
      [L('Haftalık Ort.', 'В неделю (ср.)')]: u.avg_per_week,
      [L('Toplam Giriş', 'Всего входов')]: u.total_logins_all_time,
      [L('Son Cihaz', 'Устройство')]: u.last_device || '-',
      'IP': u.last_ip || '-',
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [
      '\uFEFF' + headers.join(';'),
      ...rows.map((r) => headers.map((h) => `"${String((r as any)[h] ?? '').replace(/"/g, '""')}"`).join(';')),
    ].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Pondera_Kullanici_Giris_Analitigi_${days}g_${data.todayIso}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <div className="p-8 rounded-2xl bg-white dark:bg-[#131C31] border border-rose-200 dark:border-rose-900/60 shadow-sm text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400 mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {L('Erişim Kısıtlı (Sadece Admin)', 'Доступ ограничен (Только Администратор)')}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {L(
              'Kullanıcı giriş geçmişi ve kullanım sıklığı analitik raporu yalnızca Sistem Yöneticisi (Admin) tarafından görüntülenebilir.',
              'Аналитика входов и активности пользователей доступна исключительно Системному Администратору.'
            )}
          </p>
        </div>
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/15 dark:bg-emerald-500/20 border border-emerald-300/70 dark:border-emerald-500/35 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                {L('Kullanıcı Giriş & Kullanım Sıklığı Analitiği', 'Аналитика входов и активности пользователей')}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                {L('Sadece Admin', 'Только Админ')}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {L(
                'Gün bazlı aktif kullanıcı sayısı, saatlik yoğunluk (MSK), kullanıcı kullanım sıklığı ve detaylı oturum denetim kayıtları',
                'Ежедневная активность, пиковые часы (MSK), частота использования по сотрудникам и журнал входов'
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {([7, 14, 30, 90] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  days === d
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {d} {L('Gün', 'дн.')}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => fetchAnalytics(days, selectedUserId)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{L('Yenile', 'Обновить')}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!data}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{L('CSV İndir', 'Скачать CSV')}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {selectedUserObj && (
        <div className="px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
            <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>
              {L('Seçili Kullanıcı Filtresi:', 'Фильтр по пользователю:')}{' '}
              <strong>{selectedUserObj.name}</strong> ({selectedUserObj.email})
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedUserId(0)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-semibold cursor-pointer"
          >
            <X className="w-3 h-3" />
            <span>{L('Tümünü Göster', 'Сбросить')}</span>
          </button>
        </div>
      )}

      {/* 5 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
            <span>{L('Bugün Aktif (DAU)', 'Активны сегодня')}</span>
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
              {s?.todayActiveUsers ?? 0}
            </span>
            <span className="text-xs text-slate-500">/ {s?.totalUsers ?? 0}</span>
          </div>
          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-1">
            {L(`Bugün toplam ${s?.todayLogins ?? 0} giriş`, `Всего входов сегодня: ${s?.todayLogins ?? 0}`)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
            <span>{L('Son 7 Gün Aktif (WAU)', 'Активны за 7 дн.')}</span>
            <TrendingUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
              {s?.last7dActiveUsers ?? 0}
            </span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300">
              %{s?.adoptionPct7d ?? 0}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {L('Haftalık ekip kullanım oranı', 'Доля активных за неделю')}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
            <span>{L(`Son ${days} Gün Giriş`, `Входов за ${days} дн.`)}</span>
            <CalendarDays className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
              {s?.periodLogins ?? 0}
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              ({s?.avgDailyLogins ?? 0}/{L('gün', 'день')})
            </span>
          </div>
          <div className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium mt-1">
            {s?.peakHour
              ? L(`En yoğun saat: ${s.peakHour} MSK`, `Пиковый час: ${s.peakHour} MSK`)
              : L('Veri birikmeye başladı', 'Сбор статистики активен')}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
            <span>{L('En Aktif Kullanıcı', 'Самый активный')}</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white truncate" title={s?.topUser?.name || ''}>
            {s?.topUser?.name || '—'}
          </div>
          <div className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold mt-1">
            {s?.topUser
              ? L(
                  `${s.topUser.logins} giriş · ${s.topUser.activeDays} aktif gün`,
                  `${s.topUser.logins} вх. · ${s.topUser.activeDays} акт. дн.`
                )
              : L('Henüz kayıt yok', 'Пока нет данных')}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
            <span>{L('Pasif / Hiç Girmeyen', 'Неактивные (7д+)')}</span>
            <UserX className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-rose-600 dark:text-rose-400">
              {s?.inactive7dCount ?? 0}
            </span>
            <span className="text-xs text-slate-500">/ {s?.totalUsers ?? 0}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {L(`Hiç giriş yapmayan: ${s?.neverLoggedInCount ?? 0}`, `Ни разу не входили: ${s?.neverLoggedInCount ?? 0}`)}
          </div>
        </div>
      </div>

      {/* Main Chart: Daily Active Users & Login Volume */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {L(`Gün Bazlı Giriş Sayısı & Benzersiz Kullanıcı Trendi (Son ${days} Gün)`, `Ежедневная динамика входов и уникальных пользователей (${days} дн.)`)}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {L(
                'Sütunlar günlük toplam giriş/oturum sayısını, zümrüt çizgi o gün sisteme giren benzersiz kullanıcı sayısını gösterir.',
                'Столбцы — всего входов за день, линия — уникальные пользователи за день.'
              )}
            </p>
          </div>
        </div>

        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data?.dailyTrend || []} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
              <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#64748b' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10.5, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar
                dataKey="totalLogins"
                name={L('Toplam Giriş', 'Всего входов')}
                fill="#6366f1"
                radius={[6, 6, 0, 0]}
                maxBarSize={28}
              />
              <Line
                type="monotone"
                dataKey="uniqueUsers"
                name={L('Benzersiz Kullanıcı', 'Уникальные польз.')}
                stroke="#059669"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#059669' }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Secondary Analytics Row: Peak Hours (MSK) + Day of Week & Role Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>{L('Saatlik Giriş Yoğunluğu (Moskova Saati — MSK)', 'Распределение входов по часам (MSK)')}</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {L('Sistemin gün içinde en yoğun kullanıldığı saat dilimleri', 'Наиболее активные часы работы пользователей')}
              </p>
            </div>
          </div>
          <div className="h-[210px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.hourlyDistribution || []} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.45} />
                <XAxis dataKey="hour" tickFormatter={(h) => `${String(h).padStart(2, '0')}`} tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip
                  labelFormatter={(h) => `${String(h).padStart(2, '0')}:00 – ${String(h).padStart(2, '0')}:59 MSK`}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                />
                <Bar dataKey="logins" name={L('Giriş Sayısı', 'Входов')} radius={[5, 5, 0, 0]}>
                  {(data?.hourlyDistribution || []).map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.hour >= 8 && entry.hour <= 19 ? '#10b981' : '#94a3b8'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {L('Haftanın Günleri & Rol Bazlı Kullanım', 'Активность по дням недели и ролям')}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {L('Hangi günlerde ve hangi rollerden daha sık giriş yapılıyor', 'В какие дни недели и какие роли активнее всего')}
            </p>
          </div>

          <div className="h-[135px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={(data?.weekdayDistribution || []).map((w) => ({
                  ...w,
                  label: isRu ? w.labelRu : w.labelTr,
                }))}
                margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.45} />
                <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                <Bar dataKey="logins" name={L('Giriş', 'Входов')} fill="#0d9488" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            {(data?.roleDistribution || []).map((r) => (
              <div
                key={r.role}
                className="px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70"
              >
                <div className="text-[10.5px] font-bold text-slate-700 dark:text-slate-200 truncate">{roleLabel(r.role)}</div>
                <div className="flex items-baseline justify-between mt-0.5">
                  <span className="text-xs font-extrabold font-mono text-emerald-700 dark:text-emerald-400">
                    {r.logins} {L('giriş', 'вх.')}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {r.activeUsers}/{r.totalUsers} {L('aktif', 'акт.')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-User Frequency & Engagement Table */}
      <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {L('Kullanıcı Bazlı Kullanım Sıklığı & Son Giriş Raporu', 'Частота использования и последний вход по пользователям')}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {L(
                'Bir kullanıcının satırına tıklayarak grafik ve giriş geçmişini sadece o kullanıcıya göre filtreleyebilirsiniz.',
                'Нажмите на строку пользователя, чтобы отфильтровать графики и журнал входов только по нему.'
              )}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-50/90 dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10.5px] border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-4">{L('Kullanıcı', 'Пользователь')}</th>
                <th className="py-2.5 px-3">{L('Rol & Kapsam', 'Роль и RLS')}</th>
                <th className="py-2.5 px-3">{L('Son Giriş (MSK)', 'Последний вход (MSK)')}</th>
                <th className="py-2.5 px-3 text-right">{L(`Son ${days}g Giriş`, `За ${days} дн.`)}</th>
                <th className="py-2.5 px-3 text-right">{L('Aktif Gün', 'Акт. дней')}</th>
                <th className="py-2.5 px-3 text-right">{L('Haftalık Sıklık', 'В неделю')}</th>
                <th className="py-2.5 px-3">{L('Kullanım Düzeyi', 'Активность')}</th>
                <th className="py-2.5 px-4">{L('Son Cihaz / IP', 'Устройство / IP')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {(data?.userStats || []).map((u) => {
                const tm = tierMeta(u.engagement_tier);
                const isSel = selectedUserId === u.id;
                const activeBarPct = Math.min(100, Math.round((u.active_days / days) * 100));
                return (
                  <tr
                    key={u.id}
                    onClick={() => setSelectedUserId(isSel ? 0 : u.id)}
                    className={`cursor-pointer transition-colors ${
                      isSel
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/50'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/45'
                    }`}
                  >
                    <td className="py-2.5 px-4">
                      <div className="font-bold text-slate-900 dark:text-white">{u.name}</div>
                      <div className="text-[10.5px] font-mono text-slate-500">{u.email}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-700 dark:text-slate-200">{roleLabel(u.role)}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[160px]">{u.scope_value}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      {u.last_login_at ? (
                        <div>
                          <div className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                            {u.last_login_at}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {u.days_since_last === 0
                              ? L('Bugün', 'Сегодня')
                              : u.days_since_last === 1
                              ? L('Dün', 'Вчера')
                              : L(`${u.days_since_last} gün önce`, `${u.days_since_last} дн. назад`)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="font-mono font-bold text-slate-900 dark:text-white">{u.period_logins}</div>
                      <div className="text-[10px] text-slate-500">
                        {L('Toplam', 'Всего')}: {u.total_logins_all_time}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {u.active_days} / {days}
                      </div>
                      <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden ml-auto mt-1">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${activeBarPct}%` }} />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {u.avg_per_week}x/{L('hft', 'нед')}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${tm.cls}`}>
                        {tm.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-[11px] text-slate-600 dark:text-slate-300">
                      {u.last_device ? (
                        <div className="flex items-center gap-1.5">
                          <Monitor className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <div>
                            <div className="font-medium">{u.last_device}</div>
                            {u.last_ip && <div className="text-[10px] font-mono text-slate-400">{u.last_ip}</div>}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Login Timestamp Audit Log */}
      <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {L('Detaylı Giriş Zaman Kayıtları (Son 200 Hareket)', 'Журнал входов по времени (последние 200 записей)')}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {L('Her şifre girişi ve yeni gün oturum ziyareti Moskova saatiyle (MSK) kaydedilir.', 'Каждый вход и активная сессия фиксируются по московскому времени (MSK).')}
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder={L('İsim, mail, IP veya cihaz ara...', 'Поиск по ФИО, почте, IP...')}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            {L(
              'Seçili dönemde henüz giriş kaydı bulunmuyor. Kullanıcılar giriş yaptıkça tüm hareketler otomatik olarak burada görünecektir.',
              'За выбранный период записей о входах пока нет. Новые входы будут отображаться здесь автоматически.'
            )}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50/95 dark:bg-slate-900/95 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10.5px] sticky top-0 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">{L('Tarih / Saat (MSK)', 'Дата и время (MSK)')}</th>
                  <th className="py-2.5 px-3">{L('Kullanıcı', 'Пользователь')}</th>
                  <th className="py-2.5 px-3">{L('Rol', 'Роль')}</th>
                  <th className="py-2.5 px-3">{L('Tür', 'Тип')}</th>
                  <th className="py-2.5 px-3">{L('Cihaz & Tarayıcı', 'Устройство')}</th>
                  <th className="py-2.5 px-4">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {filteredLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                      {l.login_at}
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-semibold text-slate-900 dark:text-white">{l.name}</span>
                      <span className="ml-1.5 text-[10.5px] font-mono text-slate-500">{l.email}</span>
                    </td>
                    <td className="py-2 px-3 text-[11px] text-slate-600 dark:text-slate-300">{roleLabel(l.role)}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          l.event_type === 'session_visit'
                            ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                            : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        }`}
                      >
                        {l.event_type === 'session_visit'
                          ? L('Oturum Ziyareti', 'Активная сессия')
                          : L('Şifre ile Giriş', 'Вход по паролю')}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-[11px] text-slate-600 dark:text-slate-300">{l.device_label || '-'}</td>
                    <td className="py-2 px-4 font-mono text-[11px] text-slate-500">{l.ip_address || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
