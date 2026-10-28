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
    app_no_re = re.compile(r"^[789]\d{9}$")

    for pdf_path in downloads_dir.glob("*.pdf"):
        stem = pdf_path.stem
        if stem.startswith("tmp_"):
            continue
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
    if "ошибка отправки" in tl:
        return "Ошибка отправки заявления в ведомство"
    if "ошибка получения" in tl:
        return "Ошибка получения заявления ведомством"
    if "ошибка ведомства" in tl or ("ошибк" in tl and "отказ" not in tl):
        return t if t.lower().startswith("ошибк") else f"Ошибка: {t}"
    if (
        "отказано" in tl
        or "услуга отказана" in tl
        or "не оказана" in tl
        or "возврат" in tl
        or sc in ("rejected", "canceled", "cancelled")
    ):
        return "Услуга отказана"
    if sc == "error":
        return t if (t and t.lower().startswith("ошибк")) else "Ошибка отправки заявления в ведомство"
    if "промежуточные результаты" in tl:
        return "Промежуточные результаты по заявлению"
    if "зарегистрировано" in tl:
        return "Заявление зарегистрировано"
    if "отправлено" in tl or "получено ведомством" in tl:
        return "Отправлено в ведомство"
    if t:
        return t
    return "В обработке"


def parse_gosuslugi_datetime(raw_date: str = "", text_fallback: str = "") -> str:
    """
    Extracts and normalizes the Gosuslugi status/order timestamp into 'YYYY-MM-DD HH:MM:SS' (Moscow time).
    Supports:
    - ISO strings from /api/lk/v1/feeds ('2026-10-23T15:50:12.000+0300' or '2026-10-23 15:50:12')
    - Russian numeric dates ('23.10.26 в 15:50', '23.10.2026 в 15:50', '23.10.2026, 15:50')
    - Russian relative dates ('Сегодня в 14:22', 'Вчера в 14:22')
    - Russian month names ('23 октября в 15:50', '23 окт. в 15:50')
    """
    from datetime import timedelta

    combined = f"{raw_date or ''} | {text_fallback or ''}".strip()
    if not combined:
        return ""

    # 1. ISO 'YYYY-MM-DDTHH:MM(:SS)' or 'YYYY-MM-DD HH:MM(:SS)'
    m_iso = re.search(r"(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}(?::\d{2})?)", combined)
    if m_iso:
        d_part = m_iso.group(1)
        t_part = m_iso.group(2)
        if len(t_part) == 5:
            t_part = f"{t_part}:00"
        return f"{d_part} {t_part}"

    # 2. 'DD.MM.YY(YY) в HH:MM'
    m_num = re.search(r"(\d{2})\.(\d{2})\.(\d{2,4})\s*(?:в|,)?\s*(\d{1,2}):(\d{2})", combined, re.IGNORECASE)
    if m_num:
        dd, mm, yy, hh, mi = m_num.groups()
        yr = f"20{yy}" if len(yy) == 2 else yy
        return f"{yr}-{mm}-{dd} {int(hh):02d}:{mi}:00"

    # 3. 'Сегодня в HH:MM' / 'Вчера в HH:MM'
    m_rel = re.search(r"(сегодня|вчера)\s*(?:в|,)?\s*(\d{1,2}):(\d{2})", combined, re.IGNORECASE)
    if m_rel:
        word, hh, mi = m_rel.groups()
        base_dt = datetime.now() if word.lower() == "сегодня" else (datetime.now() - timedelta(days=1))
        return f"{base_dt.strftime('%Y-%m-%d')} {int(hh):02d}:{mi}:00"

    # 4. '23 октября в 15:50'
    month_map = {
        "янв": "01", "фев": "02", "мар": "03", "апр": "04",
        "мая": "05", "май": "05", "июн": "06", "июл": "07",
        "авг": "08", "сен": "09", "окт": "10", "ноя": "11", "дек": "12",
    }
    m_mon = re.search(
        r"(\d{1,2})\s+(янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)[а-я.]*\s*(?:(\d{4})\s*)?(?:в|,)?\s*(\d{1,2}):(\d{2})",
        combined,
        re.IGNORECASE,
    )
    if m_mon:
        dd, mon_prefix, yr_opt, hh, mi = m_mon.groups()
        mm = month_map.get(mon_prefix[:3].lower(), "10")
        yr = yr_opt or str(datetime.now().year)
        return f"{yr}-{mm}-{int(dd):02d} {int(hh):02d}:{mi}:00"

    return ""


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

    # Parse snippets JSON for 'Гражданин', 'Адрес', and any refusal/status reason
    citizen_name = ""
    address = ""
    extra_notes = []
    for extra_key in ("description", "comment", "message", "statusComment", "reason"):
        v = str(raw_item.get(extra_key) or data_obj.get(extra_key) or "").strip()
        if v and v not in extra_notes:
            extra_notes.append(v)
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
                        elif txt and ("причин" in lbl or "комментар" in lbl or "основан" in lbl or "ошибк" in lbl or "отказ" in lbl):
                            extra_notes.append(f"{it.get('label')}: {txt}")
                except Exception:
                    pass

    normalized_status = classify_gosuslugi_status_text(raw_title, raw_status)
    parsed_order_dt = parse_gosuslugi_datetime(date_str, f"{raw_title} {raw_status}")
    detail_parts = [
        p
        for p in [
            raw_title,
            sub_title,
            f"Гражданин: {citizen_name}" if citizen_name else "",
            f"Инициатор: {initiator}" if initiator else "",
            *extra_notes,
        ]
        if p
    ]

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
        "order_date": parsed_order_dt or date_str,
        "status_detail": " | ".join(detail_parts)[:240],
    }


INTERCEPTED_FEED_ORDERS: Dict[str, Dict[str, Any]] = {}
FEED_RESPONSE_STATE: Dict[str, Any] = {
    "seq": 0,
    "last_url": "",
    "last_q": "",
    "last_items": [],
    "by_q": {},
}


def attach_feeds_network_listener(page: Page):
    """
    Attaches a Playwright response listener on `page` so whenever Angular on lk.gosuslugi.ru/orders
    makes a native request to `/api/lk/v1/feeds/` (which is NEVER blocked by Gosuslugi's 428 WAF),
    we automatically capture and parse all items into `INTERCEPTED_FEED_ORDERS` and index responses
    by their exact `q=` search parameter (`FEED_RESPONSE_STATE["by_q"][q_param]`).
    """
    if getattr(page, "_feeds_listener_attached", False):
        return

    from urllib.parse import urlparse, parse_qs

    def _on_response(resp):
        try:
            u = resp.url or ""
            if "/api/lk/v1/feeds" in u and resp.status == 200:
                q_vals = parse_qs(urlparse(u).query).get("q") or [""]
                q_param = str(q_vals[0] or "").strip()
                data = resp.json()
                items = data.get("items") if isinstance(data, dict) else None
                parsed_batch = []
                if isinstance(items, list):
                    for raw_it in items:
                        parsed = parse_feed_item(raw_it)
                        if parsed and parsed.get("application_no"):
                            INTERCEPTED_FEED_ORDERS[parsed["application_no"]] = parsed
                            parsed_batch.append(parsed)
                new_seq = int(FEED_RESPONSE_STATE.get("seq", 0)) + 1
                FEED_RESPONSE_STATE["seq"] = new_seq
                FEED_RESPONSE_STATE["last_url"] = u
                FEED_RESPONSE_STATE["last_q"] = q_param
                FEED_RESPONSE_STATE["last_items"] = parsed_batch
                by_q = FEED_RESPONSE_STATE.setdefault("by_q", {})
                by_q[q_param] = {
                    "seq": new_seq,
                    "items": parsed_batch,
                    "ts": time.time(),
                    "url": u,
                }
        except Exception:
            pass

    try:
        page.on("response", _on_response)
        setattr(page, "_feeds_listener_attached", True)
    except Exception:
        pass


def extract_citizen_from_card_text(card_text: str) -> str:
    """Extracts full Гражданин FIO from single-line or multi-line Gosuslugi card text."""
    if not card_text:
        return ""
    m = re.search(r"Гражданин\s*:?\s*([\s\S]+)$", card_text, re.IGNORECASE)
    if not m:
        return ""
    tail = m.group(1)
    stop_re = re.compile(
        r"^(адрес|инициатор|не прочитано|прочитано|уведомления|услуга|заявление|промежуточные|ошибка|сегодня|вчера|\d{1,2}\s+[а-я]+|№\s*\d+)",
        re.IGNORECASE,
    )
    parts: List[str] = []
    for raw_ln in tail.splitlines():
        ln = raw_ln.strip(" |\t\r\n")
        if not ln:
            continue
        if stop_re.match(ln):
            break
        parts.append(ln)
        if len(parts) >= 3:
            break
    return " ".join(parts).strip()


def extract_orders_from_dom(page: Page) -> Dict[str, Dict[str, Any]]:
    """
    Scrapes all visible `<a href*='/order/'>` order cards directly from the DOM on https://lk.gosuslugi.ru/orders.
    Immune to `/api/lk/v1/feeds/` 428 Firewall blocks because the cards are already rendered in the page DOM.
    """
    dom_orders: Dict[str, Dict[str, Any]] = {}
    try:
        raw_cards = page.evaluate(
            r"""() => {
                const results = [];
                const links = Array.from(document.querySelectorAll("a[href*='/order/']"));
                for (const a of links) {
                    const href = a.getAttribute("href") || "";
                    if (!href) continue;
                    let card = a;
                    for (let depth = 0; depth < 6 && card.parentElement; depth++) {
                        const parent = card.parentElement;
                        const orderLinksInParent = parent.querySelectorAll("a[href*='/order/']");
                        if (orderLinksInParent.length === 1) {
                            card = parent;
                        } else {
                            break;
                        }
                    }
                    const text = (card.innerText || "").trim();
                    results.push({ href, text });
                }
                return results;
            }"""
        )
        if isinstance(raw_cards, list):
            for c in raw_cards:
                c_href = str(c.get("href") or "").strip()
                c_text = str(c.get("text") or "").strip()
                if not c_href or not c_text:
                    continue
                m_feed = re.search(r"/order/(\d+)", c_href)
                feed_id = m_feed.group(1) if m_feed else ""
                m_no = re.search(r"№\s*(\d{8,14})", c_text)
                app_no = m_no.group(1) if m_no else ""
                if not app_no:
                    continue
                status_label = classify_gosuslugi_status_text(c_text)
                citizen_name = extract_citizen_from_card_text(c_text)
                c_low = c_text.lower().replace("ё", "е")
                if "трудовой деятельности" in c_low:
                    srv_title = "Уведомления о трудовой деятельности иностранцев"
                elif "прибытии" in c_low or "убытии" in c_low:
                    srv_title = "Уведомления о прибытии и убытии иностранцев"
                elif "разрешение на работу" in c_low:
                    srv_title = "Разрешение на работу ИГ"
                else:
                    srv_title = ""
                entry = {
                    "application_no": app_no,
                    "feed_id": feed_id,
                    "gosuslugi_status": status_label,
                    "raw_title": status_label,
                    "raw_status": "",
                    "service_title": srv_title,
                    "epgu_code": "",
                    "citizen_name": citizen_name,
                    "address": "",
                    "initiator": "",
                    "order_date": parse_gosuslugi_datetime("", c_text),
                    "status_detail": c_text.replace("\n", " | ")[:240],
                }
                dom_orders[app_no] = entry
                if app_no not in INTERCEPTED_FEED_ORDERS or not INTERCEPTED_FEED_ORDERS[app_no].get("feed_id"):
                    INTERCEPTED_FEED_ORDERS[app_no] = entry
    except Exception:
        pass
    return dom_orders


def fetch_bulk_orders_via_api(page: Page, max_pages: int = 15, fast_json_only: bool = False) -> Dict[str, Dict[str, Any]]:
    """
    Fetches orders from https://lk.gosuslugi.ru/orders using a 3-layer approach:
    1) Direct XHR/fetch to `/api/lk/v1/feeds/`
    2) Playwright network response interception (`INTERCEPTED_FEED_ORDERS`)
    3) DOM `<a href*='/order/'>` card scraping + clicking 'Показать ещё' when WAF 428 blocks direct JS fetch
    Returns a dict keyed by `application_no` (extId).
    When `fast_json_only=True` (30-min background sync / Hızlı Statü), skips slow DOM pagination loops.
    """
    attach_feeds_network_listener(page)
    cur_url = (page.url or "").lower()
    if "esia.gosuslugi.ru/login" in cur_url or "esia.gosuslugi.ru/idp" in cur_url:
        logger.warning(
            "Сессия Госуслуг не активна (открыто окно входа esia.gosuslugi.ru/login). "
            "Пожалуйста, войдите в аккаунт Госуслуг в Chrome для получения статусов!"
        )
        return {}

    logger.info(f"Fetching bulk order list from Gosuslugi API (/api/lk/v1/feeds/, up to {max_pages * 20} items)...")
    orders_by_no: Dict[str, Dict[str, Any]] = dict(INTERCEPTED_FEED_ORDERS)
    if "lk.gosuslugi.ru/orders" in cur_url:
        orders_by_no.update(extract_orders_from_dom(page))

    query_prefix = (
        "?unread=false&isArchive=false&isHide=&types=ORDER,EQUEUE,APPEAL,CLAIM,SIGN,KND_APPEAL,LICENSING,LICENSING_APPEAL"
        "&pageSize=20&status=&startDate="
    )
    candidate_bases = [
        f"/api/lk/v1/feeds/{query_prefix}",
        f"https://lk.gosuslugi.ru/api/lk/v1/feeds/{query_prefix}",
        f"https://www.gosuslugi.ru/api/lk/v1/feeds/{query_prefix}",
    ]

    try:
        raw_items = page.evaluate(
            """async ({ candidateBases, maxPages }) => {
                const fetchJsonViaXhr = (url) => new Promise((resolve) => {
                    try {
                        const xhr = new XMLHttpRequest();
                        xhr.open("GET", url, true);
                        xhr.withCredentials = true;
                        xhr.setRequestHeader("Accept", "application/json, text/plain, */*");
                        xhr.onload = () => {
                            if (xhr.status >= 200 && xhr.status < 300) {
                                try {
                                    resolve({ ok: true, data: JSON.parse(xhr.responseText) });
                                    return;
                                } catch (e) {}
                            }
                            resolve({ ok: false, status: xhr.status });
                        };
                        xhr.onerror = () => resolve({ ok: false, status: -1 });
                        xhr.send();
                    } catch (e) {
                        resolve({ ok: false, status: -2 });
                    }
                });

                for (const baseUrl of candidateBases) {
                    try {
                        const collected = [];
                        let lastId = "";
                        let lastDate = "";
                        for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
                            const url = `${baseUrl}&lastFeedId=${encodeURIComponent(lastId)}&lastFeedDate=${encodeURIComponent(lastDate)}&q=`;
                            let res = await fetchJsonViaXhr(url);
                            if (!res.ok) {
                                try {
                                    const fResp = await fetch(url, { credentials: "include" });
                                    if (fResp.ok) {
                                        res = { ok: true, data: await fResp.json() };
                                    }
                                } catch (fe) {}
                            }
                            if (!res.ok || !res.data) break;
                            const data = res.data;
                            const items = Array.isArray(data.items) ? data.items : [];
                            if (items.length === 0) break;
                            collected.push(...items);
                            if (data.hasMore === false) break;
                            const lastItem = items[items.length - 1];
                            const nextId = String(lastItem.id || "");
                            const nextDate = String(lastItem.date || "");
                            if (!nextId || !nextDate || nextId === lastId) break;
                            lastId = nextId;
                            lastDate = nextDate;
                        }
                        if (collected.length > 0) return collected;
                    } catch (e) {}
                }
                return [];
            }""",
            {"candidateBases": candidate_bases, "maxPages": max_pages},
        )
    except Exception as e:
        logger.warning(f"Bulk API fetch note: {e}")
        raw_items = []

    if isinstance(raw_items, list):
        for raw_it in raw_items:
            parsed = parse_feed_item(raw_it)
            if parsed and parsed["application_no"]:
                orders_by_no[parsed["application_no"]] = parsed
                INTERCEPTED_FEED_ORDERS[parsed["application_no"]] = parsed

    # Fallback when Gosuslugi WAF (428) blocks direct JS XHR/fetch:
    # When fast_json_only=True, do at most 2 quick clicks (~2 seconds total) so 30-min sync never slows down VKS sending!
    if len(orders_by_no) < (20 if fast_json_only else max(max_pages * 15, 60)):
        try:
            if "lk.gosuslugi.ru/orders" not in (page.url or "").lower():
                page.goto(ORDERS_URL, wait_until="domcontentloaded", timeout=35000)
                page.wait_for_timeout(1800 if fast_json_only else 2500)
            elif len(orders_by_no) == 0:
                page.reload(wait_until="domcontentloaded", timeout=35000)
                page.wait_for_timeout(1800 if fast_json_only else 2500)

            orders_by_no.update(INTERCEPTED_FEED_ORDERS)
            orders_by_no.update(extract_orders_from_dom(page))

            # Clear any leftover filter in search input if present
            try:
                s_inp = page.locator("input.search-input:visible, lib-search input:visible, input[type='search']:visible").first
                if s_inp.count() > 0 and s_inp.is_visible() and (s_inp.input_value() or "").strip():
                    s_inp.click()
                    page.keyboard.press("Control+A")
                    page.keyboard.press("Backspace")
                    page.keyboard.press("Enter")
                    page.wait_for_timeout(1200)
                    orders_by_no.update(INTERCEPTED_FEED_ORDERS)
                    orders_by_no.update(extract_orders_from_dom(page))
            except Exception:
                pass

            max_dom_clicks = 2 if fast_json_only else max(max_pages, 25)
            for _ in range(max_dom_clicks):
                show_more = page.locator(
                    "button:has-text('Показать ещё'):visible, "
                    "button:has-text('Показать еще'):visible, "
                    "lib-button:has-text('Показать ещё') button:visible, "
                    "span:has-text('Показать ещё'):visible"
                ).first
                if show_more.count() == 0 or not show_more.is_visible():
                    break
                try:
                    show_more.scroll_into_view_if_needed(timeout=1200)
                except Exception:
                    pass
                try:
                    show_more.click(timeout=2000)
                except Exception:
                    break
                page.wait_for_timeout(550 if fast_json_only else 650)
                orders_by_no.update(INTERCEPTED_FEED_ORDERS)
                orders_by_no.update(extract_orders_from_dom(page))
        except Exception as dom_err:
            logger.debug(f"DOM/Intercept fallback note: {dom_err}")

    logger.info(f"Bulk fetch complete: retrieved {len(orders_by_no)} unique applications (Заявления) without typing!")
    return orders_by_no


def query_single_order_by_no(page: Page, app_no: str, force_live_search: bool = False) -> Optional[Dict[str, Any]]:
    """
    Looks up a single `application_no` on https://lk.gosuslugi.ru/orders strictly by its 10-digit zayavka number:
    1) Checks `INTERCEPTED_FEED_ORDERS` cache first (unless `force_live_search=True` or status is not final)
    2) Navigates to https://lk.gosuslugi.ru/orders (if currently on an `/order/<feed_id>` page),
       types `<app_no>` into the search box (`input.search-input`) WITHOUT sending an intermediate empty `Backspace`
       search, and waits strictly for the `/api/lk/v1/feeds/?...&q=<app_no>` response (`FEED_RESPONSE_STATE["by_q"][clean_no]`)
       before ever advancing to the next application!
    3) Also falls back to direct XHR `/api/lk/v1/feeds/?...&q=<app_no>` inside `page.evaluate` if the UI input did not fire.
    """
    clean_no = str(app_no or "").strip()
    if not clean_no or not clean_no.isdigit():
        return None

    if not force_live_search and clean_no in INTERCEPTED_FEED_ORDERS and INTERCEPTED_FEED_ORDERS[clean_no].get("feed_id"):
        cached_st = str(INTERCEPTED_FEED_ORDERS[clean_no].get("gosuslugi_status") or "")
        if cached_st in ("Услуга оказана", "Услуга отказана"):
            return INTERCEPTED_FEED_ORDERS[clean_no]

    # Ensure browser is on the orders list page (https://lk.gosuslugi.ru/orders) where the search input exists
    try:
        if "lk.gosuslugi.ru/orders" not in (page.url or "").lower():
            page.goto(ORDERS_URL, wait_until="domcontentloaded", timeout=35000)
            page.wait_for_timeout(2000)
            extract_orders_from_dom(page)
            if not force_live_search and clean_no in INTERCEPTED_FEED_ORDERS and INTERCEPTED_FEED_ORDERS[clean_no].get("feed_id"):
                cached_st = str(INTERCEPTED_FEED_ORDERS[clean_no].get("gosuslugi_status") or "")
                if cached_st in ("Услуга оказана", "Услуга отказана"):
                    return INTERCEPTED_FEED_ORDERS[clean_no]
    except Exception:
        pass

    # Remove stale cached entry if forcing a live search so we capture fresh status from Gosuslugi
    if force_live_search and clean_no in INTERCEPTED_FEED_ORDERS:
        INTERCEPTED_FEED_ORDERS.pop(clean_no, None)

    by_q_map = FEED_RESPONSE_STATE.setdefault("by_q", {})
    prev_q_seq = int((by_q_map.get(clean_no) or {}).get("seq", 0))
    got_specific_q_response = False

    # UI Search Input on https://lk.gosuslugi.ru/orders (strictly by application_no, never by worker name!)
    try:
        search_selector = (
            "input.search-input:visible, "
            "lib-search input:visible, "
            "epgu-search input:visible, "
            "input[placeholder*='Поиск']:visible, "
            "input[placeholder*='поиск']:visible, "
            "input[placeholder*='Номер']:visible, "
            "input[placeholder*='заявлен']:visible, "
            "input[type='search']:visible, "
            "main input[type='text']:visible"
        )
        search_inp = page.locator(search_selector).first
        if search_inp.count() == 0 or not search_inp.is_visible():
            # If Gosuslugi temporarily showed 'Сервис недоступен' or search bar hid, reload /orders cleanly
            page.goto(ORDERS_URL, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(2500)
            search_inp = page.locator(search_selector).first

        if search_inp.count() > 0 and search_inp.is_visible():
            page.wait_for_timeout(350)
            prev_q_seq = int((by_q_map.get(clean_no) or {}).get("seq", 0))
            search_inp.click()
            # Use fill(clean_no) directly WITHOUT pressing Control+A + Backspace so Angular never fires an empty q="" XHR!
            search_inp.fill(clean_no)
            page.wait_for_timeout(120)
            page.keyboard.press("Enter")
            try:
                search_btn = page.locator(
                    "button.search-button:visible, button[type='submit']:visible"
                ).first
                if search_btn.count() > 0 and search_btn.is_visible():
                    search_btn.click(timeout=800)
            except Exception:
                pass

            # Poll up to 8.0s (32 x 250ms) waiting strictly for the `/api/lk/v1/feeds/?...&q=<clean_no>` response
            # (`by_q_map[clean_no]["seq"] > prev_q_seq`) or the visible DOM card for `clean_no`.
            for step_idx in range(32):
                page.wait_for_timeout(250)
                if clean_no in INTERCEPTED_FEED_ORDERS and INTERCEPTED_FEED_ORDERS[clean_no].get("gosuslugi_status"):
                    got_specific_q_response = True
                    break

                q_entry = by_q_map.get(clean_no) or {}
                cur_q_seq = int(q_entry.get("seq", 0))
                if cur_q_seq > prev_q_seq:
                    got_specific_q_response = True
                    page.wait_for_timeout(350)
                    if clean_no in INTERCEPTED_FEED_ORDERS and INTERCEPTED_FEED_ORDERS[clean_no].get("gosuslugi_status"):
                        break
                    q_items = q_entry.get("items") or []
                    if len(q_items) == 0:
                        return None
                    break

                card_check = page.locator(
                    f"a[href*='/order/']:has-text('{clean_no}'), div.feed-item:has-text('{clean_no}'), *:has-text('№ {clean_no}')"
                ).first
                if card_check.count() > 0 and card_check.is_visible():
                    got_specific_q_response = True
                    page.wait_for_timeout(250)
                    break

                # If Angular hasn't fired the request after 2.0s (step_idx == 8), re-trigger Enter / search button once
                if step_idx == 8 and cur_q_seq == prev_q_seq:
                    try:
                        search_inp.press("Enter")
                        search_btn = page.locator(
                            "button.search-button:visible, button[type='submit']:visible"
                        ).first
                        if search_btn.count() > 0 and search_btn.is_visible():
                            search_btn.click(timeout=600)
                    except Exception:
                        pass

            if clean_no in INTERCEPTED_FEED_ORDERS and INTERCEPTED_FEED_ORDERS[clean_no].get("gosuslugi_status"):
                dom_found = extract_orders_from_dom(page)
                if clean_no in dom_found and dom_found[clean_no].get("feed_id") and not INTERCEPTED_FEED_ORDERS[clean_no].get("feed_id"):
                    INTERCEPTED_FEED_ORDERS[clean_no]["feed_id"] = dom_found[clean_no]["feed_id"]
                return INTERCEPTED_FEED_ORDERS[clean_no]

            dom_found = extract_orders_from_dom(page)
            if clean_no in dom_found:
                return dom_found[clean_no]

            card_loc = page.locator(
                f"a[href*='/order/']:has-text('{clean_no}'), div.feed-item:has-text('{clean_no}')"
            ).first
            if card_loc.count() > 0 and card_loc.is_visible():
                card_text = card_loc.inner_text()
                href_val = card_loc.get_attribute("href") or ""
                if not href_val:
                    try:
                        inner_a = card_loc.locator("a[href*='/order/']").first
                        if inner_a.count() > 0:
                            href_val = inner_a.get_attribute("href") or ""
                    except Exception:
                        pass
                m_feed = re.search(r"/order/(\d+)", href_val)
                feed_id = m_feed.group(1) if m_feed else ""
                status_label = classify_gosuslugi_status_text(card_text)
                citizen_name = extract_citizen_from_card_text(card_text)
                c_low = card_text.lower().replace("ё", "е")
                if "трудовой деятельности" in c_low:
                    srv_title = "Уведомления о трудовой деятельности иностранцев"
                elif "прибытии" in c_low or "убытии" in c_low:
                    srv_title = "Уведомления о прибытии и убытии иностранцев"
                elif "разрешение на работу" in c_low:
                    srv_title = "Разрешение на работу ИГ"
                else:
                    srv_title = "Уведомления о трудовой деятельности иностранцев"
                found_item = {
                    "application_no": clean_no,
                    "feed_id": feed_id,
                    "gosuslugi_status": status_label,
                    "raw_title": status_label,
                    "service_title": srv_title,
                    "citizen_name": citizen_name,
                    "status_detail": card_text.replace("\n", " | ")[:240],
                }
                INTERCEPTED_FEED_ORDERS[clean_no] = found_item
                return found_item
    except Exception as e:
        logger.debug(f"UI search fallback note for № {clean_no}: {e}")

    return None


def normalize_name_for_match(name: str) -> str:
    """Normalizes Russian full name for case-insensitive matching against 'Гражданин: ...'."""
    cleaned = re.sub(r"^[0-9]+[а-яёa-z]*\s*", " ", (name or "").lower().replace("ё", "е"))
    cleaned = re.sub(r"[^а-яa-z\s]", " ", cleaned)
    stop_words = {"нет", "не", "заполнено", "отсутствует", "no", "none", "null", "дог"}
    tokens = [t for t in cleaned.split() if t and len(t) >= 2 and t not in stop_words]
    return " ".join(tokens)


def does_citizen_match_worker_name(citizen_text: str, worker_name: str) -> bool:
    """
    Strictly verifies that all meaningful name tokens of `worker_name`
    appear as exact whole words inside `citizen_text` ('Гражданин: ...').
    Supports single-token names when Фамилия/Отчество are 'Нет' (e.g. 'Нет АДЖАД Нет'),
    requiring that `citizen_text` also has only 1 token so 'АКРАМ' never matches 'АКРАМЖОН'.
    """
    norm_c = normalize_name_for_match(citizen_text)
    norm_w = normalize_name_for_match(worker_name)
    if not norm_c or not norm_w:
        return False
    c_tokens = [t for t in norm_c.split() if len(t) >= 2]
    w_tokens = [t for t in norm_w.split() if len(t) >= 2]
    if not c_tokens or not w_tokens:
        return False
    if len(w_tokens) == 1 and len(c_tokens) != 1:
        return False
    c_set = set(c_tokens)
    return all(tok in c_set for tok in w_tokens)


def is_valid_labor_notification_order(ord_item: Dict[str, Any]) -> bool:
    """
    Strictly requires 'Уведомления о трудовой деятельности иностранцев' and excludes
    non-labor services such as 'Уведомления о прибытии и убытии иностранцев',
    Work Permits ('Разрешение на работу ИГ'), and unsent drafts ('черновик').
    """
    if not ord_item:
        return False
    srv = str(ord_item.get("service_title") or "").lower().replace("ё", "е")
    raw_t = str(ord_item.get("raw_title") or "").lower().replace("ё", "е")
    raw_s = str(ord_item.get("raw_status") or "").lower()
    det = str(ord_item.get("status_detail") or "").lower().replace("ё", "е")
    combined = f"{srv} {raw_t} {det}"
    excluded = (
        "прибытии",
        "убытии",
        "разрешение на работу",
        "выдан документ разрешение",
        "получение разрешения",
        "черновик",
    )
    if any(bad in combined for bad in excluded) or "draft" in raw_s:
        return False
    if "трудовой деятельности" not in combined:
        return False
    return True


BLOCKED_MISMATCHED_APP_BY_SICIL: Dict[str, str] = {
    "902127": "8324568212",
    "941180": "8286574341",
    "937975": "8294240592",
    "934977": "8310552187",
    "927061": "8311177673",
    "937851": "8290698264",
    "941976": "8287106492",
    "938730": "8287534774",
    "940683": "8291445402",
    "938390": "8291785562",
    "935934": "8304165921",
    "930970": "8304949515",
    "937133": "8291182665",
    "931095": "8306890167",
    "937526": "8292385071",
    "900701": "8303416245",
    "929073": "8306932902",
    "941091": "8306428687",
    "900088": "8303994182",
    "938033": "8316624567",
    "931246": "8291571654",
    "937909": "8291937845",
    "902773": "8317594914",
    "935312": "8316021625",
    "938789": "8291098061",
    "931391": "8291264938",
    "936243": "8307402667",
    "932622": "8305657900",
    "939622": "8288949057",
    "936545": "8305756556",
    "933532": "8284206508",
    "937332": "8284083499",
    "941737": "8269035605",
}


def is_acceptable_order_for_exact_app_no(ord_item: Dict[str, Any], worker_name: str = "") -> bool:
    """
    Validates an order matched by its exact 10-digit Gosuslugi `application_no` (`extId`).
    Excludes non-labor services ('прибытии', 'убытии', 'разрешение на работу', 'автотранспорт') and unsent drafts ('черновик'),
    and if `citizen_name` is present on the order card, verifies it matches `worker_name`.
    """
    if not ord_item:
        return False
    app_no = str(ord_item.get("application_no") or "").strip()
    if app_no in ("8316972551", "8324568212"):
        return False
    srv = str(ord_item.get("service_title") or "").lower().replace("ё", "е")
    raw_t = str(ord_item.get("raw_title") or "").lower().replace("ё", "е")
    raw_s = str(ord_item.get("raw_status") or "").lower()
    det = str(ord_item.get("status_detail") or "").lower().replace("ё", "е")
    combined = f"{srv} {raw_t} {det}"
    excluded = (
        "прибытии",
        "убытии",
        "разрешение на работу",
        "выдан документ разрешение",
        "получение разрешения",
        "черновик",
        "автотранспорт",
        "транспортн",
    )
    if any(bad in combined for bad in excluded) or "draft" in raw_s:
        return False
    cit_name = str(ord_item.get("citizen_name") or "").strip()
    clean_w_name = re.sub(r"^\d+[а-яА-Яa-zA-Z]?\s+", "", str(worker_name or "").strip())
    if cit_name and clean_w_name and not does_citizen_match_worker_name(cit_name, clean_w_name):
        logger.warning(
            f"  -> Citizen mismatch on № {app_no}: Gosuslugi citizen='{cit_name}' vs worker='{clean_w_name}'"
        )
        return False
    return True


def clean_worker_name_for_pdf(raw_name: str) -> str:
    skip_tokens = {"нет", "не заполнено", "отсутствует", "-", "none", "null", "no", ""}
    words = [w for w in str(raw_name or "").strip().split() if w.lower() not in skip_tokens]
    cleaned = " ".join(words) if words else str(raw_name or "Сотрудник").strip()
    cleaned = re.sub(r'[<>:"/\\|?*]+', " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def expand_history_and_inspect_order_page(page: Page, feed_id: str) -> Dict[str, str]:
    """
    Opens https://lk.gosuslugi.ru/order/<feed_id>, clicks 'Показать историю' (and any collapsed
    'Зарегистрировано на портале' block), and extracts 'citizen_name' and 'order_no'.
    """
    info = {"citizen_name": "", "order_no": ""}
    if not feed_id:
        return info
    order_url = f"https://lk.gosuslugi.ru/order/{feed_id}"
    try:
        if order_url not in (page.url or ""):
            page.goto(order_url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1800)
    except Exception:
        return info

    # Wait up to 8s specifically for 'Показать историю' (never break early on '№ <digits>' before 'Показать историю' renders!)
    for _ in range(16):
        try:
            b = page.evaluate("() => (document.body && document.body.innerText) || ''") or ""
            if "Показать историю" in b or "Показать всю историю" in b or "Скрыть историю" in b or "Гражданин" in b or "req_preview" in b:
                break
        except Exception:
            pass
        page.wait_for_timeout(450)

    # Click the exact blue 'Показать историю' text cleanly via DOM without blind mouse coordinates
    clicked_h = False
    try:
        clicked_h = bool(
            page.evaluate(
                r"""() => {
                    const isSafeOrderElement = (el) => {
                        if (!el) return false;
                        if (el.closest('header, footer, nav')) return false;
                        const a = el.closest('a[href]');
                        if (a) {
                            const href = (a.getAttribute('href') || '').toLowerCase();
                            if (href && !href.includes('/order/') && !href.startsWith('#') && !href.startsWith('javascript')) {
                                return false;
                            }
                        }
                        return true;
                    };
                    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
                    let matchedEl = null;
                    while (walker.nextNode()) {
                        const node = walker.currentNode;
                        const txt = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
                        if (/^показать\s+(всю\s+)?историю$/i.test(txt) && node.parentElement && isSafeOrderElement(node.parentElement)) {
                            const r = node.parentElement.getBoundingClientRect();
                            if (r.width > 10 && r.height > 8) {
                                matchedEl = node.parentElement;
                                break;
                            }
                        }
                    }
                    if (!matchedEl) return false;
                    const clickTarget = matchedEl.closest('button, [role="button"], .link, .history-toggle') || matchedEl;
                    if (isSafeOrderElement(clickTarget)) {
                        clickTarget.click();
                        return true;
                    }
                    return false;
                }"""
            )
        )
    except Exception:
        pass

    if clicked_h:
        for _ in range(16):
            page.wait_for_timeout(450)
            try:
                b_after = page.evaluate("() => (document.body && document.body.innerText) || ''") or ""
                if "req_preview" in b_after:
                    break
            except Exception:
                pass

    # Only expand collapsed '.history-status:not(.open)' if 'req_preview' is still hidden
    try:
        body_check = page.evaluate("() => (document.body && document.body.innerText) || ''") or ""
        if "req_preview" not in body_check:
            expanded_inner = page.evaluate(
                r"""() => {
                    let clicked = false;
                    const closedStatuses = Array.from(document.querySelectorAll('.history-status:not(.open), .history-item:not(.open)'));
                    for (const st of closedStatuses) {
                        if (st.closest('header, footer, nav')) continue;
                        const header = st.querySelector('.history-header, .status-title') || st;
                        header.click();
                        clicked = true;
                    }
                    return clicked;
                }"""
            )
            if expanded_inner:
                page.wait_for_timeout(1200)
    except Exception:
        pass

    # Scroll 'req_preview' into center of viewport so its 'Скачать' link is visible
    try:
        page.evaluate(
            r"""() => {
                const els = Array.from(document.querySelectorAll('span, div, p, a, li'));
                for (const el of els) {
                    const t = (el.innerText || el.textContent || '').trim();
                    if (t === 'req_preview' || (t.includes('req_preview') && t.length < 45)) {
                        el.scrollIntoView({ block: 'center', inline: 'nearest' });
                        break;
                    }
                }
            }"""
        )
        page.wait_for_timeout(350)
    except Exception:
        pass

    # Extract Гражданин
    try:
        cit = page.evaluate(
            """() => {
                const stopWords = /^(документы|история|показать историю|скрыть историю|скачать|скачать всё|адрес|статус|сведения|отправитель|инициатор)$/i;
                const allEls = Array.from(document.querySelectorAll('div, span, p, dt, td, label'));
                for (const el of allEls) {
                    const txt = (el.innerText || "").trim();
                    if (txt === "Гражданин" || txt === "Гражданин:" || txt === "Иностранный гражданин") {
                        let cur = el;
                        for (let depth = 0; depth < 4 && cur; depth++) {
                            const next = cur.nextElementSibling;
                            if (next && (next.innerText || "").trim()) {
                                const lines = (next.innerText || "").split("\\n").map(s => s.trim()).filter(s => s && !stopWords.test(s));
                                if (lines.length > 0) return lines.join(" ").replace(/\\s+/g, " ").trim();
                            }
                            if (cur.parentElement) {
                                const pLines = (cur.parentElement.innerText || "").split("\\n").map(s => s.trim()).filter(Boolean);
                                const gIdx = pLines.findIndex(l => /^Гражданин\\s*:?$/i.test(l) || l.startsWith("Гражданин"));
                                if (gIdx !== -1 && pLines.length > gIdx + 1) {
                                    const collected = [];
                                    for (let k = gIdx + 1; k < Math.min(pLines.length, gIdx + 4); k++) {
                                        if (stopWords.test(pLines[k])) break;
                                        collected.push(pLines[k]);
                                    }
                                    if (collected.length > 0) return collected.join(" ").replace(/\\s+/g, " ").trim();
                                }
                            }
                            cur = cur.parentElement;
                        }
                    }
                }
                return "";
            }"""
        )
        if cit:
            info["citizen_name"] = str(cit).strip()
    except Exception:
        pass

    try:
        b_txt = page.locator("body").inner_text(timeout=2000)
        if not normalize_name_for_match(info["citizen_name"]):
            m_cit = re.search(r"Гражданин\s*:?\s*(?:\r?\n|\s)+([^\r\n]+(?:\r?\n[^\r\n]+){0,2})", b_txt, re.IGNORECASE)
            if m_cit:
                lines = [ln.strip() for ln in m_cit.group(1).splitlines() if ln.strip()]
                valid = []
                for ln in lines:
                    if re.match(r"^(документы|история|показать историю|скрыть историю|скачать|адрес|статус|сведения|действия)", ln, re.IGNORECASE):
                        break
                    valid.append(ln)
                if valid:
                    info["citizen_name"] = " ".join(valid).strip()
        m_no = re.search(r"№\s*(\d{8,14})", b_txt)
        if m_no:
            info["order_no"] = m_no.group(1).strip()
        info["gosuslugi_status"] = classify_gosuslugi_status_text(b_txt[:700])
    except Exception:
        pass

    return info


def download_missing_pdf_for_order(
    page: Page,
    feed_id: str,
    app_no: str,
    sicil: str,
    worker_name: str,
    period_code: str,
) -> str:
    """
    Checks if a PDF for `app_no` already exists in ~/Downloads.
    If not, opens https://lk.gosuslugi.ru/order/<feed_id>, expands 'Показать историю',
    clicks 'Скачать' next to 'req_preview', renames the file to:
      <Sicil>_<AppNo>_<CleanWorkerName>_<Period>.pdf
    and uploads a copy to the central backend (/api/gosuslugi/pdf).
    """
    downloads_dir = Path.home() / "Downloads"
    downloads_dir.mkdir(parents=True, exist_ok=True)
    clean_no = str(app_no or "").strip()
    if not clean_no:
        return ""

    clean_name = clean_worker_name_for_pdf(worker_name)
    clean_sicil = re.sub(r'[<>:"/\\|?*]+', "", str(sicil or "").strip())
    clean_period = str(period_code or "2026-3").strip() or "2026-3"
    if not re.match(r"^20\d{2}-[1-4]$", clean_period):
        clean_period = "2026-3"

    target_filename = (
        f"{clean_sicil}_{clean_no}_{clean_name}_{clean_period}.pdf"
        if clean_sicil
        else f"{clean_no}_{clean_name}_{clean_period}.pdf"
    )
    target_filepath = downloads_dir / target_filename

    # Check if already downloaded in ~/Downloads -> ensure renamed & uploaded to backend
    for p in downloads_dir.glob("*.pdf"):
        if clean_no in p.name and not p.name.startswith("tmp_"):
            try:
                if p.resolve() != target_filepath.resolve():
                    os.replace(str(p), str(target_filepath))
                    logger.info(f"  -> Renamed existing PDF in Downloads: {target_filename}")
                cached_st = (INTERCEPTED_FEED_ORDERS.get(clean_no) or {}).get("gosuslugi_status", "")
                upload_pdf_to_central_server(target_filepath, clean_no, clean_sicil, gosuslugi_status=cached_st)
                return target_filename
            except Exception:
                upload_pdf_to_central_server(p, clean_no, clean_sicil)
                return p.name

    if not feed_id:
        return ""

    logger.info(f"  -> Missing PDF for № {clean_no} ({worker_name}): opening order {feed_id} & clicking 'Показать историю' -> 'Скачать'...")
    page_info = expand_history_and_inspect_order_page(page, feed_id)
    inspected_status = page_info.get("gosuslugi_status") or ""
    if inspected_status in ("Услуга оказана", "Услуга отказана", "Промежуточные результаты по заявлению"):
        if clean_no in INTERCEPTED_FEED_ORDERS:
            INTERCEPTED_FEED_ORDERS[clean_no]["gosuslugi_status"] = inspected_status

    existing_pdfs = {}
    for p in downloads_dir.iterdir():
        if p.is_file():
            try:
                existing_pdfs[p.resolve()] = p.stat().st_mtime
            except Exception:
                pass

    click_time = time.time()

    def trigger_dl():
        try:
            target_box = page.evaluate(
                r"""() => {
                    let reqY = null;
                    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
                    while (walker.nextNode()) {
                        const n = walker.currentNode;
                        if ((n.nodeValue || '').includes('req_preview') && n.parentElement) {
                            n.parentElement.scrollIntoView({ block: 'center' });
                            const rr = n.parentElement.getBoundingClientRect();
                            if (rr.width > 5 && rr.height > 5) {
                                reqY = rr.top + rr.height / 2;
                                break;
                            }
                        }
                    }

                    let downloadAllY = null;
                    const allEls = Array.from(document.querySelectorAll('a, button, span, div'));
                    for (const el of allEls) {
                        const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                        if (t === 'скачать всё' || t === 'скачать все') {
                            const r = el.getBoundingClientRect();
                            if (r.width > 15 && r.height > 8) {
                                downloadAllY = r.top + r.height / 2;
                                break;
                            }
                        }
                    }

                    const candidates = [];
                    for (const el of allEls) {
                        if (el.closest('header, footer, nav')) continue;
                        const rawText = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                        if (rawText !== 'Скачать') continue;

                        const clickable = el.closest('a, button, [role="button"]') || el;
                        const cText = (clickable.innerText || clickable.textContent || '').replace(/\s+/g, ' ').trim();
                        const pText = ((clickable.parentElement && clickable.parentElement.innerText) || '').replace(/\s+/g, ' ').trim();
                        if (cText !== 'Скачать' || /вс[её]/i.test(cText) || /^Скачать\s+вс[её]$/i.test(pText)) {
                            continue;
                        }

                        const r = clickable.getBoundingClientRect();
                        if (r.width < 15 || r.height < 8 || r.height > 90) continue;
                        const btnY = r.top + r.height / 2;
                        if (downloadAllY !== null && Math.abs(btnY - downloadAllY) < 18) {
                            continue;
                        }

                        const yDiff = (reqY !== null) ? Math.abs(btnY - reqY) : 999;
                        candidates.push({
                            x: Math.round(r.left + r.width / 2),
                            y: Math.round(r.top + r.height / 2),
                            yDiff,
                            top: r.top
                        });
                    }

                    let chosen = null;
                    if (reqY !== null) {
                        const rowMatches = candidates.filter(c => c.yDiff < 40).sort((a, b) => a.yDiff - b.yDiff);
                        if (rowMatches.length > 0) {
                            chosen = rowMatches[0];
                        }
                    }
                    if (!chosen && candidates.length > 0) {
                        candidates.sort((a, b) => a.top - b.top);
                        chosen = candidates[0];
                    }
                    return chosen ? { x: chosen.x, y: chosen.y } : null;
                }"""
            )
            if target_box and target_box.get("x") and target_box.get("y"):
                cx, cy = int(target_box["x"]), int(target_box["y"])
                page.mouse.move(cx, cy)
                page.wait_for_timeout(80)
                page.mouse.click(cx, cy)
                return True
        except Exception:
            pass
        return False

    downloaded_path: Optional[Path] = None
    try:
        with page.expect_download(timeout=5000) as dl_info:
            trigger_dl()
        dl = dl_info.value
        temp_target = downloads_dir / f"tmp_{os.getpid()}_{int(click_time)}_{clean_no}.pdf"
        dl.save_as(str(temp_target))
        downloaded_path = temp_target
    except Exception:
        pass

    already_renamed_re = re.compile(r"^(?:\d+_)?\d{8,14}_.+_20\d{2}-[1-4]\.pdf$", re.IGNORECASE)
    uuid_blob_re = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\s*\(\d+\))?$", re.IGNORECASE)
    if not downloaded_path or not downloaded_path.exists():
        for wait_idx in range(20):
            page.wait_for_timeout(500)
            if wait_idx == 6:
                trigger_dl()
            active_cr = [p for p in downloads_dir.glob("*.crdownload") if (time.time() - p.stat().st_mtime) < 30]
            if active_cr:
                continue
            cands = []
            for p in downloads_dir.iterdir():
                try:
                    if not p.is_file():
                        continue
                    sfx = p.suffix.lower()
                    if sfx in (".crdownload", ".tmp", ".part", ".zip", ".exe", ".msi", ".xlsx", ".xls", ".docx", ".png", ".jpg"):
                        continue
                    if already_renamed_re.match(p.name):
                        continue
                    resolved = p.resolve()
                    st = p.stat()
                    mtime = st.st_mtime
                    if st.st_size < 1000:
                        continue
                    is_new = (resolved not in existing_pdfs) or (mtime > existing_pdfs[resolved]) or (mtime >= (click_time - 2.5))
                    if not is_new:
                        continue
                    is_pdf_file = (sfx == ".pdf") or bool(uuid_blob_re.match(p.name))
                    if not is_pdf_file and sfx == "":
                        with open(p, "rb") as fh:
                            is_pdf_file = b"%PDF" in fh.read(16)
                    if is_pdf_file:
                        cands.append((mtime, p))
                except Exception:
                    pass
            if cands:
                cands.sort(key=lambda item: item[0], reverse=True)
                downloaded_path = cands[0][1]
                break

    if not downloaded_path or not downloaded_path.exists():
        return ""

    clean_name = clean_worker_name_for_pdf(worker_name)
    clean_sicil = re.sub(r'[<>:"/\\|?*]+', "", str(sicil or "").strip())
    clean_period = str(period_code or "2026-3").strip() or "2026-3"
    if not re.match(r"^20\d{2}-[1-4]$", clean_period):
        clean_period = "2026-3"

    new_filename = f"{clean_sicil}_{clean_no}_{clean_name}_{clean_period}.pdf" if clean_sicil else f"{clean_no}_{clean_name}_{clean_period}.pdf"
    new_filepath = downloads_dir / new_filename
    final_st = inspected_status or (INTERCEPTED_FEED_ORDERS.get(clean_no) or {}).get("gosuslugi_status", "")
    try:
        if downloaded_path.resolve() != new_filepath.resolve():
            os.replace(str(downloaded_path), str(new_filepath))
        logger.info(f"  -> Downloaded & renamed missing PDF: {new_filename}")
        upload_pdf_to_central_server(new_filepath, clean_no, clean_sicil, gosuslugi_status=final_st)
        return new_filename
    except Exception:
        upload_pdf_to_central_server(downloaded_path, clean_no, clean_sicil, gosuslugi_status=final_st)
        return downloaded_path.name


def upload_pdf_to_central_server(
    pdf_path: Path,
    app_no: str,
    sicil_no: str,
    gosuslugi_status: str = "",
    is_screenshot: bool = False,
):
    """Uploads the downloaded PDF receipt or A4 status screenshot directly to Pondera HR Central Server (/api/gosuslugi/pdf)."""
    try:
        if not pdf_path or not pdf_path.exists():
            return
        import base64
        import urllib.request
        import ssl
        b64_str = base64.b64encode(pdf_path.read_bytes()).decode("ascii")
        payload = json.dumps({
            "filename": pdf_path.name,
            "pdf_base64": b64_str,
            "application_no": str(app_no or "").strip(),
            "sicil_no": str(sicil_no or "").strip(),
            "gosuslugi_status": str(gosuslugi_status or "").strip(),
            "is_screenshot": bool(is_screenshot),
        }).encode("utf-8")
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        for api_url in (
            "https://hr.pondera.network/api/gosuslugi/pdf",
            "http://localhost:3000/api/gosuslugi/pdf",
        ):
            try:
                req = urllib.request.Request(
                    api_url,
                    data=payload,
                    headers={"Content-Type": "application/json; charset=utf-8"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=10.0, context=ctx if api_url.startswith("https") else None) as _:
                    logger.info(f"  -> Uploaded {'A4 Status Screenshot' if is_screenshot else 'PDF'} to central server: {pdf_path.name}")
                    break
            except Exception:
                pass
    except Exception:
        pass


def _parse_jpeg_dimensions(jpeg_bytes: bytes) -> tuple[int, int]:
    """Extracts (width, height) from raw JPEG bytes using SOF markers without external dependencies."""
    n = len(jpeg_bytes)
    i = 2
    while i < n - 9:
        if jpeg_bytes[i] != 0xFF:
            i += 1
            continue
        while i < n and jpeg_bytes[i] == 0xFF:
            i += 1
        if i >= n:
            break
        marker = jpeg_bytes[i]
        i += 1
        if marker in (0xD8, 0xD9) or (0xD0 <= marker <= 0xD7):
            continue
        if i + 2 > n:
            break
        seg_len = int.from_bytes(jpeg_bytes[i:i + 2], "big")
        if marker in (0xC0, 0xC1, 0xC2, 0xC3) and i + 7 <= n:
            h = int.from_bytes(jpeg_bytes[i + 3:i + 5], "big")
            w = int.from_bytes(jpeg_bytes[i + 5:i + 7], "big")
            if w > 0 and h > 0:
                return w, h
        if seg_len < 2:
            break
        i += seg_len
    return 794, 1123


def build_a4_pdf_from_jpeg_bytes(jpeg_bytes: bytes) -> bytes:
    """
    Wraps a cropped JPEG image into a standard 1-page A4 Portrait PDF (595.28 x 841.89 pt)
    using native PDF DCTDecode stream with zero external dependencies.
    """
    img_w, img_h = _parse_jpeg_dimensions(jpeg_bytes)
    page_w, page_h = 595.28, 841.89
    margin = 20.0
    avail_w = page_w - 2 * margin
    avail_h = page_h - 2 * margin
    scale = min(avail_w / max(img_w, 1), avail_h / max(img_h, 1))
    draw_w = img_w * scale
    draw_h = img_h * scale
    x_pos = (page_w - draw_w) / 2.0
    y_pos = page_h - margin - draw_h

    content_stream = f"q\n{draw_w:.2f} 0 0 {draw_h:.2f} {x_pos:.2f} {y_pos:.2f} cm\n/Im0 Do\nQ\n".encode("ascii")

    objects: List[bytes] = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        (
            f"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_w:.2f} {page_h:.2f}] "
            f"/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
        ).encode("ascii"),
        (
            f"4 0 obj\n<< /Type /XObject /Subtype /Image /Width {img_w} /Height {img_h} "
            f"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {len(jpeg_bytes)} >>\nstream\n"
        ).encode("ascii")
        + jpeg_bytes
        + b"\nendstream\nendobj\n",
        (
            f"5 0 obj\n<< /Length {len(content_stream)} >>\nstream\n"
        ).encode("ascii")
        + content_stream
        + b"endstream\nendobj\n",
    ]

    pdf_out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets: List[int] = []
    for obj in objects:
        offsets.append(len(pdf_out))
        pdf_out.extend(obj)

    xref_offset = len(pdf_out)
    pdf_out.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("ascii"))
    for off in offsets:
        pdf_out.extend(f"{off:010d} 00000 n \n".encode("ascii"))
    pdf_out.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(pdf_out)


def has_existing_status_screenshot_for_app(app_no: str, rec: Optional[Dict[str, Any]] = None) -> bool:
    """
    Returns True if an A4 Status Screenshot (_STATUS_A4.pdf) was already captured for `app_no`
    either on the central server (`status_pdf_filename` / `pdf_filename`) or locally in
    ~/Downloads/Gosuslugi_Status_A4/ or ~/Downloads/.
    """
    clean_no = str(app_no or "").strip()
    if not clean_no:
        return False
    if rec:
        st_pdf = str(rec.get("status_pdf_filename") or rec.get("statusPdfFilename") or "").strip()
        if st_pdf and "_STATUS_A4" in st_pdf.upper() and clean_no in st_pdf:
            return True
        reg_pdf = str(rec.get("pdf_filename") or rec.get("pdfFilename") or "").strip()
        if reg_pdf and "_STATUS_A4" in reg_pdf.upper() and clean_no in reg_pdf:
            return True
    try:
        downloads_dir = Path.home() / "Downloads"
        screenshots_dir = downloads_dir / "Gosuslugi_Status_A4"
        if screenshots_dir.exists():
            for p in screenshots_dir.glob(f"*{clean_no}*_STATUS_A4.pdf"):
                if p.is_file() and p.stat().st_size > 1000:
                    return True
        if downloads_dir.exists():
            for p in downloads_dir.glob(f"*{clean_no}*_STATUS_A4.pdf"):
                if p.is_file() and p.stat().st_size > 1000:
                    return True
    except Exception:
        pass
    return False


def capture_a4_cropped_status_screenshot(
    page: Page,
    app_no: str,
    sicil: str,
    worker_name: str,
    period_code: str,
    gosuslugi_status: str = "",
) -> str:
    """
    Captures an A4-proportioned cropped screenshot of the Gosuslugi order status area (NOT the full wide screen!),
    ensuring BOTH the top Search Bar (with the Zayavka number) AND the Order Status Card are 100% visible below
    the sticky Gosuslugi header. Converts it into a standard A4 PDF (<Sicil>_<AppNo>_<WorkerName>_STATUS_A4.pdf),
    saves it locally in ~/Downloads/Gosuslugi_Status_A4/, and uploads it to the central Pondera HR server.
    """
    clean_no = str(app_no or "").strip()
    if not clean_no:
        return ""

    downloads_dir = Path.home() / "Downloads"
    screenshots_dir = downloads_dir / "Gosuslugi_Status_A4"
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    clean_name = clean_worker_name_for_pdf(worker_name)
    clean_sicil = re.sub(r'[<>:"/\\|?*]+', "", str(sicil or "").strip())
    pdf_filename = (
        f"{clean_sicil}_{clean_no}_{clean_name}_STATUS_A4.pdf"
        if clean_sicil
        else f"{clean_no}_{clean_name}_STATUS_A4.pdf"
    )
    jpg_filename = pdf_filename.replace(".pdf", ".jpg")
    pdf_path = screenshots_dir / pdf_filename
    jpg_path = screenshots_dir / jpg_filename

    try:
        # Phase 1: Force instant scroll-behavior, reset ALL scrollable containers in the DOM to top (scrollTop = 0),
        # ensure the search input displays `clean_no`, and hide floating robot mascot widgets.
        page.evaluate(
            """(appNo) => {
                try {
                    let styleEl = document.getElementById("pondera-instant-scroll-style");
                    if (!styleEl) {
                        styleEl = document.createElement("style");
                        styleEl.id = "pondera-instant-scroll-style";
                        styleEl.textContent = "*, html, body { scroll-behavior: auto !important; }";
                        (document.head || document.documentElement).appendChild(styleEl);
                    }
                } catch (e) {}

                try {
                    if (document.activeElement && document.activeElement !== document.body && typeof document.activeElement.blur === "function") {
                        document.activeElement.blur();
                    }
                } catch (e) {}

                // Ensure the search input box shows the searched application number
                try {
                    const inputs = Array.from(
                        document.querySelectorAll(
                            "input.search-input, lib-search input, epgu-search input, input[placeholder*='Поиск'], input[placeholder*='поиск'], input[placeholder*='Номер'], input[type='search'], main input[type='text']"
                        )
                    );
                    for (const inp of inputs) {
                        const r = inp.getBoundingClientRect();
                        if (r.width > 100 && r.height > 18) {
                            if (!inp.value || !String(inp.value).includes(appNo)) {
                                inp.value = appNo;
                                inp.setAttribute("value", appNo);
                            }
                            break;
                        }
                    }
                } catch (e) {}

                // Hide floating Robot Max / chat assistant icon in bottom-right corner
                try {
                    const vw = window.innerWidth || document.documentElement.clientWidth || 1280;
                    const vh = window.innerHeight || document.documentElement.clientHeight || 900;
                    document.querySelectorAll("epgu-chat-widget, .robot-max, [class*='robot-widget'], [class*='assistant-widget'], [class*='chat-widget']").forEach(el => {
                        el.style.visibility = "hidden";
                    });
                    document.querySelectorAll("div, button, a, aside, iframe").forEach(el => {
                        try {
                            const cs = window.getComputedStyle(el);
                            if (cs.position === "fixed" || cs.position === "sticky") {
                                const r = el.getBoundingClientRect();
                                if (r.top > 120 && r.width <= 140 && r.height <= 140 && r.right >= vw - 180 && r.bottom >= vh - 180) {
                                    el.style.visibility = "hidden";
                                }
                            }
                        } catch (e) {}
                    });
                } catch (e) {}

                // Synchronously reset scroll position on window, document, and EVERY scrollable element in DOM
                try { window.scrollTo(0, 0); } catch (e) {}
                try { document.documentElement.scrollTop = 0; document.documentElement.scrollLeft = 0; } catch (e) {}
                try { document.body.scrollTop = 0; document.body.scrollLeft = 0; } catch (e) {}
                try {
                    const allEls = document.querySelectorAll("*");
                    for (let i = 0; i < allEls.length; i++) {
                        const el = allEls[i];
                        if (el.scrollTop > 0) el.scrollTop = 0;
                        if (el.scrollLeft > 0) el.scrollLeft = 0;
                    }
                } catch (e) {}
            }""",
            clean_no,
        )
        # Wait 250ms so Chrome finishes painting the top-of-page scroll layout before measuring rectangles
        page.wait_for_timeout(250)

        # Phase 2: Verify that BOTH the search bar and the order card are visible below the sticky header,
        # adjusting scroll only if needed on small screens, and compute the A4 clip box from (0, 0).
        clip_box = page.evaluate(
            """(info) => {
                const appNo = info.appNo || "";
                const orderDate = info.orderDate || "";
                const vw = window.innerWidth || document.documentElement.clientWidth || 1280;
                const vh = window.innerHeight || document.documentElement.clientHeight || 900;

                const bodyTxt = (document.body && document.body.innerText) || "";
                if (bodyTxt.includes("Сервис недоступен") || bodyTxt.includes("Заявления не найдены")) {
                    return null;
                }

                // Measure sticky top header height (usually ~74-76px)
                let headerBottom = 76;
                try {
                    const hdr = document.querySelector("header, epgu-header, lib-header, .header");
                    if (hdr) {
                        const hr = hdr.getBoundingClientRect();
                        if (hr.height >= 40 && hr.height <= 130 && hr.top <= 10) {
                            headerBottom = Math.round(hr.bottom);
                        }
                    }
                } catch (e) {}

                // Locate the visible search input
                const visibleSearchInputs = Array.from(
                    document.querySelectorAll(
                        "input.search-input, lib-search input, epgu-search input, input[placeholder*='Поиск'], input[placeholder*='поиск'], input[placeholder*='Номер'], input[type='search'], main input[type='text']"
                    )
                ).filter(el => {
                    const r = el.getBoundingClientRect();
                    return r.width > 120 && r.height > 20;
                });
                const searchInp = visibleSearchInputs[0] || null;

                // Locate the visible order card in the feed list
                const getCandidateCards = () => Array.from(
                    document.querySelectorAll("a[href*='/order/'], div.feed-item, epgu-feed-item")
                ).filter(el => {
                    const r = el.getBoundingClientRect();
                    const txt = (el.innerText || "").trim();
                    return r.width >= 260 && r.height >= 50 && !txt.includes("Будет удалено");
                });

                let candidateCards = getCandidateCards();
                let targetCard =
                    candidateCards.find(el => (el.innerText || "").includes(appNo)) ||
                    candidateCards.find(el => (el.innerText || "").includes("Уведомления о трудовой")) ||
                    candidateCards[0] ||
                    null;
                if (!targetCard) {
                    return null;
                }

                // Helper to scroll whichever container actually scrolls on this page
                const scrollPageBy = (deltaY) => {
                    if (!deltaY) return;
                    try { window.scrollBy(0, deltaY); } catch (e) {}
                    try {
                        let p = targetCard.parentElement;
                        while (p && p !== document.body && p !== document.documentElement) {
                            const cs = window.getComputedStyle(p);
                            if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && p.scrollHeight > p.clientHeight) {
                                p.scrollTop = Math.max(0, p.scrollTop + deltaY);
                            }
                            p = p.parentElement;
                        }
                    } catch (e) {}
                };

                let didScrollAdjust = false;
                if (searchInp) {
                    const sr = searchInp.getBoundingClientRect();
                    const cr = targetCard.getBoundingClientRect();
                    // Case A: Search bar is still above or hidden behind the sticky Gosuslugi header
                    if (sr.top < headerBottom + 16) {
                        scrollPageBy(sr.top - (headerBottom + 28));
                        didScrollAdjust = true;
                    } else if (cr.bottom > vh - 15 && sr.top > headerBottom + 48) {
                        // Case B: Short viewport where card bottom exceeds viewport height — scroll down slightly
                        // while keeping the search bar strictly below the sticky header (sr.top >= headerBottom + 32)
                        const neededDown = cr.bottom - (vh - 20);
                        const maxAllowedDown = Math.max(0, sr.top - (headerBottom + 32));
                        const actualDown = Math.min(neededDown, maxAllowedDown);
                        if (actualDown > 4) {
                            scrollPageBy(actualDown);
                            didScrollAdjust = true;
                        }
                    }
                }

                // Ensure the zayavka number (№ <appNo>) is clearly visible on the order card if not already rendered
                if (targetCard && appNo) {
                    let badge = targetCard.querySelector(".pondera-zayavka-no-badge");
                    if (!badge && !(targetCard.innerText || "").includes(appNo)) {
                        badge = document.createElement("div");
                        badge.className = "pondera-zayavka-no-badge";
                        badge.style.cssText = "font-size: 14px; font-weight: 700; color: #0d4cd3; margin-bottom: 6px; font-family: inherit;";
                        badge.textContent = orderDate ? `Заявление № ${appNo}  •  ${orderDate}` : `Заявление № ${appNo}`;
                        targetCard.insertBefore(badge, targetCard.firstChild);
                    }
                }

                let refRect = null;
                if (targetCard) {
                    const r = targetCard.getBoundingClientRect();
                    if (r.width >= 260 && r.height >= 40) refRect = r;
                }
                if (!refRect && searchInp) {
                    const searchWrapper = searchInp.closest("lib-search, epgu-search, form, .search-bar") || searchInp;
                    const r = searchWrapper.getBoundingClientRect();
                    if (r.width >= 240) refRect = r;
                }

                // Start strictly from top-left corner (x = 0, y = 0) so the Gosuslugi header, the Search Bar
                // (with the typed application_no), and the Order Card below it are 100% captured!
                const cropX = 0;
                const topY = 0;
                const rightEdge = refRect ? Math.round(refRect.right + 28) : Math.min(vw, 990);
                const cropW = Math.max(640, Math.min(vw, rightEdge));

                // A4 portrait ratio height (1 : 1.4142), clamped to visible viewport height
                const idealA4H = Math.round(cropW * 1.4142);
                const maxAvailH = Math.max(240, vh - topY);
                const cropH = Math.min(idealA4H, maxAvailH);

                return { x: cropX, y: topY, width: cropW, height: cropH, didScrollAdjust };
            }""",
            {"appNo": clean_no, "orderDate": ""},
        )
        if not clip_box:
            return ""
        if clip_box.get("didScrollAdjust"):
            page.wait_for_timeout(180)
        else:
            page.wait_for_timeout(80)
        clean_clip = {
            "x": clip_box["x"],
            "y": clip_box["y"],
            "width": clip_box["width"],
            "height": clip_box["height"],
        }
        jpeg_bytes = page.screenshot(type="jpeg", quality=92, clip=clean_clip)
        jpg_path.write_bytes(jpeg_bytes)

        pdf_bytes = build_a4_pdf_from_jpeg_bytes(jpeg_bytes)
        pdf_path.write_bytes(pdf_bytes)
        # Also place a copy in ~/Downloads so local bridge /pdf-base64 can serve it immediately
        try:
            (downloads_dir / pdf_filename).write_bytes(pdf_bytes)
        except Exception:
            pass

        upload_pdf_to_central_server(
            pdf_path,
            clean_no,
            clean_sicil,
            gosuslugi_status=gosuslugi_status,
            is_screenshot=True,
        )
        logger.info(f"  -> [A4 PrintScreen] Saved & uploaded cropped A4 status screenshot: {pdf_filename}")
        return pdf_filename
    except Exception as sc_err:
        logger.warning(f"  -> Could not capture A4 status screenshot for № {clean_no}: {sc_err}")
        return ""


CENTRAL_ARCHIVED_APP_NOS = set()


def is_superseded_or_archived_order(app_no: str, status: str = "", submitted_at: str = "") -> bool:
    """
    Returns True if `app_no` was explicitly archived in `gosuslugi_refused_archive` (`CENTRAL_ARCHIVED_APP_NOS`).
    """
    clean_no = str(app_no or "").strip()
    if not clean_no:
        return False
    if clean_no in CENTRAL_ARCHIVED_APP_NOS:
        return True
    return False


def fetch_central_master_list_records() -> List[Dict[str, Any]]:
    """Fetches the unified 3,088-worker master list + submissions from https://hr.pondera.network/api/gosuslugi/master-list."""
    import urllib.request
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    for api_url in (
        "https://hr.pondera.network/api/gosuslugi/master-list",
        "http://localhost:3000/api/gosuslugi/master-list",
    ):
        try:
            req = urllib.request.Request(api_url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=8.0, context=ctx if api_url.startswith("https") else None) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    arch_list = data.get("archivedAppNos") or []
                    if isinstance(arch_list, list):
                        for a_no in arch_list:
                            s_no = str(a_no or "").strip()
                            if s_no:
                                CENTRAL_ARCHIVED_APP_NOS.add(s_no)
                    rows = data.get("data") or []
                    if isinstance(rows, list) and len(rows) > 0:
                        mapped = []
                        mapped_by_sicil = {}
                        for w in rows:
                            sic = str(w.get("sicil") or w.get("code") or "").strip()
                            parts = [str(w.get("lastName") or "").strip(), str(w.get("firstName") or "").strip(), str(w.get("middleName") or "").strip()]
                            full_name = " ".join([p for p in parts if p and p.lower() != "нет"]).strip()
                            rec_obj = {
                                "sicil": sic,
                                "sicil_no": sic,
                                "worker_name": full_name,
                                "citizenship": str(w.get("citizenship") or "").strip(),
                                "notification_type": "vks_salary",
                                "period_code": "2026-3",
                                "application_no": str(w.get("applicationNo") or "").strip(),
                                "gosuslugi_status": str(w.get("gosuslugiStatus") or "").strip(),
                                "pdf_filename": str(w.get("pdfFilename") or "").strip(),
                                "status_pdf_filename": str(w.get("statusPdfFilename") or w.get("status_pdf_filename") or "").strip(),
                                "submitted_at": str(w.get("submittedAt") or "").strip(),
                                "checked_at": str(w.get("checkedAt") or w.get("checked_at") or "").strip(),
                            }
                            mapped.append(rec_obj)
                            if sic:
                                mapped_by_sicil[sic] = rec_obj
                        # Merge & recover any local Fast-Mode ('Отправлено (PDF не скачан)') or other submissions
                        # from local gosuslugi_applications.json and local bridge /health
                        local_candidates = []
                        ledger_path = os.path.join(CURRENT_DIR, "gosuslugi_applications.json")
                        if os.path.exists(ledger_path):
                            try:
                                with open(ledger_path, "r", encoding="utf-8") as lf:
                                    l_raw = json.load(lf)
                                    if isinstance(l_raw, list):
                                        local_candidates.extend([x for x in l_raw if isinstance(x, dict)])
                            except Exception:
                                pass
                        try:
                            req_b = urllib.request.Request("http://127.0.0.1:8088/health")
                            with urllib.request.urlopen(req_b, timeout=1.5) as resp_b:
                                if resp_b.status == 200:
                                    b_data = json.loads(resp_b.read().decode("utf-8"))
                                    b_subs = b_data.get("submissions") or []
                                    if isinstance(b_subs, list):
                                        local_candidates.extend([x for x in b_subs if isinstance(x, dict)])
                        except Exception:
                            pass
                        to_recover = []
                        seen_rec_keys = set()
                        for lc in local_candidates:
                            l_sic = str(lc.get("sicil") or lc.get("sicil_no") or "").strip()
                            l_app = str(lc.get("application_no") or "").strip()
                            l_st = str(lc.get("gosuslugi_status") or "").strip()
                            l_sub = str(lc.get("submitted_at") or "").strip()
                            l_pdf = str(lc.get("pdf_filename") or "").strip()
                            if not l_sic or not l_app or not l_app.isdigit() or l_st.lower().startswith("ошибк"):
                                continue
                            if is_superseded_or_archived_order(l_app, l_st, l_sub):
                                continue
                            # Skip only legacy Oct 21-25 unsent drafts (< 8320000000 and < 2026-10-26 10:15:00)
                            if (
                                l_st in ("Отправлено (PDF не скачан)", "Отправлено")
                                and not l_pdf
                                and l_sub < "2026-10-26 10:15:00"
                                and int(l_app) < 8320000000
                            ):
                                continue
                            srv_rec = mapped_by_sicil.get(l_sic)
                            srv_app = str(srv_rec.get("application_no") or "").strip() if srv_rec else ""
                            srv_st = str(srv_rec.get("gosuslugi_status") or "").strip() if srv_rec else ""
                            if (
                                not srv_rec
                                or not srv_app
                                or srv_st.lower().startswith("ошибк")
                                or (l_app.isdigit() and srv_app.isdigit() and int(l_app) > int(srv_app))
                            ):
                                rec_payload = {
                                    "sicil": l_sic,
                                    "sicil_no": l_sic,
                                    "worker_name": str(lc.get("worker_name") or (srv_rec.get("worker_name") if srv_rec else "") or "").strip(),
                                    "citizenship": str(lc.get("citizenship") or (srv_rec.get("citizenship") if srv_rec else "") or "").strip(),
                                    "notification_type": str(lc.get("notification_type") or "vks_salary"),
                                    "period_code": str(lc.get("period_code") or "2026-3"),
                                    "application_no": l_app,
                                    "gosuslugi_status": l_st,
                                    "pdf_filename": l_pdf,
                                    "submitted_at": l_sub,
                                }
                                if srv_rec is not None:
                                    srv_rec.update(rec_payload)
                                else:
                                    mapped.append(rec_payload)
                                    mapped_by_sicil[l_sic] = rec_payload
                                if (l_sic, l_app) not in seen_rec_keys:
                                    seen_rec_keys.add((l_sic, l_app))
                                    to_recover.append(rec_payload)
                        if to_recover:
                            sync_updates_to_pondera_api(to_recover)
                        return mapped
        except Exception:
            pass
    return []


def sync_updates_to_pondera_api(updates: List[Dict[str, Any]]):
    """Pushes updated application statuses to Pondera HR Central Server & Local Next.js API (/api/gosuslugi/submissions)."""
    if not updates:
        return
    import urllib.request
    import ssl
    payload = json.dumps({"records": updates}, ensure_ascii=False).encode("utf-8")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    for api_url in (
        "https://hr.pondera.network/api/gosuslugi/submissions",
        "http://localhost:3000/api/gosuslugi/submissions",
    ):
        try:
            req = urllib.request.Request(
                api_url,
                data=payload,
                headers={"Content-Type": "application/json; charset=utf-8"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=6.0, context=ctx if api_url.startswith("https") else None) as _:
                break
        except Exception:
            pass


def is_local_bridge_up_to_date() -> bool:
    import urllib.request
    try:
        req = urllib.request.Request("http://127.0.0.1:8088/health")
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                return str(data.get("bridge_version") or "") >= "2.6.82"
    except Exception:
        pass
    return False


def update_local_applications_ledger(updates: List[Dict[str, Any]]):
    if not updates:
        return
    ledger_path = os.path.join(CURRENT_DIR, "gosuslugi_applications.json")
    try:
        existing_list = []
        if os.path.exists(ledger_path):
            with open(ledger_path, "r", encoding="utf-8") as lf:
                raw = json.load(lf)
                if isinstance(raw, list):
                    existing_list = [
                        it for it in raw
                        if isinstance(it, dict)
                        and not is_superseded_or_archived_order(
                            str(it.get("application_no") or ""),
                            str(it.get("gosuslugi_status") or ""),
                            str(it.get("submitted_at") or ""),
                        )
                    ]
        by_key = {}
        for idx, it in enumerate(existing_list):
            s = str(it.get("sicil") or it.get("sicil_no") or "").strip()
            p = str(it.get("period_code") or "2026-3").strip()
            if s:
                by_key[(s, p)] = idx
        for up in updates:
            s = str(up.get("sicil") or up.get("sicil_no") or "").strip()
            p = str(up.get("period_code") or "2026-3").strip()
            if s and (s, p) in by_key:
                existing_list[by_key[(s, p)]] = {**existing_list[by_key[(s, p)]], **up}
            else:
                if s:
                    by_key[(s, p)] = len(existing_list)
                existing_list.append(up)
        with open(ledger_path, "w", encoding="utf-8") as lf:
            json.dump(existing_list, lf, ensure_ascii=False, indent=2)
    except Exception:
        pass


def restart_local_bridge_if_outdated():
    if is_local_bridge_up_to_date():
        return
    bridge_script = os.path.join(CURRENT_DIR, "rpa_bridge_server.py")
    if not os.path.exists(bridge_script):
        return
    try:
        import subprocess
        flags = 0
        if sys.platform == "win32":
            flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
        subprocess.Popen(
            [sys.executable, bridge_script],
            cwd=CURRENT_DIR,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            creationflags=flags,
        )
    except Exception:
        pass


def prevent_windows_sleep():
    if sys.platform != "win32":
        return
    try:
        import ctypes
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001 | 0x00000002 | 0x00000040)
    except Exception:
        pass


def run_fast_json_status_sync_on_page(
    page: Page,
    max_pages: int = 100,
    records: Optional[List[Dict[str, Any]]] = None,
    allow_single_search: bool = False,
    search_scope: str = "pending_only",
    capture_screenshots: bool = False,
) -> int:
    """
    Fast, non-intrusive status sync (NO PDF download, NO /order/<feed_id> navigation):
    - When `allow_single_search=False` (default for 30-min interval during VKS sending & 'Hızlı Statü'):
      Fetches applications purely via Gosuslugi's JSON API (/api/lk/v1/feeds/) in ~3-5 seconds with ZERO
      one-by-one typing (`query_single_order_by_no`), so VKS sending continues immediately without delay.
    - When `allow_single_search=True` (manual 'Tek Tek Statü Ara' mode):
      1) `search_scope == 'pending_only'` (default): checks only applications waiting for final status
         (excludes 'Услуга оказана', 'Услуга отказана', and 'Ошибка%').
      2) `search_scope == 'all_from_start'`: checks all applications with an `application_no` from the start of the list.
      3) When `capture_screenshots=True`, captures an A4-cropped screenshot of the Gosuslugi status card and uploads it.
    """
    try:
        attach_feeds_network_listener(page)
        cur_url = (page.url or "").lower()
        if "gosuslugi.ru" not in cur_url or "esia.gosuslugi.ru" in cur_url:
            logger.info("Fast JSON status sync skipped: active tab is not on an authenticated gosuslugi.ru page.")
            return 0

        target_records = records if records is not None else fetch_central_master_list_records()
        if not target_records:
            return 0

        if "lk.gosuslugi.ru/orders" not in (page.url or "").lower():
            try:
                logger.info("Navigating briefly to https://lk.gosuslugi.ru/orders to fetch JSON order statuses...")
                page.goto(
                    ORDERS_URL,
                    wait_until="domcontentloaded",
                    timeout=30000,
                )
                page.wait_for_timeout(2000)
            except Exception as nav_err:
                logger.debug(f"Orders navigation note: {nav_err}")

        bulk_orders = fetch_bulk_orders_via_api(
            page,
            max_pages=max_pages,
            fast_json_only=not allow_single_search,
        )

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        updated_records: List[Dict[str, Any]] = []
        status_changed_count = 0
        verified_same_pending_count = 0
        screenshots_captured_count = 0
        assigned_app_nos_to_sicil: Dict[str, str] = {}
        for r_pre in target_records:
            p_sic = str(r_pre.get("sicil") or r_pre.get("sicil_no") or "").strip()
            p_app = str(r_pre.get("application_no") or "").strip()
            p_st = str(r_pre.get("gosuslugi_status") or "").strip()
            p_sub = str(r_pre.get("submitted_at") or "").strip()
            if p_sic and p_app and p_app.isdigit() and not is_superseded_or_archived_order(p_app, p_st, p_sub):
                assigned_app_nos_to_sicil[p_app] = p_sic

        if allow_single_search and search_scope == "all_from_start":
            sorted_target_records = list(target_records)
        else:
            def _fast_priority_key(r_it: Dict[str, Any]):
                st_it = str(r_it.get("gosuslugi_status") or "").strip()
                app_it = str(r_it.get("application_no") or "").strip()
                chk_it = str(r_it.get("checked_at") or "").strip()
                has_app = bool(app_it and app_it.isdigit())
                if not has_app:
                    return (5, "", 0)
                # Priority 0 (Checked 1st): 'Отправлено (PDF не скачан)' / 'Отправлено' / 'В обработке' (never checked or awaiting initial status)
                if st_it in ("", "Отправлено (PDF не скачан)", "Отправлено", "В обработке"):
                    return (0, chk_it, -int(app_it))
                # Priority 1 (Checked 2nd): 'Отправлено в ведомство' (awaiting MVD gateway acceptance or gateway error)
                if st_it == "Отправлено в ведомство":
                    return (1, chk_it, -int(app_it))
                # Priority 2 (Checked 3rd): 'Заявление зарегистрировано' / 'Промежуточные результаты по заявлению' (oldest checked_at first!)
                if st_it in ("Заявление зарегистрировано", "Промежуточные результаты по заявлению"):
                    return (2, chk_it, -int(app_it))
                # Priority 3: Any other non-final status
                if (
                    st_it not in ("Услуга оказана", "Услуга отказана", "Данные не найдены в базе МВД")
                    and not st_it.lower().startswith("ошибк")
                ):
                    return (3, chk_it, -int(app_it))
                return (4, chk_it, -int(app_it))

            sorted_target_records = sorted(target_records, key=_fast_priority_key)

        targeted_search_count = 0
        skipped_unsent_draft_count = 0
        skipped_already_okazana_sc_count = 0
        checked_only_records: List[Dict[str, Any]] = []

        numeric_bulk_ids = [int(k) for k in bulk_orders.keys() if k.isdigit() and len(k) == 10]
        min_bulk_order_id = min(numeric_bulk_ids) if len(numeric_bulk_ids) >= 20 else 0

        for rec in sorted_target_records:
            prevent_windows_sleep()
            raw_app_no = str(rec.get("application_no") or "").strip()
            app_no = raw_app_no if raw_app_no.isdigit() else ""
            sicil = str(rec.get("sicil") or rec.get("sicil_no") or "").strip()
            worker_name = str(rec.get("worker_name") or "").strip()
            prev_status = str(rec.get("gosuslugi_status") or "").strip()
            submitted_at = str(rec.get("submitted_at") or "").strip()
            prev_pdf_file = str(rec.get("pdf_filename") or "").strip()

            if app_no and is_superseded_or_archived_order(app_no, prev_status, submitted_at):
                app_no = ""

            if not app_no:
                continue

            already_has_sc = has_existing_status_screenshot_for_app(app_no, rec)

            # User rule: During one-by-one status check + screenshot capture:
            # - If 'Услуга оказана' ALREADY has an A4 screenshot taken previously, NEVER re-check or re-capture it!
            # - For all OTHER statuses (e.g. 'Заявление зарегистрировано', 'Отправлено', 'Отправлено в ведомство',
            #   'Промежуточные результаты по заявлению', 'Услуга отказана', etc.), ALWAYS re-check and re-capture (overwrite)!
            if allow_single_search and prev_status == "Услуга оказана":
                if not capture_screenshots or already_has_sc or search_scope == "pending_only":
                    if capture_screenshots and already_has_sc:
                        skipped_already_okazana_sc_count += 1
                    continue

            is_intermediate_prev = (
                prev_status not in ("Услуга оказана", "Услуга отказана")
                and not prev_status.lower().startswith("ошибк")
            )
            is_non_okazana_with_app_no = prev_status != "Услуга оказана"

            if allow_single_search and search_scope == "pending_only":
                if capture_screenshots:
                    if not is_non_okazana_with_app_no:
                        continue
                elif not is_intermediate_prev:
                    continue

            matched_order: Optional[Dict[str, Any]] = None

            if app_no in bulk_orders and not (allow_single_search and capture_screenshots):
                candidate = bulk_orders[app_no]
                if is_acceptable_order_for_exact_app_no(candidate, worker_name) and not is_superseded_or_archived_order(
                    app_no, candidate.get("gosuslugi_status", ""), submitted_at
                ):
                    matched_order = candidate

            is_unverified_draft_id = (
                prev_status in ("Отправлено (PDF не скачан)", "Отправлено")
                and not prev_pdf_file
                and submitted_at < "2026-10-26 10:15:00"
                and int(app_no) < 8320000000
                and min_bulk_order_id > 0
                and int(app_no) > min_bulk_order_id
            )
            should_run_single_query = allow_single_search and (
                not matched_order or capture_screenshots
            ) and (
                search_scope == "all_from_start"
                or is_intermediate_prev
                or (capture_screenshots and is_non_okazana_with_app_no)
            )

            if should_run_single_query:
                if is_unverified_draft_id and search_scope == "pending_only":
                    skipped_unsent_draft_count += 1
                    continue
                targeted_search_count += 1
                logger.info(
                    f"Checking Gosuslugi Status for: {worker_name or 'Заявление'} "
                    f"(Код: {sicil or '—'}, № Заявления: {app_no}) — [{targeted_search_count}] поштучный поиск (текущий: {prev_status or 'Отправлено'})..."
                )
                candidate = query_single_order_by_no(page, app_no, force_live_search=True)
                if (
                    candidate
                    and is_acceptable_order_for_exact_app_no(candidate, worker_name)
                    and not is_superseded_or_archived_order(app_no, candidate.get("gosuslugi_status", ""), submitted_at)
                ):
                    matched_order = candidate
                    bulk_orders[app_no] = candidate
                    logger.info(
                        f"  -> Найдено № {app_no} ({worker_name}): {candidate.get('gosuslugi_status')}"
                    )
                else:
                    logger.info(
                        f"  -> Заявление № {app_no} не найдено в этом аккаунте Госуслуг."
                    )

            if not matched_order:
                continue

            final_app_no = matched_order["application_no"]
            owner_sicil = assigned_app_nos_to_sicil.get(final_app_no)
            if owner_sicil and sicil and owner_sicil != sicil:
                continue
            if sicil:
                assigned_app_nos_to_sicil[final_app_no] = sicil

            new_status = str(matched_order.get("gosuslugi_status") or "").strip()
            if (
                raw_app_no == final_app_no
                and prev_status in ("Услуга оказана", "Услуга отказана")
                and new_status in ("Отправлено", "Отправлено (PDF не скачан)", "В обработке")
            ):
                continue

            prev_pdf = str(rec.get("pdf_filename") or "").strip()
            if prev_pdf and final_app_no and final_app_no not in prev_pdf and re.search(r"[789]\d{9}", prev_pdf):
                prev_pdf = ""

            prev_status_pdf = str(rec.get("status_pdf_filename") or rec.get("statusPdfFilename") or "").strip()
            captured_sc_file = ""
            if allow_single_search and capture_screenshots:
                captured_sc_file = capture_a4_cropped_status_screenshot(
                    page=page,
                    app_no=final_app_no,
                    sicil=sicil,
                    worker_name=worker_name or matched_order.get("citizen_name") or "",
                    period_code=str(rec.get("period_code") or "2026-3"),
                    gosuslugi_status=new_status,
                )
                if captured_sc_file:
                    screenshots_captured_count += 1
                    prev_status_pdf = captured_sc_file
                    if not prev_pdf or "_STATUS_A4" in prev_pdf:
                        prev_pdf = captured_sc_file

            gosuslugi_event_dt = parse_gosuslugi_datetime(
                str(matched_order.get("order_date") or ""),
                str(matched_order.get("status_detail") or ""),
            )
            effective_checked_at = (
                gosuslugi_event_dt
                if gosuslugi_event_dt and (not submitted_at or gosuslugi_event_dt >= submitted_at[:16])
                else now_str
            )

            if prev_status == new_status and raw_app_no == final_app_no and not captured_sc_file:
                if is_intermediate_prev or (allow_single_search and search_scope == "all_from_start"):
                    verified_same_pending_count += 1
                    logger.info(
                        f"  [=] № {final_app_no} ({worker_name}) — проверено на Госуслугах: статус без изменений («{new_status}»)"
                    )
                    if allow_single_search:
                        logger.info(
                            f"SUCCESS: Status checked for {worker_name} (№ {final_app_no}: {new_status})!"
                        )
                    checked_only_records.append({
                        **rec,
                        "sicil": sicil,
                        "sicil_no": sicil,
                        "worker_name": worker_name or matched_order.get("citizen_name") or "",
                        "application_no": final_app_no,
                        "pdf_filename": prev_pdf,
                        "status_pdf_filename": prev_status_pdf,
                        "gosuslugi_status": new_status,
                        "status_detail": matched_order.get("status_detail", ""),
                        "checked_at": effective_checked_at,
                    })
                continue

            if prev_status != new_status:
                status_changed_count += 1
                logger.info(
                    f"  [✓] СТАТУС ОБНОВЛЁН: № {final_app_no} ({worker_name}) -> «{prev_status or 'Отправлено'}» ==> «{new_status}»"
                )

            updated_entry = {
                **rec,
                "sicil": sicil,
                "sicil_no": sicil,
                "worker_name": worker_name or matched_order.get("citizen_name") or "",
                "application_no": final_app_no,
                "pdf_filename": prev_pdf,
                "status_pdf_filename": prev_status_pdf,
                "gosuslugi_status": new_status,
                "status_detail": matched_order.get("status_detail", ""),
                "checked_at": effective_checked_at,
                "force_status_correction": True,
            }
            updated_records.append(updated_entry)
            if is_local_bridge_up_to_date():
                logger.info(f"APPLICATION_STATUS_UPDATED: {json.dumps(updated_entry, ensure_ascii=False)}")
            else:
                logger.info(f"APPLICATION_SYNCED_CENTRAL: {json.dumps(updated_entry, ensure_ascii=False)}")
            sync_updates_to_pondera_api([updated_entry])
            if allow_single_search:
                logger.info(
                    f"SUCCESS: Status checked for {updated_entry['worker_name']} "
                    f"(№ {final_app_no}: {new_status}, A4 PrintScreen: {captured_sc_file or '—'})!"
                )

        if checked_only_records:
            sync_updates_to_pondera_api(checked_only_records)

        if skipped_already_okazana_sc_count > 0:
            logger.info(
                f"  [i] Пропущено {skipped_already_okazana_sc_count} заявлений со статусом «Услуга оказана» (скриншот A4 уже был сохранён ранее)."
            )

        if skipped_unsent_draft_count > 0:
            logger.info(
                f"  [i] Пропущено {skipped_unsent_draft_count} черновиков со статусом «Отправлено (PDF не скачан)» (не были отправлены в МВД / отсутствуют в ленте заявлений организации)."
            )

        if updated_records:
            update_local_applications_ledger(updated_records)
            sync_updates_to_pondera_api(updated_records)
            logger.info(
                f">>> Status Sync Complete: Просканировано {len(bulk_orders)} заявлений | "
                f"Поштучно проверено: {targeted_search_count} | Изменился статус: {status_changed_count} | "
                f"Скриншотов A4: {screenshots_captured_count} | Без изменений: {verified_same_pending_count} <<<"
            )
        else:
            logger.info(
                f">>> Status Sync Complete: Просканировано {len(bulk_orders)} заявлений | "
                f"Поштучно проверено: {targeted_search_count} | Изменился статус: 0 | "
                f"Скриншотов A4: {screenshots_captured_count} | Проверено без изменений: {verified_same_pending_count} <<<"
            )
        restart_local_bridge_if_outdated()
        return len(updated_records)
    except Exception as e:
        logger.warning(f"Fast JSON status sync note: {e}")
        return 0


def main():
    prevent_windows_sleep()
    parser = argparse.ArgumentParser(description="Pondera HR Gosuslugi Status Checker (lk.gosuslugi.ru/orders)")
    parser.add_argument("--json", default="", help="Path to JSON queue of applications/workers to check")
    parser.add_argument("--cdp-port", type=int, default=9222, help="Chrome Remote Debugging Port")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of records to check")
    parser.add_argument("--max-pages", type=int, default=100, help="Max bulk pages (20 orders/page, 100 = 2000 orders) to fetch without searching")
    parser.add_argument("--status-only", action="store_true", help="Fast JSON-only status check without downloading PDFs or opening individual order pages")
    parser.add_argument("--single-search", action="store_true", help="Enable manual one-by-one status search by application_no on lk.gosuslugi.ru/orders")
    parser.add_argument("--search-scope", default="pending_only", choices=["pending_only", "all_from_start"], help="Scope for manual one-by-one search: pending_only or all_from_start")
    parser.add_argument("--capture-screenshots", action="store_true", help="Capture A4-cropped screenshot of status on Gosuslugi and upload to system")
    args = parser.parse_args()

    # 1. Always fetch the authoritative Central Master List FIRST so CENTRAL_ARCHIVED_APP_NOS and central statuses are loaded!
    central_records = fetch_central_master_list_records()

    # Clean up local gosuslugi_applications.json if it contains any archived or Oct 21 morning outage refused application_no
    local_ledger_path = os.path.join(CURRENT_DIR, "gosuslugi_applications.json")
    if os.path.exists(local_ledger_path):
        try:
            with open(local_ledger_path, "r", encoding="utf-8") as lf:
                local_ledger_data = json.load(lf)
            if isinstance(local_ledger_data, list):
                cleaned_ledger = [
                    it for it in local_ledger_data
                    if isinstance(it, dict)
                    and not is_superseded_or_archived_order(
                        str(it.get("application_no") or "").strip(),
                        str(it.get("gosuslugi_status") or "").strip(),
                    )
                    and BLOCKED_MISMATCHED_APP_BY_SICIL.get(
                        str(it.get("sicil") or it.get("sicil_no") or "").strip()
                    ) != str(it.get("application_no") or "").strip()
                ]
                if len(cleaned_ledger) != len(local_ledger_data):
                    with open(local_ledger_path, "w", encoding="utf-8") as lfw:
                        json.dump(cleaned_ledger, lfw, ensure_ascii=False, indent=2)
                    logger.info(
                        f"Purged {len(local_ledger_data) - len(cleaned_ledger)} archived/outage-refused records from local gosuslugi_applications.json"
                    )
        except Exception:
            pass

    records: List[Dict[str, Any]] = []
    if args.json and os.path.exists(args.json):
        try:
            with open(args.json, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list) and len(data) > 0:
                records = [
                    r for r in data
                    if isinstance(r, dict)
                    and not is_superseded_or_archived_order(
                        str(r.get("application_no") or "").strip(),
                        str(r.get("gosuslugi_status") or "").strip(),
                        str(r.get("submitted_at") or "").strip(),
                    )
                ]
                logger.info(f"Loaded {len(records)} records from {args.json}")
        except Exception as e:
            logger.warning(f"Could not read {args.json}: {e}")

    # Merge with the central 3,088-worker master list from https://hr.pondera.network (Central Server is authoritative!)
    if central_records:
        by_sicil = {str(r.get("sicil") or r.get("sicil_no") or "").strip(): r for r in records if str(r.get("sicil") or r.get("sicil_no") or "").strip()}
        for cr in central_records:
            csic = cr["sicil_no"]
            c_app = str(cr.get("application_no") or "").strip()
            c_sub = str(cr.get("submitted_at") or "").strip()
            if csic in by_sicil:
                existing_r = by_sicil[csic]
                ex_app = str(existing_r.get("application_no") or "").strip()
                existing_r["submitted_at"] = c_sub or str(existing_r.get("submitted_at") or "").strip()
                existing_r["checked_at"] = str(cr.get("checked_at") or existing_r.get("checked_at") or "").strip()
                if ex_app and is_superseded_or_archived_order(
                    ex_app,
                    str(existing_r.get("gosuslugi_status") or "").strip(),
                    existing_r["submitted_at"],
                ):
                    existing_r["application_no"] = c_app
                    existing_r["pdf_filename"] = str(cr.get("pdf_filename") or "").strip()
                    existing_r["gosuslugi_status"] = str(cr.get("gosuslugi_status") or "").strip()
                elif c_app:
                    if not ex_app or (c_app.isdigit() and ex_app.isdigit() and int(c_app) >= int(ex_app)):
                        existing_r["application_no"] = c_app
                        existing_r["gosuslugi_status"] = str(cr.get("gosuslugi_status") or existing_r.get("gosuslugi_status") or "").strip()
                if not existing_r.get("pdf_filename") and cr.get("pdf_filename"):
                    existing_r["pdf_filename"] = cr["pdf_filename"]
                if cr.get("status_pdf_filename"):
                    existing_r["status_pdf_filename"] = cr["status_pdf_filename"]
                if not existing_r.get("worker_name") and cr.get("worker_name"):
                    existing_r["worker_name"] = cr["worker_name"]
            else:
                records.append(cr)
                by_sicil[csic] = cr
        logger.info(f"Synced with Central Master List: {len(records)} total VKS workers ready for multi-account status/PDF check.")

    # Also merge any PDFs found in ~/Downloads that have non-archived Gosuslugi application numbers
    discovered_pdfs = scan_downloads_for_applications()
    by_sicil_map = {str(r.get("sicil") or r.get("sicil_no") or "").strip(): r for r in records if str(r.get("sicil") or r.get("sicil_no") or "").strip()}
    existing_app_nos = {str(r.get("application_no") or "").strip() for r in records if str(r.get("application_no") or "").strip()}
    for d_item in discovered_pdfs:
        d_app = str(d_item.get("application_no") or "").strip()
        d_sic = str(d_item.get("sicil") or d_item.get("sicil_no") or "").strip()
        if not d_app or is_superseded_or_archived_order(d_app):
            continue
        if d_sic and d_sic in by_sicil_map:
            r_sic = by_sicil_map[d_sic]
            r_sub = str(r_sic.get("submitted_at") or "").strip()
            r_app = str(r_sic.get("application_no") or "").strip()
            if is_superseded_or_archived_order(d_app, "", r_sub):
                continue
            if r_app and r_app.isdigit() and d_app.isdigit() and int(d_app) < int(r_app):
                continue
        if d_app not in existing_app_nos:
            records.append(d_item)
            existing_app_nos.add(d_app)
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
            attach_feeds_network_listener(page)
        except Exception as e:
            logger.error(f"Could not connect to Chrome on port {args.cdp_port}: {e}")
            return

        # Identify which sicil codes belong to THIS computer's local VKS queue
        local_sicils = set()
        for r in records:
            if r.get("is_local_worker"):
                s = str(r.get("sicil") or r.get("sicil_no") or "").strip()
                if s:
                    local_sicils.add(s)
        active_vks_q_path = os.path.join(CURRENT_DIR, "active_vks_queue.json")
        if os.path.exists(active_vks_q_path):
            try:
                with open(active_vks_q_path, "r", encoding="utf-8") as qf:
                    q_data = json.load(qf)
                    if isinstance(q_data, list):
                        for qr in q_data:
                            qs = str(qr.get("Sicil") or qr.get("Код") or qr.get("sicil") or "").strip()
                            if qs:
                                local_sicils.add(qs)
            except Exception:
                pass

        # Navigate to https://lk.gosuslugi.ru/orders if not already there (unless --status-only and already on gosuslugi.ru)
        cur_page_url = (page.url or "").lower()
        if (args.status_only or args.single_search) and "gosuslugi.ru" in cur_page_url and "esia.gosuslugi.ru" not in cur_page_url:
            run_fast_json_status_sync_on_page(
                page,
                max_pages=args.max_pages,
                records=records,
                allow_single_search=True,
                search_scope=args.search_scope,
                capture_screenshots=bool(args.capture_screenshots),
            )
            return

        if "lk.gosuslugi.ru/orders" not in (page.url or ""):
            logger.info(f"Navigating to Gosuslugi Заявления ({ORDERS_URL})...")
            try:
                page.goto(ORDERS_URL, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(2500)
            except Exception as e:
                logger.warning(f"Navigation to lk.gosuslugi.ru/orders note: {e}")

        if args.status_only or args.single_search:
            run_fast_json_status_sync_on_page(
                page,
                max_pages=args.max_pages,
                records=records,
                allow_single_search=True,
                search_scope=args.search_scope,
                capture_screenshots=bool(args.capture_screenshots),
            )
            return

        # If Gosuslugi redirected to login (esia.gosuslugi.ru/login), wait until user logs in
        if "esia.gosuslugi.ru" in (page.url or "").lower():
            logger.warning(
                "PAUSED_FOR_LOGIN: Сессия Госуслуг завершилась (esia.gosuslugi.ru/login). "
                "Пожалуйста, войдите в Госуслуги в окне Chrome — проверка статусов автоматически продолжится после входа!"
            )
            for _ in range(450):
                page.wait_for_timeout(2000)
                cur_u = (page.url or "").lower()
                if "esia.gosuslugi.ru" not in cur_u and "gosuslugi.ru" in cur_u:
                    logger.info("LOGIN_RESTORED: Вход в Госуслуги выполнен! Продолжаем проверку статусов...")
                    page.wait_for_timeout(2000)
                    if "lk.gosuslugi.ru/orders" not in cur_u:
                        try:
                            page.goto(ORDERS_URL, wait_until="domcontentloaded", timeout=45000)
                            page.wait_for_timeout(2500)
                        except Exception:
                            pass
                    break

        # TIER 1: Bulk fetch orders via Gosuslugi API / Network Interceptor / DOM + 'Показать ещё'
        bulk_orders = fetch_bulk_orders_via_api(page, max_pages=args.max_pages)

        # Filter labor notification orders (sorted newest application_no first!)
        labor_orders_list = sorted(
            [
                ord_item for ord_item in bulk_orders.values()
                if is_valid_labor_notification_order(ord_item)
                and not is_superseded_or_archived_order(
                    ord_item.get("application_no", ""),
                    ord_item.get("gosuslugi_status", ""),
                )
            ],
            key=lambda x: int(x["application_no"]) if str(x.get("application_no") or "").isdigit() else 0,
            reverse=True,
        )

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        updated_records: List[Dict[str, Any]] = []
        assigned_app_nos_to_sicil: Dict[str, str] = {}
        for r_pre in records:
            p_sic = str(r_pre.get("sicil") or r_pre.get("sicil_no") or "").strip()
            p_app = str(r_pre.get("application_no") or "").strip()
            p_st = str(r_pre.get("gosuslugi_status") or "").strip()
            p_sub = str(r_pre.get("submitted_at") or "").strip()
            if p_sic and p_app and p_app.isdigit() and not is_superseded_or_archived_order(p_app, p_st, p_sub):
                assigned_app_nos_to_sicil[p_app] = p_sic

        # Log top recent applications found on the account so user always sees immediate feedback
        if bulk_orders:
            sample_list = list(bulk_orders.values())[:10]
            logger.info(f"--- Recent Applications on Gosuslugi Account (Top {len(sample_list)} of {len(bulk_orders)}) ---")
            for s_idx, s_ord in enumerate(sample_list, 1):
                logger.info(
                    f"  [{s_idx}] № {s_ord['application_no']} | {s_ord['gosuslugi_status']} | "
                    f"{s_ord.get('citizen_name') or ''} | {s_ord.get('service_title') or ''}"
                )

        if records:
            is_large_batch = len(records) > 50
            matched_on_this_account_count = 0
            pdfs_downloaded_count = 0

            def _record_sort_key(r: Dict[str, Any]):
                r_app = str(r.get("application_no") or "").strip()
                r_st = str(r.get("gosuslugi_status") or "").strip()
                r_chk = str(r.get("checked_at") or "").strip()
                has_app = bool(r_app and r_app.isdigit())
                if not has_app:
                    return (7, "", 0)
                missing_pdf = not bool(str(r.get("pdf_filename") or "").strip())
                in_bulk = r_app in bulk_orders
                r_sic = str(r.get("sicil") or r.get("sicil_no") or "").strip()
                is_local = bool(r.get("is_local_worker")) or (r_sic in local_sicils)

                # Priority 0: Any pending record already matched in bulk_orders (instant)
                is_pending_st = (
                    r_st not in ("Услуга оказана", "Услуга отказана", "Данные не найдены в базе МВД")
                    and not r_st.lower().startswith("ошибк")
                )
                if is_pending_st and in_bulk:
                    return (0, r_chk, -int(r_app))
                # Priority 1: 'Отправлено (PDF не скачан)' / 'Отправлено' / 'В обработке' (check these first!)
                if r_st in ("", "Отправлено (PDF не скачан)", "Отправлено", "В обработке"):
                    return (1, r_chk, -int(r_app))
                # Priority 2: 'Отправлено в ведомство' (check these second!)
                if r_st == "Отправлено в ведомство":
                    return (2, r_chk, -int(r_app))
                # Priority 3: 'Заявление зарегистрировано' / 'Промежуточные результаты по заявлению' (oldest checked_at first!)
                if is_pending_st:
                    return (3, r_chk, -int(r_app))
                if in_bulk and missing_pdf:
                    return (4, "0" if is_local else "1", -int(r_app))
                if missing_pdf and is_local:
                    return (5, r_chk, -int(r_app))
                return (6, r_chk, -int(r_app))

            records.sort(key=_record_sort_key)

            for idx, rec in enumerate(records):
                prevent_windows_sleep()
                raw_app_no = str(rec.get("application_no") or "").strip()
                app_no = raw_app_no if raw_app_no.isdigit() else ""
                sicil = str(rec.get("sicil") or rec.get("sicil_no") or "").strip()
                worker_name = str(rec.get("worker_name") or "").strip()
                pdf_file = str(rec.get("pdf_filename") or "").strip()
                cur_status = str(rec.get("gosuslugi_status") or "").strip()
                submitted_at = str(rec.get("submitted_at") or "").strip()
                needs_status_refresh = (
                    bool(app_no)
                    and cur_status not in ("Услуга оказана", "Услуга отказана")
                    and not cur_status.lower().startswith("ошибк")
                )

                if app_no and is_superseded_or_archived_order(app_no, cur_status, submitted_at):
                    app_no = ""
                    pdf_file = ""

                # Strictly require latest `application_no` — NEVER search by worker FIO name!
                if not app_no:
                    continue

                # If PDF is already downloaded and order is not in bulk_orders, skip slow search only if status is already final
                if is_large_batch and pdf_file and app_no not in bulk_orders:
                    if not needs_status_refresh:
                        continue

                matched_order: Optional[Dict[str, Any]] = None

                # 1) Match strictly by exact `application_no` in bulk feed
                if app_no in bulk_orders:
                    logger.info(
                        f"Checking Gosuslugi Status for: {worker_name or 'Заявление'} "
                        f"(Код: {sicil or '—'}, № Заявления: {app_no})"
                    )
                    candidate = bulk_orders[app_no]
                    if not is_acceptable_order_for_exact_app_no(candidate, worker_name):
                        logger.warning(
                            f"  -> Rejecting № {app_no} for {worker_name}: wrong service/citizen ('{candidate.get('service_title')}') or draft!"
                        )
                    elif is_superseded_or_archived_order(app_no, candidate.get("gosuslugi_status", ""), submitted_at):
                        logger.info(
                            f"  -> Skipping archived/outage № {app_no} for {worker_name}"
                        )
                    else:
                        matched_order = candidate
                        logger.info(
                            f"  -> Matched № {app_no} in bulk feed: {matched_order['gosuslugi_status']}"
                        )

                # 2) Run targeted search by application_no for any pending application (`needs_status_refresh`)
                #    not found in the initial bulk feed, or when `matched_order` is missing `feed_id` for PDF download!
                needs_feed_id_for_pdf = bool(matched_order and not matched_order.get("feed_id") and not pdf_file)
                if needs_feed_id_for_pdf or (not matched_order and (needs_status_refresh or not is_large_batch)):
                    logger.info(
                        f"Checking Gosuslugi Status for: {worker_name or 'Заявление'} "
                        f"(Код: {sicil or '—'}, № Заявления: {app_no}) — поштучный поиск по № Заявления на lk.gosuslugi.ru/orders..."
                    )
                    candidate = query_single_order_by_no(page, app_no, force_live_search=True)
                    if candidate:
                        if not is_acceptable_order_for_exact_app_no(candidate, worker_name) or is_superseded_or_archived_order(
                            app_no, candidate.get("gosuslugi_status", ""), submitted_at
                        ):
                            logger.warning(
                                f"  -> Rejecting targeted № {app_no}: wrong service, draft, or archived!"
                            )
                        else:
                            matched_order = candidate
                            bulk_orders[app_no] = candidate
                            logger.info(
                                f"  -> Found № {app_no} via search on lk.gosuslugi.ru/orders (feed_id={candidate.get('feed_id')}): {matched_order['gosuslugi_status']}"
                            )
                    else:
                        logger.info(f"  -> Заявление № {app_no} не найдено в текущем аккаунте Госуслуг.")

                if matched_order:
                    matched_on_this_account_count += 1
                    final_app_no = matched_order["application_no"]
                    owner_sicil = assigned_app_nos_to_sicil.get(final_app_no)
                    if owner_sicil and sicil and owner_sicil != sicil:
                        logger.warning(
                            f"  -> Skipping № {final_app_no} for Sicil {sicil}: already assigned to Sicil {owner_sicil}!"
                        )
                        continue
                    if sicil:
                        assigned_app_nos_to_sicil[final_app_no] = sicil

                    new_st_val = str(matched_order.get("gosuslugi_status") or "").strip()
                    if (
                        raw_app_no == final_app_no
                        and cur_status in ("Услуга оказана", "Услуга отказана")
                        and new_st_val in ("Отправлено", "Отправлено (PDF не скачан)", "В обработке")
                    ):
                        new_st_val = cur_status

                    # Automatically download, rename, and upload the receipt PDF to backend if missing
                    if not pdf_file or not is_large_batch:
                        dl_pdf = download_missing_pdf_for_order(
                            page=page,
                            feed_id=str(matched_order.get("feed_id") or ""),
                            app_no=final_app_no,
                            sicil=sicil,
                            worker_name=worker_name or matched_order.get("citizen_name") or "",
                            period_code=str(rec.get("period_code") or "2026-3"),
                        )
                        if dl_pdf:
                            pdf_file = dl_pdf
                            pdfs_downloaded_count += 1

                    gosuslugi_event_dt = parse_gosuslugi_datetime(
                        str(matched_order.get("order_date") or ""),
                        str(matched_order.get("status_detail") or ""),
                    )
                    effective_checked_at = (
                        gosuslugi_event_dt
                        if gosuslugi_event_dt and (not submitted_at or gosuslugi_event_dt >= submitted_at[:16])
                        else now_str
                    )

                    updated_entry = {
                        **rec,
                        "sicil": sicil,
                        "sicil_no": sicil,
                        "worker_name": worker_name or matched_order.get("citizen_name") or "",
                        "application_no": final_app_no,
                        "pdf_filename": pdf_file,
                        "gosuslugi_status": new_st_val,
                        "status_detail": matched_order.get("status_detail", ""),
                        "checked_at": effective_checked_at,
                        "force_status_correction": True,
                    }
                    updated_records.append(updated_entry)
                    if is_local_bridge_up_to_date():
                        logger.info(f"APPLICATION_STATUS_UPDATED: {json.dumps(updated_entry, ensure_ascii=False)}")
                    else:
                        logger.info(f"APPLICATION_SYNCED_CENTRAL: {json.dumps(updated_entry, ensure_ascii=False)}")
                    # Immediately sync this updated record (with its new PDF filename & status) to central backend!
                    sync_updates_to_pondera_api([updated_entry])
                    logger.info(
                        f"SUCCESS: Status checked & synced for {updated_entry['worker_name']} "
                        f"(№ {updated_entry['application_no']}: {updated_entry['gosuslugi_status']}, PDF: {pdf_file or '—'})!"
                    )
                elif not is_large_batch:
                    logger.info(
                        f"  -> No matching labor notification order found on current Gosuslugi account for {worker_name} (№ {app_no or '—'})."
                    )

            logger.info(
                f"Multi-Account Summary on this Gosuslugi account: matched {matched_on_this_account_count} orders, "
                f"downloaded/uploaded {pdfs_downloaded_count} PDFs."
            )
        else:
            # No pre-existing local records — only register labor notification orders
            for s_ord in labor_orders_list[:50]:
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
                if is_local_bridge_up_to_date():
                    logger.info(f"APPLICATION_STATUS_UPDATED: {json.dumps(entry, ensure_ascii=False)}")
                else:
                    logger.info(f"APPLICATION_SYNCED_CENTRAL: {json.dumps(entry, ensure_ascii=False)}")
                logger.info(
                    f"SUCCESS: Status checked for {entry['worker_name']} "
                    f"(№ {entry['application_no']}: {entry['gosuslugi_status']})!"
                )

        if updated_records:
            update_local_applications_ledger(updated_records)
            sync_updates_to_pondera_api(updated_records)

        restart_local_bridge_if_outdated()

        logger.info(
            f"\n=== Status Check Complete ===\n"
            f"Bulk Feed Orders Scanned: {len(bulk_orders)}, Matched/Updated: {len(updated_records)}"
        )


if __name__ == "__main__":
    main()
