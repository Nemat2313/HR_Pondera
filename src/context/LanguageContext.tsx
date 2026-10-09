'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'tr' | 'ru';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
  translateCol: (colName: string) => string;
  translateVal: (val: string) => string;
  translateGroup: (groupName: string) => string;
}

const translations: Record<string, { tr: string; ru: string }> = {
  // Navigation & Menus
  nav_overview: { tr: 'Genel Dashboard', ru: 'Главная панель' },
  nav_compliance: { tr: 'Evrak & Süre Analitiği', ru: 'Аналитика документов и сроков' },
  nav_personnel: { tr: 'Personel Listesi', ru: 'Список персонала' },
  nav_sites: { tr: 'Şantiye & Projeler', ru: 'Участки и Проекты' },
  nav_demographics: { tr: 'Demografi & İstatistik', ru: 'Демография и Статистика' },
  nav_turnover: { tr: 'Yönetim & Turnover', ru: 'Текучесть и Управление' },
  nav_database: { tr: 'Excel & Veritabanı', ru: 'Excel и База данных' },
  nav_admin: { tr: 'Kullanıcı & RLS', ru: 'Пользователи и RLS' },
  nav_main_menu: { tr: 'ANA MENÜ', ru: 'ГЛАВНОЕ МЕНЮ' },
  nav_db_secure: { tr: 'Pondera Güvenli DB', ru: 'Безопасная БД Pondera' },
  nav_db_sub: { tr: 'SQLite In-Memory Hızında', ru: 'Быстрая база SQLite' },
  badge_kpi: { tr: 'KPI', ru: 'KPI' },
  badge_new: { tr: 'Yeni', ru: 'Новое' },
  badge_report: { tr: 'Rapor', ru: 'Отчет' },
  badge_admin: { tr: 'Admin', ru: 'Админ' },

  // Topbar
  search_placeholder: { tr: 'Personel ara... (Ad, Sicil, Pasaport)', ru: 'Поиск персонала... (ФИО, Табельный, Паспорт)' },
  btn_find: { tr: 'Bul', ru: 'Найти' },
  btn_filter: { tr: 'Filtre', ru: 'Фильтр' },
  mode_light: { tr: 'Light', ru: 'Светлая' },
  mode_dark: { tr: 'Dark', ru: 'Темная' },
  status_active: { tr: 'Mevcut', ru: 'В штате' },
  status_exited: { tr: 'Çıkışlılar', ru: 'Уволенные' },
  label_data_date: { tr: 'Veri:', ru: 'Данные:' },
  btn_upload_excel: { tr: 'Excel Yükle', ru: 'Загрузить Excel' },
  rls_all_sites: { tr: 'Tüm Şantiyeler', ru: 'Все участки' },
  rls_unlimited: { tr: 'Tüm Şantiyeler (Sınırsız)', ru: 'Все участки (Без ограничений)' },
  user_admin_title: { tr: 'Sistem Yöneticisi (Admin)', ru: 'Системный администратор' },
  btn_logout: { tr: 'Oturumu Kapat', ru: 'Выйти' },
  notifications_title: { tr: 'Bildirimler', ru: 'Уведомления' },
  notifications_critical: { tr: 'Kritik Süre Uyarıları', ru: 'Критические сроки документов' },
  notifications_none: { tr: 'Yeni bildirim yok', ru: 'Нет новых уведомлений' },

  // Filter Bar
  filter_all_regions: { tr: 'Tüm Bölgeler', ru: 'Все регионы' },
  filter_all_projects: { tr: 'Tüm Projeler', ru: 'Все проекты' },
  filter_all_departments: { tr: 'Tüm Departmanlar', ru: 'Все отделы' },
  filter_all_categories: { tr: 'Tüm Kategoriler', ru: 'Все категории' },
  filter_all_nationalities: { tr: 'Tüm Uyruklar', ru: 'Все гражданства' },
  filter_all_collars: { tr: 'Tüm Yakalar', ru: 'Все категории персонала' },
  filter_all_titles: { tr: 'Tüm Ünvanlar', ru: 'Все должности' },
  filter_all_firms: { tr: 'Tüm Firmalar', ru: 'Все компании' },
  filter_clear_all: { tr: 'Filtreleri Temizle', ru: 'Сбросить фильтры' },
  filter_active_count: { tr: 'Aktif Filtre', ru: 'Активных фильтров' },

  // Overview / Hero KPIs
  kpi_total_personnel: { tr: 'Toplam Personel', ru: 'Всего персонала' },
  kpi_total_sub: { tr: 'Tüm şantiyeler ve merkez kadro', ru: 'Все объекты и головной офис' },
  kpi_active_field: { tr: 'Aktif Saha Gücü', ru: 'Активный персонал на объектах' },
  kpi_active_sub: { tr: 'Sahada fiilen çalışan iş gücü', ru: 'Сотрудники, работающие на объектах' },
  kpi_sites_regions: { tr: 'Şantiye & Bölge', ru: 'Участки и Регионы' },
  kpi_sites_sub: { tr: 'Aktif proje lokasyonları', ru: 'Действующие локации проектов' },
  kpi_subcon: { tr: 'Alt Yüklenici & Taşeron', ru: 'Субподрядчики и Партнеры' },
  kpi_subcon_sub: { tr: 'Kadro dışı anlaşmalı firma', ru: 'Сторонние подрядные организации' },
  kpi_avg_tenure: { tr: 'Kıdem Ortalaması', ru: 'Средний стаж' },
  kpi_avg_tenure_sub: { tr: 'Şirket içi tecrübe süresi', ru: 'Средний стаж работы в компании' },
  kpi_avg_age: { tr: 'Yaş Ortalaması', ru: 'Средний возраст' },
  kpi_avg_age_sub: { tr: 'Dinamik kadro ortalaması', ru: 'Средний возраст коллектива' },
  unit_years: { tr: 'Yıl', ru: 'лет' },
  unit_age: { tr: 'Yaş', ru: 'лет' },
  unit_person: { tr: 'Kişi', ru: 'чел.' },
  btn_see_detail: { tr: 'Detay Gör', ru: 'Подробнее' },
  btn_see_in_list: { tr: 'Listede Gör', ru: 'В списке' },

  // Decomposition Tree
  decomp_title: { tr: 'Dinamik Kırılım Ağacı (Decomposition Tree)', ru: 'Дерево декомпозиции персонала (Decomposition Tree)' },
  decomp_sub: { tr: 'İş gücünü bölge, proje, departman ve uyruk seviyesinde hiyerarşik analiz edin', ru: 'Иерархический анализ численности по регионам, проектам, отделам и гражданству' },
  decomp_root: { tr: 'Toplam Personel', ru: 'Всего персонала' },
  decomp_select_region: { tr: 'Bölge Seçin', ru: 'Выберите регион' },
  decomp_project_dist: { tr: 'Proje Dağılımı', ru: 'Распределение по проектам' },
  decomp_dept_dist: { tr: 'Departman Kırılımı', ru: 'Разбивка по отделам' },
  decomp_nat_dist: { tr: 'Uyruk & Personel Listesi', ru: 'Гражданство и список персонала' },

  // Organization Funnel (7-tier pyramid)
  funnel_title: { tr: 'Hiyerarşik Teşkilat Piramidi (Organization Funnel)', ru: 'Иерархическая пирамида структуры (Organization Funnel)' },
  funnel_sub: { tr: 'Yönetim zirvesinden saha icrasına doğru 7 kademeli piramidal dağılım', ru: '7-уровневое распределение от руководства до полевых рабочих' },
  funnel_peak: { tr: 'YÖNETİM KADEMESİ (ZİRVE)', ru: 'РУКОВОДЯЩИЙ СОСТАВ (ТОП)' },
  funnel_l1: { tr: 'Mühendis / Teknik Ofis', ru: 'Инженеры / Технический офис' },
  funnel_l2: { tr: 'Uzman / Müfettiş', ru: 'Специалисты / Инспекторы' },
  funnel_l3: { tr: 'Formen / Ekipbaşı', ru: 'Бригадиры / Мастера' },
  funnel_l4: { tr: 'Nitelikli Usta / Montajcı', ru: 'Квалифицированные рабочие / Монтажники' },
  funnel_l5: { tr: 'Saha Personeli / Düz İşçi', ru: 'Полевой персонал / Рабочие' },
  funnel_note: { tr: 'Saha personeli ve usta kadrosu piramidin ana tabanını (%89.1) oluşturur', ru: 'Полевой персонал и рабочие составляют основу пирамиды (89.1%)' },
  funnel_tag: { tr: '7 Kademeli Teşkilat', ru: '7 Уровней структуры' },

  // Age Demographics Chart
  age_title: { tr: 'Demografik Yaş Piramidi & Kuşak Analizi', ru: 'Демографическая пирамида возраста и анализ поколений' },
  age_sub: { tr: 'Çalışanların yaş grupları ve kuşak dağılımı (Demographic Longevity)', ru: 'Распределение сотрудников по возрастным группам и поколениям' },
  age_avg_pill: { tr: 'Ort. 34.9 Yaş', ru: 'Ср. 34.9 года' },
  age_under_25: { tr: '< 25 Yaş', ru: '< 25 лет' },
  age_under_25_group: { tr: 'Gen Z / Genç Yetenek', ru: 'Поколение Z / Молодые кадры' },
  age_25_34: { tr: '25 - 34 Yaş', ru: '25 - 34 года' },
  age_25_34_group: { tr: 'Y Kuşağı / Dinamik Kadro', ru: 'Поколение Y / Основной костяк' },
  age_35_44: { tr: '35 - 44 Yaş', ru: '35 - 44 года' },
  age_35_44_group: { tr: 'Deneyimli Saha Gücü', ru: 'Опытный производственный состав' },
  age_45_54: { tr: '45 - 54 Yaş', ru: '45 - 54 года' },
  age_45_54_group: { tr: 'Uzman & Usta Kademesi', ru: 'Ведущие специалисты и наставники' },
  age_55_plus: { tr: '55+ Yaş', ru: '55+ лет' },
  age_55_plus_group: { tr: 'Kıdemli Danışman & Mentor', ru: 'Старшие консультанты и эксперты' },
  age_sparkle_note: { tr: "Kadronun %73.1'i 25-44 yaş aralığında dinamik üretim gücündedir", ru: '73.1% штата находится в возрасте 25–44 лет — максимальная продуктивность' },
  age_benchmark: { tr: 'Global Benchmark: Uyumlu', ru: 'Мировой бенчмарк: Соответствует' },

  // Dual Donuts & Rankings
  donut_nationality: { tr: 'Uyruk & Milliyet Dağılımı', ru: 'Распределение по гражданствам' },
  donut_collar: { tr: 'Mavi / Beyaz Yaka Dağılımı', ru: 'Распределение: Синие / Белые воротнички' },
  collar_blue: { tr: 'Mavi Yaka (Saha & Üretim)', ru: 'Синий воротничок (Полевой персонал)' },
  collar_white: { tr: 'Beyaz Yaka (Yönetim & Ofis)', ru: 'Белый воротничок (ИТР и Офис)' },
  firms_title: { tr: 'Firma & Taşeron Ekosistemi', ru: 'Экосистема компаний и субподрядчиков' },
  firms_sub: { tr: 'Proje operasyonlarının ana yürütücü kuruluşu', ru: 'Генеральный подрядчик и субподрядчики' },
  firms_all: { tr: 'Tüm Taşeronlar', ru: 'Все субподрядчики' },
  tenure_title: { tr: 'Şirket İçi Kıdem Dağılımı (Histogram)', ru: 'Распределение по стажу работы в компании (Гистограмма)' },
  tenure_sub: { tr: 'Şantiye fazlarına göre işe alımlar 0-1 yılda (%69) kümelenmiştir', ru: 'По этапам проектов найм сконцентрирован на 0-1 году (69%)' },
  tenure_curve: { tr: 'Tecrübe Eğrisi', ru: 'Кривая опыта' },
  regions_ranking_title: { tr: 'Bölge & Şantiye İş Gücü Yoğunluğu', ru: 'Численность персонала по регионам и объектам' },

  // Personnel Table Headers & Labels
  table_title: { tr: 'Personel Veritabanı & Liste', ru: 'База данных и список персонала' },
  table_subtitle: { tr: '198 kolonluk tam veri yapısı, evrak bazlı grup seçimi ve dinamik arama', ru: 'Полная структура из 198 колонок, выбор групп документов и динамический поиск' },
  table_column_picker_btn: { tr: 'Kolon Seçici', ru: 'Выбор колонок' },
  table_download_excel: { tr: 'Excel İndir (.xlsx)', ru: 'Скачать Excel (.xlsx)' },
  table_preparing_excel: { tr: 'Excel Hazırlanıyor...', ru: 'Подготовка Excel...' },
  table_records_count: { tr: 'Kayıt', ru: 'Записей' },
  table_search: { tr: 'Personel Ara...', ru: 'Поиск персонала...' },
  table_groups_title: { tr: 'Evrak & Bilgi Grupları (16 Grup):', ru: 'Группы документов и данных (16 групп):' },
  table_groups_subtitle: { tr: 'Tabloda görmek istediğiniz evrak türlerini tek tıkla seçin', ru: 'Выберите категории документов для отображения в таблице' },
  table_expand_groups: { tr: 'Tüm Grupları Ekrana Aç (16 Grup)', ru: 'Развернуть все группы (16 групп)' },
  table_compact_groups: { tr: 'Kompakt Kaydırıcı', ru: 'Компактный вид' },
  table_total_listed: { tr: 'personel listeleniyor', ru: 'сотрудников отображается' },
  table_total_prefix: { tr: 'Toplam', ru: 'Всего' },
  table_page: { tr: 'Sayfa', ru: 'Страница' },
  table_prev: { tr: 'Önceki', ru: 'Назад' },
  table_next: { tr: 'Sonraki', ru: 'Вперед' },
  table_select_all: { tr: 'Tümünü Seç', ru: 'Выбрать все' },
  table_reset_default: { tr: 'Varsayılan', ru: 'По умолчанию' },
  table_clear_all: { tr: 'Tümünü Kaldır', ru: 'Снять все' },
  table_loading: { tr: 'Veriler taranıyor...', ru: 'Загрузка данных...' },
  table_no_data: { tr: 'Kriterlere uygun personel bulunamadı.', ru: 'Сотрудники по заданным критериям не найдены.' },
  table_action_col: { tr: 'İşlem', ru: 'Действие' },
  table_picker_drawer_title: { tr: '198 Kolonluk Evrak & Bilgi Seçici', ru: 'Выбор из 198 колонок документов и данных' },
  table_picker_search_ph: { tr: 'Kolon adı ara (örn: Pasaport, Maaş, Vize)...', ru: 'Поиск колонки (напр. Паспорт, Оклад, Виза)...' },

  // Compliance / Evrak & Süre
  comp_title: { tr: 'Evrak & Süre Analitiği', ru: 'Аналитика документов и сроков' },
  comp_sub: { tr: 'Pasaport, Vize, Patent ve Oturum İzinlerinin Süre Riski İzleme Merkezi', ru: 'Центр контроля сроков действия паспортов, виз, патентов и разрешений' },
  comp_compliance_rate: { tr: 'Genel Uyum', ru: 'Общее соответствие' },
  comp_expired: { tr: 'Süresi Dolmuş', ru: 'Просрочено' },
  comp_critical_urgent: { tr: '0-15 Gün (Acil)', ru: '0-15 дней (Срочно)' },
  comp_warning: { tr: '16-30 Gün', ru: '16-30 дней' },
  comp_missing: { tr: 'Eksik Evrak', ru: 'Отсутствует документ' },
  comp_active_workforce: { tr: 'Aktif Kadro', ru: 'Активный штат' },
  comp_0_30: { tr: '0 - 30 Gün', ru: '0 - 30 дней' },
  comp_31_60: { tr: '31 - 60 Gün', ru: '31 - 60 дней' },
  comp_61_90: { tr: '61 - 90 Gün', ru: '61 - 90 дней' },
  comp_safe: { tr: 'Güvenli (90+ Gün)', ru: 'Действительно (90+ дней)' },
  comp_passport: { tr: 'Pasaport Süresi', ru: 'Срок действия паспорта' },
  comp_visa: { tr: 'Vize Süresi', ru: 'Срок действия визы' },
  comp_patent: { tr: 'Patent Süresi', ru: 'Срок действия патента' },
  comp_chart1_title: { tr: 'Evrak Türlerine Göre Geçerlilik Dağılımı', ru: 'Распределение документов по срокам действия' },
  comp_chart2_title: { tr: 'Bölge Bazlı Risk Durumu', ru: 'Оценка рисков по регионам' },
  comp_chart3_title: { tr: 'Uyruk Bazlı Kritik Evraklar', ru: 'Критические документы по гражданствам' },
  comp_table_title: { tr: 'Detaylı Evrak & Süre Takip Tablosu', ru: 'Подробная таблица контроля сроков документов' },

  // Demographics / Eurasia Map
  demo_title: { tr: 'Demografi & Çalışan Profili', ru: 'Демография и профиль сотрудников' },
  demo_sub: { tr: 'Personelin küresel uyruk haritası, cinsiyet oranları, yaka türü ve çalışma kategorisi analitikleri.', ru: 'Глобальная карта гражданства персонала, соотношение полов, категории персонала и аналитика.' },
  demo_badge: { tr: 'Çok Uluslu Kadro', ru: 'Многонациональный штат' },
  demo_gender_title: { tr: 'Cinsiyet Dağılımı', ru: 'Распределение по полу' },
  demo_gender_male: { tr: 'Erkek', ru: 'Мужчины' },
  demo_gender_female: { tr: 'Kadın', ru: 'Женщины' },
  demo_gender_note: { tr: 'Ağır sanayi & şantiye koşulları gereği kadronun büyük bölümü sahada çalışmaktadır.', ru: 'В связи с тяжелыми промышленными и строительными условиями большая часть персонала работает на объектах.' },
  demo_category_title: { tr: 'Kategori Dağılımı', ru: 'Распределение по категориям' },
  demo_category_note: { tr: "Ekspat ve SNG çalışanlar toplam mevcudun %93'ünü oluşturmaktadır.", ru: 'Экспаты и граждане СНГ составляют 93% от общей численности.' },
  demo_hse_title: { tr: 'İSG & Sağlık Uyumu', ru: 'Охрана труда и здоровье' },
  demo_hse_exam: { tr: 'Periyodik Muayene', ru: 'Периодический медосмотр' },
  demo_hse_training: { tr: 'İSG Eğitimi Tamam', ru: 'Инструктаж по ТБ пройден' },
  demo_hse_note: { tr: 'Şantiyeye giriş yapacak tüm personelin yasal İSG evrakları tamdır.', ru: 'Все сотрудники на стройплощадке имеют полный комплект документов по ТБ.' },

  // Login Modal
  login_title: { tr: 'Pondera HR Giriş & RLS Erişimi', ru: 'Вход в Pondera HR и доступ RLS' },
  login_sub: { tr: 'Bölge ve Proje bazlı Row-Level Security (RLS) ile güvenli giriş yapın', ru: 'Безопасный вход с разграничением прав доступа (RLS) по объектам' },
  login_fast_title: { tr: 'HIZLI GİRİŞ (DEMO HESAPLAR):', ru: 'БЫСТРЫЙ ВХОД (ДЕМО-ПРОФИЛИ):' },
  login_admin_desc: { tr: 'Tüm Şantiyeler & Kullanıcı Yönetimi', ru: 'Все участки и управление пользователями' },
  login_kazan_desc: { tr: 'Yalnızca Kazan Bölgesi (2.258 Personel)', ru: 'Только объект Казань (2.258 сотрудников)' },
  login_svobodny_desc: { tr: 'Yalnızca Svobodny-AGHK (1.215 Personel)', ru: 'Только объект Свободный-АГХК (1.215 сотрудников)' },
  login_ustluga_desc: { tr: 'Yalnızca Ust Luga (720 Personel)', ru: 'Только объект Усть-Луга (720 сотрудников)' },
  login_dgp2_desc: { tr: 'Yalnızca Tobolsk DGP-2 Projesi (1.125 Personel)', ru: 'Только проект Тобольск ДГП-2 (1.125 сотрудников)' },
  login_or_manual: { tr: 'VEYA MANUEL GİRİŞ', ru: 'ИЛИ РУЧНОЙ ВХОД' },
  login_email: { tr: 'E-Posta Adresi', ru: 'Электронная почта' },
  login_password: { tr: 'Şifre', ru: 'Пароль' },
  login_btn: { tr: 'Giriş Yap', ru: 'Войти' },
  login_loading: { tr: 'Pondera HR Yükleniyor...', ru: 'Загрузка Pondera HR...' },

  // Excel Upload Modal
  upload_modal_title: { tr: 'Excel Veri Yükleme & Güncelleme', ru: 'Загрузка и обновление данных Excel' },
  upload_modal_sub: { tr: 'EBA veya sistemden alınan Excel dökümünü yükleyin', ru: 'Загрузите выгрузку персонала из EBA или кадровой системы' },
  upload_date_label: { tr: 'Rapor / Veri Tarihi', ru: 'Дата отчета / данных' },
  upload_drag_drop: { tr: 'Excel dosyasını buraya sürükleyin veya tıklayarak seçin', ru: 'Перетащите Excel-файл сюда или нажмите для выбора' },
  upload_btn_start: { tr: 'Veritabanını Güncelle', ru: 'Обновить базу данных' },
  upload_close: { tr: 'Kapat', ru: 'Закрыть' },
};

// Column Name Dictionary (Turkish to Russian)
const columnDictionaryRu: Record<string, string> = {
  // Identity & Core
  'Sıra No': '№ п/п',
  'sira_no': '№ п/п',
  'Sicil No': 'Табельный №',
  'sicil_no': 'Табельный №',
  'Şirket ID': 'ID Компании',
  'sirket_id': 'ID Компании',
  'rhi_id': 'ID Компании',
  'Saren No': 'Saren №',
  'saren_no': 'Saren №',
  'Genel Durumu': 'Общий статус',
  'genel_durum': 'Общий статус',
  'Güncel Durumu': 'Текущий статус',
  'guncel_durum': 'Текущий статус',
  'Uyruk': 'Гражданство',
  'uyruk': 'Гражданство',
  'Ad Soyad': 'ФИО',
  'ad_soyad': 'ФИО',
  'Adı': 'Имя',
  'adi': 'Имя',
  'Soyadı': 'Фамилия',
  'soyadi': 'Фамилия',
  'Baba Adı': 'Отчество',
  'baba_adi': 'Отчество',
  'Tam Adı (Kiril)': 'ФИО (Кириллица)',
  'tam_adi_kiril': 'ФИО (Кириллица)',
  'Cinsiyet': 'Пол',
  'cinsiyet': 'Пол',
  'Doğum Tarihi': 'Дата рождения',
  'dogum_tarihi': 'Дата рождения',
  'Doğum Yeri': 'Место рождения',
  'dogum_yeri': 'Место рождения',
  'TC Kimlik No': 'Номер удостоверения / ИНН',
  'tc_kimlik_no': 'Номер удостоверения / ИНН',
  'İşe Giriş Tarihi': 'Дата приема',
  'ise_giris_tarihi': 'Дата приема',
  'Şantiye Giriş Tarihi': 'Дата прибытия на объект',
  'santiye_giris_tarihi': 'Дата прибытия на объект',
  'İşten Çıkış Tarihi': 'Дата увольнения',
  'isten_cikis_tarihi': 'Дата увольнения',
  'Çıkış Nedeni': 'Причина увольнения',
  'cikis_nedeni': 'Причина увольнения',

  // Project & Assignment
  'Görevi': 'Должность',
  'gorevi': 'Должность',
  'Görevi / Pozisyon': 'Должность / Профессия',
  'Proje Adı': 'Название проекта',
  'proje_adi': 'Название проекта',
  'Bölge': 'Регион / Участок',
  'bolge': 'Регион / Участок',
  'Region': 'Регион',
  'region': 'Регион',
  'Bölge & Proje': 'Регион и проект',
  'Departman': 'Отдел',
  'departman': 'Отдел',
  'Firma': 'Компания',
  'firma': 'Компания',
  'Kategori': 'Категория',
  'kategori': 'Категория',
  'Yaka': 'Категория персонала',
  'yaka': 'Категория персонала',
  'Meslek': 'Профессия',
  'meslek': 'Профессия',
  'Pozisyon': 'Позиция',
  'pozisyon': 'Позиция',
  'Ek Görev': 'Доп. должность',
  'ek_gorev': 'Доп. должность',
  'Şantiye': 'Объект / Стройплощадка',
  'santiye': 'Объект / Стройплощадка',
  'Alt Yüklenici': 'Субподрядчик',
  'alt_yuklenici': 'Субподрядчик',

  // Passport & Migration
  'Pasaport No': 'Номер паспорта',
  'pasaport_no': 'Номер паспорта',
  'Pasaport Bitiş Tarihi': 'Срок действия паспорта',
  'pasaport_bitis_tarihi': 'Срок действия паспорта',
  'Pasaport Veriliş Tarihi': 'Дата выдачи паспорта',
  'pasaport_verilis_tarihi': 'Дата выдачи паспорта',
  'Pasaport Veren Makam': 'Орган выдачи паспорта',
  'pasaport_veren_makam': 'Орган выдачи паспорта',
  'Vize No': 'Номер визы',
  'vize_no': 'Номер визы',
  'Vize Türü': 'Тип визы',
  'vize_turu': 'Тип визы',
  'Vize Bitiş Tarihi': 'Срок действия визы',
  'vize_bitis_tarihi': 'Срок действия визы',
  'Vize Başlangıç Tarihi': 'Дата начала визы',
  'vize_baslangic_tarihi': 'Дата начала визы',
  'Patent No': 'Номер патента',
  'patent_no': 'Номер патента',
  'Patent Bitiş Tarihi': 'Срок действия патента',
  'patent_bitis_tarihi': 'Срок действия патента',
  'Patent Başlangıç Tarihi': 'Дата начала патента',
  'patent_baslangic_tarihi': 'Дата начала патента',
  'Patent Mesleği': 'Профессия по патенту',
  'patent_meslegi': 'Профессия по патенту',
  'Patent Bölgesi': 'Территория действия патента',
  'patent_bolgesi': 'Территория действия патента',
  'Oturum İzni': 'ВНЖ / РВП',
  'oturum_izni': 'ВНЖ / РВП',
  'Oturum Bitiş Tarihi': 'Срок ВНЖ / РВП',
  'oturum_bitis_tarihi': 'Срок ВНЖ / РВП',
  'Propusk No': 'Номер пропуска',
  'propusk_no': 'Номер пропуска',
  'Propusk Bitiş Tarihi': 'Срок пропуска',
  'propusk_bitis_tarihi': 'Срок пропуска',
  'Daktiloskopiya': 'Дактилоскопия',
  'daktiloskopiya': 'Дактилоскопия',
  'Daktiloskopiya Tarihi': 'Дата дактилоскопии',
  'daktiloskopiya_tarihi': 'Дата дактилоскопии',

  // Official IDs & Tax
  'SNILS': 'СНИЛС',
  'snils': 'СНИЛС',
  'INN': 'ИНН',
  'inn': 'ИНН',
  'Kayıt Tarihi': 'Дата регистрации',
  'kayit_tarihi': 'Дата регистрации',
  'Kayıt Bitiş Tarihi': 'Срок регистрации',
  'kayit_bitis_tarihi': 'Срок регистрации',
  'Kayıt Adresi': 'Адрес регистрации',
  'kayit_adresi': 'Адрес регистрации',

  // Health & HSE
  'Tıbbi Muayene': 'Медосмотр',
  'tibbi_muayene': 'Медосмотр',
  'Muayene Bitiş Tarihi': 'Срок медосмотра',
  'muayene_bitis_tarihi': 'Срок медосмотра',
  'İSG Eğitimi': 'Обучение по ОТ и ТБ',
  'isg_egitimi': 'Обучение по ОТ и ТБ',
  'İSG Belge No': '№ удостоверения по ТБ',
  'isg_belge_no': '№ удостоверения по ТБ',
  'Kan Grubu': 'Группа крови',
  'kan_grubu': 'Группа крови',
  'Aşı Bilgisi': 'Данные о вакцинации',
  'asi_bilgisi': 'Данные о вакцинации',

  // Contract & Payroll
  'Sözleşme Türü': 'Тип договора',
  'sozlesme_turu': 'Тип договора',
  'Sözleşme Bitiş': 'Окончание договора',
  'sozlesme_bitis': 'Окончание договора',
  'Sözleşme Bitiş Tarihi': 'Дата окончания договора',
  'sozlesme_bitis_tarihi': 'Дата окончания договора',
  'Maaş / Ücret': 'Оклад / Тарифная ставка',
  'maas_ucret': 'Оклад / Тарифная ставка',
  'Para Birimi': 'Валюта',
  'para_birimi': 'Валюта',

  // Contact & Living
  'Telefon': 'Телефон',
  'telefon': 'Телефон',
  'E-Posta': 'Эл. почта',
  'eposta': 'Эл. почта',
  'Adres': 'Адрес',
  'adres': 'Адрес',
  'Kamp Adı': 'Вахтовый городок / Общежитие',
  'kamp_adi': 'Вахтовый городок / Общежитие',
  'Oda No': 'Комната №',
  'oda_no': 'Комната №',
  'Yatak No': 'Место / Койка №',
  'yatak_no': 'Место / Койка №',
  'Askerlik': 'Воинский учет',
  'askerlik': 'Воинский учет',
  'Eğitim': 'Образование',
  'egitim': 'Образование',

  // Table Common Headers
  'Belge No': '№ документа',
  'Bitiş Tarihi': 'Срок действия',
  'Kalan Gün': 'Осталось дней',
  'Durum Rozeti': 'Статус',
  'İşlem': 'Действие',
  'Evrak Türü': 'Тип документа',
  'Metrik / Tablo': 'Метрика / Таблица',
  'Değer': 'Значение',
  'Açıklama': 'Описание',
  'Durum': 'Статус',
  'durum': 'Статус',
};

// Column Group Categories (Turkish to Russian)
const columnGroupDictionaryRu: Record<string, string> = {
  '1. Temel & Kimlik Bilgileri': '1. Основная информация и паспортные данные',
  '2. Şantiye & Görev Bilgileri': '2. Объект и должностные данные',
  '3. Pasaport & Kimlik Belgeleri': '3. Паспорт и удостоверения личности',
  '4. Vize & Oturum İzni (RVP/VNJ)': '4. Виза и вид на жительство (РВП/ВНЖ)',
  '5. Çalışma İzni & Patent Bilgileri': '5. Разрешение на работу и патент',
  '6. Giriş & Çıkış Tarihleri': '6. Даты прибытия и убытия',
  '7. Sözleşme & Bordro Bilgileri': '7. Трудовой договор и оплата',
  '8. İletişim & Acil Durum': '8. Контакты и экстренная связь',
  '9. Sağlık & İSG Belgeleri': '9. Охрана труда и медицинские справки',
  '10. Konaklama & Kamp Bilgileri': '10. Проживание и вахтовый городок',
  '11. Banka & Finansal Bilgiler': '11. Банковские реквизиты и счета',
  '12. Eğitim & Sertifikalar': '12. Образование и квалификация',
  '13. Disiplin & Sicil Notları': '13. Дисциплина и служебные отметки',
  '14. Ulaşım & Bilet Bilgileri': '14. Проезд и билеты',
  '15. Zimmet & Ekipman Bilgileri': '15. Инвентарь и спецодежда',
  '16. Arşiv & Diğer Notlar': '16. Архив и прочие примечания',
};

// Database Value Dictionary (Values in dropdowns or statuses)
const valueDictionaryRu: Record<string, string> = {
  'Mevcut': 'В штате (Активный)',
  'Cikis': 'Уволен',
  'Çıkış': 'Уволен',
  'Sevki Iptal': 'Отмена отправки',
  'Sevki İptal': 'Отмена отправки',
  'Sevke Hazır': 'Готов к отправке',
  'Direkt': 'Прямой (Основной)',
  'Endirekt': 'Непрямой (ИТР/Офис)',
  'Beyaz Yaka': 'Белый воротничок (ИТР)',
  'Mavi Yaka': 'Синий воротничок (Рабочие)',
  'Tüm Şantiyeler': 'Все участки',
  'Tüm Bölgeler': 'Все регионы',
  'Tüm Projeler': 'Все проекты',
  'Tüm Departmanlar': 'Все отделы',
  'Tüm Kategoriler': 'Все категории',
  'Tüm Uyruklar': 'Все гражданства',
  'Tüm Yakalar': 'Все воротнички',
  'Tüm Ünvanlar': 'Все должности',
  'Tüm Firmalar': 'Все компании',
  'Tüm Durumlar': 'Все статусы',
  'Yalnızca Mevcut (Aktif)': 'Только в штате (Активные)',
  'Yalnızca Çıkış': 'Только уволенные',
  'Erkek': 'Мужчина',
  'Kadin': 'Женщина',
  'Kadın': 'Женщина',
  'Lokal': 'Местный',
  'Ekspat': 'Экспат',
  'SNG': 'СНГ',
  'Pondera Ana Kadro': 'Основной штат Pondera',
  'Taşeronlar': 'Субподрядчики',
};

const LanguageContext = createContext<LanguageContextType>({
  lang: 'tr',
  setLang: () => {},
  t: (key: string, fallback?: string) => fallback || key,
  translateCol: (col: string) => col,
  translateVal: (val: string) => val,
  translateGroup: (group: string) => group,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('tr');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('pondera_lang') as Language;
      if (stored === 'tr' || stored === 'ru') {
        setLangState(stored);
      }
    } catch {}
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem('pondera_lang', newLang);
    } catch {}
  };

  const t = (key: string, fallback?: string): string => {
    const entry = translations[key];
    if (entry) {
      return entry[lang] || entry.tr || fallback || key;
    }
    return fallback || key;
  };

  const translateCol = (colName: string): string => {
    if (lang === 'tr' || !colName) return colName;
    if (columnDictionaryRu[colName]) return columnDictionaryRu[colName];
    // Case-insensitive lookup
    const found = Object.entries(columnDictionaryRu).find(
      ([k]) => k.toLowerCase() === colName.toLowerCase()
    );
    if (found) return found[1];
    return colName;
  };

  const translateVal = (val: string): string => {
    if (lang === 'tr' || !val) return val;
    if (valueDictionaryRu[val]) return valueDictionaryRu[val];
    return val;
  };

  const translateGroup = (groupName: string): string => {
    if (lang === 'tr' || !groupName) return groupName;
    if (columnGroupDictionaryRu[groupName]) return columnGroupDictionaryRu[groupName];
    return groupName;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, translateCol, translateVal, translateGroup }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

