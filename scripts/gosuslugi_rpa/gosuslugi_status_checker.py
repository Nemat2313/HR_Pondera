"""
Pondera HR - Gosuslugi Application Status Checker (Python + Playwright)
Checks the processing/decision status ('Услуга оказана', 'Услуга отказана',
'Промежуточные результаты по заявлению', 'Заявление зарегистрировано', etc.)
from Gosuslugi Personal Cabinet -> Заявления (https://lk.gosuslugi.ru/orders).

Uses a 2-Tier Hybrid Engine:
1. Tier 1 (Ultra-Fast Bulk Fetch without typing in search box):
   Fetches the orders feed directly via Gosuslugi's internal JSON API
   (/api/lk/v1/feeds/?...&types=ORDER...) inside the authenticated browser session,
   pulling hundreds of applications and their statuses + 'Гражданин' names in ~2 seconds.
2. Tier 2 (Targeted Search by № Заявления):
   For any specific application_no not found in the bulk feed, queries /api/lk/v1/feeds/?...&q=<app_no>
   and falls back to typing the application number into the search input on https://lk.gosuslugi.ru/orders.
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
from typing import Dict, Any, List, Optional

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ORDERS_URL = "https://lk.gosuslugi.ru/orders?type=ORDER,EQUEUE,APPEAL,CLAIM,SIGN,KND_APPEAL,LICENSING,LICENSING_APPEAL"

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

    period_re = re.compile(r"^20\d{2}-[1-4]$")
    app_no_re = re.compile(r"^[1-9]\d{9}$")

    for pdf_path in downloads_dir.glob("*.pdf"):
        stem = pdf_path.stem
        parts = stem.split("_")
        # Format A: 933532_8255536023_АБДУЛ РАШИД_2026-3.pdf
        if len(parts) >= 4 and parts[0].isdigit() and app_no_re.match(parts[1]) and period_re.match(parts[-1]):
            discovered.append({
                "sicil": parts[0],
                "sicil_no": parts[0],
                "application_no": parts[1],
                "worker_name": "_".join(parts[2:-1]),
                "period_code": parts[-1],
                "pdf_filename": pdf_path.name,
                "gosuslugi_status": "Заявление зарегистрировано",
            })
        # Format B: 8255536023_АБДУЛ РАШИД_2026-3.pdf
        elif len(parts) >= 3 and app_no_re.match(parts[0]) and period_re.match(parts[-1]):
            discovered.append({
                "sicil": "",
                "sicil_no": "",
                "application_no": parts[0],
                "worker_name": "_".join(parts[1:-1]),
                "period_code": parts[-1],
                "pdf_filename": pdf_path.name,
                "gosuslugi_status": "Заявление зарегистрировано",
            })
    return discovered


def classify_gosuslugi_status_text(raw_title: str, raw_status_code: str = "") -> str:
    """
    Normalizes Gosuslugi order status text ('title' and 'status' from /orders)
    into clear Russian status labels shown in Pondera HR.
    """
    t = (raw_title or "").strip()
    tl = t.lower()
    sc = (raw_status_code or "").strip().lower()

    if "услуга оказана" in tl or sc == "executed" or "исполнено" in tl:
        return "Услуга оказана"
    if (
        "отказано" in tl
        or "услуга отказана" in tl
        or "не оказана" in tl
        or "ошибка отправки" in tl
        or "возврат" in tl
        or sc in ("rejected", "error", "canceled", "cancelled")
    ):
        return "Услуга отказана"
    if "промежуточные результаты" in tl:
        return "Промежуточные результаты по заявлению"
    if "зарегистрировано" in tl:
        return "Заявление зарегистрировано"
    if "отправлено" in tl or "получено ведомством" in tl:
        return "Отправлено в ведомство"
    if t:
        return t
    return "В обработке"


def parse_feed_item(raw_item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extracts structured fields from a single item in Gosuslugi's /api/lk/v1/feeds/ response:
    - application_no (extId, e.g. '8268295301')
    - gosuslugi_status ('Услуга оказана', 'Промежуточные результаты по заявлению', 'Услуга отказана', etc.)
    - citizen_name ('Гражданин: Файзиев Бекзод Туйчи Угли')
    - address ('Адрес: ...')
    - initiator ('Инициатор заявления: Куцар Г. П.')
    - service_title ('Уведомления о трудовой деятельности иностранцев' / 'Уведомления о прибытии и убытии иностранцев')
    """
    if not isinstance(raw_item, dict):
        return None

    data_obj = raw_item.get("data") or {}
    ext_id = str(raw_item.get("extId") or data_obj.get("orderId") or "").strip()
    if not ext_id or not ext_id.isdigit():
        return None

    raw_title = str(raw_item.get("title") or "").strip()
    raw_status = str(raw_item.get("status") or "").strip()
    sub_title = str(raw_item.get("subTitle") or "").strip().strip("«»\"'")
    date_str = str(raw_item.get("date") or "").strip()
    epgu_code = str(data_obj.get("passCodeEpguCode") or "").strip()

    # Parse orderCreator JSON if present
    initiator = ""
    creator_raw = data_obj.get("orderCreator")
    if creator_raw and isinstance(creator_raw, str):
        try:
            creator_json = json.loads(creator_raw)
            initiator = str(creator_json.get("formattedLoginName") or creator_json.get("userLastName") or "").strip()
        except Exception:
            pass

    # Parse snippets JSON for 'Гражданин' and 'Адрес'
    citizen_name = ""
    address = ""
    snippets = data_obj.get("snippets") or []
    if isinstance(snippets, list):
        for snip in snippets:
            if not isinstance(snip, dict):
                continue
            snip_json_str = snip.get("json")
            if snip_json_str and isinstance(snip_json_str, str):
                try:
                    snip_obj = json.loads(snip_json_str)
                    for it in snip_obj.get("items") or []:
                        lbl = str(it.get("label") or "").strip().lower()
                        txt = str(it.get("text") or "").strip()
                        if "гражданин" in lbl or "фио" in lbl or "работник" in lbl:
                            citizen_name = txt
                        elif "адрес" in lbl:
                            address = txt
                except Exception:
                    pass

    normalized_status = classify_gosuslugi_status_text(raw_title, raw_status)
    detail_parts = [p for p in [sub_title, f"Гражданин: {citizen_name}" if citizen_name else "", f"Инициатор: {initiator}" if initiator else ""] if p]

    return {
        "application_no": ext_id,
        "feed_id": str(raw_item.get("id") or ""),
        "gosuslugi_status": normalized_status,
        "raw_title": raw_title,
        "raw_status": raw_status,
        "service_title": sub_title,
        "epgu_code": epgu_code,
        "citizen_name": citizen_name,
        "address": address,
        "initiator": initiator,
        "order_date": date_str,
        "status_detail": " | ".join(detail_parts)[:240],
    }


def fetch_bulk_orders_via_api(page: Page, max_pages: int = 15) -> Dict[str, Dict[str, Any]]:
    """
    Fetches up to `max_pages * 20` (e.g. 300) orders directly from Gosuslugi's internal
    /api/lk/v1/feeds/ JSON API using the browser's active session cookies — NO manual search typing needed!
    Returns a dict keyed by `application_no` (extId).
    """
    logger.info(f"Fetching bulk order list from Gosuslugi API (/api/lk/v1/feeds/, up to {max_pages * 20} items)...")
    base_url = (
        "https://www.gosuslugi.ru/api/lk/v1/feeds/"
        "?unread=false&isArchive=false&isHide=&types=ORDER,EQUEUE,APPEAL,CLAIM,SIGN,KND_APPEAL,LICENSING,LICENSING_APPEAL"
        "&pageSize=20&status=&startDate="
    )

    try:
        raw_items = page.evaluate(
            """async ({ baseUrl, maxPages }) => {
                const collected = [];
                let lastId = "";
                let lastDate = "";
                for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
                    const url = `${baseUrl}&lastFeedId=${encodeURIComponent(lastId)}&lastFeedDate=${encodeURIComponent(lastDate)}&q=`;
                    const resp = await fetch(url, { credentials: "include", headers: { "Accept": "application/json" } });
                    if (!resp.ok) break;
                    const data = await resp.json();
                    const items = Array.isArray(data.items) ? data.items : [];
                    if (items.length === 0) break;
                    collected.push(...items);
                    if (!data.hasMore) break;
                    const lastItem = items[items.length - 1];
                    lastId = String(lastItem.id || "");
                    lastDate = String(lastItem.date || "");
                    if (!lastId || !lastDate) break;
                }
                return collected;
            }""",
            {"baseUrl": base_url, "maxPages": max_pages},
        )
    except Exception as e:
        logger.warning(f"Bulk API fetch note: {e}")
        raw_items = []

    orders_by_no: Dict[str, Dict[str, Any]] = {}
    if isinstance(raw_items, list):
        for raw_it in raw_items:
            parsed = parse_feed_item(raw_it)
            if parsed and parsed["application_no"]:
                orders_by_no[parsed["application_no"]] = parsed

    logger.info(f"Bulk fetch complete: retrieved {len(orders_by_no)} unique applications (Заявления) without typing!")
    return orders_by_no


def query_single_order_by_no(page: Page, app_no: str) -> Optional[Dict[str, Any]]:
    """
    Looks up a single `application_no` on https://lk.gosuslugi.ru/orders:
    1) First tries direct JSON API query `/api/lk/v1/feeds/?...&q=<app_no>` (~0.2s)
    2) Falls back to typing `<app_no>` into the `input.search-input` box on https://lk.gosuslugi.ru/orders
    """
    clean_no = str(app_no or "").strip()
    if not clean_no:
        return None

    # 1) Direct JSON API query (?q=<app_no>)
    query_url = (
        "https://www.gosuslugi.ru/api/lk/v1/feeds/"
        "?unread=false&isArchive=false&isHide=&types=ORDER,EQUEUE,APPEAL,CLAIM,SIGN,KND_APPEAL,LICENSING,LICENSING_APPEAL"
        f"&pageSize=10&status=&startDate=&lastFeedId=&lastFeedDate=&q={clean_no}"
    )
    try:
        api_res = page.evaluate(
            """async (url) => {
                const resp = await fetch(url, { credentials: "include", headers: { "Accept": "application/json" } });
                if (!resp.ok) return { ok: false, items: [] };
                const data = await resp.json();
                return { ok: true, items: Array.isArray(data.items) ? data.items : [] };
            }""",
            query_url,
        )
        if isinstance(api_res, dict) and api_res.get("ok"):
            for raw_it in api_res.get("items") or []:
                parsed = parse_feed_item(raw_it)
                if parsed and parsed["application_no"] == clean_no:
                    return parsed
            return None
    except Exception:
        pass

    # 2) Fallback: UI Search Input on https://lk.gosuslugi.ru/orders
    try:
        search_inp = page.locator("input.search-input:visible, input[type='search']:visible, input[placeholder*='Поиск']:visible").first
        if search_inp.count() > 0 and search_inp.is_visible():
            search_inp.click()
            page.keyboard.press("Control+A")
            page.keyboard.press("Backspace")
            search_inp.fill(clean_no)
            page.keyboard.press("Enter")
            page.wait_for_timeout(1500)

            card_loc = page.locator(f"a[href*='/order/']:has-text('{clean_no}'), div.feed-item:has-text('{clean_no}')").first
            if card_loc.count() > 0 and card_loc.is_visible():
                card_text = card_loc.inner_text()
                status_label = classify_gosuslugi_status_text(card_text)
                citizen_match = re.search(r"Гражданин:\s*([^\n\r]+)", card_text)
                citizen_name = citizen_match.group(1).strip() if citizen_match else ""
                return {
                    "application_no": clean_no,
                    "gosuslugi_status": status_label,
                    "raw_title": status_label,
                    "citizen_name": citizen_name,
                    "status_detail": card_text.replace("\n", " | ")[:240],
                }
    except Exception as e:
        logger.debug(f"UI search fallback note for № {clean_no}: {e}")

    return None


def normalize_name_for_match(name: str) -> str:
    """Normalizes Russian full name for case-insensitive matching against 'Гражданин: ...'."""
    cleaned = re.sub(r"\b(нет|no|none|-)\b", " ", (name or "").lower(), flags=re.IGNORECASE)
    cleaned = re.sub(r"[^а-яёa-z0-9\s]", " ", cleaned)
    return " ".join(cleaned.split())


def sync_updates_to_pondera_api(updates: List[Dict[str, Any]]):
    """Pushes updated application statuses to Pondera HR Next.js API (/api/gosuslugi/submissions)."""
    if not updates:
        return
    try:
        import urllib.request
        req = urllib.request.Request(
            "http://localhost:3000/api/gosuslugi/submissions",
            data=json.dumps({"records": updates}, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=4.0) as _:
            pass
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(description="Pondera HR Gosuslugi Status Checker (lk.gosuslugi.ru/orders)")
    parser.add_argument("--json", default="", help="Path to JSON queue of applications/workers to check")
    parser.add_argument("--cdp-port", type=int, default=9222, help="Chrome Remote Debugging Port")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of records to check")
    parser.add_argument("--max-pages", type=int, default=15, help="Max bulk pages (20 orders/page) to fetch without searching")
    args = parser.parse_args()

    records: List[Dict[str, Any]] = []
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
                    records = data
                    logger.info(f"Loaded {len(records)} records from {jpath}")
                    break
            except Exception as e:
                logger.warning(f"Could not read {jpath}: {e}")

    # Also merge any PDFs found in ~/Downloads that have Gosuslugi application numbers
    discovered_pdfs = scan_downloads_for_applications()
    existing_app_nos = {str(r.get("application_no") or "").strip() for r in records if str(r.get("application_no") or "").strip()}
    for d_item in discovered_pdfs:
        if d_item["application_no"] not in existing_app_nos:
            records.append(d_item)
            existing_app_nos.add(d_item["application_no"])
            logger.info(f"APPLICATION_REGISTERED: {json.dumps(d_item, ensure_ascii=False)}")

    if args.limit > 0 and records:
        records = records[:args.limit]

    with sync_playwright() as p:
        logger.info(f"Connecting to Chrome on http://localhost:{args.cdp_port}...")
        try:
            browser = p.chromium.connect_over_cdp(f"http://localhost:{args.cdp_port}")
            context = browser.contexts[0] if browser.contexts else browser.new_context()
            page = None
            if context.pages:
                # Prefer a tab already on lk.gosuslugi.ru/orders, then any gosuslugi.ru tab
                for p_item in context.pages:
                    if "lk.gosuslugi.ru/orders" in (p_item.url or ""):
                        page = p_item
                        break
                if not page:
                    for p_item in context.pages:
                        if "gosuslugi.ru" in (p_item.url or "") and "chrome-error" not in (p_item.url or ""):
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

        # Navigate to https://lk.gosuslugi.ru/orders if not already there
        if "lk.gosuslugi.ru/orders" not in (page.url or ""):
            logger.info(f"Navigating to Gosuslugi Заявления ({ORDERS_URL})...")
            try:
                page.goto(ORDERS_URL, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(2000)
            except Exception as e:
                logger.warning(f"Navigation to lk.gosuslugi.ru/orders note: {e}")

        # TIER 1: Bulk fetch orders directly via Gosuslugi JSON API (no search box typing needed!)
        bulk_orders = fetch_bulk_orders_via_api(page, max_pages=args.max_pages)

        # Build secondary lookup by normalized Citizen Name ('Гражданин')
        orders_by_citizen: Dict[str, Dict[str, Any]] = {}
        for ord_item in bulk_orders.values():
            norm_cit = normalize_name_for_match(ord_item.get("citizen_name", ""))
            if norm_cit and norm_cit not in orders_by_citizen:
                orders_by_citizen[norm_cit] = ord_item

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        updated_records: List[Dict[str, Any]] = []

        # Log top recent applications found on the account so user always sees immediate feedback
        if bulk_orders:
            sample_list = list(bulk_orders.values())[:10]
            logger.info(f"--- Recent Applications on Gosuslugi Account (Top {len(sample_list)} of {len(bulk_orders)}) ---")
            for s_idx, s_ord in enumerate(sample_list, 1):
                logger.info(
                    f"  [{s_idx}] № {s_ord['application_no']} | {s_ord['gosuslugi_status']} | "
                    f"{s_ord.get('citizen_name') or s_ord.get('service_title') or ''}"
                )

        if records:
            for idx, rec in enumerate(records):
                app_no = str(rec.get("application_no") or "").strip()
                sicil = str(rec.get("sicil") or rec.get("sicil_no") or "").strip()
                worker_name = str(rec.get("worker_name") or "").strip()

                logger.info(
                    f"Checking Gosuslugi Status for: {worker_name or 'Заявление'} "
                    f"(Код: {sicil or '—'}, № Заявления: {app_no or 'по ФИО'})"
                )

                matched_order: Optional[Dict[str, Any]] = None

                # 1) Match by application_no in bulk feed
                if app_no and app_no in bulk_orders:
                    matched_order = bulk_orders[app_no]
                    logger.info(
                        f"  -> Matched № {app_no} in bulk feed (no search needed): {matched_order['gosuslugi_status']}"
                    )

                # 2) Match by Citizen Name ('Гражданин') in bulk feed if application_no not matched
                if not matched_order and worker_name:
                    norm_w = normalize_name_for_match(worker_name)
                    if norm_w and norm_w in orders_by_citizen:
                        matched_order = orders_by_citizen[norm_w]
                        app_no = matched_order["application_no"]
                        logger.info(
                            f"  -> Matched '{worker_name}' by Гражданин in bulk feed -> № {app_no}: {matched_order['gosuslugi_status']}"
                        )

                # 3) Tier 2 Fallback: Query single application_no via ?q=<app_no> or UI search box
                if not matched_order and app_no:
                    logger.info(f"  -> № {app_no} not in recent bulk feed, querying directly...")
                    matched_order = query_single_order_by_no(page, app_no)
                    if matched_order:
                        logger.info(
                            f"  -> Found № {app_no} via targeted search: {matched_order['gosuslugi_status']}"
                        )

                if matched_order:
                    updated_entry = {
                        **rec,
                        "sicil": sicil,
                        "sicil_no": sicil,
                        "worker_name": worker_name or matched_order.get("citizen_name") or "",
                        "application_no": matched_order["application_no"],
                        "gosuslugi_status": matched_order["gosuslugi_status"],
                        "status_detail": matched_order.get("status_detail", ""),
                        "checked_at": now_str,
                    }
                    updated_records.append(updated_entry)
                    logger.info(f"APPLICATION_STATUS_UPDATED: {json.dumps(updated_entry, ensure_ascii=False)}")
                    logger.info(
                        f"SUCCESS: Status checked for {updated_entry['worker_name']} "
                        f"(№ {updated_entry['application_no']}: {updated_entry['gosuslugi_status']})!"
                    )
                else:
                    logger.info(
                        f"  -> No matching order found on current Gosuslugi account for {worker_name} (№ {app_no or '—'})."
                    )
        else:
            # No pre-existing local records — register the recent orders discovered from the Gosuslugi account
            for s_ord in list(bulk_orders.values())[:50]:
                entry = {
                    "sicil": "",
                    "sicil_no": "",
                    "worker_name": s_ord.get("citizen_name") or s_ord.get("service_title") or "",
                    "citizenship": "",
                    "notification_type": "VKS_SALARY",
                    "period_code": "",
                    "application_no": s_ord["application_no"],
                    "gosuslugi_status": s_ord["gosuslugi_status"],
                    "status_detail": s_ord.get("status_detail", ""),
                    "checked_at": now_str,
                }
                updated_records.append(entry)
                logger.info(f"APPLICATION_STATUS_UPDATED: {json.dumps(entry, ensure_ascii=False)}")
                logger.info(
                    f"SUCCESS: Status checked for {entry['worker_name']} "
                    f"(№ {entry['application_no']}: {entry['gosuslugi_status']})!"
                )

        if updated_records:
            sync_updates_to_pondera_api(updated_records)

        logger.info(
            f"\n=== Status Check Complete ===\n"
            f"Bulk Feed Orders Scanned: {len(bulk_orders)}, Matched/Updated: {len(updated_records)}"
        )


if __name__ == "__main__":
    main()
