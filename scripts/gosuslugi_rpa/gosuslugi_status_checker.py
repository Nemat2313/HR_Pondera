"""
Pondera HR - Gosuslugi Application Status Checker (Python + Playwright)
Checks the processing/decision status ('Услуга оказана', 'Услуга отказана', 'Заявление зарегистрировано', etc.)
in Gosuslugi Personal Cabinet (lk.gosuslugi.ru/notifications) by Application Number (№ Заявления).

Also supports auto-discovering Application Numbers from downloaded PDF files in ~/Downloads:
- <Sicil>_<GosuslugiNo>_<WorkerName>_<Period>.pdf
- <GosuslugiNo>_<WorkerName>_<Period>.pdf
"""

import sys
import os
import re
import time
import json
import argparse
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(f"gosuslugi_status_check_{datetime.now().strftime('%Y%m%d')}.log", encoding="utf-8")
    ]
)
logger = logging.getLogger("PonderaGosuslugiStatusChecker")

try:
    from playwright.sync_api import sync_playwright, Page
except ImportError:
    logger.error("Playwright is not installed! Run: pip install playwright")
    sys.exit(1)


def scan_downloads_for_applications() -> List[Dict[str, Any]]:
    """
    Scans ~/Downloads for renamed Gosuslugi PDF receipts and extracts:
    - Format A: <Sicil>_<ApplicationNo>_<WorkerName>_<Period>.pdf
    - Format B: <ApplicationNo>_<WorkerName>_<Period>.pdf
    """
    downloads_dir = Path.home() / "Downloads"
    discovered = []
    if not downloads_dir.exists():
        return discovered

    for pdf_path in downloads_dir.glob("*.pdf"):
        stem = pdf_path.stem
        parts = stem.split("_")
        # Format A: 933532_8255536023_АБДУЛ РАШИД_2026-3.pdf
        if len(parts) >= 4 and parts[0].isdigit() and parts[1].isdigit() and len(parts[1]) >= 7:
            discovered.append({
                "sicil": parts[0],
                "sicil_no": parts[0],
                "application_no": parts[1],
                "worker_name": parts[2],
                "period_code": parts[3],
                "pdf_filename": pdf_path.name,
                "gosuslugi_status": "Заявление зарегистрировано",
            })
        # Format B: 8255536023_АБДУЛ РАШИД_2026-3.pdf
        elif len(parts) >= 3 and parts[0].isdigit() and len(parts[0]) >= 7:
            discovered.append({
                "sicil": "",
                "sicil_no": "",
                "application_no": parts[0],
                "worker_name": parts[1],
                "period_code": parts[2],
                "pdf_filename": pdf_path.name,
                "gosuslugi_status": "Заявление зарегистрировано",
            })
    return discovered


def classify_gosuslugi_status_text(raw_text: str) -> str:
    """Normalizes Gosuslugi order status text into standard status labels."""
    t = (raw_text or "").lower()
    if "услуга оказана" in t or "исполнено" in t or "принято ведомством" in t:
        return "Услуга оказана"
    if "отказано" in t or "услуга отказана" in t or "ошибка" in t or "возврат" in t:
        return "Услуга отказана"
    if "зарегистрировано" in t or "отправлено" in t or "получено ведомством" in t or "в обработке" in t:
        return "В обработке"
    return "В обработке"


def check_single_application_status(page: Page, item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Looks up `application_no` (e.g. '8255536023') in Gosuslugi Personal Cabinet (lk.gosuslugi.ru/notifications)
    and extracts the latest status ('Услуга оказана', 'Услуга отказана', 'В обработке').
    """
    app_no = str(item.get("application_no") or "").strip()
    sicil = str(item.get("sicil") or item.get("sicil_no") or "").strip()
    worker_name = str(item.get("worker_name") or "").strip()

    logger.info(f"=== Checking Gosuslugi Status for: {worker_name} (Код: {sicil}, № Заявления: {app_no}) ===")

    if "lk.gosuslugi.ru/notifications" not in (page.url or ""):
        try:
            page.goto("https://lk.gosuslugi.ru/notifications", wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(2500)
        except Exception as e:
            logger.warning(f"Navigation to lk.gosuslugi.ru/notifications note: {e}")

    # Try search input on lk.gosuslugi.ru/notifications if available
    status_label = str(item.get("gosuslugi_status") or "В обработке")
    status_detail = ""

    try:
        search_inp = page.locator(
            "input[placeholder*='Поиск']:visible, "
            "input[type='search']:visible, "
            "input.search-input:visible"
        ).first
        if search_inp.count() > 0 and search_inp.is_visible():
            search_inp.click()
            page.keyboard.press("Control+A")
            page.keyboard.press("Backspace")
            search_inp.fill(app_no)
            page.keyboard.press("Enter")
            page.wait_for_timeout(2000)

        # Look for feed card / order row containing application_no
        item_loc = page.locator(f"text='{app_no}'").first
        if item_loc.count() > 0 and item_loc.is_visible():
            card_text = ""
            try:
                card_text = item_loc.evaluate(
                    "el => (el.closest('a, lib-feed-item, div.feed-item, div.order-item') || el.parentElement).innerText"
                )
            except Exception:
                card_text = page.locator("body").inner_text(timeout=2000)

            status_label = classify_gosuslugi_status_text(card_text)
            status_detail = card_text.replace("\n", " | ")[:180]
            logger.info(f"Found № {app_no} in list -> Status: {status_label}")
        else:
            # Also check current page body if already on order detail page
            body_txt = page.locator("body").inner_text(timeout=3000)
            if app_no in body_txt:
                status_label = classify_gosuslugi_status_text(body_txt)
                logger.info(f"Found № {app_no} on detail screen -> Status: {status_label}")
            else:
                logger.info(f"№ {app_no} not visible in top feed — keeping status '{status_label}'")
    except Exception as e:
        logger.warning(f"Status check note for № {app_no}: {e}")

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    updated_entry = {
        **item,
        "sicil": sicil,
        "sicil_no": sicil,
        "application_no": app_no,
        "gosuslugi_status": status_label,
        "status_detail": status_detail,
        "checked_at": now_str,
    }

    # Emit structured log line parsed by rpa_bridge_server.py
    logger.info(f"APPLICATION_STATUS_UPDATED: {json.dumps(updated_entry, ensure_ascii=False)}")
    logger.info(f"SUCCESS: Status checked for {worker_name} (№ {app_no}: {status_label})!")

    # Sync to Pondera HR Next.js API
    try:
        import urllib.request
        req = urllib.request.Request(
            "http://localhost:3000/api/gosuslugi/submissions",
            data=json.dumps({"updates": [updated_entry]}, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="PATCH",
        )
        with urllib.request.urlopen(req, timeout=2.5) as _:
            pass
    except Exception:
        pass

    return updated_entry


def main():
    parser = argparse.ArgumentParser(description="Pondera HR Gosuslugi Status Checker")
    parser.add_argument("--json", default="", help="Path to JSON queue of applications to check")
    parser.add_argument("--cdp-port", type=int, default=9222, help="Chrome Remote Debugging Port")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of records to check")
    args = parser.parse_args()

    records = []
    json_candidates = [
        args.json,
        os.path.join(CURRENT_DIR, "active_status_check_queue.json"),
        os.path.join(CURRENT_DIR, "gosuslugi_applications.json"),
    ]
    for jpath in json_candidates:
        if jpath and os.path.exists(jpath):
            try:
                with open(jpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list) and len(data) > 0:
                    records = [r for r in data if str(r.get("application_no") or "").strip()]
                    if records:
                        logger.info(f"Loaded {len(records)} application numbers from {jpath}")
                        break
            except Exception as e:
                logger.warning(f"Could not read {jpath}: {e}")

    # Also merge any PDFs found in ~/Downloads that have Gosuslugi application numbers
    discovered_pdfs = scan_downloads_for_applications()
    existing_app_nos = {str(r.get("application_no")).strip() for r in records}
    for d_item in discovered_pdfs:
        if d_item["application_no"] not in existing_app_nos:
            records.append(d_item)
            existing_app_nos.add(d_item["application_no"])
            logger.info(f"APPLICATION_REGISTERED: {json.dumps(d_item, ensure_ascii=False)}")

    if not records:
        logger.warning("No Gosuslugi Application Numbers (№ Заявлений) found to check.")
        return

    if args.limit > 0:
        records = records[:args.limit]

    with sync_playwright() as p:
        logger.info(f"Connecting to Chrome on http://localhost:{args.cdp_port}...")
        try:
            browser = p.chromium.connect_over_cdp(f"http://localhost:{args.cdp_port}")
            context = browser.contexts[0] if browser.contexts else browser.new_context()
            page = None
            if context.pages:
                for p_item in context.pages:
                    if "gosuslugi.ru" in p_item.url and "chrome-error" not in p_item.url:
                        page = p_item
                        break
                if not page:
                    page = context.pages[0]
            else:
                page = context.new_page()
            page.bring_to_front()
        except Exception as e:
            logger.error(f"Could not connect to Chrome on port {args.cdp_port}: {e}")
            return

        for idx, rec in enumerate(records):
            logger.info(f"\n--- Checking Application {idx+1}/{len(records)} ---")
            check_single_application_status(page, rec)
            time.sleep(1.0)

        logger.info(f"\n=== Status Check Complete ===\nTotal Checked: {len(records)}")


if __name__ == "__main__":
    main()
