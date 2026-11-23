#!/usr/bin/env python3
"""
Pondera HR — Automated eBA (pearl.pondera.network) Excel Report Downloader
Reads JSON config from stdin:
  {
    "login_url": "https://pearl.pondera.network/eba.net/Desktop/Login.aspx",
    "username": "...",
    "password": "...",
    "report_btn_id": "fileView_ctl01_btnPersonnelReport1",
    "output_dir": "/path/to/uploads",
    "progress_file": "/path/to/uploads/eba_sync_progress.json"
  }
Outputs a single JSON line to stdout:
  { "success": true, "filePath": "...", "fileName": "...", "sizeBytes": 12345, "durationSec": 80.2 }
"""

import json
import os
import sys
import time
from datetime import datetime


def write_progress(progress_file: str, percent: int, message: str):
    if not progress_file:
        return
    try:
        with open(progress_file, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "percent": percent,
                    "message": message,
                    "updatedAt": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                },
                f,
                ensure_ascii=False,
            )
    except Exception:
        pass


def launch_browser(p):
    # Prefer bundled Chromium on Linux VPS; fallback to system Chrome on Windows
    launch_args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
    try:
        return p.chromium.launch(headless=True, args=launch_args)
    except Exception:
        return p.chromium.launch(headless=True, channel="chrome", args=launch_args)


def main():
    t0 = time.time()
    try:
        raw = sys.stdin.read()
        cfg = json.loads(raw or "{}")
    except Exception as e:
        print(json.dumps({"success": False, "message": f"Geçersiz giriş JSON: {e}"}))
        return

    login_url = str(cfg.get("login_url") or "https://pearl.pondera.network/eba.net/Desktop/Login.aspx").strip()
    username = str(cfg.get("username") or "").strip()
    password = str(cfg.get("password") or "").strip()
    report_btn_id = str(cfg.get("report_btn_id") or "fileView_ctl01_btnPersonnelReport1").strip()
    output_dir = str(cfg.get("output_dir") or os.path.join(os.getcwd(), "uploads")).strip()
    progress_file = str(cfg.get("progress_file") or "").strip()

    if not username or not password:
        print(json.dumps({"success": False, "message": "eBA kullanıcı adı veya şifre eksik."}))
        return

    os.makedirs(output_dir, exist_ok=True)

    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        print(
            json.dumps(
                {
                    "success": False,
                    "message": f"Sunucuda Playwright kurulu değil ({e}).",
                }
            )
        )
        return

    try:
        write_progress(progress_file, 10, "eBA (pearl.pondera.network) açılıyor ve giriş yapılıyor...")
        with sync_playwright() as p:
            browser = launch_browser(p)
            ctx = browser.new_context(viewport={"width": 1600, "height": 960}, accept_downloads=True)
            page = ctx.new_page()

            page.goto(login_url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(1200)

            page.fill("input#username", username)
            page.fill("input#password", password)
            page.locator("input#password").press("Enter")
            page.wait_for_timeout(4500)

            if "Login.aspx" in page.url:
                dx_btn = page.locator(".dx-button, button:visible").first
                if dx_btn.count() > 0:
                    dx_btn.click(force=True)
                    page.wait_for_timeout(4500)

            if "Login.aspx" in page.url:
                browser.close()
                print(json.dumps({"success": False, "message": "eBA girişi başarısız. Kullanıcı adı veya şifreyi kontrol edin."}))
                return

            write_progress(progress_file, 25, "eBA oturumu açıldı. Pondera Personnel → Excel Raporları açılıyor...")
            pp = page.locator("text=Pondera Personnel").or_(page.locator("text=Pondera Personel")).first
            pp.wait_for(state="visible", timeout=20000)
            pp.click()
            page.wait_for_timeout(3000)

            er = page.locator("text=Excel Reports").or_(page.locator("text=Excel Raporları")).first
            er.wait_for(state="visible", timeout=20000)
            er.click()
            page.wait_for_timeout(4500)

            doc_frame = next((fr for fr in page.frames if "DocumentViewer.aspx" in fr.url), None)
            if not doc_frame:
                browser.close()
                print(json.dumps({"success": False, "message": "eBA Personel Excel Raporları penceresi açılamadı."}))
                return

            btn_loc = doc_frame.locator(f"#{report_btn_id}").first
            if btn_loc.count() == 0:
                browser.close()
                print(json.dumps({"success": False, "message": f"Seçilen rapor butonu bulunamadı (#{report_btn_id})."}))
                return

            write_progress(progress_file, 38, "Rapor filtre penceresi açılıyor ve tüm bölgeler/projeler seçiliyor...")
            btn_loc.click()
            page.wait_for_timeout(4500)

            mdl = next((fr for fr in page.frames if "WorkflowModalForm.aspx" in fr.url), None)
            if mdl:
                # 1. Select All Regions and wait until Project listbox populates
                reg_btn = mdl.locator("#ctl05_btnSelectAllRegion").first
                if reg_btn.count() > 0:
                    reg_btn.click()
                    for _ in range(15):
                        page.wait_for_timeout(1000)
                        try:
                            proj_cnt = mdl.evaluate("() => (document.getElementById('ctl05_lBoxProject')?.options.length) || 0")
                            if proj_cnt > 5:
                                break
                        except Exception:
                            pass

                # 2. Select All Companies
                comp_btn = mdl.locator("#ctl05_btnSelectAlCompany").first
                if comp_btn.count() > 0:
                    comp_btn.click()
                    page.wait_for_timeout(3000)

                # 3. Select All Projects
                proj_btn = mdl.locator("#ctl05_btnSelectAllProject").first
                if proj_btn.count() > 0:
                    proj_btn.click()
                    page.wait_for_timeout(3000)

                dl_btn = mdl.locator("#ctl05_btnAddPersonnels").or_(
                    mdl.locator("input[value*='Download'], button:has-text('Download')")
                ).first
                if dl_btn.count() == 0:
                    browser.close()
                    print(json.dumps({"success": False, "message": "eBA 'Download Report' butonu bulunamadı."}))
                    return

                write_progress(
                    progress_file,
                    52,
                    "eBA sunucusu tüm şantiyeler için 198 kolonluk (~32 MB) Excel raporunu hazırlıyor (yaklaşık 2-3 dakika)...",
                )
                with page.expect_download(timeout=420000) as dl_info:
                    dl_btn.click()
            else:
                # Some direct reports might download without opening MdlDownload
                write_progress(progress_file, 52, "eBA raporu indiriliyor...")
                with page.expect_download(timeout=180000) as dl_info:
                    btn_loc.click()

            dl = dl_info.value
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            suggested = dl.suggested_filename or "Personel1Raporu.xlsx"
            ext = os.path.splitext(suggested)[1] or ".xlsx"
            out_path = os.path.join(output_dir, f"eba_auto_{stamp}{ext}")
            dl.save_as(out_path)
            browser.close()

            size_bytes = os.path.getsize(out_path) if os.path.exists(out_path) else 0
            if size_bytes < 10000:
                print(
                    json.dumps(
                        {
                            "success": False,
                            "message": f"İndirilen eBA dosyası çok küçük ({size_bytes} byte), geçerli bir rapor değil.",
                        }
                    )
                )
                return

            write_progress(
                progress_file,
                82,
                f"Excel indirildi ({suggested}, {size_bytes / (1024*1024):.1f} MB). Veritabanı güncelleniyor...",
            )
            print(
                json.dumps(
                    {
                        "success": True,
                        "filePath": out_path,
                        "fileName": suggested,
                        "sizeBytes": size_bytes,
                        "durationSec": round(time.time() - t0, 1),
                    },
                    ensure_ascii=False,
                )
            )
    except Exception as e:
        print(json.dumps({"success": False, "message": f"eBA indirme hatası: {e}"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
