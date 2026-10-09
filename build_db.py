import openpyxl
import sqlite3
import json
import time
import os
from datetime import datetime, date

EXCEL_PATH = r"C:\Users\nemat\Downloads\tum liste 02 10 26.xlsx"
DB_PATH = r"pondera_hr.db"
DATA_FRESHNESS = "03.10.2026"
SOURCE_FILE = "tum liste 03 10 26.xlsx"

def clean_val(val):
    if val is None:
        return ""
    if isinstance(val, (datetime, date)):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    return s

def build_database():
    start_time = time.time()
    print("Loading Excel workbook...")
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    
    # Read column definitions from Sheet1 if available
    col_defs = []
    if "Sheet1" in wb.sheetnames:
        ws_cols = wb["Sheet1"]
        for row in ws_cols.iter_rows(values_only=True):
            if row[0] is not None and row[1] is not None:
                col_defs.append({"index": int(row[0]), "name": str(row[1]).strip()})
    
    ws_data = wb["Personel Listesi"]
    
    # Remove existing DB if possible
    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
        except Exception:
            pass

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Always drop existing tables to prevent duplicate records if file was locked
    cursor.execute("DROP TABLE IF EXISTS personnel")
    cursor.execute("DROP TABLE IF EXISTS columns_meta")
    cursor.execute("DROP TABLE IF EXISTS system_info")

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

    # Create indexes for blazing-fast queries
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

    # Determine headers from row 1
    headers = []
    rows_to_insert = []
    total_count = 0
    active_count = 0

    for i, row in enumerate(ws_data.iter_rows(values_only=True)):
        if i == 0:
            headers = [clean_val(c) or f"Col_{idx+1}" for idx, c in enumerate(row)]
            continue

        if not any(row):
            continue

        total_count += 1
        row_dict = {}
        for idx, val in enumerate(row):
            h_name = headers[idx] if idx < len(headers) else f"Col_{idx+1}"
            row_dict[h_name] = clean_val(val)

        genel_durum = clean_val(row[4]) if len(row) > 4 else ""
        if genel_durum == "Mevcut":
            active_count += 1

        sira_no_raw = clean_val(row[0]) if len(row) > 0 else ""
        try:
            sira_no = int(sira_no_raw)
        except ValueError:
            sira_no = total_count

        record = (
            sira_no,
            clean_val(row[1]) if len(row) > 1 else "",
            clean_val(row[2]) if len(row) > 2 else "",
            clean_val(row[3]) if len(row) > 3 else "",
            genel_durum,
            clean_val(row[5]) if len(row) > 5 else "",
            clean_val(row[6]) if len(row) > 6 else "",
            clean_val(row[7]) if len(row) > 7 else "",
            clean_val(row[8]) if len(row) > 8 else "",
            clean_val(row[9]) if len(row) > 9 else "",
            clean_val(row[10]) if len(row) > 10 else "",
            clean_val(row[11]) if len(row) > 11 else "",
            clean_val(row[12]) if len(row) > 12 else "",
            clean_val(row[13]) if len(row) > 13 else "",
            clean_val(row[14]) if len(row) > 14 else "",
            clean_val(row[15]) if len(row) > 15 else "",
            clean_val(row[16]) if len(row) > 16 else "",
            clean_val(row[20]) if len(row) > 20 else "", # Tam Adı (Kiril)
            clean_val(row[21]) if len(row) > 21 else "", # Görevi
            clean_val(row[22]) if len(row) > 22 else "", # RHI Görevi
            clean_val(row[23]) if len(row) > 23 else "", # Sorumlu Kişi
            clean_val(row[24]) if len(row) > 24 else "", # Grup Şefi
            clean_val(row[25]) if len(row) > 25 else "", # Endirekt / Direkt
            clean_val(row[27]) if len(row) > 27 else "", # İşe Giriş Tarihi
            clean_val(row[28]) if len(row) > 28 else "", # Şantiye Giriş Tarihi
            clean_val(row[29]) if len(row) > 29 else "", # Çıkış Tarihi
            clean_val(row[30]) if len(row) > 30 else "", # Çıkış Sebebi
            clean_val(row[31]) if len(row) > 31 else "", # Gündüz / Gece
            clean_val(row[32]) if len(row) > 32 else "", # Propusk No
            clean_val(row[35]) if len(row) > 35 else "", # Propusk Bitiş Tarihi
            clean_val(row[40]) if len(row) > 40 else "", # Cinsiyet
            clean_val(row[41]) if len(row) > 41 else "", # Doğum Tarihi
            clean_val(row[43]) if len(row) > 43 else "", # Pasaport No
            clean_val(row[45]) if len(row) > 45 else "", # Pasaport Geçerlilik
            clean_val(row[50]) if len(row) > 50 else "", # TC Kimlik No
            clean_val(row[53]) if len(row) > 53 else "", # Doğum Yeri
            clean_val(row[56]) if len(row) > 56 else "", # Migrasyon No
            clean_val(row[68]) if len(row) > 68 else "", # INN No
            clean_val(row[72]) if len(row) > 72 else "", # Vize No
            clean_val(row[75]) if len(row) > 75 else "", # Vize Bitiş
            clean_val(row[81]) if len(row) > 81 else "", # Patent Alış
            clean_val(row[86]) if len(row) > 86 else "", # Patent Bitiş
            clean_val(row[174]) if len(row) > 174 else "", # Telefon No
            clean_val(row[173]) if len(row) > 173 else "", # e-Mail
            clean_val(row[167]) if len(row) > 167 else "", # Kamp No
            clean_val(row[168]) if len(row) > 168 else "", # Oda No
            json.dumps(row_dict, ensure_ascii=False)
        )
        rows_to_insert.append(record)

        if len(rows_to_insert) >= 5000:
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
            print(f"Inserted {total_count} rows...")

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

    # Insert columns metadata
    for col in col_defs:
        # Assign logical groups based on index / name
        idx = col["index"]
        cname = col["name"]
        group = "Diğer Detay Alanları"
        if idx in [1, 2, 3, 4, 5, 6, 14, 15, 16, 17, 18, 19, 20, 21]:
            group = "Temel Bilgiler"
        elif idx in [7, 8, 9, 11, 120, 121, 168, 169, 176, 177]:
            group = "Lokasyon & Şantiye"
        elif idx in [10, 12, 22, 23, 24, 25, 26, 27, 32, 122]:
            group = "Pozisyon & Meslek"
        elif idx in [13, 41, 42, 43, 44, 45, 46, 50, 51, 54, 55, 173, 174, 175, 185, 186]:
            group = "Özlük & Uyruk"
        elif idx in [28, 29, 30, 31, 106, 107, 108, 110, 111, 114, 115, 171, 172]:
            group = "Sözleşme & İşe Giriş/Çıkış"
        elif idx in [33, 34, 35, 36, 56, 57, 58, 59, 60, 61, 62, 63, 68, 69, 72, 73, 74, 75, 76, 81, 82, 83, 84, 85, 86, 87, 95, 96, 98, 99]:
            group = "Vize, İkamet & Yasal Belgeler"
        elif idx in [38, 39, 40, 126, 127, 128, 132, 133, 134, 135, 139, 140, 145, 146, 152, 153, 155, 157]:
            group = "Sağlık, İSG & Eğitim"

        cursor.execute("INSERT OR REPLACE INTO columns_meta (col_index, col_name, col_group) VALUES (?, ?, ?)",
                       (idx, cname, group))

    # Save system info
    cursor.execute("INSERT OR REPLACE INTO system_info (key, value) VALUES ('data_freshness', ?)", (DATA_FRESHNESS,))
    cursor.execute("INSERT OR REPLACE INTO system_info (key, value) VALUES ('source_file', ?)", (SOURCE_FILE,))
    cursor.execute("INSERT OR REPLACE INTO system_info (key, value) VALUES ('total_records', ?)", (str(total_count),))
    cursor.execute("INSERT OR REPLACE INTO system_info (key, value) VALUES ('active_records', ?)", (str(active_count),))
    cursor.execute(f"INSERT OR REPLACE INTO system_info (key, value) VALUES ('last_updated', '{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}')")
    conn.commit()
    conn.close()

    elapsed = time.time() - start_time
    print(f"SUCCESS! Database created in {elapsed:.2f} seconds. Total: {total_count}, Active: {active_count}")

if __name__ == "__main__":
    build_database()
