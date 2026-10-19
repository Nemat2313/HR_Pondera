import sqlite3

conn = sqlite3.connect('pondera_hr.db')
c = conn.cursor()

c.execute("""
    SELECT 
        AVG(2026 - CAST(substr(dogum_tarihi, 1, 4) AS INTEGER)) as avg_age,
        AVG(2026.75 - (CAST(substr(ise_giris_tarihi, 1, 4) AS REAL) + CAST(substr(ise_giris_tarihi, 6, 2) AS REAL)/12.0)) as avg_tenure
    FROM personnel 
    WHERE genel_durum = 'Mevcut' 
      AND length(dogum_tarihi) >= 4 
      AND length(ise_giris_tarihi) >= 7
""")
res = c.fetchone()
print(f"Avg Age: {res[0]:.1f}, Avg Tenure: {res[1]:.1f} years")

c.execute("SELECT firma, COUNT(*) FROM personnel WHERE genel_durum = 'Mevcut' GROUP BY firma ORDER BY COUNT(*) DESC LIMIT 8")
print("Top Firms:", c.fetchall())

c.execute("""
    SELECT 
        CASE 
            WHEN (2026 - CAST(substr(ise_giris_tarihi, 1, 4) AS INTEGER)) < 1 THEN '0 - 1 Yıl'
            WHEN (2026 - CAST(substr(ise_giris_tarihi, 1, 4) AS INTEGER)) BETWEEN 1 AND 2 THEN '1 - 2 Yıl'
            WHEN (2026 - CAST(substr(ise_giris_tarihi, 1, 4) AS INTEGER)) BETWEEN 3 AND 4 THEN '3 - 4 Yıl'
            WHEN (2026 - CAST(substr(ise_giris_tarihi, 1, 4) AS INTEGER)) BETWEEN 5 AND 7 THEN '5 - 7 Yıl'
            ELSE '7+ Yıl'
        END as tenure_group,
        COUNT(*) as count
    FROM personnel
    WHERE genel_durum = 'Mevcut' AND length(ise_giris_tarihi) >= 4
    GROUP BY tenure_group
    ORDER BY count DESC
""")
print("Tenure Groups:", c.fetchall())

# Title hierarchy mapping (Pyramid / Funnel)
c.execute("""
    SELECT 
        CASE 
            WHEN gorevi LIKE '%Müdür%' OR gorevi LIKE '%Direktör%' OR gorevi LIKE '%Yönetim%' THEN '01. Yönetici / Müdür'
            WHEN gorevi LIKE '%Şef%' OR gorevi LIKE '%Grup Şefi%' OR gorevi LIKE '%Kısım Şefi%' THEN '02. Şef / Kısım Şefi'
            WHEN gorevi LIKE '%Mühendis%' OR gorevi LIKE '%Mimar%' OR gorevi LIKE '%PTO%' THEN '03. Mühendis / Teknik Ofis'
            WHEN gorevi LIKE '%Uzman%' OR gorevi LIKE '%Inspektor%' OR gorevi LIKE '%Denetmen%' THEN '04. Uzman / Müfettiş'
            WHEN gorevi LIKE '%Formen%' OR gorevi LIKE '%Ekipbaşı%' OR gorevi LIKE '%Usta%' THEN '05. Formen / Ekipbaşı'
            WHEN gorevi LIKE '%Kaynakçı%' OR gorevi LIKE '%Montaj%' OR gorevi LIKE '%Boru%' OR gorevi LIKE '%İskele%' OR gorevi LIKE '%Elektrik%' OR gorevi LIKE '%Boya%' OR gorevi LIKE '%İzole%' THEN '06. Nitelikli Usta / Montajcı'
            ELSE '07. Saha Personeli / Düz İşçi'
        END as title_group,
        COUNT(*) as count
    FROM personnel
    WHERE genel_durum = 'Mevcut'
    GROUP BY title_group
    ORDER BY title_group ASC
""")
print("Title Pyramid:", c.fetchall())
