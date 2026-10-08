'use client';

import React, { useState, useRef } from 'react';
import { X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface ExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export default function ExcelUploadModal({ isOpen, onClose, onUploadSuccess }: ExcelUploadModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

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
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls')) {
        setFile(droppedFile);
        setIsError(false);
        setStatusMessage(null);
      } else {
        setIsError(true);
        setStatusMessage('Lütfen geçerli bir Excel (.xlsx veya .xls) dosyası seçin.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.name.endsWith('.xlsx') || selected.name.endsWith('.xls')) {
        setFile(selected);
        setIsError(false);
        setStatusMessage(null);
      } else {
        setIsError(true);
        setStatusMessage('Lütfen geçerli bir Excel (.xlsx veya .xls) dosyası seçin.');
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setStatusMessage('Excel dosyası sunucuya aktarılıyor ve yerel SQLite veritabanı güncelleniyor (32.000+ kayıt)...');
    setIsError(false);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const resData = await res.json();

      if (resData.success) {
        setStatusMessage('Veritabanı başarıyla güncellendi! Veriler yenileniyor...');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Excel Yükle & Güncelle</h2>
              <p className="text-xs text-slate-600">Yerel 198 kolonluk SQLite veritabanını güncelleyin</p>
            </div>
          </div>

          {!uploading && (
            <button
              onClick={onClose}
              aria-label="Kapat"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
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
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-indigo-600 bg-indigo-50/50'
                : file
                ? 'border-emerald-300 bg-emerald-50/30'
                : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'
            }`}
          >
            {file ? (
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900 truncate max-w-xs mx-auto">{file.name}</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB • Hazır
                  </p>
                </div>
                <p className="text-[11px] text-indigo-600 font-semibold pt-1">Farklı dosya seçmek için tıklayın</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900">Excel Dosyasını Sürükleyip Bırakın</p>
                  <p className="text-xs text-slate-600 mt-0.5">veya bilgisayarınızdan seçmek için tıklayın</p>
                </div>
                <p className="text-[11px] text-slate-600">Desteklenen: .xlsx (turn_liste_02_10_26 vb., ~31 MB)</p>
              </div>
            )}
          </div>

          {/* Status Alert */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                isError
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : uploading
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              {uploading ? (
                <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-indigo-600" />
              ) : isError ? (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              )}
              <span className="font-medium">{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50"
          >
            İptal
          </button>

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {uploading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>İşleniyor...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Veritabanına Aktar & Güncelle</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
