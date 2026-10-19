'use client';

import React, { useEffect, useState } from 'react';
import { X, Download, ArrowRight, UserCheck, Building2, MapPin, Briefcase, FileSpreadsheet } from 'lucide-react';
import { exportToExcel } from '@/lib/exportExcel';
import { useLanguage } from '@/context/LanguageContext';

interface DrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  filterType: 'region' | 'project' | 'department' | 'category' | 'nationality' | 'collar' | 'permit';
  filterValue: string;
  onNavigateToPersonnel: (filterType: string, filterValue: string) => void;
}

export default function DrillDownModal({
  isOpen,
  onClose,
  title,
  filterType,
  filterValue,
  onNavigateToPersonnel,
}: DrillDownModalProps) {
  const { lang, translateCol, translateVal } = useLanguage();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalRows, setTotalRows] = useState(0);

  useEffect(() => {
    if (!isOpen || !filterValue) return;

    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', '50'); // Preview 50 rows in drilldown
    params.set('status', 'Mevcut');

    if (filterType === 'region') params.set('region', filterValue);
    else if (filterType === 'project') params.set('project', filterValue);
    else if (filterType === 'department') params.set('department', filterValue);
    else if (filterType === 'category') params.set('category', filterValue);
    else if (filterType === 'nationality') params.set('nationality', filterValue);
    else if (filterType === 'permit') params.set('permit', filterValue);
    else if (filterType === 'collar') {
      const collarVal = filterValue.includes('Endirekt') ? 'Endirekt' : filterValue.includes('Direkt') ? 'Direkt' : '';
      if (collarVal) params.set('collar', collarVal);
    }

    fetch(`/api/personnel?${params.toString()}`)
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success) {
          setData(resData.data || []);
          setTotalRows(resData.pagination?.totalRows || 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, filterType, filterValue]);

  if (!isOpen) return null;

  const formatModalDate = (val: any) => {
    if (!val) return '-';
    const num = Number(val);
    if (!isNaN(num) && num > 30000 && num < 60000) {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      const day = String(date.getUTCDate()).padStart(2, '0');
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const year = date.getUTCFullYear();
      return `${day}.${month}.${year}`;
    }
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const parts = str.slice(0, 10).split('-');
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return str;
  };

  const handleExport = () => {
    try {
      const params = new URLSearchParams();
      params.set('status', 'Mevcut');
      if (filterType === 'region') params.set('region', filterValue);
      else if (filterType === 'project') params.set('project', filterValue);
      else if (filterType === 'department') params.set('department', filterValue);
      else if (filterType === 'category') params.set('category', filterValue);
      else if (filterType === 'nationality') params.set('nationality', filterValue);
      else if (filterType === 'collar') {
        const collarVal = filterValue.includes('Endirekt') ? 'Endirekt' : filterValue.includes('Direkt') ? 'Direkt' : '';
        if (collarVal) params.set('collar', collarVal);
      }

      const safeVal = (filterValue || 'Tum').replace(/[\/\\?%*:|"<>]/g, '_');
      const fileName = `DrillDown_${filterType}_${safeVal}.xlsx`;

      const anchor = document.createElement('a');
      anchor.href = `/api/export?${params.toString()}`;
      anchor.setAttribute('download', fileName);
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        if (document.body.contains(anchor)) document.body.removeChild(anchor);
      }, 1000);
    } catch {
      const exportData = data.map((item) => ({
        'Sıra No': item.sira_no,
        'Sicil No': item.sicil_no,
        'Ad Soyad': item.ad_soyad,
        'Görevi': item.gorevi,
        'Bölge': item.region,
        'Proje': item.proje_adi,
        'Departman': item.departman,
        'Kategori': item.kategori,
        'Uyruk': item.uyruk,
        'İşe Giriş Tarihi': formatModalDate(item.ise_giris_tarihi),
        'Genel Durum': item.genel_durum,
      }));
      exportToExcel(exportData, `DrillDown_${filterType}_${filterValue}.xlsx`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-900 dark:text-white">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                {lang === 'ru' ? 'Анализ детализации' : 'Drill-Down Analizi'}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                • {lang === 'ru' ? `Найдено сотрудников: ${totalRows}` : `${totalRows} Personel Bulundu`}
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1 flex items-center gap-2">
              {title}: <span className="text-emerald-600 dark:text-teal-400">{translateVal(filterValue)}</span>
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-700/60 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors shadow-2xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Скачать Excel (.xlsx)' : 'Excel İndir (.xlsx)'}</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onNavigateToPersonnel(filterType, filterValue);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-2xs cursor-pointer"
            >
              <span>{lang === 'ru' ? 'Открыть подробный список' : 'Detaylı Listede Aç'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              aria-label={lang === 'ru' ? 'Закрыть' : 'Kapat'}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="py-20 text-center">
              <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {lang === 'ru' ? 'Загрузка данных персонала...' : 'Personel verileri yükleniyor...'}
              </p>
            </div>
          ) : data.length === 0 ? (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500">
              <UserCheck className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">
                {lang === 'ru' ? 'По данному фильтру активный персонал не найден.' : 'Bu filtreye ait aktif personel bulunamadı.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-3">{translateCol('Sicil No')}</th>
                    <th className="py-3 px-3">{translateCol('Ad Soyad')}</th>
                    <th className="py-3 px-3">{translateCol('Görevi')}</th>
                    <th className="py-3 px-3">{lang === 'ru' ? 'Регион и проект' : 'Bölge & Proje'}</th>
                    <th className="py-3 px-3">{translateCol('Departman')}</th>
                    <th className="py-3 px-3">{translateCol('Uyruk')}</th>
                    <th className="py-3 px-3">{lang === 'ru' ? 'Дата приема' : 'İşe Giriş'}</th>
                    <th className="py-3 px-3">{lang === 'ru' ? 'Статус' : 'Durum'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-900 dark:text-slate-100">{item.sicil_no || '-'}</span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">{item.ad_soyad}</td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{item.gorevi || '-'}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{item.region}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{item.proje_adi}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 max-w-[150px] truncate">{item.departman}</td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 font-medium">{translateVal(item.uyruk)}</td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-mono">{formatModalDate(item.ise_giris_tarihi)}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            item.genel_durum === 'Mevcut'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800'
                              : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800'
                          }`}
                        >
                          {translateVal(item.genel_durum)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            {lang === 'ru'
              ? 'Предпросмотр первых 50 сотрудников. Для просмотра всех 198 колонок и фильтрации используйте кнопку "Открыть подробный список".'
              : 'İlk 50 personel önizleniyor. Tam 198 kolon ve filtreleme için "Detaylı Listede Aç" butonunu kullanın.'}
          </span>
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer">
            {lang === 'ru' ? 'Закрыть' : 'Kapat'}
          </button>
        </div>
      </div>
    </div>
  );
}
