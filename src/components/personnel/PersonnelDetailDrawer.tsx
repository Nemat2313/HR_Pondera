'use client';

import React, { useState } from 'react';
import {
  X,
  User,
  MapPin,
  Briefcase,
  FileText,
  Shield,
  Activity,
  Search,
  Calendar,
  Phone,
  Mail,
  Home,
  CreditCard,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import { PersonnelRecord } from '@/types';

interface PersonnelDetailDrawerProps {
  personnel: PersonnelRecord | null;
  onClose: () => void;
}

export default function PersonnelDetailDrawer({ personnel, onClose }: PersonnelDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'core' | 'location' | 'identity' | 'contract' | 'visa' | 'hse' | 'all'>('core');
  const [searchField, setSearchField] = useState('');

  if (!personnel) return null;

  const raw = personnel.raw || {};

  const tabs = [
    { id: 'core', label: 'Temel & Görev', icon: User },
    { id: 'location', label: 'Lokasyon & Kamp', icon: MapPin },
    { id: 'identity', label: 'Özlük & Pasaport', icon: CreditCard },
    { id: 'contract', label: 'Sözleşme & Maaş', icon: FileText },
    { id: 'visa', label: 'Vize & İkamet', icon: Shield },
    { id: 'hse', label: 'İSG & Sağlık', icon: Activity },
    { id: 'all', label: 'Tüm 198 Kolon', icon: Layers },
  ];

  // Helper to format date and values
  const formatDrawerValue = (label: string, value: any) => {
    if (value === undefined || value === null || String(value).trim() === '') return '-';
    const num = Number(value);
    if (!isNaN(num) && num > 30000 && num < 60000) {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      const day = String(date.getUTCDate()).padStart(2, '0');
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const year = date.getUTCFullYear();
      return `${day}.${month}.${year}`;
    }
    const str = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const parts = str.slice(0, 10).split('-');
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return str;
  };

  // Helper to render field value
  const renderField = (label: string, value: any, highlight: boolean = false) => {
    const displayVal = formatDrawerValue(label, value);
    return (
      <div className={`p-3 rounded-xl border transition-colors ${highlight ? 'bg-emerald-50/50 dark:bg-emerald-950/50 border-emerald-100 dark:border-emerald-800' : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/60'}`}>
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">{label}</span>
        <span className={`text-sm font-bold mt-0.5 block truncate ${highlight ? 'text-emerald-900 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-200'}`}>
          {displayVal}
        </span>
      </div>
    );
  };

  // Filter raw 198 columns for "all" tab
  const rawEntries = Object.entries(raw).filter(([k, v]) => {
    if (!searchField) return true;
    return k.toLowerCase().includes(searchField.toLowerCase()) || String(v).toLowerCase().includes(searchField.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white dark:bg-[#0F172A] border-l border-slate-200/80 dark:border-slate-800 h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold text-lg flex items-center justify-center shadow-md shadow-emerald-500/20">
              {personnel.ad_soyad
                ? personnel.ad_soyad
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                : 'P'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">{personnel.ad_soyad}</h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    personnel.genel_durum === 'Mevcut'
                      ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}
                >
                  {personnel.genel_durum}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                Sicil: <span className="font-bold text-slate-800 dark:text-slate-200">{personnel.sicil_no || '-'}</span>
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                {personnel.gorevi || 'Görevi Belirtilmemiş'} • {personnel.region} / {personnel.proje_adi}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Kapat"
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-[#0F172A] flex items-center gap-2 overflow-x-auto py-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: Core */}
          {activeTab === 'core' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Temel Bilgiler & Görev</h3>
              <div className="grid grid-cols-2 gap-3">
                {renderField('Sıra No', personnel.sira_no)}
                {renderField('Sicil No', personnel.sicil_no, true)}
                {renderField('Şirket ID', personnel.rhi_id)}
                {renderField('Saren No', personnel.saren_no)}
                {renderField('Adı', personnel.adi)}
                {renderField('Soyadı', personnel.soyadi)}
                {renderField('Baba Adı', personnel.baba_adi)}
                {renderField('Tam Adı (Kiril)', personnel.tam_adi_kiril)}
                {renderField('Görevi', personnel.gorevi, true)}
                {renderField('Ek Görev', personnel.rhi_gorevi)}
                {renderField('Sorumlu Kişi', personnel.sorumlu_kisi)}
                {renderField('Grup Şefi', personnel.grup_sefi)}
                {renderField('Yaka Türü', personnel.endirekt_direkt, true)}
                {renderField('Kategori', personnel.kategori)}
                {renderField('Genel Durumu', personnel.genel_durum)}
                {renderField('Güncel Durumu', personnel.guncel_durum)}
              </div>
            </div>
          )}

          {/* TAB 2: Location & Camp */}
          {activeTab === 'location' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Lokasyon, Şantiye & Barınma</h3>
              <div className="grid grid-cols-2 gap-3">
                {renderField('Region / Bölge', personnel.region, true)}
                {renderField('Proje Adı', personnel.proje_adi, true)}
                {renderField('Çalışma Lokasyon Durumu', personnel.calisma_lokasyon)}
                {renderField('Firma', personnel.firma)}
                {renderField('Kamp No', personnel.kamp_no || raw['Kamp No'])}
                {renderField('Oda No', personnel.oda_no || raw['Oda No'])}
                {renderField('Mevcut Bulunduğu Yer', raw['Mevcut Bulunduğu Yer'])}
                {renderField('Resmi Şubesi', raw['Resmi Şubesi'])}
                {renderField('Resmi Firma', raw['Resmi Firma'])}
                {renderField('Gündüz / Gece Durumu', personnel.gunduz_gece)}
              </div>
            </div>
          )}

          {/* TAB 3: Identity & Passport */}
          {activeTab === 'identity' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Özlük, Kimlik & Pasaport</h3>
              <div className="grid grid-cols-2 gap-3">
                {renderField('Uyruk', personnel.uyruk, true)}
                {renderField('Cinsiyet', personnel.cinsiyet)}
                {renderField('Doğum Tarihi', personnel.dogum_tarihi)}
                {renderField('Doğum Yeri', personnel.dogum_yeri)}
                {renderField('Pasaport No', personnel.pasaport_no, true)}
                {renderField('Pasaport Geçerlilik Tarihi', personnel.pasaport_gecerlilik, true)}
                {renderField('TC Kimlik No', personnel.tc_kimlik_no)}
                {renderField('Telefon No', personnel.telefon_no || raw['Telefon No'])}
                {renderField('e-Mail', personnel.email || raw['e-Mail'])}
                {renderField('Memleket Adresi', raw['Memleket Adresi'])}
                {renderField('Pasaport Düzenleme Tarihi', raw['Pasaport Düzenleme Tarihi'])}
                {renderField('Pasaportu Veren Makam (Kiril)', raw['Pasaportu Veren Makam (Kiril)'])}
              </div>
            </div>
          )}

          {/* TAB 4: Contract */}
          {activeTab === 'contract' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Sözleşme, İşe Giriş/Çıkış & Maaş</h3>
              <div className="grid grid-cols-2 gap-3">
                {renderField('İşe Giriş Tarihi', personnel.ise_giris_tarihi, true)}
                {renderField('Şantiye Giriş Tarihi', personnel.santiye_giris_tarihi)}
                {renderField('Çıkış Tarihi', personnel.cikis_tarihi)}
                {renderField('Çıkış Sebebi', personnel.cikis_sebebi)}
                {renderField('İş Sözleşmesi Numarası', raw['İş Sözleşmesi Numarası'])}
                {renderField('İş Sözleşmesi İmza Tarihi', raw['İş Sözleşmesi İmza Tarihi'])}
                {renderField('Resmi Maaş', raw['Resmi Maaş'])}
                {renderField('Resmi Maaş Yazılı', raw['Resmi Maaş Yazılı'])}
                {renderField('Resmi Çıkış Tarihi', raw['Resmi Çıkış Tarihi'])}
                {renderField('Resmi Çıkış Sebebi', raw['Resmi Çıkış Sebebi'])}
                {renderField('İzine Gidiş Tarihi', raw['İzine Gidiş Tarihi'])}
                {renderField('İzin Dönüş Tarihi', raw['İzin Dönüş Tarihi'])}
              </div>
            </div>
          )}

          {/* TAB 5: Visa & Permits */}
          {activeTab === 'visa' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Vize, İkamet & Yasal Belgeler</h3>
              <div className="grid grid-cols-2 gap-3">
                {renderField('Propusk No', personnel.propusk_no, true)}
                {renderField('Propusk Bitiş Tarihi', personnel.propusk_bitis_tarihi, true)}
                {renderField('Vize No', personnel.vize_no, true)}
                {renderField('Vize Bitiş Tarihi', personnel.vize_bitis_tarihi, true)}
                {renderField('Migrasyon No', personnel.migrasyon_no)}
                {renderField('Migrasyon Giriş Tarihi', raw['Migrasyon Giriş Tarihi'])}
                {renderField('INN No', personnel.inn_no)}
                {renderField('CNILS No', raw['CNILS No'])}
                {renderField('Patent Alış Tarihi', personnel.patent_alis_tarihi)}
                {renderField('Patent Bitiş Tarihi', personnel.patent_bitis_tarihi)}
                {renderField('Registrasyon Alış Tarihi', raw['Registrasyon Alış Tarihi'])}
                {renderField('Registrasyon Bitiş Tarihi', raw['Registrasyon Bitiş Tarihi'])}
                {renderField('Daktiloskopiya Alış', raw['Daktiloskopiya Alış Tarihi'])}
                {renderField('Daktiloskopiya Bitiş', raw['Daktiloskopiya Bitis Tarihi'])}
                {renderField('Gosusluga Başvuru Tarihi', raw['Gosusluga Başvuru Tarihi'])}
                {renderField('Biometri Başvuru Tarihi', raw['Biometri Başvuru Tarihi'])}
              </div>
            </div>
          )}

          {/* TAB 6: HSE & Health */}
          {activeTab === 'hse' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">İSG, Sağlık & Eğitim</h3>
              <div className="grid grid-cols-2 gap-3">
                {renderField('HSE Eğitim Tarihi', raw['HSE Eğitim Tarihi'], true)}
                {renderField('HSE Notu', raw['HSE Notu'])}
                {renderField('Sağlık Rapor Sonucu', raw['Sağlık Rapor Sonucu'], true)}
                {renderField('Sağlık Rapor Tarihi', raw['Sağlık Rapor Tarihi'])}
                {renderField('Sağlık 29n Sonucu', raw['Sağlık 29n Sonucu'])}
                {renderField('Psikoloji Testi Alındığı Tarih', raw['Psikoloji Testi Alındığı Tarih'])}
                {renderField('Narkoloji', raw['Narkoloji'])}
                {renderField('Dil Sınavı Geçtiği Tarih', raw['Dil Sınavı Geçtiği Tarih'])}
                {renderField('Dil Sertifikası Referans No', raw['Dil Sertifikası Referans No'])}
                {renderField('DMS Kart No', raw['DMS Kart  No'])}
                {renderField('DMS Bitiş Tarihi', raw['DMS Bitiş Tarihi'])}
                {renderField('Aşıdan Geçtiği Tarih', raw['Aşıdan Geçtiği Tarih'])}
              </div>
            </div>
          )}

          {/* TAB 7: All 198 Columns with Search */}
          {activeTab === 'all' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchField}
                  onChange={(e) => setSearchField(e.target.value)}
                  placeholder="198 kolon içinde alan ara... (örn: Propusk, Vize, Tarih, Not)"
                  className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {rawEntries.length} alan listeleniyor:
              </div>

              <div className="space-y-2">
                {rawEntries.map(([k, v], idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50/70 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-xl flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-400 max-w-[50%] truncate">{k}</span>
                    <span className="font-bold text-slate-900 dark:text-white max-w-[48%] truncate text-right">
                      {v !== null && v !== undefined && String(v).trim() !== '' ? String(v) : '-'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">Pondera HR ID: #{personnel.id}</span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors shadow-2xs"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
