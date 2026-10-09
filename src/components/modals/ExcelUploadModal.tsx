'use client';

import React, { useState, useRef } from 'react';
import { X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, Calendar } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface ExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export default function ExcelUploadModal({ isOpen, onClose, onUploadSuccess }: ExcelUploadModalProps) {
  const { lang } = useLanguage();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [customDate, setCustomDate] = useState('03.10.2026');
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Auto-detect date from file name if possible (e.g. "tum liste 03 10 26.xlsx" -> "03.10.2026")
  const extractDateFromFileName = (name: string) => {
    const match = name.match(/(\d{1,2})[._\s-](\d{1,2})[._\s-](\d{2,4})/);
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
    if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
      setFile(selectedFile);
      setIsError(false);
      setStatusMessage(null);
      const detected = extractDateFromFileName(selectedFile.name);
      if (detected) {
        setCustomDate(detected);
      }
    } else {
      setIsError(true);
      setStatusMessage('Lütfen geçerli bir Excel (.xlsx veya .xls) dosyası seçin.');
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

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    const targetDate = customDate.trim() || '03.10.2026';
    setStatusMessage(`Excel dosyası sunucuya aktarılıyor ve veritabanı "${targetDate}" tarihiyle güncelleniyor...`);
    setIsError(false);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('dataFreshness', targetDate);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const resData = await res.json();

      if (resData.success) {
        setStatusMessage(`Veritabanı başarıyla güncellendi! Veri tarihi: ${targetDate}`);
        setTimeout(() => {
          onUploadSuccess();
          onClose();
        }, 1500);
      } else {
        setIsError(true);
        setStatusMessage(resData.message || 'Yükleme sırasında hata oluştu.');
      }
    } catch {
      setIsError(true);
      setStatusMessage('Dosya işlenirken sunucu hatası oluştu.');
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
                {lang === 'ru' ? 'Загрузка и обновление Excel' : 'Excel Yükle & Güncelle'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'ru'
                  ? 'Обновите локальную 198-колоночную базу данных SQLite'
                  : 'Yerel 198 kolonluk SQLite veritabanını güncelleyin'}
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

        {/* Body */}
        <div className="p-6 space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx, .xls"
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
                    {lang === 'ru' ? 'Перетащите файл Excel сюда' : 'Excel Dosyasını Sürükleyip Bırakın'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {lang === 'ru' ? 'или нажмите для выбора с компьютера' : 'veya bilgisayarınızdan seçmek için tıklayın'}
                  </p>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {lang === 'ru' ? 'Поддерживается: .xlsx или .xls (~31 МБ)' : 'Desteklenen: .xlsx veya .xls (~31 MB)'}
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

          {/* Status Alert */}
          {statusMessage && (
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
              <span className="font-medium">{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-50"
          >
            {lang === 'ru' ? 'Отмена' : 'İptal'}
          </button>

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {uploading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{lang === 'ru' ? 'Обработка...' : 'İşleniyor...'}</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Импортировать в базу данных' : 'Veritabanına Aktar & Güncelle'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
