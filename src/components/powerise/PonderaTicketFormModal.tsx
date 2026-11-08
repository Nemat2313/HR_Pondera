'use client';

import React, { useState, useEffect } from 'react';
import { X, Search, UserCheck, Plane, Train, Bus, Check } from 'lucide-react';

export interface PonderaTicketFormData {
  id?: number;
  eba_doc_id: string;
  sicil_no: string;
  person_type: 'employee' | 'guest';
  passenger_name: string;
  passenger_name_ru: string;
  passport_no: string;
  citizenship: string;
  flight_purpose: string;
  ticket_agent: string;
  payment_company: string;
  transport_type: 'flight' | 'train' | 'bus';
  flight_or_train_no: string;
  booking_ref: string;
  ticket_number: string;
  departure_date: string;
  departure_time: string;
  departure_city: string;
  arrival_date: string;
  arrival_time: string;
  arrival_city: string;
  ticket_price: number | string;
  currency: string;
  doc_status: string;
  contact_phone: string;
  job_title: string;
  region: string;
  project_name: string;
  ticket_status: string;
  detail_reason: string;
  trip_type: string;
  notes: string;
  deduct_from_salary: 'No' | 'Yes';
}

export const EMPTY_PONDERA_TICKET_FORM: PonderaTicketFormData = {
  eba_doc_id: '',
  sicil_no: '',
  person_type: 'employee',
  passenger_name: '',
  passenger_name_ru: '',
  passport_no: '',
  citizenship: '',
  flight_purpose: 'Transfer',
  ticket_agent: 'One Two Trip',
  payment_company: 'PONDERA-INDUSTRY',
  transport_type: 'flight',
  flight_or_train_no: '',
  booking_ref: '',
  ticket_number: '',
  departure_date: '',
  departure_time: '',
  departure_city: '',
  arrival_date: '',
  arrival_time: '',
  arrival_city: '',
  ticket_price: 0,
  currency: 'RUB',
  doc_status: 'Uploaded',
  contact_phone: '',
  job_title: '',
  region: '',
  project_name: '',
  ticket_status: '',
  detail_reason: '0',
  trip_type: 'One Way',
  notes: '',
  deduct_from_salary: 'No',
};

interface PonderaTicketFormModalProps {
  isOpen: boolean;
  initialData: PonderaTicketFormData | null;
  regions: string[];
  projects: string[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}

export default function PonderaTicketFormModal({
  isOpen,
  initialData,
  regions,
  projects,
  onClose,
  onSaved,
}: PonderaTicketFormModalProps) {
  const [form, setForm] = useState<PonderaTicketFormData>(EMPTY_PONDERA_TICKET_FORM);
  const [empSearch, setEmpSearch] = useState('');
  const [empResults, setEmpResults] = useState<Array<Record<string, any>>>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setForm(
        initialData
          ? {
              ...EMPTY_PONDERA_TICKET_FORM,
              ...initialData,
              deduct_from_salary: initialData.deduct_from_salary === 'Yes' ? 'Yes' : 'No',
            }
          : { ...EMPTY_PONDERA_TICKET_FORM, deduct_from_salary: 'No' }
      );
      setEmpSearch('');
      setEmpResults([]);
      setErrMsg('');
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    const q = empSearch.trim();
    if (q.length < 2) {
      setEmpResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/tickets?action=search_people&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.success) {
          setEmpResults(data.employees || []);
        }
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [empSearch]);

  if (!isOpen) return null;

  const isEdit = Boolean(form.id);

  const handlePickEmployee = (emp: Record<string, any>) => {
    setForm((prev) => ({
      ...prev,
      person_type: 'employee',
      sicil_no: String(emp.sicil_no || ''),
      passenger_name: String(emp.ad_soyad || prev.passenger_name || '').toUpperCase(),
      passenger_name_ru: String(emp.tam_adi_kiril || prev.passenger_name_ru || ''),
      passport_no: String(emp.pasaport_no || prev.passport_no || ''),
      citizenship: String(emp.uyruk || prev.citizenship || '').toUpperCase(),
      contact_phone: String(emp.telefon_no || prev.contact_phone || ''),
      job_title: String(emp.gorevi || prev.job_title || ''),
      region: String(emp.region || prev.region || ''),
      project_name: String(emp.proje_adi || prev.project_name || ''),
      payment_company: String(emp.firma || prev.payment_company || 'PONDERA-INDUSTRY'),
    }));
    setEmpSearch('');
    setEmpResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.passenger_name.trim()) {
      setErrMsg('Yolcu Ad Soyad alanı zorunludur.');
      return;
    }
    setSaving(true);
    setErrMsg('');
    try {
      const payload = isEdit
        ? {
            action: 'update_ticket',
            ticket: {
              ...form,
              ticket_price: Number(form.ticket_price || 0) || 0,
              deduct_from_salary: form.deduct_from_salary === 'Yes' ? 'Yes' : 'No',
            },
          }
        : {
            action: 'create_manual_ticket',
            ticket: {
              ebaDocId: form.eba_doc_id,
              sicilNo: form.sicil_no,
              personType: form.sicil_no ? 'employee' : form.person_type,
              passengerName: form.passenger_name,
              passengerNameCyrillic: form.passenger_name_ru,
              passportNumber: form.passport_no,
              citizenship: form.citizenship,
              flightPurpose: form.flight_purpose,
              ticketAgent: form.ticket_agent,
              paymentCompany: form.payment_company,
              transportType: form.transport_type,
              flightOrTrainNumber: form.flight_or_train_no,
              bookingReference: form.booking_ref,
              ticketNumber: form.ticket_number,
              departureDate: form.departure_date,
              departureTime: form.departure_time,
              departureCity: form.departure_city,
              arrivalDate: form.arrival_date,
              arrivalTime: form.arrival_time,
              arrivalCity: form.arrival_city,
              ticketPrice: Number(form.ticket_price || 0) || 0,
              currency: form.currency,
              docStatus: form.doc_status,
              contactPhone: form.contact_phone,
              jobTitle: form.job_title,
              region: form.region,
              projectName: form.project_name,
              ticketStatus: form.ticket_status,
              detailReason: form.detail_reason,
              tripType: form.trip_type,
              notes: form.notes,
              deductFromSalary: form.deduct_from_salary === 'Yes' ? 'Yes' : 'No',
            },
          };

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        setErrMsg(data.message || 'Kayıt işlemi başarısız oldu.');
      } else {
        onSaved(data.message || 'Bilet kaydı başarıyla kaydedildi.');
        onClose();
      }
    } catch {
      setErrMsg('Sunucu bağlantısı sırasında hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-3xl bg-white dark:bg-[#11192C] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              {isEdit
                ? `✏️ Pondera Bilet Kaydını Düzenle (#${form.eba_doc_id || form.id})`
                : '➕ Yeni Manuel Bilet Ekle (Pondera 29 Sütun eBA Formatı)'}
            </h3>
            <p className="text-[11px] text-slate-500">
              Tüm personel havuzundan (Mevcut • Bekleniyor • Sevke Hazır • Çıkışlı) sicil arayıp bilgileri otomatik doldurabilirsiniz
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
          {/* ALL EMPLOYEES QUICK AUTO-FILL BAR */}
          <div className="p-3 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60 space-y-2">
            <label className="block text-[11px] font-bold text-teal-900 dark:text-teal-200">
              🔎 Tüm Personel Listesinden Hızlı Eşleştir (Sicil No, Ad Soyad, Kiril Ad, Pasaport):
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-teal-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                placeholder="Örn: 934444, RUZMETOV, beklenen yeni personel veya eski sicil ara..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 text-xs text-slate-900 dark:text-white"
              />
            </div>
            {searching && <div className="text-[11px] text-teal-600">Tüm personel listesi taranıyor...</div>}
            {empResults.length > 0 && (
              <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                {empResults.map((emp) => (
                  <button
                    key={`${emp.sicil_no}-${emp.ad_soyad}`}
                    type="button"
                    onClick={() => handlePickEmployee(emp)}
                    className="w-full px-3 py-2 text-left hover:bg-teal-50 dark:hover:bg-teal-950/40 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white">
                        #{emp.sicil_no} — {emp.ad_soyad}
                      </span>
                      {emp.tam_adi_kiril && (
                        <span className="ml-2 text-[11px] text-slate-500">({emp.tam_adi_kiril})</span>
                      )}
                      <div className="text-[10.5px] text-slate-500">
                        Pasaport: {emp.pasaport_no || '-'} • {emp.proje_adi || emp.region || '-'} • {emp.gorevi || '-'}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                        String(emp.genel_durum || '').toLowerCase().includes('mevcut')
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : String(emp.genel_durum || '').toLowerCase().includes('bekleniyor') ||
                            String(emp.genel_durum || '').toLowerCase().includes('sevke')
                          ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {emp.genel_durum || 'Kayıtlı'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* TRANSPORT TYPE & SALARY DEDUCTION TOP STRIP */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Ulaşım Türü (Uçak / Tren / Otobüs)
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'flight', label: 'Uçak', icon: Plane },
                    { id: 'train', label: 'Tren', icon: Train },
                    { id: 'bus', label: 'Otobüs', icon: Bus },
                  ] as const
                ).map((m) => {
                  const Icon = m.icon;
                  const active = form.transport_type === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, transport_type: m.id }))}
                      className={`flex items-center justify-center gap-1 py-2 rounded-xl font-bold border cursor-pointer ${
                        active
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Personelden Mi Kesilcek? (Varsayılan: No)
              </label>
              <select
                value={form.deduct_from_salary}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    deduct_from_salary: e.target.value === 'Yes' ? 'Yes' : 'No',
                  }))
                }
                className={`w-full px-3 py-2 rounded-xl border font-bold ${
                  form.deduct_from_salary === 'Yes'
                    ? 'bg-rose-50 border-rose-300 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
                }`}
              >
                <option value="No">No (Şirket Karşılar — Varsayılan)</option>
                <option value="Yes">Yes (Personelden Kesilecek)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                eBA Doküman ID & Sicil No
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={form.eba_doc_id}
                  onChange={(e) => setForm((p) => ({ ...p, eba_doc_id: e.target.value }))}
                  placeholder="Doküman ID"
                  className="px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
                />
                <input
                  type="text"
                  value={form.sicil_no}
                  onChange={(e) => setForm((p) => ({ ...p, sicil_no: e.target.value }))}
                  placeholder="Sicil No"
                  className="px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                />
              </div>
            </div>
          </div>

          {/* PASSENGER & HR FIELDS */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Ad Soyad (Latin — Zorunlu)
              </label>
              <input
                type="text"
                required
                value={form.passenger_name}
                onChange={(e) => setForm((p) => ({ ...p, passenger_name: e.target.value }))}
                placeholder="SURNAME GIVENNAME"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold uppercase"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Tam Adı (Kiril)
              </label>
              <input
                type="text"
                value={form.passenger_name_ru}
                onChange={(e) => setForm((p) => ({ ...p, passenger_name_ru: e.target.value }))}
                placeholder="Иванов Иван..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Pasaport No & Uyruk
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={form.passport_no}
                  onChange={(e) => setForm((p) => ({ ...p, passport_no: e.target.value }))}
                  placeholder="Pasaport"
                  className="px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
                />
                <input
                  type="text"
                  value={form.citizenship}
                  onChange={(e) => setForm((p) => ({ ...p, citizenship: e.target.value }))}
                  placeholder="Uyruk"
                  className="px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 uppercase"
                />
              </div>
            </div>
          </div>

          {/* ROUTE, DATES & TIMES */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
            <div className="col-span-2 sm:col-span-2">
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Kalkış Şehri
              </label>
              <input
                type="text"
                value={form.departure_city}
                onChange={(e) => setForm((p) => ({ ...p, departure_city: e.target.value }))}
                placeholder="Örn: MOSKOVA"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 uppercase font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Uçuş / Kalkış Tarihi
              </label>
              <input
                type="text"
                value={form.departure_date}
                onChange={(e) => setForm((p) => ({ ...p, departure_date: e.target.value }))}
                placeholder="12.11.2026"
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Kalkış Saati
              </label>
              <input
                type="text"
                value={form.departure_time}
                onChange={(e) => setForm((p) => ({ ...p, departure_time: e.target.value }))}
                placeholder="09:25"
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
            <div className="col-span-2 sm:col-span-2">
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Varış Şehri
              </label>
              <input
                type="text"
                value={form.arrival_city}
                onChange={(e) => setForm((p) => ({ ...p, arrival_city: e.target.value }))}
                placeholder="Örn: KAZAN"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 uppercase font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Varış Tarihi
              </label>
              <input
                type="text"
                value={form.arrival_date}
                onChange={(e) => setForm((p) => ({ ...p, arrival_date: e.target.value }))}
                placeholder="12.11.2026"
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Varış Saati
              </label>
              <input
                type="text"
                value={form.arrival_time}
                onChange={(e) => setForm((p) => ({ ...p, arrival_time: e.target.value }))}
                placeholder="11:45"
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Sefer / PNR
              </label>
              <input
                type="text"
                value={form.flight_or_train_no}
                onChange={(e) => setForm((p) => ({ ...p, flight_or_train_no: e.target.value }))}
                placeholder="SU-1192"
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Fiyat (Tutar)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.ticket_price}
                onChange={(e) => setForm((p) => ({ ...p, ticket_price: e.target.value }))}
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Para Birimi
              </label>
              <select
                value={form.currency}
                onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold"
              >
                <option value="RUB">RUB</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="TRY">TRY</option>
                <option value="UZS">UZS</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Gidiş Dönüş mü?
              </label>
              <select
                value={form.trip_type}
                onChange={(e) => setForm((p) => ({ ...p, trip_type: e.target.value }))}
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              >
                <option value="One Way">One Way</option>
                <option value="Round Trip">Round Trip</option>
              </select>
            </div>
          </div>

          {/* PONDERA EBA MANUAL COLUMNS */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Uçuş Tipi (Amaç)
              </label>
              <select
                value={form.flight_purpose}
                onChange={(e) => setForm((p) => ({ ...p, flight_purpose: e.target.value }))}
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              >
                <option value="Transfer">Transfer</option>
                <option value="İşe Giriş">İşe Giriş</option>
                <option value="İşten Çıkış">İşten Çıkış</option>
                <option value="İzne Gidiş">İzne Gidiş</option>
                <option value="İzinden Dönüş">İzinden Dönüş</option>
                <option value="Is Gezisi">İş Gezisi</option>
                <option value="Özel">Özel</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Ticket Agent (Acente)
              </label>
              <input
                type="text"
                value={form.ticket_agent}
                onChange={(e) => setForm((p) => ({ ...p, ticket_agent: e.target.value }))}
                placeholder="One Two Trip"
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Payment Company
              </label>
              <input
                type="text"
                value={form.payment_company}
                onChange={(e) => setForm((p) => ({ ...p, payment_company: e.target.value }))}
                placeholder="PONDERA-INDUSTRY"
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                İletişim Bilgisi (Ev / Tel)
              </label>
              <input
                type="text"
                value={form.contact_phone}
                onChange={(e) => setForm((p) => ({ ...p, contact_phone: e.target.value }))}
                placeholder="+7 9..."
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Proje Bölgesi (Şantiye Kırılımlı)
              </label>
              <input
                type="text"
                list="pondera-modal-regions"
                value={form.region}
                onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))}
                placeholder="NHNK mPE-300 / Svobodny..."
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
              <datalist id="pondera-modal-regions">
                {regions.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Proje Adı (Şantiye)
              </label>
              <input
                type="text"
                list="pondera-modal-projects"
                value={form.project_name}
                onChange={(e) => setForm((p) => ({ ...p, project_name: e.target.value }))}
                placeholder="NHNK mPE-300"
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
              <datalist id="pondera-modal-projects">
                {projects.map((pr) => (
                  <option key={pr} value={pr} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Resmi Görevi
              </label>
              <input
                type="text"
                value={form.job_title}
                onChange={(e) => setForm((p) => ({ ...p, job_title: e.target.value }))}
                placeholder="Görevi"
                className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Bilet Durumu & Detail/Reason
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={form.ticket_status}
                  onChange={(e) => setForm((p) => ({ ...p, ticket_status: e.target.value }))}
                  className="px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                >
                  <option value="">Aktif</option>
                  <option value="Changed">Changed</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Missed">Missed</option>
                </select>
                <input
                  type="text"
                  value={form.detail_reason}
                  onChange={(e) => setForm((p) => ({ ...p, detail_reason: e.target.value }))}
                  placeholder="0"
                  className="px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Açıklama / Karşılama Notu
            </label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Bilet veya karşılama ile ilgili ek not..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
            />
          </div>

          {errMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-medium">
              {errMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold shadow cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <span>Kaydediliyor...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isEdit ? 'Değişiklikleri Kaydet' : 'Bileti Tabloya Kaydet'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

