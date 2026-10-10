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

      if (!res.ok) {
        setIsError(true);
        if (res.status === 413) {
          setStatusMessage(
            lang === 'ru'
              ? 'Файл слишком большой (>30 МБ). Облачный сервер (Cloud Run) отклонил запрос по лимиту 32 МБ. Используйте кнопку "Восстановить мастер-базу" внизу.'
              : 'Dosya boyutu çok büyük (>30 MB). Bulut sunucusu (Cloud Run) 32 MB sınırını aştığı için yüklemeyi reddetti. Lütfen alttaki "Ana Listeyi Geri Yükle" butonunu kullanın.'
          );
        } else if (res.status === 504 || res.status === 502) {
          setStatusMessage(
            lang === 'ru'
              ? 'Превышено время ожидания сервера (таймаут). Файл содержит более 28.000 строк. Рекомендуется использовать встроенную мастер-базу.'
              : 'Sunucu zaman aşımına uğradı (dosya 28.000 satırdan fazla veri içeriyor). Dahili ana listeyi kullanmanız önerilir.'
          );
        } else {
          try {
            const errData = await res.json();
            setStatusMessage(errData.message || (lang === 'ru' ? 'Ошибка сервера при обработке файла.' : 'Dosya işlenirken sunucu hatası oluştu.'));
          } catch {
            setStatusMessage(lang === 'ru' ? 'Ошибка сервера при обработке файла.' : 'Dosya işlenirken sunucu hatası oluştu.');
          }
        }
        return;
      }

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
      setStatusMessage(
        lang === 'ru'
          ? 'Сбой сетевого подключения или размер файла превышает лимит сервера (32 МБ).'
          : 'Bağlantı hatası veya dosya boyutu bulut sunucu limitini (32 MB) aşıyor.'
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
                  ? '💡 Примечание: Выбранный файл является выгрузкой одного участка (например, Polisterol). База обновится только по этому файлу. Для загрузки полного штата всей компании (3.616 сотрудников) выберите файл "tum liste...".'
                  : '💡 Bilgi: Seçilen dosya tek bir şantiyeye (örn. Polisterol) ait görünüyor. Sistemde sadece o projenin personeli görünecektir. Tüm şirketin ana listesi (3.616 aktif personel) için "tum liste..." genel dosyasını seçmelisiniz.'}
              </span>
            </div>
          )}

          {/* Informational tip if master full list file (> 25MB) is selected */}
          {file && file.size > 25 * 1024 * 1024 && (
            <div className="p-3 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 rounded-xl text-[11px] text-sky-900 dark:text-sky-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              <span>
                {lang === 'ru'
                  ? '💡 Эта полная мастер-база (30+ МБ, 3.616 сотрудников) уже встроена в систему! Из-за лимита Cloud Run (32 МБ) загрузка через браузер может превысить лимит. Вы можете нажать "Восстановить мастер-базу (3.616)" внизу для мгновенного сброса.'
                  : '💡 Bu ana liste (30+ MB, 3.616 personel) zaten sisteme tam olarak entegre edilmiştir! Bulut sunucusu (Cloud Run) 32 MB sınırına sahip olduğu için tarayıcıdan yükleme limit aşımına uğrayabilir. Aşağıdaki "Ana Listeyi Geri Yükle (3.616)" butonunu kullanarak anında geri yükleyebilirsiniz.'}
              </span>
            </div>
          )}

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
                if (!confirm(lang === 'ru' ? 'Восстановить полную базу данных компании (3.616 активных сотрудников)?' : '3.616 aktif personellik ana şirket veritabanı geri yüklensin mi?')) return;
                setUploading(true);
                setStatusMessage(lang === 'ru' ? 'Восстановление полной базы...' : 'Ana şirket listesi geri yükleniyor...');
                setIsError(false);
                try {
                  const res = await fetch('/api/upload/restore', { method: 'POST' });
                  const resData = await res.json();
                  if (resData.success) {
                    setStatusMessage(lang === 'ru' ? 'Мастер-база (3.616 чел.) успешно восстановлена!' : '3.616 personellik ana şirket listesi başarıyla geri yüklendi!');
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
              title={lang === 'ru' ? 'Восстановить мастер-базу компании (3.616 чел.)' : 'Ana Şirket Listesini Geri Yükle (3.616 Kişi)'}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Восстановить мастер-базу (3.616)' : 'Ana Listeyi Geri Yükle (3.616)'}</span>
            </button>
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
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
