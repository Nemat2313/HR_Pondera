'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Plus, X, CheckCircle2, RefreshCw, AlertTriangle } from 'lucide-react';

export interface VksQuarterModalItem {
  quarter_code: string;
  short_label_tr?: string;
  short_label_ru?: string;
  status?: 'active' | 'archived' | 'planned';
}

interface VksAddQuarterModalProps {
  open: boolean;
  onClose: () => void;
  suggestedNextQuarterCode?: string;
  activeQuarterLabel?: string;
  existingQuarters?: VksQuarterModalItem[];
  canMakeActive?: boolean;
  lang?: string;
  onSuccess: (result: {
    quarterCode: string;
    makeActive: boolean;
    overview: any;
    message: string;
  }) => void;
}

function getQuarterDefaultDates(year: number, quarter: number): { start: string; end: string } {
  switch (quarter) {
    case 1:
      return { start: `01.01.${year}`, end: `31.03.${year}` };
    case 2:
      return { start: `01.04.${year}`, end: `30.06.${year}` };
    case 3:
      return { start: `01.07.${year}`, end: `30.09.${year}` };
    case 4:
    default:
      return { start: `01.10.${year}`, end: `31.12.${year}` };
  }
}

function parseCode(code?: string): { year: number; quarter: number } {
  const m = /^(\d{4})[-_Q]+([1-4])$/i.exec(String(code || '2027-1').trim());
  if (m) {
    return { year: Number(m[1]), quarter: Number(m[2]) };
  }
  return { year: 2027, quarter: 1 };
}

export default function VksAddQuarterModal({
  open,
  onClose,
  suggestedNextQuarterCode = '2027-1',
  activeQuarterLabel,
  existingQuarters = [],
  canMakeActive = true,
  lang = 'tr',
  onSuccess,
}: VksAddQuarterModalProps) {
  const isRu = lang === 'ru';
  const [year, setYear] = useState<number>(2027);
  const [quarter, setQuarter] = useState<number>(1);
  const [periodStart, setPeriodStart] = useState<string>('01.01.2027');
  const [periodEnd, setPeriodEnd] = useState<string>('31.03.2027');
  const [makeActive, setMakeActive] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const parsed = parseCode(suggestedNextQuarterCode);
    const dates = getQuarterDefaultDates(parsed.year, parsed.quarter);
    setYear(parsed.year);
    setQuarter(parsed.quarter);
    setPeriodStart(dates.start);
    setPeriodEnd(dates.end);
    setMakeActive(false);
    setErrorText(null);
  }, [open, suggestedNextQuarterCode]);

  if (!open) return null;

  const existingSet = new Set(existingQuarters.map((q) => q.quarter_code));
  const selectedCode = `${year}-${quarter}`;
  const alreadyExists = existingSet.has(selectedCode);

  const handleSelectYearQuarter = (nextYear: number, nextQuarter: number) => {
    const dates = getQuarterDefaultDates(nextYear, nextQuarter);
    setYear(nextYear);
    setQuarter(nextQuarter);
    setPeriodStart(dates.start);
    setPeriodEnd(dates.end);
    setErrorText(null);
  };

  const quickPresets = [
    { year: 2027, quarter: 1 },
    { year: 2027, quarter: 2 },
    { year: 2027, quarter: 3 },
    { year: 2027, quarter: 4 },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorText(null);
    try {
      const res = await fetch('/api/gosuslugi/quarters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_quarter',
          year,
          quarter,
          periodStart: periodStart.trim(),
          periodEnd: periodEnd.trim(),
          makeActive: canMakeActive ? makeActive : false,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setErrorText(json?.message || (isRu ? 'Не удалось добавить квартал.' : 'Çeyrek eklenemedi.'));
        return;
      }
      onSuccess({
        quarterCode: json.quarterCode || selectedCode,
        makeActive: canMakeActive ? makeActive : false,
        overview: json.overview,
        message:
          json.message ||
          (isRu
            ? `Квартал ${selectedCode} успешно добавлен.`
            : `${year} ${quarter}. Çeyrek başarıyla eklendi.`),
      });
      onClose();
    } catch {
      setErrorText(
        isRu ? 'Ошибка соединения с сервером.' : 'Sunucu bağlantı hatası oluştu.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isRu ? 'Добавить новый квартал ВКС' : 'Yeni VKS Çeyrek Dönemi Ekle'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isRu
                  ? 'Добавьте 1 Квартал 2027 или будущие периоды уведомлений МВД'
                  : '2027 1. Çeyrek veya gelecek VKS maaş bildirim dönemlerini tanımlayın'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorText && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorText}</span>
            </div>
          )}

          {/* Quick 2027 Quarter Presets */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              {isRu ? 'Быстрый выбор (2027 год):' : 'Hızlı Seçim (2027 Çeyrekleri):'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {quickPresets.map((p) => {
                const code = `${p.year}-${p.quarter}`;
                const isSelected = year === p.year && quarter === p.quarter;
                const exists = existingSet.has(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => handleSelectYearQuarter(p.year, p.quarter)}
                    className={`px-2.5 py-2 rounded-xl border text-left transition cursor-pointer ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-950 dark:text-indigo-100 font-bold'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>{isRu ? `${p.quarter} Кв. ${p.year}` : `${p.year} ${p.quarter}. Çeyrek`}</span>
                      {exists && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                      {exists ? (isRu ? 'Добавлен' : 'Mevcut') : isRu ? 'Новый' : 'Eklenecek'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                {isRu ? 'Год' : 'Yıl'}
              </label>
              <select
                value={year}
                onChange={(e) => handleSelectYearQuarter(Number(e.target.value), quarter)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold"
              >
                {[2026, 2027, 2028, 2029, 2030].map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                {isRu ? 'Квартал' : 'Çeyrek Dönem'}
              </label>
              <select
                value={quarter}
                onChange={(e) => handleSelectYearQuarter(year, Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold"
              >
                <option value={1}>{isRu ? '1 Квартал (Янв–Мар)' : '1. Çeyrek (Oca – Mar)'}</option>
                <option value={2}>{isRu ? '2 Квартал (Апр–Июн)' : '2. Çeyrek (Nis – Haz)'}</option>
                <option value={3}>{isRu ? '3 Квартал (Июл–Сен)' : '3. Çeyrek (Tem – Eyl)'}</option>
                <option value={4}>{isRu ? '4 Квартал (Окт–Дек)' : '4. Çeyrek (Eki – Ara)'}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                {isRu ? 'Начало периода (ДД.ММ.ГГГГ)' : 'Dönem Başlangıcı (GG.AA.YYYY)'}
              </label>
              <input
                type="text"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                placeholder="01.01.2027"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                {isRu ? 'Конец периода (ДД.ММ.ГГГГ)' : 'Dönem Son Günü (GG.AA.YYYY)'}
              </label>
              <input
                type="text"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                placeholder="31.03.2027"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2">
            {canMakeActive && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={makeActive}
                  onChange={(e) => setMakeActive(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600"
                />
                <span className="text-slate-800 dark:text-slate-200 leading-snug">
                  <strong>
                    {isRu
                      ? 'Сделать этот квартал текущим рабочим периодом'
                      : 'Bu çeyreği hemen aktif çalışma dönemi yap'}
                  </strong>
                  {activeQuarterLabel && (
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {isRu
                        ? `Текущий рабочий период: ${activeQuarterLabel}`
                        : `Mevcut aktif çalışma dönemi: ${activeQuarterLabel}`}
                    </span>
                  )}
                </span>
              </label>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {isRu
                ? `По умолчанию до окончания квартала (${periodEnd}) руководителям автоматически отображается предыдущий завершенный квартал; после ${periodEnd} этот квартал выбирается автоматически.`
                : `Çeyrek son günü (${periodEnd}) geçene kadar yöneticilere tamamlanan bir önceki çeyrek varsayılan olarak gösterilir; ${periodEnd} tarihinden sonra bu çeyrek otomatik varsayılan olur.`}
            </p>
          </div>

          <div className="pt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
            >
              {isRu ? 'Отмена' : 'İptal'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {submitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>
                {alreadyExists
                  ? isRu
                    ? `Обновить ${selectedCode}`
                    : `${year} ${quarter}. Çeyreği Güncelle`
                  : isRu
                  ? `Добавить ${selectedCode}`
                  : `${year} ${quarter}. Çeyreği Ekle`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

