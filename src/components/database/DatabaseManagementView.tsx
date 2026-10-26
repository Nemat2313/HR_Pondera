'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  HardDrive,
  RefreshCw,
  FileSpreadsheet,
  UploadCloud,
  Search,
  Table2,
  Terminal,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Eye,
  Save,
  Trash2,
  X,
  Server,
  Play,
  CheckCircle2,
  AlertCircle,
  Layers,
} from 'lucide-react';
import { StatsData } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';

interface DatabaseManagementViewProps {
  stats: StatsData | null;
  onOpenUpload: () => void;
  onRefreshData: () => void;
}

interface TableColumnMeta {
  name: string;
  type: string;
  pk: boolean;
  notnull?: boolean;
}

interface TableSummary {
  name: string;
  rowCount: number;
  columnCount: number;
  columns: TableColumnMeta[];
}

interface ServerInfo {
  hostname: string;
  platform: string;
  nodeVersion: string;
  sqliteVersion: string;
  dbPath: string;
  dbFileSizeMB: string;
  dbModifiedAt: string;
  totalTables: number;
  totalIndexes: number;
}

const TABLE_DESCRIPTIONS: Record<string, { tr: string; ru: string; badge: string }> = {
  gosuslugi_submissions: {
    tr: 'Gosuslugi VKS & Bildirim Başvuruları (Aktif Zayavka ve Statüler)',
    ru: 'Заявления Госуслуг ВКС (Активные номера и статусы МВД)',
    badge: 'Gosuslugi',
  },
  gosuslugi_submission_history: {
    tr: 'Zayavka & Statü Değişim Tarihçesi (Tüm Geçmiş Loglar)',
    ru: 'История изменений статусов и заявлений Госуслуг',
    badge: 'Tarihçe',
  },
  gosuslugi_refused_archive: {
    tr: 'Red Alan (Услуга отказана) & Arşivlenen Eski Başvurular',
    ru: 'Архив отклонённых заявлений (Услуга отказана)',
    badge: 'Arşiv',
  },
  gosuslugi_vks_master_list: {
    tr: '3.088 Kişilik VKS Maaş Bildirimi Ana Listesi',
    ru: 'Мастер-список уведомлений ВКС (3 088 сотрудников)',
    badge: 'VKS Master',
  },
  gosuslugi_vks_master: {
    tr: '3.088 Kişilik VKS Maaş Bildirimi Ana Listesi',
    ru: 'Мастер-список уведомлений ВКС (3 088 сотрудников)',
    badge: 'VKS Master',
  },
  personnel: {
    tr: 'Personel Ana Tablosu (Tüm Şantiyeler, Evraklar ve 198 Kolon JSON)',
    ru: 'Основная таблица персонала (Все объекты и документы)',
    badge: 'Personel',
  },
  users: {
    tr: 'Sistem Kullanıcıları ve Şantiye/Bölge Yetkileri (RLS)',
    ru: 'Пользователи системы и права доступа по объектам',
    badge: 'Yetki',
  },
  gosuslugi_mail_events: {
    tr: 'Mail.ru IMAP Üzerinden Gelen Gosuslugi E-Posta Bildirimleri',
    ru: 'События и уведомления Госуслуг из почты Mail.ru (IMAP)',
    badge: 'E-Posta',
  },
  gosuslugi_mail_config: {
    tr: 'Mail.ru IMAP Bağlantı ve Otomatik Senkronizasyon Ayarları',
    ru: 'Настройки подключения IMAP Mail.ru',
    badge: 'Ayarlar',
  },
  system_info: {
    tr: 'Sistem Durum Bilgileri, Telegram Rapor Zamanlayıcısı ve Kaynak Dosya',
    ru: 'Системные параметры и планировщик отчётов Telegram',
    badge: 'Sistem',
  },
  system_meta: {
    tr: 'Sistem Veri Tazeliği, Kaynak Excel ve Yükleme Bilgileri',
    ru: 'Системные метаданные и информация об исходном Excel',
    badge: 'Sistem',
  },
  columns_meta: {
    tr: 'Excel 198 Kolon Şeması ve Kategori Eşleştirmeleri',
    ru: 'Схема 198 колонок Excel и категории',
    badge: 'Şema',
  },
  telegram_outbox: {
    tr: 'Telegram Bildirim Kuyruğu (Outbox)',
    ru: 'Очередь отправки уведомлений Telegram',
    badge: 'Telegram',
  },
};

const PRESET_QUERIES = [
  {
    labelTr: 'Gosuslugi Statü Dağılımı (Özet)',
    labelRu: 'Распределение статусов Госуслуг',
    sql: `SELECT gosuslugi_status AS Statu, COUNT(*) AS Adet\nFROM gosuslugi_submissions\nGROUP BY gosuslugi_status\nORDER BY Adet DESC;`,
  },
  {
    labelTr: 'Bekleyen Başvurular (Отправлено / Зарегистрировано)',
    labelRu: 'Ожидающие заявления (Отправлено / Зарегистрировано)',
    sql: `SELECT sicil_no, worker_name, application_no, gosuslugi_status, pdf_filename, submitted_at, checked_at\nFROM gosuslugi_submissions\nWHERE gosuslugi_status IN ('Отправлено', 'Отправлено (PDF не скачан)', 'Заявление зарегистрировано', 'Отправлено в ведомство')\nORDER BY submitted_at DESC\nLIMIT 250;`,
  },
  {
    labelTr: 'Son Güncellenen 100 Zayavka',
    labelRu: 'Последние 100 обновлённых заявлений',
    sql: `SELECT sicil_no, worker_name, application_no, gosuslugi_status, pdf_filename, submitted_at, checked_at\nFROM gosuslugi_submissions\nORDER BY checked_at DESC, submitted_at DESC\nLIMIT 100;`,
  },
  {
    labelTr: 'Red Arşivi (gosuslugi_refused_archive)',
    labelRu: 'Архив отказов (gosuslugi_refused_archive)',
    sql: `SELECT sicil_no, worker_name, application_no, gosuslugi_status, submitted_at, archived_at\nFROM gosuslugi_refused_archive\nORDER BY archived_at DESC\nLIMIT 200;`,
  },
  {
    labelTr: 'Şantiye Bazlı Aktif Personel Sayıları',
    labelRu: 'Активный персонал по проектам',
    sql: `SELECT region AS Bolge, proje_adi AS Santiye, COUNT(*) AS Aktif_Personel\nFROM personnel\nWHERE genel_durum = 'Mevcut'\nGROUP BY region, proje_adi\nORDER BY Aktif_Personel DESC;`,
  },
];

export default function DatabaseManagementView({
  stats,
  onOpenUpload,
  onRefreshData,
}: DatabaseManagementViewProps) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const sys = stats?.systemInfo || {};

  const [mode, setMode] = useState<'explorer' | 'sql'>('explorer');
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('gosuslugi_submissions');
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);

  // Table Rows state
  const [columns, setColumns] = useState<TableColumnMeta[]>([]);
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [searchInput, setSearchInput] = useState<string>('');
  const [appliedSearch, setAppliedSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [loadingRows, setLoadingRows] = useState<boolean>(false);

  // Row Inspector / Edit Modal state
  const [inspectedRow, setInspectedRow] = useState<Record<string, any> | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = useState<boolean>(false);
  const [rowFeedback, setRowFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // SQL Console state
  const [sqlText, setSqlText] = useState<string>(PRESET_QUERIES[0].sql);
  const [sqlResultCols, setSqlResultCols] = useState<string[]>([]);
  const [sqlResultRows, setSqlResultRows] = useState<Array<Record<string, any>>>([]);
  const [sqlElapsedMs, setSqlElapsedMs] = useState<string>('');
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [runningSql, setRunningSql] = useState<boolean>(false);

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await fetch('/api/admin/db?action=overview');
      const data = await res.json();
      if (data.success) {
        setServerInfo(data.serverInfo || null);
        setTables(data.tables || []);
        if (data.tables?.length > 0 && !data.tables.some((t: TableSummary) => t.name === selectedTable)) {
          setSelectedTable(data.tables[0].name);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingOverview(false);
    }
  }, [selectedTable]);

  const fetchTableRows = useCallback(async () => {
    if (!selectedTable) return;
    setLoadingRows(true);
    try {
      const params = new URLSearchParams({
        action: 'rows',
        table: selectedTable,
        page: String(page),
        pageSize: String(pageSize),
        sortOrder,
      });
      if (appliedSearch) params.set('search', appliedSearch);
      if (sortBy) params.set('sortBy', sortBy);

      const res = await fetch(`/api/admin/db?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setColumns(data.columns || []);
        setRows(data.rows || []);
        setTotalRows(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch {
      // ignore
    } finally {
      setLoadingRows(false);
    }
  }, [selectedTable, page, pageSize, appliedSearch, sortBy, sortOrder]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    fetchTableRows();
  }, [fetchTableRows]);

  const handleSelectTable = (tbl: string) => {
    setSelectedTable(tbl);
    setPage(1);
    setSortBy('');
    setSortOrder('DESC');
    setSearchInput('');
    setAppliedSearch('');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(searchInput.trim());
  };

  const handleToggleSort = (colName: string) => {
    if (sortBy === colName) {
      setSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(colName);
      setSortOrder('DESC');
    }
    setPage(1);
  };

  const openRowInspector = async (row: Record<string, any>) => {
    setInspectedRow(row);
    const initial: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k !== '_rowid_') {
        initial[k] = v === null || v === undefined ? '' : String(v);
      }
    }
    setEditedFields(initial);
    setRowFeedback(null);

    if (row._rowid_) {
      try {
        const res = await fetch(
          `/api/admin/db?action=row_detail&table=${encodeURIComponent(selectedTable)}&rowid=${row._rowid_}`
        );
        const data = await res.json();
        if (data.success && data.row) {
          setInspectedRow(data.row);
          const fullFields: Record<string, string> = {};
          for (const [k, v] of Object.entries(data.row)) {
            if (k !== '_rowid_') {
              fullFields[k] = v === null || v === undefined ? '' : String(v);
            }
          }
          setEditedFields(fullFields);
        }
      } catch {}
    }
  };

  const handleSaveRow = async () => {
    if (!inspectedRow || !isAdmin) return;
    setSavingRow(true);
    setRowFeedback(null);
    try {
      const res = await fetch('/api/admin/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_row',
          table: selectedTable,
          rowid: inspectedRow._rowid_,
          updates: editedFields,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRowFeedback({
          type: 'ok',
          text: lang === 'ru' ? 'Запись успешно сохранена в базе данных.' : 'Kayıt veritabanında güncellendi.',
        });
        fetchTableRows();
        fetchOverview();
      } else {
        setRowFeedback({ type: 'err', text: data.message || 'Hata oluştu.' });
      }
    } catch {
      setRowFeedback({ type: 'err', text: 'Bağlantı hatası.' });
    } finally {
      setSavingRow(false);
    }
  };

  const handleDeleteRow = async () => {
    if (!inspectedRow || !isAdmin) return;
    const confirmMsg =
      lang === 'ru'
        ? `Удалить эту запись (rowid=${inspectedRow._rowid_}) из таблицы ${selectedTable}?`
        : `${selectedTable} tablosundan bu kaydı (rowid=${inspectedRow._rowid_}) silmek istediğinize emin misiniz?`;
    if (!window.confirm(confirmMsg)) return;

    setSavingRow(true);
    try {
      const res = await fetch('/api/admin/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_row',
          table: selectedTable,
          rowid: inspectedRow._rowid_,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setInspectedRow(null);
        fetchTableRows();
        fetchOverview();
      } else {
        setRowFeedback({ type: 'err', text: data.message || 'Silinemedi.' });
      }
    } catch {
      setRowFeedback({ type: 'err', text: 'Bağlantı hatası.' });
    } finally {
      setSavingRow(false);
    }
  };

  const handleRunSql = async (customSql?: string) => {
    const queryToRun = customSql ?? sqlText;
    if (!queryToRun.trim()) return;
    setRunningSql(true);
    setSqlError(null);
    try {
      const res = await fetch('/api/admin/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'query', sql: queryToRun }),
      });
      const data = await res.json();
      if (data.success) {
        setSqlResultCols(data.columns || []);
        setSqlResultRows(data.rows || []);
        setSqlElapsedMs(data.elapsedMs || '0');
      } else {
        setSqlError(data.message || 'SQL hatası');
      }
    } catch {
      setSqlError('Sunucu bağlantı hatası.');
    } finally {
      setRunningSql(false);
    }
  };

  const exportToCsv = (filenamePrefix: string, colNames: string[], dataRows: Array<Record<string, any>>) => {
    if (!colNames.length || !dataRows.length) return;
    const escapeCell = (val: any) => {
      const str = val === null || val === undefined ? '' : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };
    const headerLine = colNames.map(escapeCell).join(';');
    const lines = dataRows.map((r) => colNames.map((c) => escapeCell(r[c])).join(';'));
    const csvContent = '\uFEFF' + [headerLine, ...lines].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const visibleColumns = columns.filter((c) => c.name !== 'extra_json');

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header & Top Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {lang === 'ru' ? 'Управление БД SQLite и Таблицами (Online)' : 'Canlı Backend Veritabanı (SQLite) & Tablo Gezgini'}
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-800">
              {lang === 'ru' ? 'Прямой доступ к серверу' : 'Canlı Sunucu Bağlantısı'}
            </span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {lang === 'ru'
              ? 'Просмотр всех таблиц базы данных pondera_hr.db на сервере 89.111.152.49 в реальном времени, поиск, редактирование и SQL-консоль.'
              : 'Sunucudaki (89.111.152.49) pondera_hr.db SQLite veritabanı tablolarını canlı olarak inceleyin, arayın, düzenleyin veya SQL sorgusu çalıştırın.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              fetchOverview();
              fetchTableRows();
              onRefreshData();
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{lang === 'ru' ? 'Обновить БД' : 'Tabloları Yenile'}</span>
          </button>

          <button
            onClick={onOpenUpload}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{lang === 'ru' ? 'Загрузить новый Excel' : 'Yeni Excel Yükle'}</span>
          </button>
        </div>
      </div>

      {/* Server & Database Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Server className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {lang === 'ru' ? 'Сервер VPS (Reg.ru)' : 'VPS Sunucu (Reg.ru Cloud)'}
            </span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 truncate">
              89.111.152.49 ({serverInfo?.hostname || 'Linux VPS'})
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate">
              {serverInfo ? `${serverInfo.platform} • Node ${serverInfo.nodeVersion}` : 'Ubuntu Linux • PM2 + Nginx'}
            </p>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {lang === 'ru' ? 'Файл базы данных' : 'Veritabanı Dosyası'}
            </span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
              pondera_hr.db ({serverInfo?.dbFileSizeMB || '—'} MB)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              SQLite v{serverInfo?.sqliteVersion || '3.x'} • {serverInfo?.totalTables || tables.length}{' '}
              {lang === 'ru' ? 'таблиц' : 'Tablo'} • {serverInfo?.totalIndexes || 12}{' '}
              {lang === 'ru' ? 'индексов' : 'İndeks'}
            </p>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {lang === 'ru' ? 'Актуальность Excel' : 'Son Excel Senkronizasyonu'}
            </span>
            <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
              {sys.data_freshness || 'Güncel'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate">
              {sys.source_file || 'tum liste.xlsx'}
            </p>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {lang === 'ru' ? 'Записи в таблицах' : 'Toplam Tablo Kayıtları'}
            </span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
              {tables.reduce((acc, t) => acc + t.rowCount, 0).toLocaleString('tr-TR')}{' '}
              {lang === 'ru' ? 'строк' : 'Satır'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {lang === 'ru' ? 'Режим WAL (высокая скорость)' : 'WAL Modu (Eşzamanlı Okuma/Yazma)'}
            </p>
          </div>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setMode('explorer')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            mode === 'explorer'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
          }`}
        >
          <Table2 className="w-4 h-4" />
          <span>{lang === 'ru' ? 'Таблицы базы данных (Обзор и поиск)' : 'Veritabanı Tabloları (Canlı Tablo Gezgini)'}</span>
        </button>

        <button
          onClick={() => {
            setMode('sql');
            if (sqlResultRows.length === 0) {
              handleRunSql(sqlText);
            }
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            mode === 'sql'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>{lang === 'ru' ? 'SQL-Консоль (Запросы SELECT)' : 'Canlı SQL Sorgu Konsolu'}</span>
        </button>
      </div>

      {mode === 'explorer' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT SIDEBAR: Table List */}
          <div className="lg:col-span-3 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  {lang === 'ru' ? 'Таблицы SQLite' : 'SQLite Tabloları'} ({tables.length})
                </span>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[680px] overflow-y-auto">
              {loadingOverview && tables.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">Yükleniyor...</div>
              ) : (
                tables.map((t) => {
                  const active = t.name === selectedTable;
                  const desc = TABLE_DESCRIPTIONS[t.name];
                  return (
                    <button
                      key={t.name}
                      onClick={() => handleSelectTable(t.name)}
                      className={`w-full text-left p-3.5 transition-all cursor-pointer flex flex-col gap-1 ${
                        active
                          ? 'bg-emerald-50/90 dark:bg-emerald-950/50 border-l-4 border-emerald-600'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-mono text-xs font-bold truncate ${
                            active ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {t.name}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[11px] font-bold rounded-full shrink-0 ${
                            active
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {t.rowCount.toLocaleString('tr-TR')}
                        </span>
                      </div>
                      {desc && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-snug">
                          {lang === 'ru' ? desc.ru : desc.tr}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                        <span>{t.columnCount} kolon</span>
                        {desc?.badge && (
                          <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {desc.badge}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT MAIN AREA: Selected Table Rows & Search */}
          <div className="lg:col-span-9 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            {/* Table Toolbar */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">{selectedTable}</span>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    {totalRows.toLocaleString('tr-TR')} {lang === 'ru' ? 'записей' : 'kayıt'}
                  </span>
                </div>
                {TABLE_DESCRIPTIONS[selectedTable] && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {lang === 'ru' ? TABLE_DESCRIPTIONS[selectedTable].ru : TABLE_DESCRIPTIONS[selectedTable].tr}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <form onSubmit={handleSearchSubmit} className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={
                      lang === 'ru'
                        ? 'Поиск по всем колонкам...'
                        : 'Sicil, Zayavka No, İsim, Statü ara...'
                    }
                    className="pl-8 pr-16 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 w-56 sm:w-64"
                  />
                  {appliedSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput('');
                        setAppliedSearch('');
                        setPage(1);
                      }}
                      className="absolute right-12 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="submit"
                    className="absolute right-1.5 px-2 py-0.5 text-[11px] font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer"
                  >
                    {lang === 'ru' ? 'Найти' : 'Ara'}
                  </button>
                </form>

                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200"
                >
                  <option value={25}>25 / sayfa</option>
                  <option value={50}>50 / sayfa</option>
                  <option value={100}>100 / sayfa</option>
                  <option value={250}>250 / sayfa</option>
                </select>

                <button
                  onClick={() =>
                    exportToCsv(
                      selectedTable,
                      visibleColumns.map((c) => c.name),
                      rows
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>CSV</span>
                </button>
              </div>
            </div>

            {/* Data Table */}
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold w-20 text-center">
                      {lang === 'ru' ? 'Действие' : 'Detay'}
                    </th>
                    {visibleColumns.map((col) => (
                      <th
                        key={col.name}
                        onClick={() => handleToggleSort(col.name)}
                        className="py-2.5 px-3 font-semibold whitespace-nowrap cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 select-none transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono">{col.name}</span>
                          {col.pk && (
                            <span className="px-1 py-0.2 text-[9px] bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded">
                              PK
                            </span>
                          )}
                          <ArrowUpDown
                            className={`w-3 h-3 ${
                              sortBy === col.name ? 'text-emerald-600 opacity-100' : 'opacity-35'
                            }`}
                          />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-200">
                  {loadingRows ? (
                    <tr>
                      <td colSpan={visibleColumns.length + 1} className="p-8 text-center text-slate-500">
                        {lang === 'ru' ? 'Загрузка данных таблицы...' : 'Tablo verileri yükleniyor...'}
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length + 1} className="p-8 text-center text-slate-500">
                        {lang === 'ru' ? 'Записи не найдены.' : 'Kayıt bulunamadı.'}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => (
                      <tr
                        key={row._rowid_ ?? idx}
                        onClick={() => openRowInspector(row)}
                        className="hover:bg-emerald-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                      >
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRowInspector(row);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-100 dark:bg-slate-800 dark:hover:bg-emerald-950 text-slate-700 dark:text-slate-200 text-[11px] font-medium cursor-pointer"
                          >
                            <Eye className="w-3 h-3 text-emerald-600" />
                            <span>{lang === 'ru' ? 'Открыть' : 'İncele'}</span>
                          </button>
                        </td>
                        {visibleColumns.map((col) => {
                          const rawVal = row[col.name];
                          const strVal = rawVal === null || rawVal === undefined ? '' : String(rawVal);

                          // Status badge styling for gosuslugi_status
                          if (col.name === 'gosuslugi_status' && strVal) {
                            const isOk = strVal.includes('Услуга оказана');
                            const isRefused = strVal.includes('отказан') || strVal.startsWith('Ошибка');
                            const isReg = strVal.includes('зарегистрировано') || strVal.includes('ведомство');
                            return (
                              <td key={col.name} className="py-2 px-3 whitespace-nowrap">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                    isOk
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300'
                                      : isRefused
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/80 dark:text-rose-300'
                                      : isReg
                                      ? 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/80 dark:text-sky-300'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/80 dark:text-amber-300'
                                  }`}
                                >
                                  {strVal}
                                </span>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={col.name}
                              className="py-2 px-3 max-w-[260px] truncate whitespace-nowrap"
                              title={strVal}
                            >
                              {strVal || <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 bg-slate-50/40 dark:bg-slate-800/20">
              <div>
                {lang === 'ru'
                  ? `Страница ${page} из ${totalPages} (Всего: ${totalRows.toLocaleString('tr-TR')})`
                  : `Sayfa ${page} / ${totalPages} (Toplam ${totalRows.toLocaleString('tr-TR')} kayıt)`}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-semibold text-slate-800 dark:text-slate-200">{page}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* SQL QUERY CONSOLE MODE */
        <div className="bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {lang === 'ru' ? 'Выполнение SQL-запросов (SELECT)' : 'Canlı SQL Sorgu Konsolu (SELECT)'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'ru'
                  ? 'Выберите готовый шаблон или напишите свой SQL-запрос к базе pondera_hr.db'
                  : 'Hazır sorgu şablonlarından birine tıklayın veya kendi SELECT sorgunuzu çalıştırın.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {PRESET_QUERIES.map((pq, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSqlText(pq.sql);
                    handleRunSql(pq.sql);
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                >
                  {lang === 'ru' ? pq.labelRu : pq.labelTr}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <textarea
              rows={4}
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
              className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              placeholder="SELECT * FROM gosuslugi_submissions LIMIT 50;"
            />
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500">
                {sqlElapsedMs && (
                  <span>
                    {sqlResultRows.length} {lang === 'ru' ? 'строк за' : 'satır döndü'} ({sqlElapsedMs} ms)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {sqlResultRows.length > 0 && (
                  <button
                    onClick={() => exportToCsv('sql_query_result', sqlResultCols, sqlResultRows)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>CSV İndir</span>
                  </button>
                )}
                <button
                  onClick={() => handleRunSql()}
                  disabled={runningSql}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{runningSql ? 'Çalıştırılıyor...' : lang === 'ru' ? 'Выполнить SQL' : 'Sorguyu Çalıştır'}</span>
                </button>
              </div>
            </div>
          </div>

          {sqlError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{sqlError}</span>
            </div>
          )}

          {sqlResultCols.length > 0 && (
            <div className="overflow-x-auto max-h-[520px] rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 sticky top-0 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    {sqlResultCols.map((c) => (
                      <th key={c} className="py-2.5 px-3 font-mono font-semibold whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                  {sqlResultRows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      {sqlResultCols.map((c) => (
                        <td key={c} className="py-2 px-3 whitespace-nowrap max-w-[300px] truncate">
                          {r[c] === null || r[c] === undefined ? '—' : String(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ROW INSPECTOR & EDITOR MODAL */}
      {inspectedRow && (
        <div
          onClick={() => setInspectedRow(null)}
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">{selectedTable}</span>
                  <span className="text-xs text-slate-500">rowid #{inspectedRow._rowid_}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  {isAdmin
                    ? lang === 'ru'
                      ? 'Вы можете изменить значения полей и сохранить их напрямую в SQLite.'
                      : 'Alan değerlerini düzenleyip doğrudan SQLite veritabanına kaydedebilirsiniz.'
                    : 'Kayıt Detay Görünümü'}
                </p>
              </div>
              <button
                onClick={() => setInspectedRow(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {Object.entries(editedFields).map(([colName, val]) => {
                if (colName === 'extra_json') {
                  let parsedExtra: Record<string, any> | null = null;
                  try {
                    parsedExtra = JSON.parse(val);
                  } catch {}
                  return (
                    <div key={colName} className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <label className="block font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                        extra_json (Excel 198 Kolon Verisi)
                      </label>
                      {parsedExtra && typeof parsedExtra === 'object' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                          {Object.entries(parsedExtra).map(([ek, ev]) => (
                            <div key={ek} className="truncate">
                              <span className="font-semibold text-slate-500">{ek}: </span>
                              <span className="text-slate-800 dark:text-slate-200">{String(ev ?? '—')}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          rows={3}
                          value={val}
                          readOnly={!isAdmin}
                          onChange={(e) => setEditedFields((prev) => ({ ...prev, [colName]: e.target.value }))}
                          className="w-full p-2 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      )}
                    </div>
                  );
                }

                const isReadOnlyCol = !isAdmin || colName === 'id' || colName === 'password';
                return (
                  <div key={colName} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                    <label className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {colName}
                    </label>
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        value={val}
                        readOnly={isReadOnlyCol}
                        onChange={(e) => setEditedFields((prev) => ({ ...prev, [colName]: e.target.value }))}
                        className={`w-full px-3 py-1.5 text-xs rounded-lg border ${
                          isReadOnlyCol
                            ? 'bg-slate-100 dark:bg-slate-800/60 text-slate-500 border-slate-200 dark:border-slate-700'
                            : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700 focus:border-emerald-500 focus:outline-none'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}

              {rowFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    rowFeedback.type === 'ok'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {rowFeedback.type === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{rowFeedback.text}</span>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={handleDeleteRow}
                  disabled={savingRow}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{lang === 'ru' ? 'Удалить запись' : 'Satırı Sil'}</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInspectedRow(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  {lang === 'ru' ? 'Закрыть' : 'Kapat'}
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleSaveRow}
                    disabled={savingRow}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingRow ? 'Kaydediliyor...' : lang === 'ru' ? 'Сохранить в БД' : 'Değişiklikleri Kaydet'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
