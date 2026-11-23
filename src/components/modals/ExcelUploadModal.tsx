'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, Calendar, Globe, Save, Play, Clock } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';

interface ExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export default function ExcelUploadModal({ isOpen, onClose, onUploadSuccess }: ExcelUploadModalProps) {
  const { lang } = useLanguage();
  const { getAuthHeaders } = useAuth();
  const [modalTab, setModalTab] = useState<'manual' | 'eba'>('manual');
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [customDate, setCustomDate] = useState(() => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${d}.${m}.${y}`;
  });
  const [uploading, setUploading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // eBA Auto-Sync state
  const [ebaUsername, setEbaUsername] = useState('');
  const [ebaPassword, setEbaPassword] = useState('');
  const [ebaReportBtnId, setEbaReportBtnId] = useState('fileView_ctl01_btnPersonnelReport1');
  const [ebaAutoEnabled, setEbaAutoEnabled] = useState(false);
  const [ebaAutoTime, setEbaAutoTime] = useState('08:00');
  const [ebaReportOptions, setEbaReportOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [ebaStatus, setEbaStatus] = useState<{
    isRunning: boolean;
    percent: number;
    stageMessage: string;
    lastSyncAt: string;
    lastSyncStatus: string;
    lastSyncMessage: string;
    lastSyncFile: string;
    lastSyncActiveRecords: number;
    lastSyncTotalRecords: number;
  } | null>(null);
  const [ebaSaving, setEbaSaving] = useState(false);
  const [ebaFeedback, setEbaFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const wasEbaRunningRef = useRef(false);

  const loadEbaState = async (silent = false) => {
    try {
      const res = await fetch('/api/eba-sync', { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (data?.success) {
        if (!silent && data.config) {
          setEbaUsername(data.config.username || '');
          setEbaPassword(data.config.password || '');
          setEbaReportBtnId(data.config.reportBtnId || 'fileView_ctl01_btnPersonnelReport1');
          setEbaAutoEnabled(Boolean(data.config.autoSyncEnabled));
          setEbaAutoTime(data.config.autoSyncTimeMsk || '08:00');
        }
        if (Array.isArray(data.reportOptions)) {
          setEbaReportOptions(data.reportOptions);
        }
        if (data.status) {
          const prevRunning = wasEbaRunningRef.current;
          wasEbaRunningRef.current = Boolean(data.status.isRunning);
          setEbaStatus(data.status);
          if (prevRunning && !data.status.isRunning && data.status.lastSyncStatus === 'SUCCESS') {
            setEbaFeedback({ type: 'success', text: data.status.lastSyncMessage || 'eBA senkronizasyonu tamamlandı!' });
            setTimeout(() => {
              onUploadSuccess();
              onClose();
              window.location.reload();
            }, 1800);
          } else if (prevRunning && !data.status.isRunning && data.status.lastSyncStatus === 'ERROR') {
            setEbaFeedback({ type: 'error', text: data.status.lastSyncMessage || 'eBA senkronizasyonu başarısız oldu.' });
          }
        }
      }
    } catch {}
  };

  useEffect(() => {
    if (!isOpen) return;
    loadEbaState(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !ebaStatus?.isRunning) return;
    const t = setInterval(() => {
      loadEbaState(true);
    }, 3000);
    return () => clearInterval(t);
  }, [isOpen, ebaStatus?.isRunning]);

  const handleSaveEbaConfig = async () => {
    setEbaSaving(true);
    setEbaFeedback(null);
    try {
      const res = await fetch('/api/eba-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          action: 'save_config',
          config: {
            username: ebaUsername,
            password: ebaPassword,
            reportBtnId: ebaReportBtnId,
            autoSyncEnabled: ebaAutoEnabled,
            autoSyncTimeMsk: ebaAutoTime,
          },
        }),
      });
      const data = await res.json();
      if (data?.success) {
        if (data.config?.password) setEbaPassword(data.config.password);
        setEbaFeedback({ type: 'success', text: data.message || 'eBA ayarları kaydedildi.' });
      } else {
        setEbaFeedback({ type: 'error', text: data?.message || 'Ayarlar kaydedilemedi.' });
      }
    } catch {
      setEbaFeedback({ type: 'error', text: 'Sunucu bağlantı hatası.' });
    } finally {
      setEbaSaving(false);
    }
  };

  const handleRunEbaSync = async () => {
    setEbaSaving(true);
    setEbaFeedback(null);
    try {
      const res = await fetch('/api/eba-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          action: 'run_sync',
          config: {
            username: ebaUsername,
            password: ebaPassword,
            reportBtnId: ebaReportBtnId,
            autoSyncEnabled: ebaAutoEnabled,
            autoSyncTimeMsk: ebaAutoTime,
          },
        }),
      });
      const data = await res.json();
      if (data?.success) {
        wasEbaRunningRef.current = true;
        if (data.status) setEbaStatus(data.status);
        setEbaFeedback({ type: 'info', text: data.message });
      } else {
        setEbaFeedback({ type: 'error', text: data?.message || 'eBA senkronizasyonu başlatılamadı.' });
      }
    } catch {
      setEbaFeedback({ type: 'error', text: 'Sunucu bağlantı hatası.' });
    } finally {
      setEbaSaving(false);
    }
  };

  if (!isOpen) return null;

  // Auto-detect date from file name if possible (e.g. "tum liste 09  11 2026.xlsx" -> "09.11.2026")
  const extractDateFromFileName = (name: string) => {
    const match = name.match(/(\d{1,2})[._\s-]+(\d{1,2})[._\s-]+(\d{2,4})/);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      let year = match[3];
      if (year.length === 2) year = '20' + year;
      return `${day}.${month}.${year}`;
    }
    return null;
  };

  const handleSelectedFile = (selectedFile: File) => {
    const lowerName = selectedFile.name.toLowerCase();
    const validExts = ['.xlsx', '.xls', '.csv', '.txt', '.tsv', '.zip'];
    if (validExts.some((ext) => lowerName.endsWith(ext))) {
      setFile(selectedFile);
      setIsError(false);
      setStatusMessage(null);
      const detected = extractDateFromFileName(selectedFile.name);
      if (detected) {
        setCustomDate(detected);
      }
    } else {
      setIsError(true);
      setStatusMessage(
        lang === 'ru'
          ? 'Пожалуйста, выберите файл .xlsx, .txt, .csv или .zip.'
          : 'Lütfen geçerli bir dosya (.xlsx, .txt, .csv veya .zip) seçin.'
      );
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0]);
    }
  };

  // Direct upload of original file to server - no browser truncation, no memory leak, handles 198 columns & 35.000+ rows directly via server Python
  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgressPercent(0);
    const targetDate = customDate.trim() || extractDateFromFileName(file.name) || '09.11.2026';
    setIsError(false);

    try {
      setStatusMessage(
        lang === 'ru'
          ? 'Подключение к серверу и передача оригинального файла...'
          : 'Sunucuya bağlanılıyor ve orijinal dosya aktarılıyor...'
      );

      const formData = new FormData();
      formData.append('file', file);
      formData.append('dataFreshness', targetDate);

      // Use XMLHttpRequest for reliable byte-level progress reporting (0-100%)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload', true);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            const rawPercent = Math.round((event.loaded / event.total) * 100);
            const displayPercent = Math.min(92, Math.round(rawPercent * 0.9));
            setProgressPercent(displayPercent);

            if (rawPercent >= 100) {
              setProgressPercent(95);
              setStatusMessage(
                lang === 'ru'
                  ? 'Файл передан на сервер! Полная обработка базы данных и всех 198 колонок... (пожалуйста, подождите)'
                  : 'Dosya sunucuya aktarıldı! 198 kolon ve veritabanı eksiksiz işleniyor... (lütfen bekleyin)'
              );
            } else {
              setStatusMessage(
                lang === 'ru'
                  ? `Передача исходного файла на сервер (%${rawPercent})...`
                  : `Orijinal dosya sunucuya aktarılıyor (%${rawPercent})...`
              );
            }
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const resData = JSON.parse(xhr.responseText);
              if (resData.success) {
                setProgressPercent(100);
                const activeInfo = resData.activeRecords ? `${resData.activeRecords}` : '';
                const totalInfo = resData.totalRecords ? `${resData.totalRecords}` : '';
                setStatusMessage(
                  lang === 'ru'
                    ? `База данных успешно обновлена! Активных: ${activeInfo || '5.300+'} (Всего: ${totalInfo}), Дата: ${targetDate}`
                    : `Veritabanı başarıyla güncellendi! Aktif personel: ${activeInfo || '5.300+'} (Toplam: ${totalInfo}), Tarih: ${targetDate}`
                );
                setTimeout(() => {
                  onUploadSuccess();
                  onClose();
                  window.location.reload();
                }, 1500);
                resolve();
              } else {
                reject(new Error(resData.message || (lang === 'ru' ? 'Ошибка обработки' : 'İşlem hatası')));
              }
            } catch {
              reject(new Error(lang === 'ru' ? 'Сбой обработки ответа сервера' : 'Sunucu yanıtı okunamadı'));
            }
          } else {
            let errorMsg = `Sunucu hatası (HTTP ${xhr.status})`;
            try {
              const errJson = JSON.parse(xhr.responseText);
              if (errJson.message) errorMsg = errJson.message;
            } catch {}
            reject(new Error(errorMsg));
          }
        };

        xhr.onerror = () => {
          reject(new Error(lang === 'ru' ? 'Ошибка сети при передаче файла' : 'Dosya aktarımı sırasında ağ hatası oluştu'));
        };

        xhr.ontimeout = () => {
          reject(new Error(lang === 'ru' ? 'Тайм-аут запроса к серверу' : 'Sunucu yanıt zaman aşımına uğradı'));
        };

        xhr.timeout = 360000; // 6 minutes timeout for huge files
        xhr.send(formData);
      });
    } catch (err: any) {
      setIsError(true);
      setStatusMessage(
        err?.message ||
          (lang === 'ru'
            ? 'Сбой при загрузке данных.'
            : 'Yükleme sırasında hata oluştu.')
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#131C31] rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {lang === 'ru' ? 'Загрузка данных (Excel / TXT / CSV)' : 'Veri Yükleme (Excel / TXT / CSV)'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'ru'
                  ? 'Поддерживаются файлы Excel, Текст из eBA (.txt), CSV и ZIP'
                  : 'Excel, eBA Metin dökümü (.txt), CSV ve ZIP dosyaları desteklenir'}
              </p>
            </div>
          </div>

          {!uploading && (
            <button
              onClick={onClose}
              aria-label={lang === 'ru' ? 'Закрыть' : 'Kapat'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Mode Tabs: Manual Upload vs Automated eBA Sync */}
        <div className="px-6 pt-4 flex gap-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30">
          <button
            type="button"
            onClick={() => setModalTab('manual')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-xl border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              modalTab === 'manual'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-[#131C31]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>{lang === 'ru' ? 'Ручная загрузка' : 'Manuel Dosya Yükle'}</span>
          </button>
          <button
            type="button"
            onClick={() => setModalTab('eba')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-xl border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              modalTab === 'eba'
                ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-white dark:bg-[#131C31]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'ru' ? 'Авто-загрузка из eBA' : "eBA'dan Otomatik Çek"}</span>
            {ebaStatus?.isRunning && <RefreshCw className="w-3 h-3 animate-spin text-indigo-500" />}
          </button>
        </div>

        {/* Body */}
        {modalTab === 'eba' ? (
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/70 text-[11px] text-indigo-900 dark:text-indigo-200">
              <strong>pearl.pondera.network (eBA)</strong> üzerinden seçilen raporu (varsayılan: <strong>Personel Rapor 1 (TR) — 198 Kolon</strong>) sunucuda otomatik indirir, yedek alır ve veritabanını günceller.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  eBA Kullanıcı Adı (Login)
                </label>
                <input
                  type="text"
                  value={ebaUsername}
                  onChange={(e) => setEbaUsername(e.target.value)}
                  placeholder="zrakhimov"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  eBA Şifre (Parol)
                </label>
                <input
                  type="password"
                  value={ebaPassword}
                  onChange={(e) => setEbaPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                İndirilecek eBA Raporu (Pondera Personel → Excel Raporları)
              </label>
              <select
                value={ebaReportBtnId}
                onChange={(e) => setEbaReportBtnId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                {(ebaReportOptions.length > 0
                  ? ebaReportOptions
                  : [{ id: 'fileView_ctl01_btnPersonnelReport1', label: 'Personel Rapor 1 (TR) — 198 Kolon (Ana Liste)' }]
                ).map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ebaAutoEnabled}
                  onChange={(e) => setEbaAutoEnabled(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Her gün otomatik çek &amp; güncelle</span>
              </label>
              <div className="flex items-center gap-1.5 text-xs">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-slate-500 dark:text-slate-400">Saat (MSK):</span>
                <input
                  type="time"
                  value={ebaAutoTime}
                  onChange={(e) => setEbaAutoTime(e.target.value)}
                  className="px-2 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            {ebaStatus?.lastSyncAt && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-1 px-1">
                <span>Son başarılı eBA çekimi: <strong className="text-slate-800 dark:text-slate-200">{ebaStatus.lastSyncAt}</strong></span>
                {ebaStatus.lastSyncActiveRecords > 0 && (
                  <span>Aktif: <strong>{ebaStatus.lastSyncActiveRecords}</strong> / Toplam: <strong>{ebaStatus.lastSyncTotalRecords}</strong></span>
                )}
              </div>
            )}

            {ebaStatus?.isRunning && (
              <div className="space-y-2">
                <div className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/60 text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-indigo-600 dark:text-indigo-400" />
                  <span className="flex-1">{ebaStatus.stageMessage || 'eBA senkronizasyonu çalışıyor...'}</span>
                  <span className="font-mono font-bold">%{ebaStatus.percent || 5}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-500"
                    style={{ width: `${Math.max(5, ebaStatus.percent || 5)}%` }}
                  />
                </div>
              </div>
            )}

            {ebaFeedback && !ebaStatus?.isRunning && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  ebaFeedback.type === 'error'
                    ? 'bg-rose-50 dark:bg-rose-950/70 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    : ebaFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : 'bg-sky-50 dark:bg-sky-950/70 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200'
                }`}
              >
                {ebaFeedback.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                )}
                <span>{ebaFeedback.text}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleSaveEbaConfig}
                disabled={ebaSaving || ebaStatus?.isRunning}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Ayarları Kaydet</span>
              </button>
              <button
                type="button"
                onClick={handleRunEbaSync}
                disabled={ebaSaving || ebaStatus?.isRunning || !ebaUsername}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer disabled:opacity-50"
              >
                {ebaStatus?.isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>{ebaStatus?.isRunning ? 'eBA Çekiliyor...' : "Şimdi eBA'dan Çek & Güncelle"}</span>
              </button>
            </div>
          </div>
        ) : (
        <>
        {/* Body */}
        <div className="p-6 space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx, .xls, .csv, .txt, .tsv, .zip"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Dropzone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !uploading && inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
                : file
                ? 'border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            {file ? (
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-xs mx-auto">{file.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB • {lang === 'ru' ? 'Файл выбран' : 'Dosya Seçildi'}
                  </p>
                </div>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                  {lang === 'ru' ? 'Нажмите для выбора другого файла' : 'Farklı dosya seçmek için tıklayın'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900 dark:text-white">
                    {lang === 'ru' ? 'Перетащите файл Excel, TXT или CSV сюда' : 'Excel, TXT veya CSV Dosyasını Sürükleyip Bırakın'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {lang === 'ru' ? 'или нажмите для выбора с компьютера' : 'veya bilgisayarınızdan seçmek için tıklayın'}
                  </p>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {lang === 'ru' ? 'Поддерживается: .xlsx, .txt (eBA), .csv, .zip' : 'Desteklenen: .xlsx, .txt (eBA dökümü), .csv, .zip'}
                </p>
              </div>
            )}
          </div>

          {/* Date Picker Input for Data Freshness */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                {lang === 'ru' ? 'Дата актуальности данных (в системе)' : 'Veri Tazeliği Tarihi (Uygulamada Görünecek Tarih)'}
              </label>
              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 rounded-md">
                {lang === 'ru' ? 'Данные: ' : 'Veri: '}
                {customDate || (lang === 'ru' ? 'ДД.ММ.ГГГГ' : 'GG.AA.YYYY')}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                placeholder={lang === 'ru' ? 'ДД.ММ.ГГГГ (напр. 03.10.2026)' : 'GG.AA.YYYY (ör. 03.10.2026)'}
                className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const d = String(now.getDate()).padStart(2, '0');
                  const m = String(now.getMonth() + 1).padStart(2, '0');
                  const y = now.getFullYear();
                  setCustomDate(`${d}.${m}.${y}`);
                }}
                className="px-2.5 py-2 text-[11px] font-semibold bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors"
              >
                {lang === 'ru' ? 'Сегодня' : 'Bugün'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
              {lang === 'ru'
                ? 'Вне зависимости от имени файла, в верхней панели и отчетах будет отображаться выбранная дата.'
                : 'Dosya adı ne olursa olsun, üst barda ve tüm raporlarda bu seçtiğiniz tarih gösterilecektir.'}
            </p>
          </div>

          {/* Informational tip for eBA TXT / CSV recommendations */}
          <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-[11px] text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              {lang === 'ru'
                ? '⚡ Рекомендация для eBA: При ежедневной выгрузке из eBA выбирайте формат "Текст (.txt / Tab-delimited)" или CSV (или архивируйте в ZIP). Файл весит ~12 МБ вместо 32 МБ и загружается мгновенно!'
                : '⚡ eBA Rapor İpucu: Günlük raporları eBA üzerinden alırken "Metin Belgesi (.txt / Sekme ile ayrılmış)" veya "CSV" olarak indirmeniz (veya ZIP ile sıkıştırmanız) önerilir. Dosya 32 MB yerine ~12 MB olur ve saniyeler içinde yüklenir!'}
            </span>
          </div>

          {/* Informational tip if a small single-project file is selected */}
          {file && (file.size < 2 * 1024 * 1024 || !file.name.toLowerCase().includes('tum')) && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                {lang === 'ru'
                  ? '💡 Примечание: Выбранный файл является выгрузкой одного участка (например, Polisterol). База обновится только по этому файлу. Для загрузки полного штата всей компании (5.313 сотрудников) выберите файл "tum liste...".'
                  : '💡 Bilgi: Seçilen dosya tek bir şantiyeye (örn. Polisterol) ait görünüyor. Sistemde sadece o projenin personeli görünecektir. Tüm şirketin ana listesi (5.313 aktif personel) için "tum liste..." genel dosyasını seçmelisiniz.'}
              </span>
            </div>
          )}

          {/* Informational tip if master full list file (> 25MB) is selected: highlights direct full-file processing */}
          {file && file.size > 25 * 1024 * 1024 && (
            <div className="p-3 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 rounded-xl text-[11px] text-sky-900 dark:text-sky-200 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              <span>
                {lang === 'ru'
                  ? `⚡ Прямая загрузка оригинального Excel: Файл ${(file.size / (1024 * 1024)).toFixed(1)} МБ и 198 колонок передается напрямую на сервер без разбиения и потери строк.`
                  : `⚡ Doğrudan Orijinal Excel Yükleme: ${(file.size / (1024 * 1024)).toFixed(1)} MB boyutundaki dosyanız ve 198 kolon parçalanmadan, hiçbir veri veya satır kaybı olmadan doğrudan sunucuda eksiksiz işlenecektir.`}
              </span>
            </div>
          )}

          {/* Status Alert and Progress Bar */}
          {statusMessage && (
            <div className="space-y-2">
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                  isError
                    ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                    : uploading
                    ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                }`}
              >
                {uploading ? (
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : isError ? (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                )}
                <span className="font-medium flex-1">{statusMessage}</span>
                {uploading && (
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    %{progressPercent}
                  </span>
                )}
              </div>

              {uploading && (
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 dark:bg-emerald-400 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={uploading}
              className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-50"
            >
              {lang === 'ru' ? 'Отмена' : 'İptal'}
            </button>

            <button
              type="button"
              onClick={async () => {
                if (
                  !confirm(
                    lang === 'ru'
                      ? 'Восстановить последнюю защитную копию базы данных перед операцией (Pre-Action)?'
                      : 'Son işlem öncesi otomatik koruma yedeğine (Pre-Action) geri dönülsün mü?'
                  )
                )
                  return;
                setUploading(true);
                setStatusMessage(
                  lang === 'ru'
                    ? 'Восстановление защитной копии перед операцией...'
                    : 'İşlem öncesi otomatik koruma yedeği geri yükleniyor...'
                );
                setIsError(false);
                try {
                  const res = await fetch('/api/upload/restore', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'restore' }),
                  });
                  const resData = await res.json();
                  if (resData.success) {
                    setStatusMessage(
                      resData.message ||
                        (lang === 'ru'
                          ? 'Защитная копия успешно восстановлена!'
                          : 'İşlem öncesi koruma yedeği başarıyla geri yüklendi!')
                    );
                    setTimeout(() => {
                      onUploadSuccess();
                      onClose();
                      window.location.reload();
                    }, 1200);
                  } else {
                    setIsError(true);
                    setStatusMessage(resData.message || 'Geri yükleme başarısız oldu.');
                  }
                } catch {
                  setIsError(true);
                  setStatusMessage('Geri yükleme işlemi sırasında bir hata oluştu.');
                } finally {
                  setUploading(false);
                }
              }}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 rounded-xl border border-teal-200 dark:border-teal-800 transition-colors cursor-pointer"
              title={
                lang === 'ru'
                  ? 'Восстановить последнюю защитную копию БД перед операцией'
                  : 'Son İşlem Öncesi Otomatik Koruma Yedeğine Geri Dön'
              }
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>
                {lang === 'ru' ? 'Откатить к копии (Pre-Action)' : 'Son İşlem Öncesi Yedeğe Dön'}
              </span>
            </button>
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold border border-emerald-300 dark:border-emerald-500/40 bg-emerald-100/85 hover:bg-emerald-200/80 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-950 dark:text-emerald-100 rounded-xl shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {uploading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700 dark:text-emerald-300" />
                <span>{lang === 'ru' ? 'Обработка...' : 'İşleniyor...'}</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
                <span>{lang === 'ru' ? 'Импортировать в базу данных' : 'Veritabanına Aktar & Güncelle'}</span>
              </>
            )}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
