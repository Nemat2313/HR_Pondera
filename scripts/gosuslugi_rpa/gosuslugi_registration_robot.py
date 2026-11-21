#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pondera HR — Gosuslugi Migration Registration Robot (Уведомление о прибытии иностранного гражданина)
Service URL: https://www.gosuslugi.ru/600380/1/form

Connects to an already-logged-in Chrome session via CDP (http://localhost:9222),
fills the complete 600380/1 registration form for each employee, and uploads all 6 required
document categories directly via Playwright set_input_files() (no Windows Explorer dialogs).
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from playwright.sync_api import Page, sync_playwright

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PAUSE_SIGNAL_FILE = os.path.join(CURRENT_DIR, "rpa_pause.signal")
GOSUSLUGI_REG_URL = "https://www.gosuslugi.ru/600380/1/form"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("PonderaRegRPA")


DEFAULT_CONFIG: Dict[str, Any] = {
    "CHROME_CDP_URL": "http://localhost:9222",
    "REG_ADDRESS": "188471, обл. Ленинградская, р-н. Кингисеппский, п. Усть-Луга, кв-л. Краколье, соор. 1",
    "PREV_REG_ADDRESS": "",
    "VISIT_PURPOSE": "Работа по найму",
    "HAS_PREV_REG": True,
    "HAS_MIGRATION_CARD": True,
    "EMPLOYEE_DOCS_DIR": r"C:\Pondera_Registre\Dosyalar",
    "COMPANY_DOCS_DIR": r"C:\Pondera_Registre\Firma",
    "MAX_SCREEN_WAIT_SEC": 180,
    "DELETE_OLD_DRAFTS": True,
    "AUTO_SUBMIT": True,
}


def scan_registration_docs_for_sicil(
    sicil: str,
    employee_docs_dir: str,
    company_docs_dir: str,
) -> Dict[str, List[str]]:
    """
    Scans employee_docs_dir (recursively) for files matching `sicil` + document type keyword,
    and company_docs_dir for shared company documents (EGRN / ownership & authorized person passport).
    """
    result: Dict[str, List[str]] = {
        "passport": [],
        "migration_card": [],
        "contract": [],
        "work_permit": [],
        "company_egrn": [],
        "company_passport": [],
    }
    clean_sicil = re.sub(r"\s+", "", str(sicil or "").strip())
    allowed_ext = {".pdf", ".jpg", ".jpeg", ".png"}

    if clean_sicil and employee_docs_dir and os.path.isdir(employee_docs_dir):
        for root, _, files in os.walk(employee_docs_dir):
            folder_match = clean_sicil in os.path.basename(root)
            for fn in files:
                ext = os.path.splitext(fn)[1].lower()
                if ext not in allowed_ext:
                    continue
                if not folder_match and clean_sicil not in fn:
                    continue
                full_p = os.path.join(root, fn)
                low = fn.lower()
                if any(k in low for k in ("пасп", "пас", "pasp", "pass")):
                    result["passport"].append(full_p)
                elif any(k in low for k in ("миг", "mig", "мк", "mk")):
                    result["migration_card"].append(full_p)
                elif any(k in low for k in ("тд", "td", "договор", "sozlesme", "contract")):
                    result["contract"].append(full_p)
                elif any(k in low for k in ("рнр", "rnr", "пат", "pat", "виз", "viz", "вкс", "vks", "разреш")):
                    result["work_permit"].append(full_p)
                elif any(k in low for k in ("reg", "рег", "учет", "учёт")):
                    result["migration_card"].append(full_p)

    if company_docs_dir and os.path.isdir(company_docs_dir):
        for root, _, files in os.walk(company_docs_dir):
            for fn in files:
                ext = os.path.splitext(fn)[1].lower()
                if ext not in allowed_ext:
                    continue
                full_p = os.path.join(root, fn)
                low = fn.lower()
                if any(k in low for k in ("егрн", "egrn", "собств", "аренд", "kira", "tapu", "договор", "помещ")):
                    result["company_egrn"].append(full_p)
                elif any(k in low for k in ("паспорт", "пасп", "pasp", "окан", "okan", "руков", "представ", "директ")):
                    result["company_passport"].append(full_p)

    # Sort deterministically & deduplicate
    for k in result:
        result[k] = sorted(list(dict.fromkeys(result[k])))
    return result


class GosuslugiRegistrationRobot:
    def __init__(self, cfg: Dict[str, Any]):
        self.cfg = {**DEFAULT_CONFIG, **(cfg or {})}
        self.page: Optional[Page] = None

    def wait_if_paused(self):
        if not os.path.exists(PAUSE_SIGNAL_FILE):
            return
        logger.info("ROBOT_PAUSED: Робот на паузе. Ожидание нажатия «Продолжить (Devam Et)»...")
        while os.path.exists(PAUSE_SIGNAL_FILE):
            time.sleep(0.5)
        logger.info("ROBOT_RESUMED: Робот продолжает работу.")

    def check_mvd_unavailable_and_pause(self) -> bool:
        """Auto-pauses robot whenever Gosuslugi displays 'Сервис МВД не отвечает'."""
        if not self.page:
            return False
        try:
            hit = bool(
                self.page.evaluate(
                    """() => {
                        const txt = ((document.body && document.body.innerText) || '').toLowerCase();
                        return txt.includes('сервис мвд не отвечает') || txt.includes('попробуйте подать заявление позже');
                    }"""
                )
            )
            if hit:
                logger.warning("MVD_SERVICE_UNAVAILABLE: Обнаружено «Сервис МВД не отвечает» -> автоматическая пауза.")
                try:
                    with open(PAUSE_SIGNAL_FILE, "w", encoding="utf-8") as pf:
                        pf.write("mvd_unavailable")
                except Exception:
                    pass
                self.wait_if_paused()
                return True
        except Exception:
            pass
        return False

    def _handle_draft_modal_if_visible(self) -> bool:
        """
        Battle-tested Gosuslugi draft modal handler (ported from 600585/1 robot):
        - Scrolls modal to bottom
        - If DELETE_OLD_DRAFTS is True and (button is disabled OR draft count >= 8), deletes oldest 1-3 drafts
        - Clicks 'Создать заявление' / 'Создать новое заявление' / 'Начать заново' via JS + physical mouse click.
        """
        if not self.page:
            return False
        try:
            draft_state = self.page.evaluate(
                """() => {
                    const vis = (el) => {
                        if (!el) return false;
                        const r = el.getBoundingClientRect();
                        return r.width > 10 && r.height > 10;
                    };
                    const bodyTxt = ((document.body && document.body.innerText) || '').toLowerCase();
                    const isDraftModal = bodyTxt.includes('выберите черновик') || bodyTxt.includes('перейти в черновик');
                    const drafts = document.querySelectorAll('.draft-list .draft, epgu-constructor-draft-list .draft, .conf-modal .draft');
                    const delBtns = Array.from(document.querySelectorAll('button, a, span'))
                        .filter(el => vis(el) && (el.innerText || el.textContent || '').trim() === 'Удалить');
                    const createBtn = Array.from(document.querySelectorAll('button, lib-button button'))
                        .find(b => {
                            if (!vis(b)) return false;
                            const t = (b.innerText || b.textContent || '').trim();
                            return t.includes('Создать заявление') || t.includes('Создать новое заявление') || t.includes('Начать заново') || t.includes('Новое заявление');
                        }) || document.querySelector('lib-button.conf-modal__button button');
                    if (!isDraftModal && !vis(createBtn) && drafts.length === 0) {
                        return { found: false };
                    }
                    // Scroll modal containers to bottom so button is always in viewport
                    document.querySelectorAll('ng-scrollbar, .ng-scroll-viewport, .conf-modal__body, .modal-body, div').forEach(el => {
                        if (el.scrollHeight > el.clientHeight + 10) {
                            try { el.scrollTop = el.scrollHeight; } catch (e) {}
                        }
                    });
                    if (createBtn) {
                        createBtn.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
                    }
                    const r = createBtn ? createBtn.getBoundingClientRect() : null;
                    const wrap = createBtn ? createBtn.closest('lib-button, epgu-cf-ui-button') : null;
                    const st = createBtn ? window.getComputedStyle(createBtn) : null;
                    const btnDisabled = createBtn ? !!(
                        createBtn.disabled ||
                        createBtn.getAttribute('disabled') !== null ||
                        (createBtn.className || '').includes('disabled') ||
                        (st && st.pointerEvents === 'none') ||
                        (wrap && ((wrap.className || '').includes('disabled') || wrap.getAttribute('disabled') !== null))
                    ) : true;
                    return {
                        found: true,
                        draftCount: Math.max(drafts.length, delBtns.length),
                        btnDisabled,
                        btnText: createBtn ? (createBtn.innerText || '').trim() : '',
                        x: r ? r.left + r.width / 2 : 0,
                        y: r ? r.top + r.height / 2 : 0
                    };
                }"""
            ) or {}
        except Exception:
            return False

        if not draft_state.get("found"):
            return False

        logger.info(
            f"Draft Modal detected (drafts={draft_state.get('draftCount')}, btn='{draft_state.get('btnText')}', disabled={draft_state.get('btnDisabled')})..."
        )
        delete_old = bool(self.cfg.get("DELETE_OLD_DRAFTS", True))
        if delete_old and (draft_state.get("btnDisabled") or int(draft_state.get("draftCount") or 0) >= 8):
            for _ in range(3):
                del_btns = self.page.locator(
                    ".draft-list .draft button.draft-link:has-text('Удалить'):visible, "
                    "epgu-constructor-draft-list button:has-text('Удалить'):visible, "
                    "button:has-text('Удалить'):visible, a:has-text('Удалить'):visible"
                )
                if del_btns.count() == 0:
                    break
                logger.info(f"Удаляем самый старый черновик (всего: {del_btns.count()})...")
                try:
                    del_btns.last.scroll_into_view_if_needed(timeout=1500)
                    del_btns.last.click(timeout=2500)
                except Exception:
                    try:
                        del_btns.last.evaluate("el => el.click()")
                    except Exception:
                        pass
                self.page.wait_for_timeout(850)

        # Click 'Создать заявление' via BOTH JS click and physical mouse click
        try:
            coords = self.page.evaluate(
                """() => {
                    const btn = Array.from(document.querySelectorAll('button, lib-button button')).find(b => {
                        const r = b.getBoundingClientRect();
                        if (r.width < 10 || r.height < 10) return false;
                        const t = (b.innerText || b.textContent || '').trim();
                        return t.includes('Создать заявление') || t.includes('Создать новое заявление') || t.includes('Начать заново') || t.includes('Новое заявление');
                    }) || document.querySelector('lib-button.conf-modal__button button');
                    if (!btn) return null;
                    btn.scrollIntoView({ behavior: 'instant', block: 'center' });
                    const r = btn.getBoundingClientRect();
                    btn.click();
                    return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: (btn.innerText || '').trim() };
                }"""
            )
            if coords and coords.get("x") and coords.get("y"):
                logger.info(f"Clicking draft modal button '{coords.get('t')}' at ({int(coords['x'])}, {int(coords['y'])})...")
                self.page.mouse.click(float(coords["x"]), float(coords["y"]))
                self.page.wait_for_timeout(1200)
                return True
        except Exception as e:
            logger.debug(f"Draft modal click note: {e}")
        return False

    def click_text_button(self, texts: List[str], timeout_ms: int = 4000) -> bool:
        self.wait_if_paused()
        self.check_mvd_unavailable_and_pause()
        for t in texts:
            loc = self.page.locator(
                f"button:has-text('{t}'):visible, "
                f"span:has-text('{t}'):visible, "
                f"a:has-text('{t}'):visible, "
                f"lib-button:has-text('{t}'):visible"
            ).first
            if loc.count() > 0:
                try:
                    loc.scroll_into_view_if_needed(timeout=1500)
                    loc.click(timeout=timeout_ms)
                    self.page.wait_for_timeout(450)
                    return True
                except Exception:
                    try:
                        loc.click(force=True, timeout=timeout_ms)
                        self.page.wait_for_timeout(450)
                        return True
                    except Exception:
                        pass
        return False

    def click_continue(self) -> bool:
        return self.click_text_button(["Продолжить", "Далее", "Перейти к заявлению", "Перейти к уведомлению"])

    def fill_input_by_selector(self, selector: str, value: str, delay: int = 35) -> bool:
        val = str(value or "").strip()
        if not val:
            return False
        loc = self.page.locator(selector).first
        if loc.count() == 0:
            return False
        try:
            loc.scroll_into_view_if_needed(timeout=1500)
            loc.click(timeout=2000)
            self.page.wait_for_timeout(100)
            self.page.keyboard.press("Control+A")
            self.page.keyboard.press("Backspace")
            self.page.wait_for_timeout(80)
            loc.press_sequentially(val, delay=delay)
            self.page.wait_for_timeout(150)
            self.page.keyboard.press("Tab")
            return True
        except Exception as e:
            logger.debug(f"fill_input_by_selector({selector}) note: {e}")
            return False

    def fill_dadata_address_smart(self, addr: str) -> bool:
        clean_addr = str(addr or "").strip()
        if not clean_addr:
            return False
        ta = self.page.locator(
            "epgu-constructor-address-input textarea:visible, lib-dadata-widget textarea:visible, textarea.search-input:visible"
        ).first
        if ta.count() == 0:
            return False
        try:
            ta.click(timeout=2000)
            self.page.wait_for_timeout(150)
            ta.fill("")
            ta.fill(clean_addr)
            self.page.wait_for_timeout(150)
            self.page.keyboard.press("Space")
            self.page.wait_for_timeout(120)
            self.page.keyboard.press("Backspace")

            lookup = self.page.locator(".lookup-item:not(.nothing-found):visible")
            for _ in range(12):
                self.page.wait_for_timeout(300)
                if lookup.count() > 0:
                    lookup.first.click(timeout=2000)
                    self.page.wait_for_timeout(600)
                    break

            # Smart House / Apartment handling (only check 'Нет дома'/'Нет квартиры' when genuinely absent)
            m_house = re.search(
                r"(?:д\.|дом|зд\.|здание|стр\.|строение|соор\.|сооружение|вл\.|владение)\s*([0-9]+[А-Яа-яA-Za-z0-9/\-]*)",
                clean_addr,
                flags=re.IGNORECASE,
            )
            m_apt = re.search(
                r"(?:кв\.|квартира|оф\.|офис|пом\.|помещ\.|помещение|ком\.|комната|каб\.)\s*([0-9]+[А-Яа-яA-Za-z0-9/\-]*)",
                clean_addr,
                flags=re.IGNORECASE,
            )
            if not m_house:
                cb_h = self.page.locator("lib-checkbox:has-text('Нет дома'):visible label.check").first
                if cb_h.count() > 0:
                    try:
                        inp_h = self.page.locator("lib-checkbox:has-text('Нет дома'):visible input[type='checkbox']").first
                        if inp_h.count() == 0 or not inp_h.is_checked():
                            cb_h.click(timeout=1500)
                    except Exception:
                        pass
            if not m_apt:
                cb_a = self.page.locator("lib-checkbox:has-text('Нет квартиры'):visible label.check").first
                if cb_a.count() > 0:
                    try:
                        inp_a = self.page.locator("lib-checkbox:has-text('Нет квартиры'):visible input[type='checkbox']").first
                        if inp_a.count() == 0 or not inp_a.is_checked():
                            cb_a.click(timeout=1500)
                    except Exception:
                        pass
            return True
        except Exception as e:
            logger.warning(f"Address fill warning: {e}")
            return False

    def upload_files_on_current_screen(self, file_paths: List[str], slot_label: str) -> bool:
        """Uploads 1 or more PDF/JPG files into Gosuslugi's hidden input[type='file'] without OS dialogs."""
        valid_paths = [p for p in (file_paths or []) if p and os.path.isfile(p)]
        if not valid_paths:
            logger.warning(f"Upload [{slot_label}]: Нет локального файла — ставим паузу для ручной загрузки.")
            try:
                with open(PAUSE_SIGNAL_FILE, "w", encoding="utf-8") as pf:
                    pf.write(f"missing_doc:{slot_label}")
            except Exception:
                pass
            self.wait_if_paused()
            return True

        file_input = self.page.locator("input[type='file']").first
        if file_input.count() == 0:
            logger.warning(f"Upload [{slot_label}]: input[type='file'] не найден на экране.")
            return False

        logger.info(
            f"Upload [{slot_label}]: Загружаем {len(valid_paths)} файл(ов): {', '.join(os.path.basename(x) for x in valid_paths)}"
        )
        file_input.set_input_files(valid_paths)
        # Wait for Gosuslugi upload confirmation ('Удалить' link appears)
        for _ in range(40):
            self.page.wait_for_timeout(500)
            if self.page.locator("span:has-text('Удалить'):visible, button:has-text('Удалить'):visible").count() > 0:
                self.page.wait_for_timeout(400)
                return True
        return True

    def process_record(self, row: Dict[str, Any]) -> Tuple[bool, str]:
        sicil = str(row.get("Sicil") or row.get("Код") or "").strip()
        fam = str(row.get("Фамилия") or "").strip()
        imya = str(row.get("Имя") or "").strip()
        otch = str(row.get("Отчество") or "").strip()
        full_name = f"{fam} {imya} {otch}".strip()
        logger.info(f"=== Starting Gosuslugi Registration (600380/1) for: {full_name} (Sicil: {sicil}) ===")

        docs = scan_registration_docs_for_sicil(
            sicil=sicil,
            employee_docs_dir=str(self.cfg.get("EMPLOYEE_DOCS_DIR") or ""),
            company_docs_dir=str(self.cfg.get("COMPANY_DOCS_DIR") or ""),
        )
        # Allow per-row explicit file overrides from UI if provided
        if isinstance(row.get("docs"), dict):
            for k, v in row["docs"].items():
                if isinstance(v, list) and v:
                    docs[k] = v

        # Step 1: Open 600380/1/form
        logger.info(f"Step 1: Navigating to {GOSUSLUGI_REG_URL}...")
        self.page.goto(GOSUSLUGI_REG_URL, wait_until="domcontentloaded", timeout=120000)
        self.page.wait_for_timeout(1500)
        self.check_mvd_unavailable_and_pause()

        # Wait up to 15s for either Draft Modal OR 'Начать' OR first question screen to render
        for _init_w in range(30):
            self.wait_if_paused()
            self.check_mvd_unavailable_and_pause()
            if self._handle_draft_modal_if_visible():
                break
            if self.page.locator("button:has-text('Начать'):visible, span:has-text('Уведомление о прибытии'):visible").count() > 0:
                break
            self.page.wait_for_timeout(500)

        self.click_text_button(["Начать"])
        self.page.wait_for_timeout(900)

        # Wizard Q&A screens before 'Проверьте ваши данные'
        max_wait = int(self.cfg.get("MAX_SCREEN_WAIT_SEC") or 180)
        permit_type = str(row.get("ТипДокумента") or "DOC_NOT_NEEDED").upper()
        has_prev = bool(self.cfg.get("HAS_PREV_REG", True))
        has_mk = bool(self.cfg.get("HAS_MIGRATION_CARD", True))

        reg_addr = str(row.get("АдресРегистрации") or self.cfg.get("REG_ADDRESS") or "").strip()
        prev_addr = str(row.get("АдресРегистрацииСТР") or self.cfg.get("PREV_REG_ADDRESS") or reg_addr).strip()
        visit_purpose = str(row.get("ЦельВъезда") or self.cfg.get("VISIT_PURPOSE") or "Работа по найму").strip()

        # Dynamic state-machine loop across all 600380/1 screens (resilient to minor screen order differences)
        filled_flags: Dict[str, bool] = {}
        last_logged_heading = ""
        start_ts = time.time()
        app_no = ""

        while time.time() - start_ts < max_wait * 3:
            self.wait_if_paused()
            self.check_mvd_unavailable_and_pause()

            # Always catch late-appearing draft modal inside the loop too!
            if self._handle_draft_modal_if_visible():
                continue

            heading = ""
            body_text = ""
            try:
                info = self.page.evaluate(
                    """() => {
                        const h = Array.from(document.querySelectorAll('h1, h2'))
                            .find(el => el.getBoundingClientRect().width > 10 && el.getBoundingClientRect().height > 10);
                        return {
                            h: h ? (h.innerText || '').trim() : '',
                            b: ((document.body && document.body.innerText) || '').slice(0, 2500),
                            url: location.href
                        };
                    }"""
                )
                heading = re.sub(r"\s+", " ", str(info.get("h") or "")).strip()
                body_text = re.sub(r"\s+", " ", str(info.get("b") or "")).strip()
            except Exception:
                self.page.wait_for_timeout(500)
                continue

            if heading and heading != last_logged_heading:
                last_logged_heading = heading
                logger.info(f"Screen: {heading}")

            h_low = heading.lower()
            b_low = body_text.lower()

            # Check for completion / order number
            m_ord = re.search(r"/order/(\d{7,15})", self.page.url or "")
            if m_ord:
                app_no = m_ord.group(1)
                logger.info(f"SUCCESS: Registration submitted! Application № {app_no}")
                break

            # 0) Landing screen ('Уведомления о прибытии и убытии иностранцев' -> 'Начать')
            if "уведомления о прибытии и убытии" in h_low:
                if self.click_text_button(["Начать"]):
                    continue

            # 1) 'Что нужно сделать?' -> 'Поставить иностранца на учёт'
            if "что нужно сделать" in h_low:
                if self.click_text_button(["Поставить иностранца на учёт", "Поставить иностранца на учет"]):
                    continue

            # 2) 'Кого хотите поставить на учёт?' -> 'Совершеннолетнего иностранца'
            if "кого хотите поставить на учёт" in h_low or "кого хотите поставить на учет" in h_low:
                self.click_text_button(["Совершеннолетнего иностранца"])
                continue

            # 3) 'У иностранца или члена его семьи есть трудовой договор в России?' -> 'Да'
            if "трудовой договор в россии" in h_low:
                self.click_text_button(["Да"])
                continue

            # 4) 'Какой документ подтверждает право пребывания или проживания иностранца в России?'
            if "какой документ" in h_low and "россии" in h_low:
                if permit_type == "VISA":
                    self.click_text_button(["Виза"])
                elif permit_type == "VNJ":
                    self.click_text_button(["Вид на жительство"])
                elif permit_type == "RVP":
                    self.click_text_button(["Разрешение на временное проживание"])
                else:
                    self.click_text_button(["Документ не нужен"])
                continue

            # 5) 'У иностранца до этого был другой адрес постановки на учёт в России?'
            if "на учёт в россии" in h_low or "на учет в россии" in h_low or "другой адрес постановки" in h_low:
                self.click_text_button(["Да" if has_prev else "Нет"])
                continue

            # 6) 'У иностранца есть миграционная карта?'
            if "миграционная карта" in h_low and "есть" in h_low:
                self.click_text_button(["Да" if has_mk else "Нет"])
                continue

            # 7) 'Что нужно для подачи уведомления'
            if "что нужно для подачи" in h_low:
                self.click_text_button(["Перейти к заявлению", "Продолжить"])
                continue

            # 7) Host / Company confirmation screens ('Проверьте ваши данные', адрес, телефон, почта)
            if "проверьте" in h_low and ("данные" in h_low or "телефон" in h_low or "почту" in h_low or "постоянной регистрации" in h_low):
                self.click_text_button(["Верно", "Продолжить"])
                continue

            # 8) Legal address confirmation
            if "юридический адрес организации" in h_low:
                self.click_continue()
                continue

            # 9) 'Адрес места пребывания совпадает с юридическим адресом организации?'
            if "совпадает с юридическим" in h_low:
                self.click_text_button(["Нет"])
                continue

            # 10) Registration Address ('Укажите адрес, по которому ставите иностранца на учёт')
            if "по которому ставите" in h_low and not filled_flags.get("reg_addr"):
                self.fill_dadata_address_smart(reg_addr)
                filled_flags["reg_addr"] = True
                self.click_continue()
                continue

            # 11) Previous Registration Address ('прежней постановки на учёт' / 'предыдущего места')
            if ("прежней" in h_low or "предыдущ" in h_low) and "учёт" in h_low and not filled_flags.get("prev_addr"):
                self.fill_dadata_address_smart(prev_addr)
                filled_flags["prev_addr"] = True
                self.click_continue()
                continue

            # 12) Foreigner Personal Info (Latin + Cyrillic + DOB + Citizenship + Gender)
            if (
                self.page.locator("#si13_lastNameRu:visible, #fi4_lastname_latin:visible").count() > 0
                and not filled_flags.get("personal_info")
            ):
                logger.info(f"Filling personal info for {full_name}...")
                self.fill_input_by_selector("#fi4_lastname_latin:visible", str(row.get("Фамилия(lat)") or ""))
                self.fill_input_by_selector("#fi6_firstname_latin:visible", str(row.get("Имя(lat)") or ""))
                self.fill_input_by_selector("#fi8_middlename_latin:visible", str(row.get("Отчество(lat)") or ""))
                self.fill_input_by_selector("#si13_lastNameRu:visible", fam)
                self.fill_input_by_selector("#si13_firstNameRu:visible", imya)
                self.fill_input_by_selector("#si13_secondNameRu:visible", otch or "Нет")
                dob = str(row.get("ДатаРождения") or "").strip()
                if dob:
                    self.fill_input_by_selector("lib-date-picker input:visible, input[placeholder*='__']:visible", dob)
                pob = str(row.get("МестоРождения") or row.get("ТекущееГражданство") or "").strip()
                if pob:
                    self.fill_input_by_selector("#si13_pob:visible", pob)
                gender = str(row.get("Пол") or "Мужской").strip().lower()
                self.click_text_button(["Женский" if gender.startswith(("ж", "f", "k")) else "Мужской"])
                filled_flags["personal_info"] = True
                self.click_continue()
                continue

            # 13) Identity Document Type ('Какой документ удостоверяет личность иностранца?')
            if "какой документ удостоверяет личность" in h_low:
                self.click_continue()
                continue

            # 14) Passport Details ('Укажите данные документа, удостоверяющего личность иностранца')
            if "удостоверяющего личность" in h_low and not filled_flags.get("passport_info"):
                logger.info("Filling passport details...")
                self.fill_input_by_selector("input[name='series']:visible, input#series:visible", str(row.get("СерияПаспорта") or ""))
                self.fill_input_by_selector("input[name='number']:visible, input#number:visible", str(row.get("НомерПаспорта") or ""))
                date_inps = self.page.locator("lib-date-picker input:visible")
                if date_inps.count() >= 1 and row.get("ДатаВыдачи"):
                    date_inps.nth(0).click()
                    self.page.keyboard.press("Control+A")
                    date_inps.nth(0).press_sequentially(str(row.get("ДатаВыдачи")), delay=40)
                if date_inps.count() >= 2 and row.get("СрокДействия"):
                    date_inps.nth(1).click()
                    self.page.keyboard.press("Control+A")
                    date_inps.nth(1).press_sequentially(str(row.get("СрокДействия")), delay=40)
                self.fill_input_by_selector("input#si14_issuedBy_125:visible, input[id*='issuedBy']:visible", str(row.get("ПаспортКемВыдан") or ""))
                filled_flags["passport_info"] = True
                self.click_continue()
                continue

            # 15) Entry Purpose ('Укажите цель въезда иностранца')
            if "цель въезда" in h_low and not filled_flags.get("visit_purpose"):
                inp = self.page.locator("lib-lookup input:visible, input.search-input:visible").first
                if inp.count() > 0:
                    inp.click()
                    inp.fill(visit_purpose)
                    self.page.wait_for_timeout(600)
                    opt = self.page.locator(".lookup-item:not(.nothing-found):visible").first
                    if opt.count() > 0:
                        opt.click()
                        self.page.wait_for_timeout(300)
                filled_flags["visit_purpose"] = True
                self.click_continue()
                continue

            # 16) Migration Card Details ('Укажите данные миграционной карты иностранца')
            if "данные миграционной карты" in h_low and not filled_flags.get("mk_info"):
                logger.info("Filling migration card details...")
                self.fill_input_by_selector("input[name='series']:visible, input#series:visible", str(row.get("Серия(МК)") or ""))
                self.fill_input_by_selector("input[name='number']:visible, input#number:visible", str(row.get("Номер(МК)") or ""))
                self.fill_input_by_selector("lib-date-picker input:visible", str(row.get("ДатаВъездаВРФ") or ""))
                filled_flags["mk_info"] = True
                self.click_continue()
                continue

            # 17) Stay Period ('Укажите срок пребывания по месту учёта')
            if "по месту учёта" in h_low or "по месту учета" in h_low or "срок пребывания" in h_low:
                if not filled_flags.get("stay_dates"):
                    logger.info(f"Filling stay period: {row.get('РегС')} — {row.get('РегПО')}...")
                    date_inps = self.page.locator("lib-date-picker input:visible")
                    if date_inps.count() >= 1 and row.get("РегС"):
                        date_inps.nth(0).click()
                        self.page.keyboard.press("Control+A")
                        date_inps.nth(0).press_sequentially(str(row.get("РегС")), delay=40)
                    if date_inps.count() >= 2 and row.get("РегПО"):
                        date_inps.nth(1).click()
                        self.page.keyboard.press("Control+A")
                        date_inps.nth(1).press_sequentially(str(row.get("РегПО")), delay=40)
                    filled_flags["stay_dates"] = True
                    self.click_continue()
                    continue

            # 18) Document Upload Screens ('Загрузите документы')
            if "загрузите документы" in h_low or self.page.locator("input[type='file']").count() > 0:
                if "паспорт иностранца" in b_low and not filled_flags.get("up_passport"):
                    self.upload_files_on_current_screen(docs["passport"], "Паспорт иностранца")
                    filled_flags["up_passport"] = True
                    self.click_continue()
                    continue
                if "миграционная карта" in b_low and not filled_flags.get("up_mk"):
                    self.upload_files_on_current_screen(docs["migration_card"], "Миграционная карта")
                    filled_flags["up_mk"] = True
                    self.click_continue()
                    continue
                if "трудовой договор" in b_low and not filled_flags.get("up_td"):
                    self.upload_files_on_current_screen(docs["contract"], "Трудовой договор")
                    filled_flags["up_td"] = True
                    self.click_continue()
                    continue
                if "подтверждающие работу" in b_low and not filled_flags.get("up_work"):
                    self.upload_files_on_current_screen(docs["work_permit"], "Документы о работе (РНР/Патент)")
                    filled_flags["up_work"] = True
                    self.click_continue()
                    continue
                if ("право собственности" in b_low or "жилое помещение" in b_low) and not filled_flags.get("up_egrn"):
                    self.upload_files_on_current_screen(docs["company_egrn"], "ЕГРН / Право собственности")
                    filled_flags["up_egrn"] = True
                    self.click_continue()
                    continue
                if "ваш паспорт" in b_low and not filled_flags.get("up_host_pass"):
                    self.upload_files_on_current_screen(docs["company_passport"], "Ваш паспорт (Представитель)")
                    filled_flags["up_host_pass"] = True
                    self.click_continue()
                    continue

            # 19) Final Submit ('Отправить уведомление' / 'Отправить заявление')
            if self.page.locator("button:has-text('Отправить уведомление'):visible, button:has-text('Отправить заявление'):visible").count() > 0:
                if self.cfg.get("AUTO_SUBMIT", True):
                    logger.info("Clicking 'Отправить уведомление'...")
                    self.click_text_button(["Отправить уведомление", "Отправить заявление"])
                    self.page.wait_for_timeout(3000)
                else:
                    logger.info("AUTO_SUBMIT=False: Форма заполнена и готова к ручной отправке. Ставим паузу.")
                    try:
                        with open(PAUSE_SIGNAL_FILE, "w", encoding="utf-8") as pf:
                            pf.write("ready_to_submit")
                    except Exception:
                        pass
                    self.wait_if_paused()
                continue

            self.page.wait_for_timeout(700)

        status_payload = {
            "sicil": sicil,
            "sicil_no": sicil,
            "worker_name": full_name,
            "citizenship": str(row.get("ТекущееГражданство") or ""),
            "notification_type": "registration",
            "application_no": app_no,
            "gosuslugi_status": "Заявление отправлено в ведомство" if app_no else "Заполнено (требуется проверка)",
            "submitted_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
        logger.info("APPLICATION_STATUS_UPDATED: " + json.dumps(status_payload, ensure_ascii=False))
        return bool(app_no), app_no

    def run(self, records: List[Dict[str, Any]]):
        cdp_url = str(self.cfg.get("CHROME_CDP_URL") or "http://localhost:9222")
        logger.info(f"Loaded {len(records)} registration records. Connecting to Chrome on {cdp_url}...")
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(cdp_url)
            ctx = browser.contexts[0] if browser.contexts else browser.new_context()
            self.page = ctx.pages[0] if ctx.pages else ctx.new_page()
            ok_cnt = 0
            err_cnt = 0
            for idx, rec in enumerate(records, 1):
                logger.info(f"--- Processing Registration Record {idx}/{len(records)} ---")
                try:
                    ok, _ = self.process_record(rec)
                    if ok:
                        ok_cnt += 1
                    else:
                        err_cnt += 1
                except Exception as e:
                    err_cnt += 1
                    logger.error(f"Registration error for record #{idx}: {e}")
            logger.info(f"=== Registration Batch Complete: Total={len(records)}, Success={ok_cnt}, Errors={err_cnt} ===")


def main():
    parser = argparse.ArgumentParser(description="Pondera HR — Gosuslugi Migration Registration Robot (600380/1)")
    parser.add_argument("--json", required=True, help="Path to active_registration_queue.json")
    parser.add_argument("--config-json", default="", help="Optional config overrides JSON")
    parser.add_argument("--limit", type=int, default=0, help="Optional max records to process")
    args = parser.parse_args()

    with open(args.json, "r", encoding="utf-8") as f:
        records = json.load(f)
    if args.limit and args.limit > 0:
        records = records[: args.limit]

    cfg: Dict[str, Any] = {}
    if args.config_json and os.path.exists(args.config_json):
        with open(args.config_json, "r", encoding="utf-8") as cf:
            cfg = json.load(cf)

    robot = GosuslugiRegistrationRobot(cfg)
    robot.run(records)


if __name__ == "__main__":
    main()
