'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Search,
  ShieldCheck,
  Bell,
  Send,
  FileSpreadsheet,
  Calendar,
  UserPlus,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type {
  QuotaAllocationRow,
  QuotaAlertSettings,
  QuotaCountryRef,
  QuotaIrsCertificateComputed,
  QuotaOccupationRef,
  QuotaProjectMappingRef,
  QuotaRegionRef,
} from '@/lib/quotaManager';

interface ReferenceBundle {
  regions: QuotaRegionRef[];
  projectMappings: QuotaProjectMappingRef[];
  countries: QuotaCountryRef[];
  occupations: QuotaOccupationRef[];
}

/* ============================================================================
   1. ИРС (РНП) SERTİFİKASI EKLE / DÜZENLE MODALI (Zahid Şef 1. & 2. Tablo)
   ============================================================================ */
export function QuotaIrsCertificateModal({
  open,
  onClose,
  onSaved,
  initialCert,
  defaultYear,
  defaultRegionCode,
  references,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
  initialCert?: QuotaIrsCertificateComputed | null;
  defaultYear: number;
  defaultRegionCode?: string;
  references: ReferenceBundle;
}) {
  const [certNo, setCertNo] = useState('');
  const [trancheCode, setTrancheCode] = useState('IRS1');
  const [trancheLabel, setTrancheLabel] = useState('IRS1');
  const [quotaYear, setQuotaYear] = useState<number>(defaultYear || 2026);
  const [regionCode, setRegionCode] = useState('MURMANSK');
  const [projectName, setProjectName] = useState('MURMANSK');
  const [issueDate, setIssueDate] = useState('2026-11-07');
  const [validFrom, setValidFrom] = useState('2026-12-15');
  const [validUntil, setValidUntil] = useState('2027-03-31');
  const [stateDuty, setStateDuty] = useState<number>(15000);
  const [status, setStatus] = useState<'active' | 'planned' | 'expired'>('active');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<
    Array<{
      occupationCode: string;
      countryCode: string;
      allocatedQty: number;
    }>
  >([
    { occupationCode: '102660', countryCode: '', allocatedQty: 112 },
    { occupationCode: '101435', countryCode: '', allocatedQty: 48 },
  ]);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setErrMsg('');
    if (initialCert) {
      setCertNo(initialCert.certificate_no);
      setTrancheCode(initialCert.tranche_code || 'IRS1');
      setTrancheLabel(initialCert.tranche_label || initialCert.tranche_code || 'IRS1');
      setQuotaYear(initialCert.quota_year || 2026);
      setRegionCode(initialCert.region_code || 'MURMANSK');
      setProjectName(initialCert.project_name || initialCert.region_code || 'MURMANSK');
      setIssueDate(initialCert.issue_date || '2026-11-07');
      setValidFrom(initialCert.valid_from || '2026-11-07');
      setValidUntil(initialCert.valid_until || '2027-05-31');
      setStateDuty(initialCert.state_duty_per_person || 15000);
      setStatus(initialCert.status || 'active');
      setNotes(initialCert.notes || '');
      setLines(
        initialCert.lines.length > 0
          ? initialCert.lines.map((l) => ({
              occupationCode: l.occupation_code,
              countryCode: l.country_code || '',
              allocatedQty: l.allocated_qty,
            }))
          : [{ occupationCode: '102660', countryCode: '', allocatedQty: 100 }]
      );
    } else {
      const yr = defaultYear || 2026;
      const initReg = defaultRegionCode || 'LENINGRADSKAYA';
      const projHit = references.projectMappings.find((m) => m.regionCode === initReg);
      setCertNo(`${yr}-${initReg.slice(0, 6)}-IRS1`);
      setTrancheCode('IRS1');
      setTrancheLabel('IRS1');
      setQuotaYear(yr);
      setRegionCode(initReg);
      setProjectName(projHit?.quotaProject || initReg);
      setIssueDate(new Date().toISOString().slice(0, 10));
      setValidFrom(new Date().toISOString().slice(0, 10));
      setValidUntil(`${yr + 1}-05-31`);
      setStateDuty(15000);
      setStatus('active');
      setNotes('');
      setLines([
        { occupationCode: '102660', countryCode: '', allocatedQty: 100 },
      ]);
    }
  }, [open, initialCert, defaultYear, defaultRegionCode, references.projectMappings]);

  const totalCapacity = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.allocatedQty) || 0), 0),
    [lines]
  );

  const isCarryover = useMemo(() => {
    const endYr = Number(String(validUntil || '').slice(0, 4)) || 0;
    return endYr > quotaYear;
  }, [validUntil, quotaYear]);

  if (!open) return null;

  const handleRegionChange = (nextReg: string) => {
    setRegionCode(nextReg);
    const hit = references.projectMappings.find((m) => m.regionCode === nextReg);
    if (hit) setProjectName(hit.quotaProject);
    else setProjectName(nextReg);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg('');
    if (!certNo.trim()) {
      setErrMsg('Lütfen ИРС (РНП) sertifika numarasını girin (Örn: 2600030066).');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_irs_certificate',
          certificate: {
            certificate_no: certNo.trim(),
            tranche_code: trancheCode,
            tranche_label: trancheLabel.trim() || trancheCode,
            quota_year: quotaYear,
            region_code: regionCode,
            project_name: projectName.trim(),
            issue_date: issueDate,
            valid_from: validFrom,
            valid_until: validUntil,
            state_duty_per_person: stateDuty,
            status,
            notes,
            lines: lines.map((l) => ({
              occupation_code: l.occupationCode,
              country_code: l.countryCode,
              allocated_qty: Number(l.allocatedQty) || 0,
            })),
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrMsg(json.message || 'Sertifika kaydedilemedi.');
      } else {
        onSaved(json.message);
        onClose();
      }
    } catch {
      setErrMsg('Sunucu ile bağlantı kurulamadı.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden my-6">
        <div className="px-6 py-4 bg-gradient-to-r from-[#1A363E] to-teal-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-300" />
            <div>
              <h3 className="text-base font-semibold">
                {initialCert
                  ? `ИРС (РНП) Sertifikası Düzenle — № ${initialCert.certificate_no}`
                  : 'Yeni ИРС (РНП) Sertifikası Tanımla (Parçalı Kota & Dönem Kaydırma)'}
              </h3>
              <p className="text-[11px] text-emerald-200/90">
                Onaylı bakanlık kotasından ihtiyaç kadar sertifika dilimi açın; kalan kotayı harç ödemeden sonraki dönemlere saklayın.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {errMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {errMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                ИРС (РНП) Sertifika No *
              </label>
              <input
                type="text"
                value={certNo}
                onChange={(e) => setCertNo(e.target.value)}
                placeholder="Örn: 2600030066"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Parçalı İRS Dilimi (IRS1 / IRS2 / IRS3)
              </label>
              <div className="flex gap-1.5">
                <select
                  value={trancheCode}
                  onChange={(e) => {
                    const next = e.target.value;
                    setTrancheCode(next);
                    setTrancheLabel(next);
                    if (!initialCert && certNo.includes('-IRS')) {
                      setCertNo(certNo.replace(/-IRS\d+$/, `-${next}`));
                    }
                  }}
                  className="w-24 px-2.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                >
                  <option value="IRS1">IRS1</option>
                  <option value="IRS2">IRS2</option>
                  <option value="IRS3">IRS3</option>
                  <option value="IRS4">IRS4</option>
                </select>
                <input
                  type="text"
                  value={trancheLabel}
                  onChange={(e) => setTrancheLabel(e.target.value)}
                  placeholder="IRS1"
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Düşülecek Kota Havuz Yılı
              </label>
              <select
                value={quotaYear}
                onChange={(e) => setQuotaYear(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value={2026}>2026 Kota Havuzu</option>
                <option value={2027}>2027 Kota Havuzu</option>
                <option value={2028}>2028 Kota Havuzu</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Bölge (Субъект РФ)
              </label>
              <select
                value={regionCode}
                onChange={(e) => handleRegionChange(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {references.regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code} — {r.nameRu}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Şantiye / Proje
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Kişi Başı МВД Harcı (₽)
              </label>
              <input
                type="number"
                value={stateDuty}
                onChange={(e) => setStateDuty(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Validity Period & Next-Year Carryover Presets */}
          <div className="p-4 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-800/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-teal-900 dark:text-teal-200">
                <Calendar className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>Sertifika Geçerlilik Dönemi (Sonraki Yıla Kaydırma Desteği)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setValidFrom(`${quotaYear + 1}-01-01`);
                    setValidUntil(`${quotaYear + 1}-03-31`);
                  }}
                  className="px-2.5 py-1 text-[11px] rounded-lg bg-white dark:bg-slate-800 border border-teal-200 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-100 cursor-pointer"
                >
                  {quotaYear + 1} 1. Çeyrek (01.01–31.03.{quotaYear + 1})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setValidFrom(`${quotaYear + 1}-01-01`);
                    setValidUntil(`${quotaYear + 1}-06-30`);
                  }}
                  className="px-2.5 py-1 text-[11px] rounded-lg bg-white dark:bg-slate-800 border border-teal-200 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-100 cursor-pointer"
                >
                  {quotaYear + 1} İlk Yarıyıl
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const start = issueDate || new Date().toISOString().slice(0, 10);
                    const d = new Date(start);
                    d.setFullYear(d.getFullYear() + 1);
                    setValidFrom(start);
                    setValidUntil(d.toISOString().slice(0, 10));
                  }}
                  className="px-2.5 py-1 text-[11px] rounded-lg bg-white dark:bg-slate-800 border border-teal-200 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-100 cursor-pointer"
                >
                  +1 Tam Yıl (МВД РНП)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                  Başvuru / Düzenlenme Tarihi
                </label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                  Geçerlilik Başlangıcı
                </label>
                <input
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                  Geçerlilik Bitişi
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {isCarryover && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Bu sertifika <strong>{quotaYear}</strong> kotasından alınıp{' '}
                  <strong>{validUntil.slice(0, 4)}</strong> yılı içinde kullanılacak şekilde sonraki yıla devrediliyor.
                </span>
              </div>
            )}
          </div>

          {/* Occupation Lines inside this ИРС Certificate (Zahid Şef's 2nd Table) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-800 dark:text-slate-200">
                Sertifika Görev Dağılımı (ОКПДТР 2025 Kodu Bazlı Kontenjanlar)
              </label>
              <button
                type="button"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { occupationCode: '105558', countryCode: '', allocatedQty: 20 },
                  ])
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-xs border border-teal-200 dark:border-teal-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Görev Satırı Ekle
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((ln, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700"
                >
                  <div className="col-span-12 sm:col-span-6">
                    <select
                      value={ln.occupationCode}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, occupationCode: e.target.value } : item
                          )
                        )
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      {references.occupations.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.code} — {o.nameTr} ({o.nameRu})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-7 sm:col-span-3">
                    <select
                      value={ln.countryCode}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, countryCode: e.target.value } : item
                          )
                        )
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      <option value="">Tüm Ülkeler (Genel)</option>
                      {references.countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} — {c.nameTr}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-4 sm:col-span-2">
                    <input
                      type="number"
                      min={1}
                      value={ln.allocatedQty}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? { ...item, allocatedQty: Math.max(0, Number(e.target.value) || 0) }
                              : item
                          )
                        )
                      }
                      placeholder="Adet"
                      className="w-full px-2.5 py-1.5 text-xs text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="col-span-1 text-right">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs pt-1 text-slate-600 dark:text-slate-300">
              <span>
                Toplam ИРС Sertifika Kontenjanı:{' '}
                <strong className="text-teal-700 dark:text-teal-300">{totalCapacity} Kişi</strong>
              </span>
              <span>
                Tahmini МВД Harcı:{' '}
                <strong>{(totalCapacity * stateDuty).toLocaleString('tr-TR')} ₽</strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Sertifika Durumu
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="active">Aktif (Kullanımda)</option>
                <option value="planned">Planlanan Dilim (Henüz Başvurulmadı)</option>
                <option value="expired">Süresi Doldu</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Açıklama / Not
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Örn: 2027 ilk 3 ay sevkiyatı için alınan 1. dilim sertifika"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs bg-teal-600 hover:bg-teal-700 text-white font-medium cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor...' : 'ИРС (РНП) Sertifikasını Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
   2. YENİ ÇALIŞAN / ADAY ИРС (РНП) BAŞVURU PENCERESİ (Zahid Şef 3. Tablo)
   ============================================================================ */
export function QuotaWorkerIrsModal({
  open,
  onClose,
  onSaved,
  certificates,
  preselectedCertNo,
  references,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
  certificates: QuotaIrsCertificateComputed[];
  preselectedCertNo?: string;
  references: ReferenceBundle;
}) {
  const [certNo, setCertNo] = useState('');
  const [customCertMode, setCustomCertMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<Record<string, any>>>([]);
  const [rows, setRows] = useState<
    Array<{
      sicilNo: string;
      fullName: string;
      passportNo: string;
      countryCode: string;
      occupationCode: string;
      projectName: string;
      usageType: 'new_rnr' | 'visa_extension';
    }>
  >([
    {
      sicilNo: '',
      fullName: '',
      passportNo: '',
      countryCode: '356',
      occupationCode: '102660',
      projectName: '',
      usageType: 'new_rnr',
    },
  ]);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setErrMsg('');
    const activeCerts = certificates.filter((c) => c.status === 'active');
    const chosen =
      preselectedCertNo ||
      (activeCerts.length > 0 ? activeCerts[0].certificate_no : certificates[0]?.certificate_no || '');
    setCertNo(chosen);
    setCustomCertMode(certificates.length === 0);

    const certObj = certificates.find((c) => c.certificate_no === chosen);
    const defaultOcc = certObj?.lines[0]?.occupation_code || '102660';
    const defaultCountry = certObj?.lines[0]?.country_code || '356';
    const defaultProj = certObj?.project_name || '';

    setRows([
      {
        sicilNo: '',
        fullName: '',
        passportNo: '',
        countryCode: defaultCountry || '356',
        occupationCode: defaultOcc,
        projectName: defaultProj,
        usageType: 'new_rnr',
      },
    ]);
  }, [open, preselectedCertNo, certificates]);

  useEffect(() => {
    if (!open || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/quotas?action=search_people&q=${encodeURIComponent(searchQuery.trim())}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.employees) setSearchResults(json.employees);
        })
        .catch(() => {});
    }, 220);
    return () => clearTimeout(timer);
  }, [open, searchQuery]);

  const selectedCert = useMemo(
    () => certificates.find((c) => c.certificate_no === certNo.trim()),
    [certificates, certNo]
  );

  if (!open) return null;

  const handleSelectEmployeeFrom35k = (emp: Record<string, any>) => {
    const defaultOcc = selectedCert?.lines[0]?.occupation_code || '102660';
    const nextRow = {
      sicilNo: String(emp.sicilNo || emp.sicil_no || ''),
      fullName: String(emp.fullName || emp.ad_soyad || ''),
      passportNo: String(emp.passportNumber || emp.pasaport_no || ''),
      countryCode: selectedCert?.lines[0]?.country_code || '356',
      occupationCode: defaultOcc,
      projectName:
        selectedCert?.project_name || String(emp.project || emp.proje_adi || ''),
      usageType: 'new_rnr' as const,
    };

    setRows((prev) => {
      if (prev.length === 1 && !prev[0].fullName.trim()) {
        return [nextRow];
      }
      return [...prev, nextRow];
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg('');
    if (!certNo.trim()) {
      setErrMsg('Lütfen ИРС (РНП) sertifika numarasını seçin veya yazın.');
      return;
    }
    const valid = rows.filter((r) => r.fullName.trim().length > 0);
    if (valid.length === 0) {
      setErrMsg('En az 1 çalışan/aday adı (FIO) girilmelidir.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_worker_applications',
          certificateNo: certNo.trim(),
          regionCode: selectedCert?.region_code || '',
          projectName: selectedCert?.project_name || '',
          workers: valid.map((r) => ({
            sicil_no: r.sicilNo.trim(),
            full_name: r.fullName.trim(),
            passport_no: r.passportNo.trim(),
            country_code: r.countryCode,
            occupation_code: r.occupationCode,
            project_name: r.projectName.trim() || selectedCert?.project_name || '',
            usage_type: r.usageType,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrMsg(json.message || 'Başvurular kaydedilemedi.');
      } else {
        onSaved(json.message);
        onClose();
      }
    } catch {
      setErrMsg('Sunucu bağlantı hatası.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden my-6">
        <div className="px-6 py-4 bg-gradient-to-r from-teal-800 to-[#1A363E] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserPlus className="w-5 h-5 text-emerald-300" />
            <div>
              <h3 className="text-base font-semibold">
                ИРС (РНП) Sertifika No ile Yeni Çalışan / Aday Kota Başvurusu
              </h3>
              <p className="text-[11px] text-emerald-200/90">
                Başvurulan çalışanlar seçilen ИРС numarasının ilgili ОКПДТР görev kontenjanından otomatik düşülür.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {errMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {errMsg}
            </div>
          )}

          {/* Step 1: Select or Enter ИРС (РНП) Number */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-800 dark:text-white">
                1. Kullanılacak ИРС (РНП) Sertifika Numarası *
              </label>
              {certificates.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCustomCertMode((v) => !v)}
                  className="text-[11px] text-teal-600 dark:text-teal-400 underline cursor-pointer"
                >
                  {customCertMode ? 'Kayıtlı Sertifikalardan Seç' : 'Manuel İРС Numarası Yaz'}
                </button>
              )}
            </div>

            {!customCertMode && certificates.length > 0 ? (
              <select
                value={certNo}
                onChange={(e) => {
                  const val = e.target.value;
                  setCertNo(val);
                  const found = certificates.find((c) => c.certificate_no === val);
                  if (found && found.lines.length > 0) {
                    setRows((prev) =>
                      prev.map((r) => ({
                        ...r,
                        occupationCode: found.lines[0].occupation_code || r.occupationCode,
                        projectName: found.project_name || r.projectName,
                      }))
                    );
                  }
                }}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium"
              >
                {certificates.map((c) => (
                  <option key={c.certificate_no} value={c.certificate_no}>
                    № {c.certificate_no} ({c.tranche_label}) • {c.region_code} / {c.project_name} • Kalan:{' '}
                    {c.total_remaining_qty}/{c.total_allocated_qty} • Geçerlilik: {c.valid_until}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={certNo}
                onChange={(e) => setCertNo(e.target.value)}
                placeholder="ИРС (РНП) Sertifika No girin (Örn: 2600030066)"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium"
              />
            )}

            {/* Live Occupation Balances on Selected Certificate */}
            {selectedCert && (
              <div className="flex flex-wrap gap-2 pt-1">
                {selectedCert.lines.map((ln) => {
                  const low = ln.remaining_qty <= 10;
                  return (
                    <div
                      key={ln.id}
                      className={`px-3 py-1.5 rounded-xl text-[11px] border flex items-center gap-2 ${
                        low
                          ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <span className="font-semibold">{ln.occupation_code}</span>
                      <span>{ln.occupation_tr}</span>
                      <span className="px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 font-semibold">
                        Kalan: {ln.remaining_qty} / {ln.allocated_qty}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: Optional Quick Search from All Pondera Personnel */}
          <div className="relative">
            <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
              Pondera Tüm Personel / Beklenen Giriş Listesinden Hızlı Ara (Opsiyonel — Sicili olmayan yeni adayları doğrudan aşağıya yazabilirsiniz)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Sicil No, Ad Soyad veya Pasaport No ile ara..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            {searchResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl divide-y divide-slate-100 dark:divide-slate-800">
                {searchResults.map((emp, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectEmployeeFrom35k(emp)}
                    className="w-full text-left px-3.5 py-2 hover:bg-teal-50 dark:hover:bg-slate-800 text-xs flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {emp.fullName || emp.ad_soyad}
                      </span>{' '}
                      <span className="text-slate-500">
                        (#{emp.sicilNo || emp.sicil_no} • {emp.passportNumber || emp.pasaport_no || 'Pasaport yok'})
                      </span>
                    </div>
                    <span className="text-[11px] text-teal-600 dark:text-teal-400">
                      {emp.role || emp.gorevi} • {emp.project || emp.proje_adi}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 3: Worker Rows Table (Sicil | FIO | Pasaport | Ülke Kodu | Görev Kodu | Proje | Tür) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                2. Başvurulacak Çalışan / Aday Listesi ({rows.length} Kişi)
              </span>
              <button
                type="button"
                onClick={() =>
                  setRows((prev) => [
                    ...prev,
                    {
                      sicilNo: '',
                      fullName: '',
                      passportNo: '',
                      countryCode: prev[prev.length - 1]?.countryCode || '356',
                      occupationCode:
                        prev[prev.length - 1]?.occupationCode ||
                        selectedCert?.lines[0]?.occupation_code ||
                        '102660',
                      projectName:
                        prev[prev.length - 1]?.projectName || selectedCert?.project_name || '',
                      usageType: 'new_rnr',
                    },
                  ])
                }
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-xs border border-teal-200 dark:border-teal-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Yeni Satır Ekle
              </button>
            </div>

            <div className="space-y-2">
              {rows.map((r, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                >
                  <div className="col-span-4 sm:col-span-2">
                    <input
                      type="text"
                      value={r.sicilNo}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, sicilNo: e.target.value } : it))
                        )
                      }
                      placeholder="Sicil (Ops.)"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="col-span-8 sm:col-span-3">
                    <input
                      type="text"
                      value={r.fullName}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, fullName: e.target.value } : it))
                        )
                      }
                      placeholder="Ad Soyad / ФИО *"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <input
                      type="text"
                      value={r.passportNo}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((it, i) =>
                            i === idx ? { ...it, passportNo: e.target.value } : it
                          )
                        )
                      }
                      placeholder="Pasaport No"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <select
                      value={r.countryCode}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((it, i) =>
                            i === idx ? { ...it, countryCode: e.target.value } : it
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      {references.countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} • {c.nameTr}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-10 sm:col-span-2">
                    <select
                      value={r.occupationCode}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((it, i) =>
                            i === idx ? { ...it, occupationCode: e.target.value } : it
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      {(selectedCert && selectedCert.lines.length > 0
                        ? selectedCert.lines.map((ln) => ({
                            code: ln.occupation_code,
                            label: `${ln.occupation_code} • ${ln.occupation_tr} (Kalan: ${ln.remaining_qty})`,
                          }))
                        : references.occupations.map((o) => ({
                            code: o.code,
                            label: `${o.code} • ${o.nameTr}`,
                          }))
                      ).map((opt) => (
                        <option key={opt.code} value={opt.code}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-1">
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs bg-teal-600 hover:bg-teal-700 text-white font-medium cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor...' : `İРС № ${certNo || '...'} Üzerinden Kaydet`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
   3. BAKANLIK KOTA KAYDI (migrakvota.gov.ru / LOG) EKLE & DÜZENLE MODALI
   ============================================================================ */
export function QuotaAllocationModal({
  open,
  onClose,
  onSaved,
  initialRow,
  defaultYear,
  references,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
  initialRow?: QuotaAllocationRow | null;
  defaultYear: number;
  references: ReferenceBundle;
}) {
  const [recordCode, setRecordCode] = useState('');
  const [year, setYear] = useState<number>(defaultYear || 2026);
  const [appType, setAppType] = useState('ILK BASVURU');
  const [status, setStatus] = useState('BASVURU YAPILACAK');
  const [regionCode, setRegionCode] = useState('TATARISTAN');
  const [projectName, setProjectName] = useState('NIJNIKAMPSK+KAZAN');
  const [countryCode, setCountryCode] = useState('356');
  const [occupationCode, setOccupationCode] = useState('102660');
  const [requestedQty, setRequestedQty] = useState(100);
  const [approvedQty, setApprovedQty] = useState(0);
  const [legacyIrsQty, setLegacyIrsQty] = useState(0);
  const [openingNewUse, setOpeningNewUse] = useState(0);
  const [extensionsUse, setExtensionsUse] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setErrMsg('');
    if (initialRow) {
      setRecordCode(initialRow.record_code);
      setYear(initialRow.year);
      setAppType(initialRow.application_type || 'Esas başvuru');
      setStatus(initialRow.migrakvota_status || 'Onaylı (emir taslağında)');
      setRegionCode(initialRow.region_code || 'TATARISTAN');
      setProjectName(initialRow.project_name || '');
      setCountryCode(initialRow.country_code || '356');
      setOccupationCode(initialRow.occupation_code || '102660');
      setRequestedQty(initialRow.requested_qty || 0);
      setApprovedQty(initialRow.approved_qty || 0);
      setLegacyIrsQty(initialRow.legacy_irs_qty || 0);
      setOpeningNewUse(initialRow.opening_new_use || 0);
      setExtensionsUse(initialRow.extensions_use || 0);
      setNotes(initialRow.notes || '');
    } else {
      setRecordCode('');
      setYear(defaultYear || 2026);
      setAppType('Artırma düzeltmesi');
      setStatus('Onaylı (emir taslağında)');
      setRegionCode('TATARISTAN');
      setProjectName('NIJNIKAMPSK+KAZAN');
      setCountryCode('356');
      setOccupationCode('102660');
      setRequestedQty(100);
      setApprovedQty(100);
      setLegacyIrsQty(0);
      setOpeningNewUse(0);
      setExtensionsUse(0);
      setNotes('');
    }
  }, [open, initialRow, defaultYear]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrMsg('');
    try {
      const res = await fetch('/api/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_allocation',
          allocation: {
            record_code: recordCode,
            year,
            application_type: appType,
            migrakvota_status: status,
            region_code: regionCode,
            project_name: projectName,
            country_code: countryCode,
            occupation_code: occupationCode,
            requested_qty: requestedQty,
            approved_qty: approvedQty,
            legacy_irs_qty: legacyIrsQty,
            opening_new_use: openingNewUse,
            extensions_use: extensionsUse,
            notes,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrMsg(json.message || 'Kota kaydı kaydedilemedi.');
      } else {
        onSaved(json.message);
        onClose();
      }
    } catch {
      setErrMsg('Sunucu bağlantı hatası.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden my-6">
        <div className="px-6 py-4 bg-gradient-to-r from-[#1A363E] to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-emerald-300" />
            <h3 className="text-base font-semibold">
              {initialRow
                ? `Kota Kaydını Düzenle (${initialRow.record_code})`
                : 'Yeni Bakanlık Kota Başvurusu Ekle (migrakvota.gov.ru)'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-xs text-rose-700 dark:text-rose-300">
              {errMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">Kota Yılı</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
                <option value={2028}>2028</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Başvuru Tipi
              </label>
              <select
                value={appType}
                onChange={(e) => {
                  const v = e.target.value;
                  setAppType(v);
                  if (v === 'Azaltma düzeltmesi' && requestedQty > 0) {
                    setRequestedQty(-requestedQty);
                    if (approvedQty > 0) setApprovedQty(-approvedQty);
                  } else if (v !== 'Azaltma düzeltmesi' && requestedQty < 0) {
                    setRequestedQty(Math.abs(requestedQty));
                    if (approvedQty < 0) setApprovedQty(Math.abs(approvedQty));
                  }
                }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="Esas başvuru">Esas başvuru (Основная заявка)</option>
                <option value="Artırma düzeltmesi">Artırma düzeltmesi (+ Корректировка)</option>
                <option value="Azaltma düzeltmesi">Azaltma düzeltmesi (− Уменьшение / İade)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Bakanlık Statüsü
              </label>
              <select
                value={status}
                onChange={(e) => {
                  const st = e.target.value;
                  setStatus(st);
                  if (st === 'İncelemede') setApprovedQty(0);
                  else if (st === 'Onaylı (emir taslağında)') setApprovedQty(requestedQty);
                }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="Onaylı (emir taslağında)">
                  Onaylı (emir taslağında) — Включена в проект приказа
                </option>
                <option value="İncelemede">İncelemede — На рассмотрении</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Bölge (Субъект РФ)
              </label>
              <select
                value={regionCode}
                onChange={(e) => {
                  const nextReg = e.target.value;
                  setRegionCode(nextReg);
                  const hit = references.projectMappings.find((m) => m.regionCode === nextReg);
                  if (hit) setProjectName(hit.quotaProject);
                }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {references.regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code} — {r.nameRu}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Şantiye / Proje
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Ülke Kodu (ОКСМ)
              </label>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {references.countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.nameTr} ({c.nameRu})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Görev Kodu (ОКПДТР 2025)
              </label>
              <select
                value={occupationCode}
                onChange={(e) => setOccupationCode(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {references.occupations.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.code} — {o.nameTr} ({o.nameRu})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                Net Etki (+/−)
              </label>
              <input
                type="number"
                value={requestedQty}
                onChange={(e) => {
                  const val = Number(e.target.value) || 0;
                  setRequestedQty(val);
                  if (status.toLowerCase().includes('onaylı')) setApprovedQty(val);
                }}
                className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                Onaylı (Emirde)
              </label>
              <input
                type="number"
                value={approvedQty}
                onChange={(e) => setApprovedQty(Number(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                Geçmiş İРС Alınan
              </label>
              <input
                type="number"
                min={0}
                value={legacyIrsQty}
                onChange={(e) => setLegacyIrsQty(Number(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                Yeni Kullanım (MOB)
              </label>
              <input
                type="number"
                min={0}
                value={openingNewUse}
                onChange={(e) => setOpeningNewUse(Number(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                Vize Uzatımı
              </label>
              <input
                type="number"
                min={0}
                value={extensionsUse}
                onChange={(e) => setExtensionsUse(Number(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">Not / Koment</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Örn: 30 İADE EDİLDİ / 2027 revize talep"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs bg-teal-600 hover:bg-teal-700 text-white font-medium cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor...' : 'Kota Kaydını Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
   4. KRİTİK KOTA AZALDI BİLDİRİM AYARLARI MODALI (Telegram + E-Posta)
   ============================================================================ */
export function QuotaAlertSettingsModal({
  open,
  onClose,
  settings,
  criticalCount,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  settings: QuotaAlertSettings;
  criticalCount: number;
  onSaved: (msg: string) => void;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [lowIrsQty, setLowIrsQty] = useState(settings.lowIrsThresholdQty);
  const [lowQuotaPct, setLowQuotaPct] = useState(settings.lowQuotaThresholdPct);
  const [expiryDays, setExpiryDays] = useState(settings.expiryWarningDays);
  const [notifyTelegram, setNotifyTelegram] = useState(settings.notifyTelegram);
  const [notifyEmail, setNotifyEmail] = useState(settings.notifyEmail);
  const [recipientEmails, setRecipientEmails] = useState(settings.recipientEmails);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEnabled(settings.enabled);
    setLowIrsQty(settings.lowIrsThresholdQty);
    setLowQuotaPct(settings.lowQuotaThresholdPct);
    setExpiryDays(settings.expiryWarningDays);
    setNotifyTelegram(settings.notifyTelegram);
    setNotifyEmail(settings.notifyEmail);
    setRecipientEmails(settings.recipientEmails || '');
  }, [open, settings]);

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_alert_settings',
          settings: {
            enabled,
            lowIrsThresholdQty: lowIrsQty,
            lowQuotaThresholdPct: lowQuotaPct,
            expiryWarningDays: expiryDays,
            notifyTelegram,
            notifyEmail,
            recipientEmails,
          },
        }),
      });
      const json = await res.json();
      if (json?.success) {
        onSaved(json.message);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_test_alert' }),
      });
      const json = await res.json();
      onSaved(json.message || 'Kritik kota uyarısı tetiklendi.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-[#1A363E] to-rose-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-amber-300" />
            <div>
              <h3 className="text-sm font-semibold">
                Kritik Kota & ИРС Azaldı Bildirim Ayarları
              </h3>
              <p className="text-[11px] text-slate-300">
                Yalnızca kontenjan kritik eşiğin altına düştüğünde veya süre yaklaştığında bildirim gider.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <span className="text-xs font-medium text-slate-800 dark:text-white">
              Otomatik Kritik Kota Bildirimleri Aktif
            </span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-teal-600 cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                Kalan İРС Eşiği (≤ Kişi)
              </label>
              <input
                type="number"
                min={1}
                value={lowIrsQty}
                onChange={(e) => setLowIrsQty(Number(e.target.value) || 15)}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                Kalan Kota Eşiği (≤ %)
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={lowQuotaPct}
                onChange={(e) => setLowQuotaPct(Number(e.target.value) || 15)}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                Süre Uyarısı (≤ Gün)
              </label>
              <input
                type="number"
                min={1}
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value) || 30)}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyTelegram}
                onChange={(e) => setNotifyTelegram(e.target.checked)}
                className="accent-teal-600"
              />
              <span>Telegram Bot Bildirimi</span>
            </label>
            <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.checked)}
                className="accent-teal-600"
              />
              <span>Kurumsal E-Posta Bildirimi</span>
            </label>
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
              Özel E-Posta Alıcıları (Virgülle ayırın — boş bırakılırsa mevcut İK bildirim listesi kullanılır)
            </label>
            <input
              type="text"
              value={recipientEmails}
              onChange={(e) => setRecipientEmails(e.target.value)}
              placeholder="ornek@pondera.ru, ik@pondera.ru"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          {criticalCount > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Şu anda eşik altında {criticalCount} kritik kota kalemi var.</span>
              </div>
              <button
                type="button"
                disabled={testing}
                onClick={handleSendTest}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Send className="w-3 h-3" />
                {testing ? 'Gönderiliyor...' : 'Şimdi Uyarı Gönder'}
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              Kapat
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs bg-teal-600 hover:bg-teal-700 text-white font-medium cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

