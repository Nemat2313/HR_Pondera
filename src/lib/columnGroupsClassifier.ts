export const ORDERED_COLUMN_GROUPS = [
  '1. Temel & Kimlik Bilgileri',
  '2. Pozisyon & Şantiye Görev',
  '3. Pasaport Evrakları',
  '4. Vize & Davetiye Evrakları',
  '5. Propusk (Saha Giriş Kartı)',
  '6. Migrasyon & Registrasyon',
  '7. Patent & Çalışma İzni',
  '8. Daktiloskopiya (Parmak İzi)',
  '9. Vergi & SNILS / INN',
  '10. İş Sözleşmesi & Resmi Bordro',
  '11. İSG, HSE & Dil Sertifikaları',
  '12. Sağlık, Medikal & DMS',
  '13. Karantina & Medikal Testler',
  '14. Konaklama, Kamp & Ulaşım',
  '15. İletişim & Adres Bilgileri',
  '16. İşten Çıkış & Fesih',
] as const;

export type PonderaColumnGroupName = (typeof ORDERED_COLUMN_GROUPS)[number];

function normalizeTr(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function isPlaceholderColumnName(colName: string): boolean {
  const trimmed = String(colName || '').trim();
  return !trimmed || /^col_\d+$/i.test(trimmed);
}

export function classifyPonderaColumnGroup(colName: string): PonderaColumnGroupName {
  const n = normalizeTr(colName);

  // 13. Karantina & Medikal Testler (check before Çıkış Tarihi because of Karantina Çıkış Tarihi)
  if (
    n.includes('karantina') ||
    n.includes('pcr') ||
    n.includes('antikor') ||
    n.includes('revirde') ||
    n.includes('kontakt durumu')
  ) {
    return '13. Karantina & Medikal Testler';
  }

  // 6. Migrasyon & Registrasyon (check before Çıkış Tarihi because of Registrasyon Çıkış Tarihi)
  if (
    n.includes('migrasyon') ||
    n.includes('registrasyon') ||
    n.includes('sinir kapisi')
  ) {
    return '6. Migrasyon & Registrasyon';
  }

  // 10. İş Sözleşmesi & Resmi Bordro (check before Çıkış Tarihi because of Resmi Çıkış Tarihi)
  if (
    n.includes('sozlesme') ||
    n.includes('dop sog') ||
    n.startsWith('resmi ') ||
    n.includes('eski resmi') ||
    n.includes('ise giris emri') ||
    n.includes('ise giris bildirgesi')
  ) {
    return '10. İş Sözleşmesi & Resmi Bordro';
  }

  // 16. İşten Çıkış & Fesih
  if (
    n === 'cikis tarihi' ||
    n === 'cikis sebebi' ||
    n === 'tahmini cikis tarihi' ||
    n.includes('isten cikis') ||
    n.includes('fesih')
  ) {
    return '16. İşten Çıkış & Fesih';
  }

  // 3. Pasaport Evrakları
  if (
    n.includes('pasaport') ||
    n.includes('passport') ||
    n.includes('kodpozdravleniya')
  ) {
    return '3. Pasaport Evrakları';
  }

  // 4. Vize & Davetiye Evrakları
  if (n.includes('vize') || n.includes('davetiye')) {
    return '4. Vize & Davetiye Evrakları';
  }

  // 5. Propusk (Saha Giriş Kartı)
  if (n.includes('propusk')) {
    return '5. Propusk (Saha Giriş Kartı)';
  }

  // 7. Patent & Çalışma İzni
  if (
    n.includes('patent') ||
    n.includes('calisma kart') ||
    n.includes('rnr')
  ) {
    return '7. Patent & Çalışma İzni';
  }

  // 8. Daktiloskopiya (Parmak İzi)
  if (
    n.includes('daktilo') ||
    n.includes('gosuslug') ||
    n.includes('biometri')
  ) {
    return '8. Daktiloskopiya (Parmak İzi)';
  }

  // 9. Vergi & SNILS / INN
  if (
    n.includes('inn ') ||
    n === 'inn no' ||
    n.includes('cnils') ||
    n.includes('snils') ||
    n.includes('nfs ') ||
    n.endsWith(' nfs')
  ) {
    return '9. Vergi & SNILS / INN';
  }

  // 11. İSG, HSE & Dil Sertifikaları
  if (
    n.includes('hse') ||
    n.includes('isg') ||
    n.includes('dil sinav') ||
    n.includes('dil sertifika')
  ) {
    return '11. İSG, HSE & Dil Sertifikaları';
  }

  // 12. Sağlık, Medikal & DMS
  if (
    n.includes('dms') ||
    n.includes('saglik') ||
    n.includes('psikoloji') ||
    n.includes('kan test') ||
    n.includes('narkoloji') ||
    n.includes('rontgen') ||
    n.startsWith('asi ') ||
    n.startsWith('asidan ')
  ) {
    return '12. Sağlık, Medikal & DMS';
  }

  // 14. Konaklama, Kamp & Ulaşım
  if (
    n.includes('kamp') ||
    n === 'oda no' ||
    n === 'blok no' ||
    n === 'yatak no' ||
    n.includes('ucus ') ||
    n.includes('izine gidis') ||
    n.includes('izin donus')
  ) {
    return '14. Konaklama, Kamp & Ulaşım';
  }

  // 15. İletişim & Adres Bilgileri
  if (
    n.includes('telefon') ||
    n.includes('mail') ||
    n.includes('adres') ||
    n.includes('acil durum') ||
    n.includes('genel notlar')
  ) {
    return '15. İletişim & Adres Bilgileri';
  }

  // 2. Pozisyon & Şantiye Görev
  if (
    n === 'region' ||
    n === 'proje adi' ||
    n.includes('calisma lokasyon') ||
    n.includes('mevcut bulundugu yer') ||
    n === 'kategori' ||
    n === 'firma' ||
    n === 'departman' ||
    n.includes('gorevi') ||
    n === 'ek gorev' ||
    n === 'sorumlu kisi' ||
    n === 'grup sefi' ||
    n.includes('endirekt') ||
    n.includes('gunduz / gece') ||
    n.includes('transfer') ||
    n.includes('sibur kpp') ||
    n.includes('personel puan')
  ) {
    return '2. Pozisyon & Şantiye Görev';
  }

  // 1. Temel & Kimlik Bilgileri
  return '1. Temel & Kimlik Bilgileri';
}

