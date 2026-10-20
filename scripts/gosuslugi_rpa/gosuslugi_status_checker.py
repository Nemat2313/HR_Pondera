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
    Fetches up to `max_pages * 20` (e.g. 1,200) orders directly from Gosuslugi's internal
    /api/lk/v1/feeds/ JSON API using the browser's active session cookies — NO manual search typing needed!
    Returns a dict keyed by `application_no` (extId).
    """
    cur_url = (page.url or "").lower()
    if "esia.gosuslugi.ru/login" in cur_url or "esia.gosuslugi.ru/idp" in cur_url:
        logger.warning(
            "Сессия Госуслуг не активна (открыто окно входа esia.gosuslugi.ru/login). "
            "Пожалуйста, войдите в аккаунт Госуслуг в Chrome для получения статусов!"
        )
        return {}

    logger.info(f"Fetching bulk order list from Gosuslugi API (/api/lk/v1/feeds/, up to {max_pages * 20} items)...")
    query_prefix = (
        "?unread=false&isArchive=false&isHide=&types=ORDER,EQUEUE,APPEAL,CLAIM,SIGN,KND_APPEAL,LICENSING,LICENSING_APPEAL"
        "&pageSize=20&status=&startDate="
    )
    candidate_bases = [
        f"/api/lk/v1/feeds/{query_prefix}",
        f"https://www.gosuslugi.ru/api/lk/v1/feeds/{query_prefix}",
        f"https://lk.gosuslugi.ru/api/lk/v1/feeds/{query_prefix}",
    ]

    try:
        raw_items = page.evaluate(
            """async ({ candidateBases, maxPages }) => {
                for (const baseUrl of candidateBases) {
                    try {
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
    cleaned = re.sub(r"[^а-яёa-z0-9\s]", " ", (name or "").lower())
    stop_words = {"нет", "не", "заполнено", "отсутствует", "no", "none", "null"}
    tokens = [t for t in cleaned.split() if t and t not in stop_words]
    return " ".join(tokens)


def does_citizen_match_worker_name(citizen_text: str, worker_name: str) -> bool:
    """
    Strictly verifies that all meaningful name tokens of `worker_name`
    appear inside `citizen_text` ('Гражданин: ...').
    Supports single-token names when Фамилия/Отчество are 'Нет' (e.g. 'Нет АДЖАД Нет').
    """
    norm_c = normalize_name_for_match(citizen_text)
    norm_w = normalize_name_for_match(worker_name)
    if not norm_c or not norm_w:
        return False
    w_tokens = [t for t in norm_w.split() if len(t) >= 2]
    if not w_tokens:
        return False
    return all(tok in norm_c for tok in w_tokens)


def is_valid_labor_notification_order(ord_item: Dict[str, Any]) -> bool:
    """
    Excludes non-labor services such as 'Уведомления о прибытии и убытии иностранцев',
    Work Permits ('Разрешение на работу ИГ'), and unsent drafts ('черновик').
    """
    if not ord_item:
        return False
    srv = str(ord_item.get("service_title") or "").lower().replace("ё", "е")
    raw_t = str(ord_item.get("raw_title") or "").lower().replace("ё", "е")
    raw_s = str(ord_item.get("raw_status") or "").lower()
    combined = f"{srv} {raw_t}"
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
    if srv and "трудовой деятельности" not in srv:
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
    clicks 'Скачать' next to 'req_preview', and renames the file to:
      <Sicil>_<AppNo>_<CleanWorkerName>_<Period>.pdf
    """
    downloads_dir = Path.home() / "Downloads"
    downloads_dir.mkdir(parents=True, exist_ok=True)
    clean_no = str(app_no or "").strip()
    if not clean_no:
        return ""

    # Check if already downloaded
    for p in downloads_dir.glob("*.pdf"):
        if clean_no in p.name and not p.name.startswith("tmp_"):
            return p.name

    if not feed_id:
        return ""

    logger.info(f"  -> Missing PDF for № {clean_no} ({worker_name}): opening order {feed_id} & clicking 'Показать историю' -> 'Скачать'...")
    expand_history_and_inspect_order_page(page, feed_id)

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
    try:
        if downloaded_path.resolve() != new_filepath.resolve():
            os.replace(str(downloaded_path), str(new_filepath))
        logger.info(f"  -> Downloaded & renamed missing PDF: {new_filename}")
        upload_pdf_to_central_server(new_filepath, clean_no, clean_sicil)
        return new_filename
    except Exception:
        upload_pdf_to_central_server(downloaded_path, clean_no, clean_sicil)
        return downloaded_path.name


def upload_pdf_to_central_server(pdf_path: Path, app_no: str, sicil_no: str):
    """Uploads the downloaded PDF receipt directly to Pondera HR Central Server (/api/gosuslugi/pdf) so all 4 PCs share PDFs."""
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
                    logger.info(f"  -> Uploaded PDF to central server: {pdf_path.name}")
                    break
            except Exception:
                pass
    except Exception:
        pass


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
                    rows = data.get("data") or []
                    if isinstance(rows, list) and len(rows) > 0:
                        mapped = []
                        for w in rows:
                            sic = str(w.get("sicil") or w.get("code") or "").strip()
                            parts = [str(w.get("lastName") or "").strip(), str(w.get("firstName") or "").strip(), str(w.get("middleName") or "").strip()]
                            full_name = " ".join([p for p in parts if p and p.lower() != "нет"]).strip()
                            mapped.append({
                                "sicil": sic,
                                "sicil_no": sic,
                                "worker_name": full_name,
                                "citizenship": str(w.get("citizenship") or "").strip(),
                                "notification_type": "vks_salary",
                                "period_code": "2026-3",
                                "application_no": str(w.get("applicationNo") or "").strip(),
                                "gosuslugi_status": str(w.get("gosuslugiStatus") or "").strip(),
                                "pdf_filename": str(w.get("pdfFilename") or "").strip(),
                            })
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
    max_pages: int = 60,
    records: Optional[List[Dict[str, Any]]] = None,
) -> int:
    """
    Fast, non-intrusive status sync (NO PDF download, NO /order/<feed_id> navigation):
    Fetches up to `max_pages * 20` (e.g. 1,200) applications directly from Gosuslugi's JSON API
    (/api/lk/v1/feeds/) using the current browser session cookies in ~2-4 seconds, matches them
    against the central 3,088 VKS master list by application_no or Гражданин name, and updates
    their statuses ('Услуга оказана', 'Услуга отказана', 'Промежуточные результаты по заявлению',
    'Заявление зарегистрировано') on the central Pondera HR server.
    """
    try:
        cur_url = (page.url or "").lower()
        if "gosuslugi.ru" not in cur_url or "esia.gosuslugi.ru" in cur_url:
            logger.info("Fast JSON status sync skipped: active tab is not on an authenticated gosuslugi.ru page.")
            return 0

        target_records = records if records is not None else fetch_central_master_list_records()
        if not target_records:
            return 0

        bulk_orders = fetch_bulk_orders_via_api(page, max_pages=max_pages)
        if not bulk_orders:
            return 0

        labor_orders_list = [
            ord_item for ord_item in bulk_orders.values()
            if is_valid_labor_notification_order(ord_item)
        ]

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        updated_records: List[Dict[str, Any]] = []
        assigned_app_nos_to_sicil: Dict[str, str] = {}

        for rec in target_records:
            raw_app_no = str(rec.get("application_no") or "").strip()
            app_no = raw_app_no if raw_app_no.isdigit() else ""
            sicil = str(rec.get("sicil") or rec.get("sicil_no") or "").strip()
            worker_name = str(rec.get("worker_name") or "").strip()

            matched_order: Optional[Dict[str, Any]] = None

            if app_no and app_no in bulk_orders:
                candidate = bulk_orders[app_no]
                if is_valid_labor_notification_order(candidate):
                    if not (
                        worker_name
                        and candidate.get("citizen_name")
                        and not does_citizen_match_worker_name(candidate["citizen_name"], worker_name)
                    ):
                        matched_order = candidate
            elif worker_name and not app_no:
                for cand in labor_orders_list:
                    cand_no = cand["application_no"]
                    owner_sicil = assigned_app_nos_to_sicil.get(cand_no)
                    if owner_sicil and sicil and owner_sicil != sicil:
                        continue
                    if does_citizen_match_worker_name(cand.get("citizen_name", ""), worker_name):
                        matched_order = cand
                        app_no = cand_no
                        break

            if not matched_order:
                continue

            final_app_no = matched_order["application_no"]
            owner_sicil = assigned_app_nos_to_sicil.get(final_app_no)
            if owner_sicil and sicil and owner_sicil != sicil:
                continue
            if sicil:
                assigned_app_nos_to_sicil[final_app_no] = sicil

            prev_status = str(rec.get("gosuslugi_status") or "").strip()
            new_status = str(matched_order.get("gosuslugi_status") or "").strip()
            if prev_status == new_status and raw_app_no == final_app_no:
                continue

            updated_entry = {
                **rec,
                "sicil": sicil,
                "sicil_no": sicil,
                "worker_name": worker_name or matched_order.get("citizen_name") or "",
                "application_no": final_app_no,
                "pdf_filename": str(rec.get("pdf_filename") or "").strip(),
                "gosuslugi_status": new_status,
                "status_detail": matched_order.get("status_detail", ""),
                "checked_at": now_str,
            }
            updated_records.append(updated_entry)
            logger.info(f"APPLICATION_STATUS_UPDATED: {json.dumps(updated_entry, ensure_ascii=False)}")

        if updated_records:
            sync_updates_to_pondera_api(updated_records)
            logger.info(
                f">>> Fast 30-Min JSON Status Sync: Scanned {len(bulk_orders)} orders on this Gosuslugi account, "
                f"updated {len(updated_records)} application statuses on central server (0 PDFs downloaded)! <<<"
            )
        else:
            logger.info(
                f">>> Fast 30-Min JSON Status Sync: Scanned {len(bulk_orders)} orders on this Gosuslugi account "
                f"(all statuses already up to date). <<<"
            )
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
    parser.add_argument("--max-pages", type=int, default=60, help="Max bulk pages (20 orders/page, 60 = 1200 orders) to fetch without searching")
    parser.add_argument("--status-only", action="store_true", help="Fast JSON-only status check without downloading PDFs or opening individual order pages")
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

    # Always merge with the central 3,088-worker master list from https://hr.pondera.network so all 4 Gosuslugi accounts
    # can match orders by application_no or Гражданин name and skip orders whose PDF is already downloaded centrally!
    central_records = fetch_central_master_list_records()
    if central_records:
        by_sicil = {str(r.get("sicil") or r.get("sicil_no") or "").strip(): r for r in records if str(r.get("sicil") or r.get("sicil_no") or "").strip()}
        for cr in central_records:
            csic = cr["sicil_no"]
            if csic in by_sicil:
                existing_r = by_sicil[csic]
                if not existing_r.get("application_no") and cr.get("application_no"):
                    existing_r["application_no"] = cr["application_no"]
                if not existing_r.get("pdf_filename") and cr.get("pdf_filename"):
                    existing_r["pdf_filename"] = cr["pdf_filename"]
                if not existing_r.get("worker_name") and cr.get("worker_name"):
                    existing_r["worker_name"] = cr["worker_name"]
            else:
                records.append(cr)
                by_sicil[csic] = cr
        logger.info(f"Synced with Central Master List: {len(records)} total VKS workers ready for multi-account status/PDF check.")

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

        # Navigate to https://lk.gosuslugi.ru/orders if not already there (unless --status-only and already on gosuslugi.ru)
        cur_page_url = (page.url or "").lower()
        if args.status_only and "gosuslugi.ru" in cur_page_url and "esia.gosuslugi.ru" not in cur_page_url:
            run_fast_json_status_sync_on_page(page, max_pages=args.max_pages, records=records)
            return

        if "lk.gosuslugi.ru/orders" not in (page.url or ""):
            logger.info(f"Navigating to Gosuslugi Заявления ({ORDERS_URL})...")
            try:
                page.goto(ORDERS_URL, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(2000)
            except Exception as e:
                logger.warning(f"Navigation to lk.gosuslugi.ru/orders note: {e}")

        if args.status_only:
            run_fast_json_status_sync_on_page(page, max_pages=args.max_pages, records=records)
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
                            page.wait_for_timeout(2000)
                        except Exception:
                            pass
                    break

        # TIER 1: Bulk fetch orders directly via Gosuslugi JSON API (no search box typing needed!)
        bulk_orders = fetch_bulk_orders_via_api(page, max_pages=args.max_pages)

        # Filter labor notification orders for citizen lookup
        labor_orders_list = [
            ord_item for ord_item in bulk_orders.values()
            if is_valid_labor_notification_order(ord_item)
        ]

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        updated_records: List[Dict[str, Any]] = []
        assigned_app_nos_to_sicil: Dict[str, str] = {}

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
            # For recent labor orders whose feed snippet did NOT include 'citizen_name'
            # (because 'Гражданин' is inside 'Показать историю' on /order/<feed_id>), inspect them once on demand
            inspected_feed_ids = set()

            # Multi-account optimization: when checking full 3,088 master list across 4 Gosuslugi accounts,
            # bulk_orders already holds up to 1,200 orders from the CURRENT logged-in Gosuslugi account.
            is_large_batch = len(records) > 50
            matched_on_this_account_count = 0
            pdfs_downloaded_count = 0

            for idx, rec in enumerate(records):
                raw_app_no = str(rec.get("application_no") or "").strip()
                app_no = raw_app_no if raw_app_no.isdigit() else ""
                sicil = str(rec.get("sicil") or rec.get("sicil_no") or "").strip()
                worker_name = str(rec.get("worker_name") or "").strip()

                # Fast multi-account skip: if this worker already has an application_no recorded from another
                # computer/account and that application_no is NOT in the current account's bulk_orders feed,
                # skip immediately without slow per-worker UI searches!
                if is_large_batch and app_no and app_no not in bulk_orders:
                    continue

                if not is_large_batch or (app_no and app_no in bulk_orders):
                    logger.info(
                        f"Checking Gosuslugi Status for: {worker_name or 'Заявление'} "
                        f"(Код: {sicil or '—'}, № Заявления: {app_no or 'по ФИО'})"
                    )

                matched_order: Optional[Dict[str, Any]] = None

                # 1) Match by application_no in bulk feed (with citizen & service validation!)
                if app_no and app_no in bulk_orders:
                    candidate = bulk_orders[app_no]
                    if not is_valid_labor_notification_order(candidate):
                        logger.warning(
                            f"  -> Rejecting № {app_no} for {worker_name}: wrong service ('{candidate.get('service_title')}') or draft!"
                        )
                    elif worker_name and candidate.get("citizen_name") and not does_citizen_match_worker_name(candidate["citizen_name"], worker_name):
                        logger.warning(
                            f"  -> Rejecting № {app_no} for {worker_name}: order belongs to Гражданин '{candidate['citizen_name']}'!"
                        )
                    else:
                        matched_order = candidate
                        logger.info(
                            f"  -> Matched № {app_no} in bulk feed (no search needed): {matched_order['gosuslugi_status']}"
                        )

                # 2) Match by Citizen Name ('Гражданин') in labor_orders_list if application_no not matched
                if not matched_order and worker_name and not app_no:
                    for cand in labor_orders_list:
                        cand_no = cand["application_no"]
                        owner_sicil = assigned_app_nos_to_sicil.get(cand_no)
                        if owner_sicil and sicil and owner_sicil != sicil:
                            continue
                        if does_citizen_match_worker_name(cand.get("citizen_name", ""), worker_name):
                            matched_order = cand
                            app_no = cand_no
                            logger.info(
                                f"  -> Matched '{worker_name}' by Гражданин ('{cand.get('citizen_name')}') -> № {app_no}: {matched_order['gosuslugi_status']}"
                            )
                            break

                # 2.5) If still not matched and worker has no app_no, inspect recent unassigned labor orders (up to 80)
                # that had empty 'citizen_name' in the API snippet by opening /order/<feed_id> once
                if not matched_order and worker_name and not app_no:
                    for cand in labor_orders_list[:80]:
                        cand_no = cand["application_no"]
                        cand_feed_id = cand.get("feed_id", "")
                        owner_sicil = assigned_app_nos_to_sicil.get(cand_no)
                        if owner_sicil and sicil and owner_sicil != sicil:
                            continue
                        if not cand.get("citizen_name") and cand_feed_id and cand_feed_id not in inspected_feed_ids:
                            inspected_feed_ids.add(cand_feed_id)
                            page_info = expand_history_and_inspect_order_page(page, cand_feed_id)
                            if page_info.get("citizen_name"):
                                cand["citizen_name"] = page_info["citizen_name"]
                                logger.info(
                                    f"  -> Expanded 'Показать историю' on № {cand_no}: Гражданин = '{cand['citizen_name']}'"
                                )
                        if does_citizen_match_worker_name(cand.get("citizen_name", ""), worker_name):
                            matched_order = cand
                            app_no = cand_no
                            logger.info(
                                f"  -> Matched '{worker_name}' via 'Показать историю' ('{cand.get('citizen_name')}') -> № {app_no}: {matched_order['gosuslugi_status']}"
                            )
                            break

                # 3) Tier 2 Fallback: Query single numeric application_no ONLY for small targeted batches (<= 50 records)
                if not matched_order and not is_large_batch and app_no and app_no.isdigit():
                    logger.info(f"  -> № {app_no} not in recent bulk feed, querying directly...")
                    candidate = query_single_order_by_no(page, app_no)
                    if candidate:
                        if not is_valid_labor_notification_order(candidate):
                            logger.warning(
                                f"  -> Rejecting targeted № {app_no}: wrong service ('{candidate.get('service_title')}') or draft!"
                            )
                        elif worker_name and candidate.get("citizen_name") and not does_citizen_match_worker_name(candidate["citizen_name"], worker_name):
                            logger.warning(
                                f"  -> Rejecting targeted № {app_no} for {worker_name}: belongs to Гражданин '{candidate['citizen_name']}'!"
                            )
                        else:
                            matched_order = candidate
                            logger.info(
                                f"  -> Found № {app_no} via targeted search: {matched_order['gosuslugi_status']}"
                            )

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

                    # Automatically download and rename the receipt PDF if not already recorded on central server
                    # (or if running a small targeted check where local download is requested)
                    pdf_file = str(rec.get("pdf_filename") or "").strip()
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

                    updated_entry = {
                        **rec,
                        "sicil": sicil,
                        "sicil_no": sicil,
                        "worker_name": worker_name or matched_order.get("citizen_name") or "",
                        "application_no": final_app_no,
                        "pdf_filename": pdf_file,
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
