import openpyxl
import sqlite3
import json
import time
import os
import re
import shutil
import gzip
from datetime import datetime, date

EXCEL_PATH = r"C:\Users\nemat\Downloads\Telegram Desktop\tum liste 08 10 2026.xlsx"
DB_PATH = r"pondera_hr.db"
DATA_FRESHNESS = "08.10.2026"
SOURCE_FILE = "tum liste 08 10 2026.xlsx"

def clean_val(val):
    if val is None:
        return ""
    if isinstance(val, (datetime, date)):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    return s

FIELD_ALIASES = {
    'sira_no': ['sıra no', 'sira no', 'sn', '№', 'nomer', 'номер'],
    'sicil_no': ['sicil no', 'sicil', 'tabel no', 'табельный номер', 'табельный', 'таб'],
    'rhi_id': ['rhi id', 'rhi_id', 'rhi'],
    'saren_no': ['saren no', 'saren'],
    'genel_durum': ['genel durumu', 'genel durum', 'общий статус'],
    'guncel_durum': ['güncel durumu', 'guncel durumu', 'güncel durum', 'текущий статус'],
    'region': ['region', 'bölge', 'bolge', 'регион'],
    'proje_adi': ['proje adı', 'proje adi', 'proje', 'проект'],
    'calisma_lokasyon': ['çalışma lokasyon durumu', 'calisma lokasyon', 'lokasyon', 'локация'],
    'kategori': ['kategori', 'категория'],
    'firma': ['firma', 'şirket', 'sirket', 'фирма', 'компания'],
    'departman': ['departman', 'департамент', 'отдел'],
    'uyruk': ['uyruk', 'vatandaşlık', 'гражданство'],
    'adi': ['adı', 'adi', 'isim', 'имя'],
    'soyadi': ['soyadı', 'soyadi', 'фамилия'],
    'baba_adi': ['baba adı', 'baba adi', 'отчество'],
    'ad_soyad': ['ad soyad', 'adı soyadı', 'ad soyadı', 'fio', 'фио'],
    'tam_adi_kiril': ['tam adı (kiril)', 'tam adi kiril', 'фио (кириллица)'],
    'gorevi': ['görevi', 'gorevi', 'meslek', 'должность', 'профессия'],
    'rhi_gorevi': ['rhi görevi', 'rhi gorevi'],
    'sorumlu_kisi': ['sorumlu kişi', 'sorumlu kisi', 'ответственный'],
    'grup_sefi': ['grup şefi', 'grup sefi', 'руководитель'],
    'endirekt_direkt': ['endirekt / direkt', 'endirekt direkt', 'endirekt/direkt', 'endirekt', 'direkt'],
    'ise_giris_tarihi': ['işe giriş tarihi', 'ise giris tarihi', 'giriş tarihi', 'дата приема'],
    'santiye_giris_tarihi': ['şantiye giriş tarihi', 'santiye giris tarihi', 'дата заезда'],
    'cikis_tarihi': ['çıkış tarihi', 'cikis tarihi', 'дата увольнения'],
    'cikis_sebebi': ['çıkış sebebi', 'cikis sebebi', 'причина увольнения'],
    'gunduz_gece': ['gündüz / gece', 'gunduz / gece', 'смена'],
    'propusk_no': ['propusk no', 'пропуск №', 'пропуск'],
    'propusk_bitis_tarihi': ['propusk bitiş tarihi', 'propusk bitis', 'пропуск окончание'],
    'cinsiyet': ['cinsiyet', 'пол'],
    'dogum_tarihi': ['doğum tarihi', 'dogum tarihi', 'дата рождения'],
    'pasaport_no': ['pasaport no', 'паспорт №', 'номер паспорта'],
    'pasaport_gecerlilik': ['pasaport geçerlilik', 'паспорт окончание', 'срок паспорта'],
    'tc_kimlik_no': ['tc kimlik no', 'tc no', 'инн/снилс'],
    'dogum_yeri': ['doğum yeri', 'dogum yeri', 'место рождения'],
    'migrasyon_no': ['migrasyon no', 'миграционная карта'],
    'inn_no': ['inn no', 'инн'],
    'vize_no': ['vize no', 'виза №', 'номер визы'],
    'vize_bitis_tarihi': ['vize bitiş tarihi', 'vize bitis', 'виза окончание', 'срок визы'],
    'patent_alis_tarihi': ['patent alış tarihi', 'patent alis', 'патент выдача'],
    'patent_bitis_tarihi': ['patent çeki bitiş tarihi', 'patent bitiş tarihi', 'patent bitis', 'патент окончание'],
    'telefon_no': ['telefon no', 'telefon', 'телефон'],
    'email': ['email', 'e-mail', 'почта'],
    'kamp_no': ['kamp no', 'kamp', 'городок', 'общежитие'],
    'oda_no': ['oda no', 'oda', 'комната']
}

def infer_region_from_project(project_name):
    p = (project_name or '').upper()
    if 'POLISTEROL' in p or 'NIZHNEKAMSK' in p or 'KAZAN' in p or 'ТАТАР' in p:
        return 'Kazan'
    if 'AMUR-AGHK' in p or 'АМУР АГХК' in p:
        return 'Amur-AGHK'
    if 'AMUR' in p or 'АМУР' in p:
        return 'Amur'
    if 'SVOBODNY' in p or 'СВОБОДНЫЙ' in p:
        return 'Svobodny-AGHK'
    if 'TOBOLSK' in p or 'ТОБОЛЬСК' in p:
        return 'Tobolsk'
    if 'UST LUGA' in p or 'UST-LUGA' in p or 'УСТЬ-ЛУГА' in p or 'УСТЬ ЛУГА' in p:
        return 'Ust Luga'
    if 'MURMANSK' in p or 'МУРМАНСК' in p:
        return 'Murmansk'
    if 'MERKEZ' in p or 'MOSKOVA' in p or 'МОСКВА' in p:
        return 'Merkez Ofis'
    return project_name or 'Diğer'

def map_headers(raw_headers):
    mapping = {}
    cleaned = [re.sub(r'\s+', ' ', str(h or '')).strip().lower() for h in raw_headers]
    for field, aliases in FIELD_ALIASES.items():
        found_idx = None
        # 1. Exact match
        for idx, h in enumerate(cleaned):
            if h in aliases:
                found_idx = idx
                break
        # 2. Substring match
        if found_idx is None:
            for idx, h in enumerate(cleaned):
                for alias in aliases:
                    if len(alias) >= 4 and alias in h:
                        found_idx = idx
                        break
                if found_idx is not None:
                    break
        mapping[field] = found_idx
    return mapping

def find_personnel_sheet(wb):
    target_names = ["personel listesi", "personel", "employees", "сотрудники", "список сотрудников"]
    for name in wb.sheetnames:
        if name.strip().lower() in target_names or "personel" in name.lower() or "список" in name.lower():
            return wb[name]
    
    # Check for sheet with employee headers
    for name in wb.sheetnames:
        if "pivot" in name.lower():
            continue
        ws = wb[name]
        first_row = next(ws.iter_rows(values_only=True), None)
        if first_row:
            row_str = " ".join([str(c or '').lower() for c in first_row])
            if any(k in row_str for k in ["sicil", "ad soyad", "uyruk", "genel durum"]):
                return ws

    for name in wb.sheetnames:
        if "pivot" not in name.lower():
            return wb[name]

    return wb[wb.sheetnames[0]]

def get_row_iterator(file_path):
    lower_path = file_path.lower()

    # 1. Handle .zip archive containing xlsx, csv or txt
    if lower_path.endswith('.zip'):
        import zipfile
        temp_dir = file_path + "_unzipped"
        with zipfile.ZipFile(file_path, 'r') as z:
            z.extractall(temp_dir)
        candidate = None
        for root, _, files in os.walk(temp_dir):
            for f in files:
                f_low = f.lower()
                if f_low.endswith(('.xlsx', '.xls', '.csv', '.txt', '.tsv')) and not f.startswith('~'):
                    candidate = os.path.join(root, f)
                    break
            if candidate:
                break
        if not candidate:
            raise ValueError("ZIP arşivi içinde geçerli bir Excel (.xlsx) veya Metin (.txt / .csv) dosyası bulunamadı.")
        for row in get_row_iterator(candidate):
            yield row
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass
        return

    # 2. Handle plain text files: .txt, .csv, .tsv (e.g. eBA exports)
    if lower_path.endswith(('.txt', '.csv', '.tsv')):
        encodings = ['utf-8-sig', 'utf-8', 'cp1254', 'windows-1251', 'latin1']
        chosen_encoding = 'utf-8'
        sample_bytes = b''
        with open(file_path, 'rb') as f:
            sample_bytes = f.read(65536)

        for enc in encodings:
            try:
                sample_bytes.decode(enc)
                chosen_encoding = enc
                break
            except Exception:
                continue

        sample_text = sample_bytes.decode(chosen_encoding, errors='replace')
        first_line = sample_text.splitlines()[0] if sample_text.splitlines() else ''
        tab_count = first_line.count('\t')
        semi_count = first_line.count(';')
        comma_count = first_line.count(',')

        delim = '\t'
        if semi_count > tab_count and semi_count > comma_count:
            delim = ';'
        elif comma_count > tab_count and comma_count > semi_count:
            delim = ','

        import csv
        with open(file_path, 'r', encoding=chosen_encoding, errors='replace', newline='') as f:
            reader = csv.reader(f, delimiter=delim)
            for row in reader:
                yield row
        return

    # 3. Handle Excel: .xlsx, .xls
    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    ws_data = find_personnel_sheet(wb)
    ws_data._max_row = None  # Force reading all rows even if metadata dimension was truncated by eBA!
    for row in ws_data.iter_rows(values_only=True):
        yield row

def build_database():
    start_time = time.time()

    temp_db_path = DB_PATH + ".tmp"
    if os.path.exists(temp_db_path):
        try: os.remove(temp_db_path)
        except Exception: pass

    conn = sqlite3.connect(temp_db_path)
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_info (
        key TEXT PRIMARY KEY,
        value TEXT
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS columns_meta (
        col_index INTEGER PRIMARY KEY,
        col_name TEXT,
        col_group TEXT
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS personnel (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sira_no INTEGER,
        sicil_no TEXT,
        rhi_id TEXT,
        saren_no TEXT,
        genel_durum TEXT,
        guncel_durum TEXT,
        region TEXT,
        proje_adi TEXT,
        calisma_lokasyon TEXT,
        kategori TEXT,
        firma TEXT,
        departman TEXT,
        uyruk TEXT,
        adi TEXT,
        soyadi TEXT,
        baba_adi TEXT,
        ad_soyad TEXT,
        tam_adi_kiril TEXT,
        gorevi TEXT,
        rhi_gorevi TEXT,
        sorumlu_kisi TEXT,
        grup_sefi TEXT,
        endirekt_direkt TEXT,
        ise_giris_tarihi TEXT,
        santiye_giris_tarihi TEXT,
        cikis_tarihi TEXT,
        cikis_sebebi TEXT,
        gunduz_gece TEXT,
        propusk_no TEXT,
        propusk_bitis_tarihi TEXT,
        cinsiyet TEXT,
        dogum_tarihi TEXT,
        pasaport_no TEXT,
        pasaport_gecerlilik TEXT,
        tc_kimlik_no TEXT,
        dogum_yeri TEXT,
        migrasyon_no TEXT,
        inn_no TEXT,
        vize_no TEXT,
        vize_bitis_tarihi TEXT,
        patent_alis_tarihi TEXT,
        patent_bitis_tarihi TEXT,
        telefon_no TEXT,
        email TEXT,
        kamp_no TEXT,
        oda_no TEXT,
        all_data_json TEXT
    );
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_p_genel_durum ON personnel(genel_durum);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_p_region ON personnel(region);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_p_proje ON personnel(proje_adi);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_p_departman ON personnel(departman);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_p_kategori ON personnel(kategori);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_p_uyruk ON personnel(uyruk);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_p_endirekt ON personnel(endirekt_direkt);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_p_giris_tarih ON personnel(ise_giris_tarihi);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_p_cikis_tarih ON personnel(cikis_tarihi);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_p_sicil ON personnel(sicil_no);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_p_rhi ON personnel(rhi_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_p_saren ON personnel(saren_no);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_p_ad_soyad ON personnel(ad_soyad);")

    headers = []
    col_map = {}
    rows_to_insert = []
    total_count = 0
    active_count = 0

    # Pre-compiled index map slots
    idx_sira = None
    idx_sicil = None
    idx_rhi = None
    idx_saren = None
    idx_genel = None
    idx_guncel = None
    idx_region = None
    idx_proje = None
    idx_lokasyon = None
    idx_kategori = None
    idx_firma = None
    idx_departman = None
    idx_uyruk = None
    idx_adi = None
    idx_soyadi = None
    idx_baba_adi = None
    idx_ad_soyad = None
    idx_tam_kiril = None
    idx_gorevi = None
    idx_rhi_gorevi = None
    idx_sorumlu = None
    idx_grup_sefi = None
    idx_endirekt = None
    idx_ise_giris = None
    idx_santiye_giris = None
    idx_cikis_tarihi = None
    idx_cikis_sebebi = None
    idx_gunduz_gece = None
    idx_propusk_no = None
    idx_propusk_bitis = None
    idx_cinsiyet = None
    idx_dogum_tarihi = None
    idx_pasaport_no = None
    idx_pasaport_gecerlilik = None
    idx_tc_kimlik = None
    idx_dogum_yeri = None
    idx_migrasyon = None
    idx_inn = None
    idx_vize_no = None
    idx_vize_bitis = None
    idx_patent_alis = None
    idx_patent_bitis = None
    idx_telefon = None
    idx_email = None
    idx_kamp = None
    idx_oda = None

    def get_val(row, idx):
        if idx is not None and idx < len(row):
            return clean_val(row[idx])
        return ""

    for i, row in enumerate(get_row_iterator(EXCEL_PATH)):
        if i == 0:
            headers = [clean_val(c) or f"Col_{idx+1}" for idx, c in enumerate(row)]
            col_map = map_headers(headers)

            # Populate columns_meta
            cols_meta = [(idx + 1, h, "Genel") for idx, h in enumerate(headers)]
            cursor.executemany("INSERT OR REPLACE INTO columns_meta (col_index, col_name, col_group) VALUES (?, ?, ?)", cols_meta)

            # Pre-extract indices
            idx_sira = col_map.get('sira_no')
            idx_sicil = col_map.get('sicil_no')
            idx_rhi = col_map.get('rhi_id')
            idx_saren = col_map.get('saren_no')
            idx_genel = col_map.get('genel_durum')
            idx_guncel = col_map.get('guncel_durum')
            idx_region = col_map.get('region')
            idx_proje = col_map.get('proje_adi')
            idx_lokasyon = col_map.get('calisma_lokasyon')
            idx_kategori = col_map.get('kategori')
            idx_firma = col_map.get('firma')
            idx_departman = col_map.get('departman')
            idx_uyruk = col_map.get('uyruk')
            idx_adi = col_map.get('adi')
            idx_soyadi = col_map.get('soyadi')
            idx_baba_adi = col_map.get('baba_adi')
            idx_ad_soyad = col_map.get('ad_soyad')
            idx_tam_kiril = col_map.get('tam_adi_kiril')
            idx_gorevi = col_map.get('gorevi')
            idx_rhi_gorevi = col_map.get('rhi_gorevi')
            idx_sorumlu = col_map.get('sorumlu_kisi')
            idx_grup_sefi = col_map.get('grup_sefi')
            idx_endirekt = col_map.get('endirekt_direkt')
            idx_ise_giris = col_map.get('ise_giris_tarihi')
            idx_santiye_giris = col_map.get('santiye_giris_tarihi')
            idx_cikis_tarihi = col_map.get('cikis_tarihi')
            idx_cikis_sebebi = col_map.get('cikis_sebebi')
            idx_gunduz_gece = col_map.get('gunduz_gece')
            idx_propusk_no = col_map.get('propusk_no')
            idx_propusk_bitis = col_map.get('propusk_bitis_tarihi')
            idx_cinsiyet = col_map.get('cinsiyet')
            idx_dogum_tarihi = col_map.get('dogum_tarihi')
            idx_pasaport_no = col_map.get('pasaport_no')
            idx_pasaport_gecerlilik = col_map.get('pasaport_gecerlilik')
            idx_tc_kimlik = col_map.get('tc_kimlik_no')
            idx_dogum_yeri = col_map.get('dogum_yeri')
            idx_migrasyon = col_map.get('migrasyon_no')
            idx_inn = col_map.get('inn_no')
            idx_vize_no = col_map.get('vize_no')
            idx_vize_bitis = col_map.get('vize_bitis_tarihi')
            idx_patent_alis = col_map.get('patent_alis_tarihi')
            idx_patent_bitis = col_map.get('patent_bitis_tarihi')
            idx_telefon = col_map.get('telefon_no')
            idx_email = col_map.get('email')
            idx_kamp = col_map.get('kamp_no')
            idx_oda = col_map.get('oda_no')
            continue

        if not any(row):
            continue

        total_count += 1

        # Build lean JSON dictionary (non-empty only)
        row_dict = {}
        for idx, val in enumerate(row):
            cleaned_v = clean_val(val)
            if cleaned_v:
                h_name = headers[idx] if idx < len(headers) else f"Col_{idx+1}"
                row_dict[h_name] = cleaned_v

        sira_no_raw = get_val(row, idx_sira)
        try:
            sira_no = int(sira_no_raw)
        except ValueError:
            sira_no = total_count

        genel_durum = get_val(row, idx_genel) or 'Mevcut'
        guncel_durum = get_val(row, idx_guncel) or genel_durum
        if genel_durum == 'Mevcut':
            active_count += 1

        proje_adi = get_val(row, idx_proje)
        region = get_val(row, idx_region)
        if not region:
            region = infer_region_from_project(proje_adi)

        ad_soyad = get_val(row, idx_ad_soyad)
        adi = get_val(row, idx_adi)
        soyadi = get_val(row, idx_soyadi)
        if not ad_soyad and (adi or soyadi):
            ad_soyad = f"{adi} {soyadi}".strip()
        elif ad_soyad and not adi:
            parts = ad_soyad.split()
            adi = parts[0] if parts else ""
            soyadi = " ".join(parts[1:]) if len(parts) > 1 else ""

        record = (
            sira_no,
            get_val(row, idx_sicil),
            get_val(row, idx_rhi),
            get_val(row, idx_saren),
            genel_durum,
            guncel_durum,
            region,
            proje_adi,
            get_val(row, idx_lokasyon),
            get_val(row, idx_kategori),
            get_val(row, idx_firma),
            get_val(row, idx_departman),
            get_val(row, idx_uyruk),
            adi,
            soyadi,
            get_val(row, idx_baba_adi),
            ad_soyad,
            get_val(row, idx_tam_kiril),
            get_val(row, idx_gorevi),
            get_val(row, idx_rhi_gorevi),
            get_val(row, idx_sorumlu),
            get_val(row, idx_grup_sefi),
            get_val(row, idx_endirekt),
            get_val(row, idx_ise_giris),
            get_val(row, idx_santiye_giris),
            get_val(row, idx_cikis_tarihi),
            get_val(row, idx_cikis_sebebi),
            get_val(row, idx_gunduz_gece),
            get_val(row, idx_propusk_no),
            get_val(row, idx_propusk_bitis),
            get_val(row, idx_cinsiyet),
            get_val(row, idx_dogum_tarihi),
            get_val(row, idx_pasaport_no),
            get_val(row, idx_pasaport_gecerlilik),
            get_val(row, idx_tc_kimlik),
            get_val(row, idx_dogum_yeri),
            get_val(row, idx_migrasyon),
            get_val(row, idx_inn),
            get_val(row, idx_vize_no),
            get_val(row, idx_vize_bitis),
            get_val(row, idx_patent_alis),
            get_val(row, idx_patent_bitis),
            get_val(row, idx_telefon),
            get_val(row, idx_email),
            get_val(row, idx_kamp),
            get_val(row, idx_oda),
            json.dumps(row_dict, ensure_ascii=False)
        )
        rows_to_insert.append(record)

        if len(rows_to_insert) >= 3000:
            cursor.executemany("""
            INSERT INTO personnel (
                sira_no, sicil_no, rhi_id, saren_no, genel_durum, guncel_durum,
                region, proje_adi, calisma_lokasyon, kategori, firma, departman,
                uyruk, adi, soyadi, baba_adi, ad_soyad, tam_adi_kiril,
                gorevi, rhi_gorevi, sorumlu_kisi, grup_sefi, endirekt_direkt,
                ise_giris_tarihi, santiye_giris_tarihi, cikis_tarihi, cikis_sebebi,
                gunduz_gece, propusk_no, propusk_bitis_tarihi, cinsiyet,
                dogum_tarihi, pasaport_no, pasaport_gecerlilik, tc_kimlik_no,
                dogum_yeri, migrasyon_no, inn_no, vize_no, vize_bitis_tarihi,
                patent_alis_tarihi, patent_bitis_tarihi, telefon_no, email,
                kamp_no, oda_no, all_data_json
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, rows_to_insert)
            conn.commit()
            rows_to_insert = []

    if rows_to_insert:
        cursor.executemany("""
        INSERT INTO personnel (
            sira_no, sicil_no, rhi_id, saren_no, genel_durum, guncel_durum,
            region, proje_adi, calisma_lokasyon, kategori, firma, departman,
            uyruk, adi, soyadi, baba_adi, ad_soyad, tam_adi_kiril,
            gorevi, rhi_gorevi, sorumlu_kisi, grup_sefi, endirekt_direkt,
            ise_giris_tarihi, santiye_giris_tarihi, cikis_tarihi, cikis_sebebi,
            gunduz_gece, propusk_no, propusk_bitis_tarihi, cinsiyet,
            dogum_tarihi, pasaport_no, pasaport_gecerlilik, tc_kimlik_no,
            dogum_yeri, migrasyon_no, inn_no, vize_no, vize_bitis_tarihi,
            patent_alis_tarihi, patent_bitis_tarihi, telefon_no, email,
            kamp_no, oda_no, all_data_json
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, rows_to_insert)
        conn.commit()

    # Save system info
    cursor.execute("INSERT OR REPLACE INTO system_info (key, value) VALUES ('data_freshness', ?)", (DATA_FRESHNESS,))
    cursor.execute("INSERT OR REPLACE INTO system_info (key, value) VALUES ('source_file', ?)", (SOURCE_FILE,))
    cursor.execute("INSERT OR REPLACE INTO system_info (key, value) VALUES ('total_records', ?)", (str(total_count),))
    cursor.execute("INSERT OR REPLACE INTO system_info (key, value) VALUES ('active_records', ?)", (str(active_count),))
    cursor.execute(f"INSERT OR REPLACE INTO system_info (key, value) VALUES ('last_updated', '{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}')")
    conn.commit()
    conn.close()

    # Atomic move
    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
        except Exception:
            pass
    shutil.move(temp_db_path, DB_PATH)

    # Automatically compress to .gz as well
    try:
        with open(DB_PATH, 'rb') as f_in:
            with gzip.open(DB_PATH + '.gz', 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
    except Exception:
        pass

    elapsed = time.time() - start_time
    print(f"SUCCESS! Database created in {elapsed:.2f}s. Total: {total_count}, Active: {active_count}")

if __name__ == "__main__":
    build_database()
