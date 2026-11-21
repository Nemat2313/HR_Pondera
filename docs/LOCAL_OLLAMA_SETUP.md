# Pondera HR — Yerel AI (Ollama + Qwen2.5-VL) Kurulum Notu

Bu doküman, `hr.pondera.network` sunucusunun RAM kapasitesi **16 GB** (veya üzeri) seviyesine yükseltildiğinde **sıfır dış veri çıkışlı (%100 152-FZ uyumlu) ve ücretsiz yerel evrak/pasaport OCR AI** kurulumunu hızla tamamlamak için kaydedilmiştir.

## 1. Mevcut Sunucu Ölçümü (21.11.2026)
- **Sunucu:** `hr.pondera.network` (Linux x64, 4 vCPU Intel Broadwell, GPU yok)
- **Mevcut RAM:** 5.8 GB toplam / 5.1 GB boş (Next.js kullanımı ~0.7 GB)
- **Mevcut Disk:** 47.3 GB toplam / 39.1 GB boş
- **Durum:** Uygulama tarafında **8. Yerel AI — Ollama / Qwen2.5-VL** sağlayıcısı `v2.8.91` (`216c865`) itibarıyla tamamen hazırdır (`src/lib/aiTicketEngine.ts`, `src/app/api/settings/ai/route.ts`, `src/components/settings/AISettingsTab.tsx`, `src/components/powerise/LiveTicketScannerSystem.tsx`).

## 2. RAM Yükseltme Sonrası Sunucu Kurulum Komutları (2 Adım)
Sunucu 16 GB RAM'e yükseltildiğinde SSH ile bağlanıp şu komutları çalıştırmak yeterlidir:

```bash
# 1) Ollama kurulumu (otomatik systemd servisi olarak başlar, 127.0.0.1:11434)
curl -fsSL https://ollama.com/install.sh | sh

# 2) En yüksek doğruluklu çok dilli (Kiril + Latin + MRZ) Vision modelini indir (~5.5 GB disk)
ollama pull qwen2.5vl:7b

# (Opsiyonel: daha hızlı yedek model ~2.5 GB disk)
ollama pull qwen2.5vl:3b
```

## 3. Uygulama Üzerinden Aktivasyon
1. `https://hr.pondera.network` → **Ayarlar & Yönetim → AI Sağlayıcı Ayarları** sekmesini açın.
2. **7. Yerel AI — Ollama / Qwen2.5-VL** kartında:
   - **Base URL:** `http://127.0.0.1:11434/v1`
   - **Model:** `qwen2.5vl:7b` (16 GB+ RAM) veya `qwen2.5vl:3b` (8 GB RAM)
3. **Ollama Test** butonuna basın → yeşil onay göründükten sonra **Kaydet** ile aktif edin.

## 4. Alternatif Rusya İçi 152-FZ API Seçenekleri
- **Yandex Vision OCR:** Uygulamada 3. sırada hazır entegre (ruble bazlı en düşük maliyet).
- **Beorg Smart Vision (Биорг):** Yabancı pasaport + MRZ + patent + göç kartı + kayıt için özel Rus API (5.000 ₽ başlangıç, 25 evrak ücretsiz test).
- **Smart Engines:** Tam on-premise kurumsal SDK (yüksek banka/kurumsal bütçe gerektirir).
