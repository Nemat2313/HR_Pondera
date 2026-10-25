'use client';

import React, { useState } from 'react';
import {
  Mail,
  Send,
  FileText,
  CheckCircle2,
  Clock,
  Download,
  Search,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  Info,
  RefreshCw,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface InvitationItem {
  id: string;
  name: string;
  passport_no: string;
  nationality: string;
  site: string;
  application_date: string;
  issued_date: string;
  invitation_code: string;
  telegram_status: 'Gönderildi' | 'Kuyrukta';
  pdf_size: string;
}

const SAMPLE_INVITATIONS: InvitationItem[] = [
  {
    id: 'INV-2026-891',
    name: 'SHAVKAT RAKHMATOV',
    passport_no: 'FA 1982736',
    nationality: 'Özbekistan',
    site: 'Kazan Gaz Kimya',
    application_date: '02.10.2026',
    issued_date: '24.10.2026 14:22',
    invitation_code: 'MVD-77-2026-90412',
    telegram_status: 'Gönderildi',
    pdf_size: '420 KB',
  },
  {
    id: 'INV-2026-892',
    name: 'RAJESH KUMAR',
    passport_no: 'Z 8492019',
    nationality: 'Hindistan',
    site: 'Ust Luga Kompleksi',
    application_date: '05.10.2026',
    issued_date: '25.10.2026 09:15',
    invitation_code: 'MVD-47-2026-11842',
    telegram_status: 'Gönderildi',
    pdf_size: '390 KB',
  },
  {
    id: 'INV-2026-893',
    name: 'BAKYTBEK ASANOV',
    passport_no: 'AC 551920',
    nationality: 'Kırgızistan',
    site: 'Svobodny AGHK',
    application_date: '08.10.2026',
    issued_date: '25.10.2026 10:48',
    invitation_code: 'MVD-28-2026-64019',
    telegram_status: 'Gönderildi',
    pdf_size: '445 KB',
  },
  {
    id: 'INV-2026-894',
    name: 'AMIT PATEL',
    passport_no: 'V 4710928',
    nationality: 'Hindistan',
    site: 'Tobolsk DGP-2',
    application_date: '10.10.2026',
    issued_date: '25.10.2026 11:05',
    invitation_code: 'MVD-72-2026-38291',
    telegram_status: 'Kuyrukta',
    pdf_size: '410 KB',
  },
];

export default function InvitationsTrackingView() {
  const { lang } = useLanguage();
  const [search, setSearch] = useState('');

  const filtered = SAMPLE_INVITATIONS.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.passport_no.toLowerCase().includes(search.toLowerCase()) ||
      item.invitation_code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-8 space-y-6 font-normal max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-400/30 flex items-center justify-center">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-normal tracking-tight text-white">
                  {lang === 'ru'
                    ? 'Мониторинг официальных приглашений МВД (Авто-Email & Telegram)'
                    : 'Devlet Davetiyeleri Takip & Telegram Bildirim Merkezi'}
                </h1>
                <span className="px-2 py-0.5 text-[11px] rounded bg-sky-500/30 text-sky-200 border border-sky-400/30 font-normal">
                  Zahid Bey Taskı • Planlanan İş
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl font-normal leading-relaxed">
                {lang === 'ru'
                  ? 'Автоматический парсинг входящих писем МВД/Госуслуг, извлечение электронных приглашений (Приглашение на въезд в РФ), регистрация в базе и моментальная отправка PDF в группу Telegram.'
                  : 'MVD ve Göç İdaresi resmi e-postalarını anında okuyarak gelen elektronik giriş davetiyelerini (PDF) alan, sicil ile eşleyen ve Telegram grubuna anlık bildirim atan robotik sistem.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs transition-all cursor-pointer font-normal shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Синхронизировать почту МВД' : 'MVD Posta Kutusunu Tara'}</span>
            </button>
          </div>
        </div>

        {/* Explainability Banner */}
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-300 flex items-start gap-2.5 font-normal">
          <Info className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
          <div>
            <strong className="text-white font-normal">Bu modül nasıl çalışır?</strong> MVD onayladığı her yabancı uzman davetiyesini e-posta ile iletir. Sistem bu e-postayı 10 saniye içinde okur, ekteki resmi PDF davetiyeyi indirip personelin kartına arşivler ve İK yöneticilerinin bulunduğu Telegram kanalına otomatik bildirim gönderir.
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>Bekleyen Başvurular</span>
            <Clock className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-2xl text-slate-900 dark:text-white font-normal">245 <span className="text-xs text-slate-400">Kişi</span></div>
          <p className="text-[11px] text-slate-500 font-normal">MVD değerlendirme sürecinde</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>Onaylanan & Maili Gelen</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl text-emerald-600 dark:text-emerald-400 font-normal">184 <span className="text-xs text-emerald-600">Davetiye</span></div>
          <p className="text-[11px] text-slate-500 font-normal">Bu ay e-posta ile teslim alındı</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>Telegram Bildirimi</span>
            <Send className="w-3.5 h-3.5 text-sky-500" />
          </div>
          <div className="text-2xl text-sky-600 dark:text-sky-400 font-normal">183 <span className="text-xs text-sky-600">(%99.5)</span></div>
          <p className="text-[11px] text-slate-500 font-normal">İK kanalına anında iletildi</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>Ortalama Çıkış Süresi</span>
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-2xl text-slate-900 dark:text-white font-normal">18.4 <span className="text-xs text-slate-400">Gün</span></div>
          <p className="text-[11px] text-slate-500 font-normal">Yasal süre sınırından önce</p>
        </div>
      </div>

      {/* Invitations Table Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm text-slate-900 dark:text-white font-normal">
              Son Gelen Elektronik MVD Davetiyeleri
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-normal">
              {filtered.length} Kayıt
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İsim veya Pasaport Ara..."
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-sky-500 text-slate-800 dark:text-slate-200 font-normal"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 font-normal">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-normal">
              <tr>
                <th className="py-3 px-4">Personel & Pasaport</th>
                <th className="py-3 px-4">Şantiye</th>
                <th className="py-3 px-4">MVD Davetiye No</th>
                <th className="py-3 px-4">Teslim Tarihi</th>
                <th className="py-3 px-4">Telegram Bot</th>
                <th className="py-3 px-4 text-center">Davetiye Belgesi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4">
                    <div className="text-slate-900 dark:text-white font-normal">{item.name}</div>
                    <div className="text-[11px] text-slate-400 font-normal">{item.passport_no} • {item.nationality}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-normal">
                    {item.site}
                  </td>
                  <td className="py-3 px-4 font-normal text-sky-700 dark:text-sky-300">
                    {item.invitation_code}
                  </td>
                  <td className="py-3 px-4 text-slate-500 font-normal text-[11px]">
                    {item.issued_date}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                      <Send className="w-3 h-3 text-sky-500" />
                      {item.telegram_status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-[11px] cursor-pointer font-normal transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      <span>PDF ({item.pdf_size})</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
