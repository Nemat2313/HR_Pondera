"""
Pondera HR & Powerise Gosuslugi RPA Worker (Python + Playwright)
Automated Foreign Worker Dismissal Notification to MVD (Gosuslugi Service 600585/1)

Ported from Powerise (gosuslugi_dismissal_robot.py) and upgraded with Pondera VKS State-Machine Engine:
1. Attaches to open Chrome with active Gosuslugi/Rutoken session (CDP: http://localhost:9222)
2. Launches Chrome with Persistent User Profile if not open
3. Processes data from Pondera HR UI Queue (active_dismissal_queue.json) or GosUsluga_ увольнения.xlsx
4. Uses MVD-style non-blocking JS + physical mouse coordinate selection for OKVED 43.29
   ('43.29, Производство прочих строительно-монтажных работ'), Organization Status, Citizenship,
   Patent Region, DaData Work Address, and MVD Department.
"""

import sys
import os
import re
import time
import json
import shutil
import argparse
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
import openpyxl
from openpyxl.styles import PatternFill

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(f"gosuslugi_dismissal_rpa_{datetime.now().strftime('%Y%m%d')}.log", encoding="utf-8")
    ]
)
logger = logging.getLogger("PonderaGosuslugiDismissalRPA")

try:
    from playwright.sync_api import sync_playwright, Page
except ImportError:
    logger.error("Playwright is not installed! Run: pip install playwright")
    sys.exit(1)

MANUAL_CONTINUE_SIGNAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "manual_continue.signal")
PAUSE_SIGNAL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rpa_pause.signal")

DEFAULT_CONFIG = {
    "FORM_URL": "https://www.gosuslugi.ru/600585/1/form",
    "TYPE_COMPANY": "Юридическое лицо",
    "OKVED_TEXT": "Производство прочих строительно-монтажных работ",
    "OKVED_CODE": "43.29",
    "PATENT_REGION": "Тюменская",
    "PATENT_REGION_FULL": "Тюменская область",
    "WORK_ADDRESS": "626150, обл. Тюменская, г. Тобольск, тер. Восточный промышленный район, кв-л. 5-й",
    "WORK_POSTAL_CODE": "626150",
    "UFMS_DEPARTMENT": "ОТДЕЛ ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ",
    "DEFAULT_EXCEL_PATH": r"C:\Users\nemat\Downloads\GosUsluga_ увольнения.xlsx",
    "CDP_PORT": 9222,
    "TIMEOUT_MS": 120000,
    "MAX_SCREEN_WAIT_SEC": 120,
    "DELETE_OLD_DRAFTS": True,
    "ACTION_DELAY_SEC": 0.5,
}

PATENT_SERIES_TO_REGION = {
    "72": ("Тюменская", "Тюменская область"),
    "47": ("Ленинградская", "Ленинградская область"),
    "78": ("Санкт-Петербург", "г. Санкт-Петербург"),
    "77": ("Москва", "г. Москва"),
    "99": ("Москва", "г. Москва"),
    "50": ("Московская", "Московская область"),
    "28": ("Амурская", "Амурская область"),
    "16": ("Татарстан", "Республика Татарстан"),
    "02": ("Башкортостан", "Республика Башкортостан"),
    "52": ("Нижегородская", "Нижегородская область"),
    "23": ("Краснодарский", "Краснодарский край"),
    "66": ("Свердловская", "Свердловская область"),
    "86": ("Ханты-Мансийский", "Ханты-Мансийский автономный округ"),
    "89": ("Ямало-Ненецкий", "Ямало-Ненецкий автономный округ"),
}


class InsufficientPermissionsError(Exception):
    """Raised when Gosuslugi blocks submission due to missing power of attorney ('У вас недостаточно полномочий для отправки уведомлений')."""
    pass


class GosuslugiDismissalBot:
    def __init__(self, page: Page, config: Dict[str, Any] = None):
        self.page = page
        self.current_row: Dict[str, Any] = {}
        self.cfg = {**DEFAULT_CONFIG, **(config or {})}
        # Auto-normalize legacy Powerise 42.99 OKVED overrides to Pondera's 43.29 OKVED
        raw_code = str(self.cfg.get("OKVED_CODE") or "").strip()
        raw_text = str(self.cfg.get("OKVED_TEXT") or "").strip()
        if not raw_code or raw_code == "42.99":
            self.cfg["OKVED_CODE"] = "43.29"
        if not raw_text or "Строительство прочих инженерных" in raw_text:
            self.cfg["OKVED_TEXT"] = "Производство прочих строительно-монтажных работ"

        # Auto-normalize legacy Ust-Luga / Kingisepp overrides to Pondera's VKS work address & Moscow MVD ('МОСКВЕ')
        raw_addr = str(self.cfg.get("WORK_ADDRESS") or "").strip()
        if not raw_addr or "188471" in raw_addr or "Усть-Луга" in raw_addr or "Кингисепп" in raw_addr:
            self.cfg["WORK_ADDRESS"] = "626150, обл. Тюменская, г. Тобольск, тер. Восточный промышленный район, кв-л. 5-й"

        raw_ufms = str(self.cfg.get("UFMS_DEPARTMENT") or "").strip()
        if not raw_ufms or "Кингисепп" in raw_ufms or "Ленинград" in raw_ufms or "ТЮМЕН" in raw_ufms.upper():
            self.cfg["UFMS_DEPARTMENT"] = "ОТДЕЛ ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ"

    def enable_background_focus_emulation(self):
        """Ensures Chrome CDP tab processes focus/input/dropdown events even when behind another window or over AnyDesk."""
        try:
            cdp = self.page.context.new_cdp_session(self.page)
            cdp.send("Emulation.setFocusEmulationEnabled", {"enabled": True})
        except Exception:
            pass

    def check_and_stop_if_insufficient_permissions(self):
        try:
            body_text = ""
            try:
                body_text = self.page.locator("body").inner_text(timeout=2000)
            except Exception:
                pass
            body_lower = (body_text or "").lower()
            has_no_poa = (
                "недостаточно полномочий для отправки" in body_lower
                or (
                    "недостаточно полномочий" in body_lower
                    and ("сохранится в черновиках" in body_lower or "выдать вам доверенность" in body_lower or "отправить ещё раз" in body_lower)
                )
            )
            if has_no_poa:
                err_msg = (
                    "У вас недостаточно полномочий для отправки уведомлений! "
                    "Заявление сохранено в черновиках (требуется доверенность с полномочием «Подача заявлений»). Робот остановлен."
                )
                logger.error(f"FATAL_STOP: {err_msg}")
                raise InsufficientPermissionsError(err_msg)
        except InsufficientPermissionsError:
            raise
        except Exception:
            pass

    def is_on_login_page(self) -> bool:
        try:
            cur_url = (self.page.url or "").lower()
            if "esia.gosuslugi.ru/login" in cur_url or "esia.gosuslugi.ru/idp" in cur_url:
                return True
            login_inputs = self.page.locator(
                "input#login:visible, input#password:visible, input[name='login']:visible, input[type='password']:visible"
            )
            if login_inputs.count() > 0:
                return True
            body_text = self.page.locator("body").inner_text(timeout=1200)
            if (
                ("Телефон / Эл. почта / СНИЛС" in body_text and "Войти" in body_text)
                or ("Другой пользователь" in body_text and "Пароль" in body_text)
                or "Не удаётся войти" in body_text
                or ("Пароль" in body_text and "Восстановить" in body_text and "Войти" in body_text)
            ):
                return True
        except Exception:
            pass
        return False

    def is_service_unavailable_ip_block(self) -> bool:
        try:
            cur_url = (self.page.url or "").lower()
            if "gosuslugi.ru" not in cur_url:
                return False
            body_text = self.page.locator("body").inner_text(timeout=1200)
            if "Сервис МВД не отвечает" in body_text:
                return False
            if "Сервис недоступен" in body_text and (
                "Служба поддержки знает о проблеме" in body_text or "Попробуйте зайти позже" in body_text
            ):
                return True
            if "Доступ ограничен" in body_text or "Подозрительная активность" in body_text:
                return True
        except Exception:
            pass
        return False

    def wait_if_paused_or_logged_out(self) -> bool:
        paused_once = False
        while True:
            logged_out = self.is_on_login_page()
            service_unavail = False
            if not logged_out and self.is_service_unavailable_ip_block():
                self.page.wait_for_timeout(1500)
                service_unavail = self.is_service_unavailable_ip_block()
            manual_paused = os.path.exists(PAUSE_SIGNAL_FILE)
            if not logged_out and not service_unavail and not manual_paused:
                break
            paused_once = True
            if os.path.exists(MANUAL_CONTINUE_SIGNAL):
                try:
                    os.remove(MANUAL_CONTINUE_SIGNAL)
                except Exception:
                    pass
            if service_unavail:
                try:
                    with open(PAUSE_SIGNAL_FILE, "w", encoding="utf-8") as pf:
                        pf.write("paused_for_ip_block")
                except Exception:
                    pass
                logger.warning(
                    "PAUSED_FOR_IP_BLOCK: Gosuslugi «Сервис недоступен» uyarısı verdi (IP kısıtlaması). "
                    "Telefon Wi-Fi Hotspot / farklı bir IP'ye geçip «Devam Et (Resume)» butonuna basın."
                )
            elif logged_out:
                try:
                    with open(PAUSE_SIGNAL_FILE, "w", encoding="utf-8") as pf:
                        pf.write("paused_for_login")
                except Exception:
                    pass
                logger.warning(
                    "PAUSED_FOR_LOGIN: Сессия Госуслуг завершилась (выход из аккаунта). "
                    "Робот поставлен на ПАУЗУ! Войдите в аккаунт Госуслуг в окне Chrome, а затем нажмите кнопку «Продолжить (Devam Et)»."
                )
            else:
                logger.info(
                    "ROBOT_PAUSED: Робот поставлен на паузу пользователем. Ожидание нажатия кнопки «Продолжить (Devam Et)»..."
                )
            while os.path.exists(PAUSE_SIGNAL_FILE):
                if os.path.exists(MANUAL_CONTINUE_SIGNAL):
                    try:
                        os.remove(MANUAL_CONTINUE_SIGNAL)
                    except Exception:
                        pass
                    try:
                        if os.path.exists(PAUSE_SIGNAL_FILE):
                            os.remove(PAUSE_SIGNAL_FILE)
                    except Exception:
                        pass
                    break
                self.page.wait_for_timeout(1000)
            if service_unavail:
                try:
                    self.page.reload(wait_until="domcontentloaded", timeout=30000)
                    self.page.wait_for_timeout(2000)
                except Exception:
                    pass
                if self.is_service_unavailable_ip_block():
                    logger.warning(
                        "PAUSED_FOR_IP_BLOCK: Gosuslugi hâlâ «Сервис недоступен» gösteriyor! "
                        "Farklı bir IP / telefon Wi-Fi Hotspot bağlantısına geçip tekrar «Devam Et (Resume)» butonuna basın."
                    )
                    try:
                        with open(PAUSE_SIGNAL_FILE, "w", encoding="utf-8") as pf:
                            pf.write("paused_for_ip_block")
                    except Exception:
                        pass
                    continue
            if self.is_on_login_page():
                logger.warning(
                    "PAUSED_FOR_LOGIN: Вход в Госуслуги ещё не выполнен! Сначала войдите в Госуслуги в Chrome, затем нажмите «Продолжить (Devam Et)»."
                )
                try:
                    with open(PAUSE_SIGNAL_FILE, "w", encoding="utf-8") as pf:
                        pf.write("paused_for_login")
                except Exception:
                    pass
                continue
            logger.info("LOGIN_RESTORED: Работа робота возобновлена! Продолжаем с текущего сотрудника...")
            self.page.wait_for_timeout(1500)
            break
        return paused_once

    def wait_for_manual_intervention(self, step_msg: str):
        """Pauses the robot and notifies the Pondera HR UI so the user can manually fix a field and click Continue."""
        if os.path.exists(MANUAL_CONTINUE_SIGNAL):
            try:
                os.remove(MANUAL_CONTINUE_SIGNAL)
            except Exception:
                pass

        logger.warning(f"WAITING_FOR_USER: {step_msg}")
        for _ in range(600):  # Wait up to 10 minutes
            if os.path.exists(MANUAL_CONTINUE_SIGNAL):
                try:
                    os.remove(MANUAL_CONTINUE_SIGNAL)
                except Exception:
                    pass
                logger.info("USER_RESOLVED: Пользователь продолжил выполнение.")
                return
            self.page.wait_for_timeout(1000)

    def check_and_handle_error_modal(self) -> bool:
        """Check if Gosuslugi displays error modals or MVD check warnings and handle them."""
        handled = False
        try:
            retry_btn = self.page.locator("button:has-text('Попробовать ещё раз')")
            if retry_btn.count() > 0 and retry_btn.first.is_visible():
                logger.warning("Detected Gosuslugi retry modal ('Попробовать ещё раз'). Clicking retry...")
                retry_btn.first.click()
                self.page.wait_for_timeout(2000)
                handled = True
        except Exception:
            pass

        try:
            mvd_warning = self.page.locator(
                "div:has-text('Данные не найдены в базе МВД'):visible, "
                "p:has-text('МВД может отказать'):visible, "
                "span:has-text('Данные не найдены в базе МВД'):visible"
            )
            if mvd_warning.count() > 0 and mvd_warning.first.is_visible():
                logger.warning("Detected MVD warning modal ('Данные не найдены в базе МВД'). Continuing anyway...")
                cont_btn = self.page.locator(
                    "button:has-text('Продолжить'), button:has-text('Все равно продолжить'), button:has-text('Продолжить без проверки')"
                ).first
                if cont_btn.count() > 0 and cont_btn.is_visible():
                    cont_btn.click()
                    self.page.wait_for_timeout(2000)
                    handled = True
        except Exception:
            pass

        return handled

    def _is_continue_ready_js(self) -> bool:
        """Non-blocking JS check: returns True if the visible 'Продолжить' button is enabled (blue) and not disabled."""
        try:
            return bool(
                self.page.evaluate(
                    """() => {
                        const btns = Array.from(document.querySelectorAll(
                            "lib-button[data-button-type='nextstep'] button, button"
                        ));
                        let cont = null;
                        for (const b of btns) {
                            const txt = (b.innerText || b.textContent || '').trim();
                            const r = b.getBoundingClientRect();
                            if (txt.includes('Продолжить') && r.width > 30 && r.height > 15) {
                                const st = window.getComputedStyle(b);
                                if (st.visibility !== 'hidden' && st.display !== 'none' && parseFloat(st.opacity || '1') > 0.05) {
                                    cont = b;
                                }
                            }
                        }
                        if (!cont) return false;
                        const libWrap = cont.closest('lib-button, epgu-cf-ui-button');
                        const isDisabled =
                            cont.disabled ||
                            cont.getAttribute('disabled') !== null ||
                            (cont.className || '').includes('disabled') ||
                            (libWrap && ((libWrap.className || '').includes('disabled') || libWrap.getAttribute('disabled') !== null));
                        return !isDisabled;
                    }"""
                )
            )
        except Exception:
            return False

    def _click_continue_js_and_mouse(self) -> bool:
        """Clicks the active 'Продолжить' button via BOTH DOM JS events and physical mouse coordinates (x, y)."""
        try:
            coords = self.page.evaluate(
                """() => {
                    const btns = Array.from(document.querySelectorAll(
                        "lib-button[data-button-type='nextstep'] button, button"
                    ));
                    let cont = null;
                    for (const b of btns) {
                        const txt = (b.innerText || b.textContent || '').trim();
                        const r = b.getBoundingClientRect();
                        if (txt.includes('Продолжить') && r.width > 30 && r.height > 15) {
                            const st = window.getComputedStyle(b);
                            if (st.visibility !== 'hidden' && st.display !== 'none' && parseFloat(st.opacity || '1') > 0.05) {
                                cont = b;
                            }
                        }
                    }
                    if (!cont) return null;
                    cont.scrollIntoView({ block: 'center' });
                    const r = cont.getBoundingClientRect();
                    cont.focus();
                    cont.click();
                    cont.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                    cont.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                    cont.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                }"""
            )
            if coords and coords.get("x") and coords.get("y"):
                self.page.mouse.click(float(coords["x"]), float(coords["y"]))
                return True
        except Exception:
            pass
        return False

    def select_lookup_option_mvd_style(
        self,
        input_selector: str,
        type_text: str,
        match_keywords: List[str],
        step_label: str = "Lookup",
        click_continue_after: bool = True,
    ) -> bool:
        """
        Battle-tested Gosuslugi lookup selection (ported directly from VKS Step 12 MVD selector):
        1) Focuses & clicks the lookup input via JS + physical mouse coordinates
        2) Types `type_text` AND sets it via HTMLInputElement.prototype native setter + InputEvent('input')
           so Angular's dropdown filter always fires even when Chrome is in the background or over AnyDesk
        3) Polls every 250ms via non-blocking page.evaluate to find the tightest visible option element
           (80 <= width, 16 <= height <= 180 — never matching outer wrapper <div>s!)
        4) Dispatches pointerdown/mousedown/mouseup/click AND clicks physical (x, y) coordinates with page.mouse
        5) Verifies 'Продолжить' is enabled (blue) and optionally clicks 'Продолжить'.
        """
        self.enable_background_focus_emulation()
        keywords_up = [str(k).strip().upper() for k in match_keywords if str(k).strip()]

        for attempt in range(1, 7):
            self.check_and_handle_error_modal()

            # Verify the target input actually exists on the current screen before doing anything
            try:
                inp_present = bool(
                    self.page.evaluate(
                        """(sel) => {
                            const el = document.querySelector(sel);
                            if (!el) return false;
                            const r = el.getBoundingClientRect();
                            return r.width > 10 && r.height > 10;
                        }""",
                        input_selector,
                    )
                )
                if not inp_present:
                    return False
            except Exception:
                pass

            # If already selected (.displayed.lookup-item matches)
            already_selected = False
            try:
                already_selected = bool(
                    self.page.evaluate(
                        """(kwList) => {
                            const disp = document.querySelector('lib-lookup .displayed.lookup-item, .displayed.lookup-item');
                            if (disp && disp.getBoundingClientRect().width > 20) {
                                const dt = (disp.innerText || disp.textContent || '').replace(/\\s+/g, ' ').trim().toUpperCase();
                                if (kwList.some(k => dt.includes(k))) return true;
                            }
                            return false;
                        }""",
                        keywords_up,
                    )
                )
            except Exception:
                already_selected = False

            if already_selected and (not click_continue_after or self._is_continue_ready_js()):
                logger.info(f"{step_label}: Значение уже выбрано!")
                if click_continue_after:
                    self._click_continue_js_and_mouse()
                    self.page.wait_for_timeout(1500)
                return True

            logger.info(
                f"{step_label} (Попытка {attempt}/6): Вводим «{type_text}» для выбора из выпадающего списка..."
            )
            try:
                inp_coords = self.page.evaluate(
                    """(sel) => {
                        const inp = document.querySelector(sel);
                        if (!inp) return null;
                        const wrap = inp.closest('lib-lookup, .form-field, div') || document;
                        const clr = wrap.querySelector('button.search-clear, .search-clear');
                        if (clr && clr.getBoundingClientRect().width > 5) {
                            clr.click();
                        }
                        inp.scrollIntoView({ block: 'center' });
                        const r = inp.getBoundingClientRect();
                        if (r.width <= 10) return null;
                        inp.focus();
                        inp.click();
                        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                    }""",
                    input_selector,
                )
                if not inp_coords:
                    return False

                self.page.mouse.click(float(inp_coords["x"]), float(inp_coords["y"]))
                self.page.wait_for_timeout(200)
                self.page.keyboard.press("Control+A")
                self.page.keyboard.press("Backspace")
                self.page.wait_for_timeout(120)
                self.page.keyboard.type(type_text, delay=55)
                self.page.wait_for_timeout(150)

                # Background-window guarantee: set value via native HTMLInputElement prototype setter & dispatch InputEvent
                self.page.evaluate(
                    """({ sel, word }) => {
                        const inp = document.querySelector(sel);
                        if (!inp) return;
                        inp.focus();
                        inp.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
                        inp.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
                        const cur = (inp.value || '').trim().toUpperCase();
                        const targetUp = word.trim().toUpperCase();
                        if (!cur || !targetUp.startsWith(cur.slice(0, 6))) {
                            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                            if (nativeSetter) nativeSetter.call(inp, word);
                            else inp.value = word;
                            const lastCh = word.slice(-1) || ' ';
                            inp.dispatchEvent(new KeyboardEvent('keydown', { key: lastCh, bubbles: true, cancelable: true }));
                            try {
                                inp.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: word, inputType: 'insertText' }));
                            } catch (e) {
                                inp.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                            inp.dispatchEvent(new KeyboardEvent('keyup', { key: lastCh, bubbles: true, cancelable: true }));
                            inp.dispatchEvent(new Event('change', { bubbles: true }));
                        } else {
                            const lastCh = word.slice(-1) || ' ';
                            try {
                                inp.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: lastCh, inputType: 'insertText' }));
                            } catch (e) {
                                inp.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                            inp.dispatchEvent(new KeyboardEvent('keyup', { key: lastCh, bubbles: true, cancelable: true }));
                        }
                    }""",
                    {"sel": input_selector, "word": type_text},
                )
            except Exception as e:
                logger.warning(f"{step_label} input typing note: {e}")

            # Poll every 250ms (up to 28 ticks = 7s) using non-blocking page.evaluate
            for tick in range(28):
                self.check_and_handle_error_modal()
                self.page.wait_for_timeout(250)

                # Check if option is already displayed in .displayed.lookup-item
                try:
                    disp_ready = bool(
                        self.page.evaluate(
                            """(kwList) => {
                                const disp = document.querySelector('lib-lookup .displayed.lookup-item, .displayed.lookup-item');
                                if (disp && disp.getBoundingClientRect().width > 20) {
                                    const dt = (disp.innerText || disp.textContent || '').replace(/\\s+/g, ' ').trim().toUpperCase();
                                    if (kwList.some(k => dt.includes(k))) return true;
                                }
                                return false;
                            }""",
                            keywords_up,
                        )
                    )
                    if disp_ready and (not click_continue_after or self._is_continue_ready_js()):
                        logger.info(f"{step_label}: Элемент выбран в поле!")
                        if click_continue_after:
                            self._click_continue_js_and_mouse()
                            self.page.wait_for_timeout(1500)
                        return True
                except Exception:
                    pass

                # Find visible dropdown option in DOM via instant JS and click it
                dom_opt = None
                try:
                    dom_opt = self.page.evaluate(
                        """({ sel, kwList }) => {
                            const inp = document.querySelector(sel);
                            const inpRect = inp ? inp.getBoundingClientRect() : null;

                            // ONLY search actual dropdown list items (never generic div/span that could match the input wrapper!)
                            const all = Array.from(document.querySelectorAll(
                                '#lookup-list-wrap .lookup-item:not(.nothing-found), ' +
                                'lib-lookup .lookup-item:not(.nothing-found):not(.displayed), ' +
                                '.lookup-item:not(.nothing-found):not(.displayed), ' +
                                '.search-input-drop-down-item, .select-item, [role="option"], #lookup-list-wrap li'
                            ));
                            let best = null;
                            let bestScore = Infinity;

                            for (const el of all) {
                                if (!el || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON') continue;
                                if (el.querySelector && el.querySelector('input.search-input, input#dic12, input#dic11_UL_TD, input#dic13_ctz')) continue;
                                if (el.classList && (el.classList.contains('nothing-found') || el.classList.contains('displayed'))) continue;
                                if (el.closest && el.closest('.nothing-found, .displayed')) continue;

                                const r = el.getBoundingClientRect();
                                if (r.width < 60 || r.height < 16 || r.height > 180) continue;
                                const st = window.getComputedStyle(el);
                                if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity || '1') < 0.05) continue;

                                const txt = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().toUpperCase();
                                if (!txt || txt.length > 260 || txt === 'ПРОДОЛЖИТЬ' || txt === 'ИЗМЕНИТЬ' || txt === 'НАЗАД') continue;
                                if (txt.includes('НИЧЕГО НЕ НАЙДЕНО') || txt.includes('НЕ НАЙДЕНО') || txt.startsWith('ПО ЗАПРОСУ')) continue;

                                const matchesKw = kwList.some(k => txt.includes(k));
                                if (!matchesKw) continue;

                                if (inpRect && inpRect.width > 20) {
                                    if (r.top < inpRect.top - 15 || r.top > inpRect.bottom + 320) continue;
                                }

                                const area = r.width * r.height;
                                const exactMatchBonus = kwList.some(k => txt === k) ? 0.05 : 1.0;
                                const score = area * exactMatchBonus;
                                if (score < bestScore) {
                                    bestScore = score;
                                    best = { el, r, txt };
                                }
                            }

                            if (best) {
                                const itemContainer = best.el.closest('.lookup-item, .search-input-drop-down-item, .select-item, [role="option"], li') || best.el;
                                const targetRect = itemContainer.getBoundingClientRect();
                                const useRect = (targetRect.width > 60 && targetRect.height >= 16 && targetRect.height <= 180) ? targetRect : best.r;

                                for (const node of [best.el, itemContainer]) {
                                    try {
                                        node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
                                        node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                                        node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
                                        node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                                        node.click();
                                        node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                    } catch (e) {}
                                }

                                return {
                                    x: useRect.left + useRect.width / 2,
                                    y: useRect.top + useRect.height / 2,
                                    text: best.txt
                                };
                            }
                            return null;
                        }""",
                        {"sel": input_selector, "kwList": keywords_up},
                    )
                except Exception:
                    dom_opt = None

                if dom_opt and dom_opt.get("x") and dom_opt.get("y"):
                    cx = float(dom_opt["x"])
                    cy = float(dom_opt["y"])
                    logger.info(
                        f"{step_label}: Кликаем по найденному пункту списка «{dom_opt.get('text')}» в ({int(cx)}, {int(cy)})..."
                    )
                    try:
                        self.page.mouse.move(cx, cy)
                        self.page.wait_for_timeout(50)
                        self.page.mouse.down()
                        self.page.wait_for_timeout(50)
                        self.page.mouse.up()
                    except Exception:
                        pass
                    self.page.wait_for_timeout(450)

                    # When click_continue_after=False (e.g. Citizenship or Profession in the middle of a multi-field form),
                    # 'Продолжить' at the bottom of the page will NOT be enabled yet because fields below are still empty!
                    if not click_continue_after:
                        logger.info(f"{step_label}: Пункт успешно выбран!")
                        return True

                    if self._is_continue_ready_js():
                        logger.info(f"{step_label}: Пункт успешно выбран -> нажимаем «Продолжить»...")
                        self._click_continue_js_and_mouse()
                        self.page.wait_for_timeout(1500)
                        return True

                    # Also try ArrowDown + Enter if dropdown remained open
                    try:
                        self.page.keyboard.press("ArrowDown")
                        self.page.wait_for_timeout(150)
                        self.page.keyboard.press("Enter")
                        self.page.wait_for_timeout(450)
                    except Exception:
                        pass

                    if self._is_continue_ready_js():
                        logger.info(f"{step_label}: Пункт выбран через клавиатуру -> нажимаем «Продолжить»...")
                        self._click_continue_js_and_mouse()
                        self.page.wait_for_timeout(1500)
                        return True

                # Fast in-place nudge at 1.5s (tick==6) and 3.25s (tick==13) if dropdown option hasn't appeared yet
                if tick in (6, 13) and not dom_opt:
                    try:
                        self.enable_background_focus_emulation()
                        last_ch = type_text[-1] if type_text else "т"
                        self.page.keyboard.press("End")
                        self.page.keyboard.press("Backspace")
                        self.page.wait_for_timeout(80)
                        self.page.keyboard.type(last_ch, delay=50)
                        self.page.evaluate(
                            """({ sel, word, lastCh }) => {
                                const inp = document.querySelector(sel);
                                if (!inp) return;
                                inp.focus();
                                inp.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
                                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                                if (nativeSetter) nativeSetter.call(inp, word);
                                else inp.value = word;
                                try {
                                    inp.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: lastCh, inputType: 'insertText' }));
                                } catch (e) {
                                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                                inp.dispatchEvent(new KeyboardEvent('keyup', { key: lastCh, bubbles: true, cancelable: true }));
                            }""",
                            {"sel": input_selector, "word": type_text, "lastCh": last_ch},
                        )
                    except Exception:
                        pass

        return False

    def ensure_okved_selected(self) -> bool:
        """
        Step 7 ('Укажите вид деятельности по ОКВЭД'):
        Types 'Производство прочих строительно-монтажных работ' into #dic12 ONLY (never generic lib-lookup)
        and selects '43.29, Производство прочих строительно-монтажных работ', then clicks 'Продолжить'
        and waits for Step 8 (#si13_lastNameRu) to appear.
        """
        okved_code = str(self.cfg.get("OKVED_CODE") or "43.29").strip()
        okved_text = str(self.cfg.get("OKVED_TEXT") or "Производство прочих строительно-монтажных работ").strip()
        logger.info(f"Step 7: Selecting OKVED {okved_code} ({okved_text})...")

        ok = self.select_lookup_option_mvd_style(
            input_selector="input#dic12, input[id*='dic12']",
            type_text=okved_text,
            match_keywords=[
                okved_code,
                "43.29",
                "ПРОИЗВОДСТВО ПРОЧИХ СТРОИТЕЛЬНО-МОНТАЖНЫХ РАБОТ",
                "СТРОИТЕЛЬНО-МОНТАЖНЫХ РАБОТ",
                okved_text,
            ],
            step_label=f"Step 7 (ОКВЭД {okved_code})",
            click_continue_after=True,
        )
        # Wait up to 120 seconds for Step 8 (#si13_lastNameRu) to appear after clicking 'Продолжить' on Step 7
        max_wait_s = max(120, int(self.cfg.get("MAX_SCREEN_WAIT_SEC") or 120))
        for _w in range(max_wait_s * 2):
            if os.path.exists(PAUSE_SIGNAL_FILE):
                self.wait_if_paused_or_logged_out()
            self.check_and_handle_error_modal()
            if self.page.locator("#si13_lastNameRu:visible, input[name*='lastNameRu']:visible").count() > 0:
                break
            if _w > 0 and _w % 20 == 0:
                logger.info(f"Step 7->8: Ожидание перехода к данным сотрудника... ({int(_w * 0.5)} сек / до {max_wait_s} сек)")
            self.page.wait_for_timeout(500)
        return ok

    def sanitize_cyrillic_field(self, value: str, fallback: str = "", allow_digits: bool = False) -> str:
        """
        Ensures a string contains ONLY Russian Cyrillic letters, spaces, and hyphens (plus digits if allow_digits=True).
        Replaces common Latin lookalikes (A, B, C, E, H, K, M, O, P, T, X, Y, I) with Cyrillic equivalents
        so Gosuslugi never complains 'Поле может содержать только русские буквы'.
        """
        s = str(value or "").strip()
        if not s:
            return fallback
        latin_to_cyr = str.maketrans({
            "A": "А", "B": "В", "C": "С", "E": "Е", "H": "Н", "K": "К",
            "M": "М", "O": "О", "P": "Р", "T": "Т", "X": "Х", "Y": "У",
            "a": "а", "b": "в", "c": "с", "e": "е", "h": "н", "k": "к",
            "m": "м", "o": "о", "p": "р", "t": "т", "x": "х", "y": "у",
            "İ": "И", "I": "И", "ı": "и", "i": "и", "Ş": "Ш", "ş": "ш",
            "Ğ": "Г", "ğ": "г", "Ç": "Ч", "ç": "ч", "Ö": "О", "ö": "о",
            "Ü": "У", "ü": "у",
        })
        s = s.translate(latin_to_cyr)
        if allow_digits:
            s = re.sub(r"[^А-Яа-яЁё0-9\s\-№.]", " ", s)
        else:
            s = re.sub(r"[^А-Яа-яЁё\s\-]", " ", s)
        s = re.sub(r"\s+", " ", s).strip(" -")
        return s if s else fallback

    def normalize_past_or_today_date_ru(self, date_str: str) -> str:
        """
        Ensures a DD.MM.YYYY date is not in the future (Gosuslugi rejects future 'Дата расторжения' with ng-invalid).
        If an Excel typo has '.11.2026' in the future (e.g. '28.11.2026' instead of '28.10.2026'), normalizes it to '.10.2026'.
        """
        raw = str(date_str or "").strip()
        m = re.match(r"^(\d{2})\.(\d{2})\.(\d{4})$", raw)
        if not m:
            return raw
        dd, mm, yyyy = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            dt = datetime(yyyy, mm, dd).date()
            today = datetime.now().date()
            if dt > today:
                if mm == 11 and yyyy == today.year:
                    alt = datetime(yyyy, 10, min(dd, 31)).date()
                    if alt <= today:
                        fixed = alt.strftime("%d.%m.%Y")
                        logger.warning(f"Normalized future dismissal date '{raw}' -> '{fixed}' (Gosuslugi max date is today)")
                        return fixed
                fixed = today.strftime("%d.%m.%Y")
                logger.warning(f"Clamped future dismissal date '{raw}' -> '{fixed}' (Gosuslugi max date is today)")
                return fixed
        except Exception:
            pass
        return raw

    def type_masked_input(self, selector: str, value: str, delay: int = 35):
        """Clicks an input, clears it with Ctrl+A + Backspace, and types character-by-character so Angular masks trigger."""
        val = str(value or "").strip()
        if not val:
            return
        try:
            loc = self.page.locator(selector)
            if loc.count() > 0 and loc.first.is_visible():
                inp = loc.first
                inp.scroll_into_view_if_needed()
                inp.click(timeout=2500)
                self.page.wait_for_timeout(80)
                self.page.keyboard.press("Control+A")
                self.page.keyboard.press("Backspace")
                self.page.keyboard.type(val, delay=delay)
                self.page.wait_for_timeout(120)
                self.page.keyboard.press("Tab")
                return
        except Exception as e:
            logger.debug(f"type_masked_input({selector}) primary note: {e}")

        # Non-blocking JS + physical mouse fallback
        try:
            pos = self.page.evaluate(
                """(sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return null;
                    el.scrollIntoView({ block: 'center' });
                    const r = el.getBoundingClientRect();
                    if (r.width <= 0 || r.height <= 0) return null;
                    el.focus();
                    return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
                }""",
                selector.replace(":visible", ""),
            )
            if pos and pos.get("x") and pos.get("y"):
                self.page.mouse.click(float(pos["x"]), float(pos["y"]))
                self.page.wait_for_timeout(80)
                self.page.keyboard.press("Control+A")
                self.page.keyboard.press("Backspace")
                self.page.keyboard.type(val, delay=delay)
                self.page.wait_for_timeout(120)
                self.page.keyboard.press("Tab")
        except Exception as e:
            logger.debug(f"type_masked_input({selector}) JS fallback note: {e}")

    def fill_date_input_smart(self, primary_selector: str, label_keywords: List[str], value: str, delay: int = 35) -> bool:
        """
        Reliably locates and fills a Gosuslugi Angular date field (e.g. 'Дата рождения' [di13_birth],
        'Дата выдачи' [di14_issue / di15], 'Дата расторжения' [di16]) without ever hanging on placeholder selectors.
        """
        val = str(value or "").strip()
        if not val:
            return False

        self.enable_background_focus_emulation()
        kw_lower = [str(k).strip().lower() for k in label_keywords if str(k).strip()]
        clean_sel = primary_selector.replace(":visible", "")

        try:
            target_info = self.page.evaluate(
                """({ sel, kwList }) => {
                    const isVis = (el) => {
                        if (!el) return false;
                        const r = el.getBoundingClientRect();
                        if (r.width < 20 || r.height < 14) return false;
                        const st = window.getComputedStyle(el);
                        return st.visibility !== 'hidden' && st.display !== 'none' && parseFloat(st.opacity || '1') > 0.05;
                    };

                    // 1. Collect all visible candidate date inputs
                    const candidates = [];
                    const seen = new Set();
                    const addCand = (inp, priorityBonus) => {
                        if (!inp || seen.has(inp) || !isVis(inp)) return;
                        seen.add(inp);
                        // Gather context text from surrounding form group / label / date-picker
                        const wrapper = inp.closest('lib-date-picker, .form-field, .input-group, .field-wrap, epgu-constructor-form-field, div') || inp.parentElement;
                        const parentWrap = (wrapper && wrapper.parentElement) ? wrapper.parentElement : wrapper;
                        const ctxText = ((parentWrap ? parentWrap.innerText : '') || (wrapper ? wrapper.innerText : '') || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                        const nameId = ((inp.getAttribute('name') || '') + ' ' + (inp.getAttribute('id') || '') + ' ' + (inp.getAttribute('placeholder') || '')).toLowerCase();
                        let score = priorityBonus;
                        for (const kw of kwList) {
                            if (ctxText.includes(kw)) score += 50;
                            if (nameId.includes(kw)) score += 30;
                        }
                        if (inp.closest('lib-date-picker')) score += 20;
                        candidates.push({ inp, score, curVal: (inp.value || '').trim() });
                    };

                    if (sel) {
                        try {
                            document.querySelectorAll(sel).forEach(el => addCand(el, 40));
                        } catch (e) {}
                    }
                    document.querySelectorAll("lib-date-picker input, input[name^='di'], input[id^='di'], input[placeholder*='__']").forEach(el => addCand(el, 15));

                    // Also search labels matching kwList and find input inside the same container
                    if (kwList.length > 0) {
                        const labels = Array.from(document.querySelectorAll('label, .label, .field-label, .form-label, span, p, div'));
                        for (const lbl of labels) {
                            if (!isVis(lbl)) continue;
                            const t = (lbl.innerText || lbl.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                            if (t.length > 100) continue;
                            if (kwList.some(k => t.includes(k))) {
                                let container = lbl.parentElement;
                                for (let depth = 0; depth < 4 && container; depth++) {
                                    const inp = container.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');
                                    if (inp && isVis(inp)) {
                                        addCand(inp, 60 - depth * 5);
                                        break;
                                    }
                                    container = container.parentElement;
                                }
                            }
                        }
                    }

                    if (candidates.length === 0) return null;
                    candidates.sort((a, b) => b.score - a.score);
                    const chosen = candidates[0].inp;
                    chosen.scrollIntoView({ block: 'center' });
                    const r = chosen.getBoundingClientRect();
                    chosen.focus();
                    chosen.click();
                    return {
                        x: r.left + Math.min(45, r.width / 2),
                        y: r.top + r.height / 2,
                        name: chosen.getAttribute('name') || chosen.getAttribute('id') || 'date-input'
                    };
                }""",
                {"sel": clean_sel, "kwList": kw_lower},
            )
        except Exception as e:
            logger.debug(f"fill_date_input_smart evaluate note: {e}")
            target_info = None

        if target_info and target_info.get("x") and target_info.get("y"):
            try:
                cx = float(target_info["x"])
                cy = float(target_info["y"])
                self.page.mouse.click(cx, cy)
                self.page.wait_for_timeout(80)
                self.page.keyboard.press("Control+A")
                self.page.keyboard.press("Backspace")
                self.page.wait_for_timeout(50)
                self.page.keyboard.type(val, delay=delay)
                self.page.wait_for_timeout(120)
                self.page.keyboard.press("Tab")
                self.page.wait_for_timeout(200)
                return True
            except Exception as e:
                logger.debug(f"fill_date_input_smart mouse/keyboard note: {e}")

        # Fallback via Playwright locator with short timeout (never 30s)
        try:
            loc = self.page.locator(primary_selector)
            if loc.count() > 0 and loc.first.is_visible():
                loc.first.click(timeout=2500)
                self.page.keyboard.press("Control+A")
                self.page.keyboard.press("Backspace")
                self.page.keyboard.type(val, delay=delay)
                self.page.keyboard.press("Tab")
                self.page.wait_for_timeout(200)
                return True
        except Exception as e:
            logger.debug(f"fill_date_input_smart fallback note: {e}")

        return False

    def fill_citizenship_strict(self, citizenship_raw: str) -> bool:
        """
        Reliably fills 'Гражданство' (#dic13_ctz) on Step 8 without looping or waiting for 'Продолжить':
        1) Types the country name (e.g. 'Узбекистан') into #dic13_ctz
        2) Immediately clicks the matching dropdown option once it appears (~0.3s)
        3) Returns immediately so 'Место рождения' and 'Пол' can be filled next.
        """
        raw = str(citizenship_raw or "").strip().upper()
        ctz_val = "Узбекистан"
        if "ТУРЦ" in raw or "ТУРЕЦ" in raw or "TURK" in raw:
            ctz_val = "Турция"
        elif "ТАДЖ" in raw:
            ctz_val = "Таджикистан"
        elif "КАЗАХ" in raw:
            ctz_val = "Казахстан"
        elif "КЫРГ" in raw or "КИРГ" in raw:
            ctz_val = "Кыргызстан"
        elif "БЕЛАР" in raw or "БЕЛОР" in raw:
            ctz_val = "Беларусь"
        elif "АЗЕРБ" in raw:
            ctz_val = "Азербайджан"
        elif "АРМЕН" in raw:
            ctz_val = "Армения"
        elif "ИНДИ" in raw:
            ctz_val = "Индия"
        elif "СЕРБ" in raw:
            ctz_val = "Сербия"
        elif citizenship_raw and len(citizenship_raw.strip()) >= 3:
            ctz_val = self.sanitize_cyrillic_field(citizenship_raw.strip(), "Узбекистан")

        ctz_lower = ctz_val.lower()

        for attempt in range(1, 3):
            self.check_and_handle_error_modal()
            try:
                # 1) Quick check if `.displayed.lookup-item` already shows the right country
                already_selected = self.page.evaluate(
                    """(want) => {
                        const el = document.querySelector('lib-lookup .displayed.lookup-item, .displayed.lookup-item');
                        if (!el) return '';
                        const r = el.getBoundingClientRect();
                        if (r.width === 0 || r.height === 0) return '';
                        const txt = (el.innerText || el.textContent || '').trim();
                        return txt.toLowerCase().includes(want) ? txt : '';
                    }""",
                    ctz_lower,
                )
                if already_selected:
                    logger.info(f"Step 8: Гражданство already verified as '{already_selected}'.")
                    return True

                # Clear if another value (e.g. accidental text) was inside #dic13_ctz
                self.page.evaluate(
                    """() => {
                        const clr = document.querySelector('lib-lookup button.search-clear, button.search-clear');
                        if (clr) {
                            const r = clr.getBoundingClientRect();
                            if (r.width > 0 && r.height > 0) clr.click();
                        }
                    }"""
                )

                ctz_inp = self.page.locator(
                    "#dic13_ctz:visible, input[id*='ctz']:visible, lib-lookup input.search-input:visible"
                ).first
                if ctz_inp.count() == 0:
                    return False

                try:
                    ctz_inp.scroll_into_view_if_needed(timeout=1000)
                except Exception:
                    pass

                # 2) Focus #dic13_ctz, clear any text, and type so Angular filters the list
                ctz_inp.click(timeout=1500)
                self.page.wait_for_timeout(80)
                self.page.keyboard.press("Control+A")
                self.page.keyboard.press("Backspace")
                self.page.wait_for_timeout(80)
                ctz_inp.press_sequentially(ctz_val, delay=35)

                # 3) Poll every 150ms (up to 2.1s max) and click the matching country option once it appears
                clicked_country = False
                for _ in range(14):
                    self.check_and_handle_error_modal()
                    self.page.wait_for_timeout(150)
                    try:
                        dom_clicked = self.page.evaluate(
                            """(targetCountry) => {
                                const want = targetCountry.trim().toLowerCase();
                                const items = Array.from(document.querySelectorAll(
                                    '#lookup-list-wrap .lookup-item:not(.nothing-found):not(.displayed), ' +
                                    'lib-lookup .lookup-item:not(.nothing-found):not(.displayed), ' +
                                    '.lookup-item:not(.nothing-found):not(.displayed), ' +
                                    '[role="option"]'
                                ));
                                let chosen = null;
                                for (const el of items) {
                                    const r = el.getBoundingClientRect();
                                    if (r.width < 10 || r.height < 10) continue;
                                    const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
                                    if (txt.includes('ничего не найдено') || txt.includes('не найдено')) continue;
                                    if (txt === want) { chosen = { el, r, txt }; break; }
                                }
                                if (!chosen) {
                                    for (const el of items) {
                                        const r = el.getBoundingClientRect();
                                        if (r.width < 10 || r.height < 10) continue;
                                        const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
                                        if (txt.includes('ничего не найдено') || txt.includes('не найдено')) continue;
                                        if (txt.includes(want)) { chosen = { el, r, txt }; break; }
                                    }
                                }
                                if (chosen) {
                                    const clickable = chosen.el.closest('.lookup-item, [role="option"], li') || chosen.el;
                                    clickable.click();
                                    clickable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                                    clickable.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                                    clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                    return { x: chosen.r.left + chosen.r.width / 2, y: chosen.r.top + chosen.r.height / 2, text: chosen.txt };
                                }
                                return null;
                            }""",
                            ctz_val,
                        )
                        if isinstance(dom_clicked, dict) and dom_clicked.get("x") and dom_clicked.get("y"):
                            logger.info(f"Step 8: Selecting Гражданство option '{dom_clicked.get('text')}'...")
                            self.page.mouse.click(float(dom_clicked["x"]), float(dom_clicked["y"]))
                            clicked_country = True
                            self.page.wait_for_timeout(250)
                            break
                    except Exception:
                        pass

                if clicked_country:
                    return True

                # Keyboard fallback if option list didn't match via DOM
                self.page.keyboard.press("ArrowDown")
                self.page.wait_for_timeout(100)
                self.page.keyboard.press("Enter")
                self.page.wait_for_timeout(200)
                return True
            except Exception as e:
                logger.debug(f"fill_citizenship_strict attempt {attempt} note: {e}")
                self.page.wait_for_timeout(200)

        return False

    def set_address_checkbox(self, label_text: str, form_control_name: str, should_check: bool):
        """Reliably sets 'Нет дома' or 'Нет квартиры' checkbox to should_check (True/False) without matching parent divs."""
        try:
            cb_containers = self.page.locator(
                f"lib-checkbox[formcontrolname='{form_control_name}']:visible, "
                f"lib-checkbox:has-text('{label_text}'):visible"
            )
            if cb_containers.count() > 0:
                target_cb = cb_containers.last
                inp = target_cb.locator("input[type='checkbox']").first
                is_currently_checked = False
                if inp.count() > 0:
                    try:
                        is_currently_checked = inp.is_checked()
                    except Exception:
                        cls_str = (target_cb.get_attribute("class") or "") + " " + (inp.get_attribute("class") or "")
                        is_currently_checked = "checked" in cls_str
                if is_currently_checked != should_check:
                    lbl = target_cb.locator("label.check, label").first
                    if lbl.count() > 0 and lbl.is_visible():
                        lbl.click(timeout=2000)
                    else:
                        target_cb.click(timeout=2000)
                    self.page.wait_for_timeout(250)
                return

            lbl_loc = self.page.locator(f"label:has-text('{label_text}'):visible").last
            if lbl_loc.count() > 0 and lbl_loc.is_visible() and should_check:
                lbl_loc.click(timeout=2000)
                self.page.wait_for_timeout(250)
        except Exception as e:
            logger.debug(f"set_address_checkbox({label_text}, {should_check}) note: {e}")

    def select_dadata_work_address(self, work_addr: str) -> bool:
        """
        Fills the work address textarea (`epgu-constructor-address-input textarea`),
        triggers the DaData/FIAS dropdown using real keystrokes, and clicks the matching suggestion item
        so Gosuslugi never complains 'Проверьте адрес'.
        Supports Tobolsk ('626150, обл. Тюменская, г. Тобольск, тер. Восточный промышленный район, кв-л. 5-й')
        and any other Russian site address.
        """
        is_tobolsk_kv5 = "Восточный промышленный район" in work_addr and (
            "5-й" in work_addr or "квартал 5" in work_addr or "кв-л 5" in work_addr
        )
        cleaned_for_fias = re.sub(
            r",?\s*(?:этаж|эт\.|офис|оф\.|помещ\.|пом\.|ком\.|каб\.)\s*[^,]+",
            "",
            work_addr,
            flags=re.IGNORECASE,
        ).strip(" ,")
        cleaned_for_fias = re.sub(r"\bзд\.?\s*", "д. ", cleaned_for_fias, flags=re.IGNORECASE)

        primary_query = (
            "Тюменская обл, г Тобольск, тер Восточный промышленный район-квартал 5"
            if is_tobolsk_kv5
            else cleaned_for_fias
        )
        street_fallback_query = re.sub(
            r",?\s*(?:д\.|дом|вл\.|зд\.|стр\.|корп\.|к\.)\s*[0-9].*$",
            "",
            cleaned_for_fias,
            flags=re.IGNORECASE,
        ).strip(" ,")

        queries_to_try = [primary_query]
        if not is_tobolsk_kv5 and street_fallback_query and street_fallback_query != primary_query:
            queries_to_try.append(street_fallback_query)

        addr_textarea = self.page.locator(
            "epgu-constructor-address-input textarea, "
            "lib-dadata-widget textarea, "
            "textarea.search-input"
        ).first

        lookup_selector = (
            "epgu-constructor-address-input .lookup-item:not(.nothing-found):visible, "
            "lib-dadata-widget .lookup-item:not(.nothing-found):visible, "
            "#lookup-list-wrap .lookup-item:not(.nothing-found):visible, "
            ".lookup-item:not(.nothing-found):visible"
        )

        for dadata_query in queries_to_try:
            if addr_textarea.count() > 0 and addr_textarea.is_visible():
                addr_textarea.click()
                self.page.wait_for_timeout(150)
                addr_textarea.fill("")
                self.page.wait_for_timeout(150)
                addr_textarea.fill(dadata_query)
                self.page.wait_for_timeout(150)
                self.page.keyboard.press("Space")
                self.page.wait_for_timeout(120)
                self.page.keyboard.press("Backspace")
            else:
                self.page.keyboard.press("Tab")
                self.page.wait_for_timeout(200)
                self.page.keyboard.type(dadata_query, delay=25)

            lookup_items = self.page.locator(lookup_selector)
            for _ in range(8):
                self.page.wait_for_timeout(300)
                if lookup_items.count() > 0:
                    break

            try:
                item_count = lookup_items.count()
                if is_tobolsk_kv5 and item_count > 0:
                    for idx_i in range(item_count):
                        txt_i = lookup_items.nth(idx_i).inner_text().strip()
                        if txt_i.endswith("квартал 5") or txt_i.endswith("кв-л 5") or txt_i.endswith("5-й"):
                            lookup_items.nth(idx_i).click()
                            self.page.wait_for_timeout(800)
                            return True
                    lookup_items.first.click()
                    self.page.wait_for_timeout(800)
                    return True
                elif item_count > 0:
                    lookup_items.first.click()
                    self.page.wait_for_timeout(800)
                    return True
            except Exception:
                pass

        return False

    def fill_postal_code_strict(self, postal_code: str):
        """Fills 6-digit postal code into input#index and selects the autocomplete dropdown item if shown."""
        if not postal_code:
            return
        try:
            idx_input = self.page.locator("input#index:visible").first
            if idx_input.count() == 0:
                return
            for _ in range(3):
                cur_val = idx_input.input_value().strip()
                if cur_val == postal_code:
                    idx_opt = self.page.locator(
                        f".lookup-item:has-text('{postal_code}'):visible, "
                        f"li:has-text('{postal_code}'):visible, "
                        f"div.lookup-item:has-text('{postal_code}'):visible"
                    ).first
                    if idx_opt.count() > 0 and idx_opt.is_visible():
                        try:
                            idx_opt.click(timeout=1500)
                            self.page.wait_for_timeout(250)
                        except Exception:
                            pass
                    break

                idx_input.click()
                self.page.wait_for_timeout(120)
                self.page.keyboard.press("Control+A")
                self.page.keyboard.press("Backspace")
                self.page.wait_for_timeout(120)
                idx_input.press_sequentially(postal_code, delay=65)
                self.page.wait_for_timeout(450)

                idx_opt = self.page.locator(
                    f".lookup-item:has-text('{postal_code}'):visible, "
                    f"li:has-text('{postal_code}'):visible, "
                    f"div.lookup-item:has-text('{postal_code}'):visible"
                ).first
                if idx_opt.count() > 0 and idx_opt.is_visible():
                    try:
                        idx_opt.click(timeout=1500)
                        self.page.wait_for_timeout(300)
                    except Exception:
                        self.page.keyboard.press("ArrowDown")
                        self.page.keyboard.press("Enter")
                        self.page.wait_for_timeout(250)
                else:
                    self.page.keyboard.press("Tab")
                    self.page.wait_for_timeout(250)
        except Exception as e:
            logger.warning(f"Postal code input warning: {e}")

    def _is_on_step12_mvd_screen_js(self) -> bool:
        """Returns True if the browser is currently displaying Step 12 (Подразделение МВД / #dic18 / #dic18_byHand)."""
        try:
            return bool(
                self.page.evaluate(
                    """() => {
                        const vis = (el) => {
                            if (!el) return false;
                            const r = el.getBoundingClientRect();
                            return r.width > 5 && r.height > 5;
                        };
                        const dic = document.querySelector('input#dic18, input#dic18_byHand, lib-lookup input.search-input');
                        if (vis(dic)) return true;
                        const h1 = Array.from(document.querySelectorAll('h1, h2, h3')).find(
                            h => vis(h) && (h.innerText || '').toLowerCase().includes('подразделение мвд')
                        );
                        return !!h1;
                    }"""
                )
            )
        except Exception:
            return False

    def _click_step13_confirm_js(self) -> bool:
        """
        Detects the Step 13 Employee Consent screen ('Подтвердите, что получили согласие работника' -> 'Подтвердить')
        via non-blocking JS and clicks 'Подтвердить' using BOTH DOM JS events and physical mouse coordinates (x, y).
        """
        try:
            coords = self.page.evaluate(
                """() => {
                    const btns = Array.from(document.querySelectorAll('button, lib-button button, epgu-cf-ui-button button, a.button'));
                    let target = null;
                    for (const b of btns) {
                        const txt = (b.innerText || b.textContent || '').trim();
                        const r = b.getBoundingClientRect();
                        if (txt.includes('Подтвердить') && r.width > 30 && r.height > 15) {
                            const st = window.getComputedStyle(b);
                            if (st.visibility !== 'hidden' && st.display !== 'none' && parseFloat(st.opacity || '1') > 0.05) {
                                target = b;
                            }
                        }
                    }
                    if (!target) return null;
                    target.scrollIntoView({ behavior: 'instant', block: 'center' });
                    const r = target.getBoundingClientRect();
                    target.focus();
                    target.click();
                    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                }"""
            )
            if isinstance(coords, dict) and coords.get("x") and coords.get("y"):
                logger.info(
                    f"Step 13: Clicking 'Подтвердить' on employee consent modal at ({int(coords['x'])}, {int(coords['y'])})..."
                )
                self.page.mouse.click(float(coords["x"]), float(coords["y"]))
                for _ in range(10):
                    self.page.wait_for_timeout(250)
                    try:
                        still_confirm = self.page.evaluate(
                            """() => {
                                const btns = Array.from(document.querySelectorAll('button'));
                                return btns.some(b => (b.innerText || '').trim().includes('Подтвердить') && b.getBoundingClientRect().width > 30);
                            }"""
                        )
                        if not still_confirm:
                            break
                    except Exception:
                        break
                return True
        except Exception:
            pass
        return False

    def _has_advanced_past_step12_js(self) -> bool:
        """Returns True if the form has already transitioned from Step 12 (Подразделение МВД) to Step 13/14/15."""
        try:
            return bool(
                self.page.evaluate(
                    """() => {
                        const txt = (document.body && document.body.innerText) || '';
                        if (
                            txt.includes('Подтвердите, что получили согласие') ||
                            txt.includes('Согласие на обработку персональных данных') ||
                            txt.includes('Уведомление готово к отправке') ||
                            txt.includes('Уведомление отправлено') ||
                            txt.includes('Заявление отправлено')
                        ) {
                            return true;
                        }
                        return false;
                    }"""
                )
            )
        except Exception:
            return False

    def _is_step12_continue_ready_js(self) -> bool:
        """Non-blocking JS check: returns True if the 'Продолжить' button on Step 12/14 is visible, enabled, and NOT on an unselected/non-Moscow MVD screen."""
        try:
            return bool(
                self.page.evaluate(
                    """() => {
                        const vis = (el) => {
                            if (!el) return false;
                            const r = el.getBoundingClientRect();
                            if (r.width <= 5 || r.height <= 5) return false;
                            const st = window.getComputedStyle(el);
                            return st.visibility !== 'hidden' && st.display !== 'none' && parseFloat(st.opacity || '1') > 0.05;
                        };
                        const dic18 = document.querySelector('input#dic18');
                        const disp = document.querySelector('lib-lookup .displayed.lookup-item, .displayed.lookup-item');
                        const izmBtn = Array.from(document.querySelectorAll("lib-button[data-button-type='skipstep'] button, button"))
                            .find(b => vis(b) && (b.innerText || '').trim().includes('Изменить'));
                        if (vis(dic18) || vis(disp) || izmBtn) {
                            const valUp = ((dic18 ? dic18.value : '') || (disp ? disp.innerText : '') || '').trim().toUpperCase();
                            const isExactVks = valUp.includes('ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ') && valUp.includes('МОСКВ') && !valUp.includes('РАЙОН');
                            if (!isExactVks) return false;
                        }

                        const btns = Array.from(document.querySelectorAll(
                            "lib-button[data-button-type='nextstep'] button, button"
                        ));
                        let cont = null;
                        for (const b of btns) {
                            const txt = (b.innerText || b.textContent || '').trim();
                            const r = b.getBoundingClientRect();
                            if (txt.includes('Продолжить') && r.width > 30 && r.height > 15) {
                                cont = b;
                            }
                        }
                        if (!cont) return false;
                        const libWrap = cont.closest('lib-button, epgu-cf-ui-button');
                        const isDisabled =
                            cont.disabled ||
                            cont.getAttribute('disabled') !== null ||
                            (cont.className || '').includes('disabled') ||
                            (libWrap && ((libWrap.className || '').includes('disabled') || libWrap.getAttribute('disabled') !== null));
                        return !isDisabled;
                    }"""
                )
            )
        except Exception:
            return False

    def _click_step12_continue_js(self) -> bool:
        """Non-blocking JS + physical mouse click on the active 'Продолжить' button on Step 12/14."""
        try:
            coords = self.page.evaluate(
                """() => {
                    const btns = Array.from(document.querySelectorAll(
                        "lib-button[data-button-type='nextstep'] button, button"
                    ));
                    let cont = null;
                    for (const b of btns) {
                        const txt = (b.innerText || b.textContent || '').trim();
                        const r = b.getBoundingClientRect();
                        if (txt.includes('Продолжить') && r.width > 30 && r.height > 15) {
                            cont = b;
                        }
                    }
                    if (!cont) return null;
                    cont.scrollIntoView({ block: 'center' });
                    const r = cont.getBoundingClientRect();
                    cont.focus();
                    cont.click();
                    cont.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                    cont.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                    cont.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                }"""
            )
            if coords and coords.get("x") and coords.get("y"):
                self.page.mouse.click(float(coords["x"]), float(coords["y"]))
                for _ in range(18):
                    self.page.wait_for_timeout(250)
                    if self._click_step13_confirm_js():
                        break
                    if self._has_advanced_past_step12_js():
                        break
                return True
        except Exception:
            pass
        return False

    def ensure_moscow_mvd_department(self, target_dept_override: str = "") -> bool:
        """
        Ensures that on Step 12 ('Подразделение МВД, куда отправится уведомление' /
        'Выберите подразделение МВД, куда отправится уведомление'), the robot selects the target MVD
        department for the current employee (or global default UFMS_DEPARTMENT).
        When the target is Moscow ('МОСКВ'), uses the proven 'МОСКВЕ' lookup for
        'ОТДЕЛ ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ'.
        When a custom regional MVD is specified for the employee, selects that regional MVD.
        """
        if self._click_step13_confirm_js():
            return True
        if self._has_advanced_past_step12_js():
            return False

        raw_target = str(
            target_dept_override
            or self.cfg.get("UFMS_DEPARTMENT")
            or "ОТДЕЛ ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ"
        ).strip()
        is_moscow_target = "МОСКВ" in raw_target.upper()
        target_dept = (
            "ОТДЕЛ ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ"
            if is_moscow_target
            else raw_target
        )
        search_word = "МОСКВЕ" if is_moscow_target else raw_target

        state = {}
        try:
            state = self.page.evaluate(
                """() => {
                    const vis = (el) => {
                        if (!el) return false;
                        const r = el.getBoundingClientRect();
                        if (r.width <= 5 || r.height <= 5) return false;
                        const st = window.getComputedStyle(el);
                        return st.visibility !== 'hidden' && st.display !== 'none' && parseFloat(st.opacity || '1') > 0.05;
                    };
                    const dic18 = document.querySelector('input#dic18');
                    const disp = document.querySelector('lib-lookup .displayed.lookup-item, .displayed.lookup-item');
                    const byHand = document.querySelector('input#dic18_byHand, lib-lookup input.search-input');
                    const izmBtn = Array.from(document.querySelectorAll("lib-button[data-button-type='skipstep'] button, button"))
                        .find(b => vis(b) && (b.innerText || '').trim().includes('Изменить'));
                    const h1 = Array.from(document.querySelectorAll('h1, h2, h3'))
                        .find(h => vis(h) && (h.innerText || '').toLowerCase().includes('подразделение мвд'));
                    return {
                        hasReadonly: vis(dic18) || vis(disp),
                        readonlyVal: ((dic18 ? dic18.value : '') || (disp ? disp.innerText : '') || '').trim(),
                        hasIzmenit: !!izmBtn,
                        hasByHand: vis(byHand),
                        hasMvdHeading: !!h1
                    };
                }"""
            ) or {}
        except Exception:
            state = {}

        # Case A: Pre-selected MVD screen ('Подразделение МВД, куда отправится уведомление') with #dic18 & 'Изменить' button
        if state.get("hasReadonly") or state.get("hasIzmenit"):
            cur_dept = str(state.get("readonlyVal") or "").strip()
            cur_dept_up = cur_dept.upper()
            if is_moscow_target:
                is_matching_dept = (
                    "ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ" in cur_dept_up
                    and "МОСКВ" in cur_dept_up
                    and "РАЙОН" not in cur_dept_up
                )
            else:
                target_up = target_dept.upper()
                is_matching_dept = bool(cur_dept_up and (target_up in cur_dept_up or cur_dept_up in target_up))
            if not is_matching_dept:
                logger.info(
                    f"Step 12: Pre-selected MVD is '{cur_dept or 'non-matching'}' -> clicking 'Изменить' to select '{target_dept}'..."
                )
                byhand_visible = False
                for _izm_try in range(1, 4):
                    try:
                        izm_box = self.page.evaluate(
                            """() => {
                                const btns = Array.from(document.querySelectorAll("lib-button[data-button-type='skipstep'] button, button"));
                                for (const b of btns) {
                                    const r = b.getBoundingClientRect();
                                    if (r.width > 20 && r.height > 10 && (b.innerText || '').trim().includes('Изменить')) {
                                        b.scrollIntoView({ block: 'center' });
                                        b.focus();
                                        b.click();
                                        b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                                        b.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                                        b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                                    }
                                }
                                return null;
                            }"""
                        )
                        if izm_box:
                            self.page.mouse.click(float(izm_box["x"]), float(izm_box["y"]))
                    except Exception:
                        pass
                    for _ in range(10):
                        self.page.wait_for_timeout(250)
                        try:
                            if self.page.evaluate("() => { const el = document.querySelector('input#dic18_byHand, lib-lookup input.search-input'); return !!(el && el.getBoundingClientRect().width > 20); }"):
                                byhand_visible = True
                                break
                        except Exception:
                            pass
                    if byhand_visible:
                        break
                self.page.wait_for_timeout(500)
                state["hasByHand"] = True
            else:
                logger.info(f"Step 12: MVD department already set to '{cur_dept}' -> clicking 'Продолжить'...")
                self._click_step12_continue_js()
                self.page.wait_for_timeout(1500)
                return True

        # Case B: Manual MVD lookup screen ('Выберите подразделение МВД, куда отправится уведомление') with #dic18_byHand
        if state.get("hasByHand") or state.get("hasMvdHeading"):
            if not is_moscow_target:
                ok_custom = self.select_lookup_option_mvd_style(
                    input_selector="input#dic18_byHand, lib-lookup input.search-input",
                    type_text=search_word,
                    match_keywords=[target_dept, search_word],
                    step_label=f"Step 12 (Подразделение МВД: {target_dept})",
                    click_continue_after=True,
                )
                if ok_custom:
                    self.page.wait_for_timeout(1200)
                    self.check_and_stop_if_insufficient_permissions()
                    return True

            self.enable_background_focus_emulation()
            for mvd_try in range(1, 7):
                self.check_and_handle_error_modal()
                if self._click_step13_confirm_js():
                    return True
                if self._has_advanced_past_step12_js():
                    logger.info("Step 12: Page already advanced past MVD department selection -> continuing!")
                    return True
                if mvd_try >= 2 and not self._is_on_step12_mvd_screen_js():
                    logger.info("Step 12: MVD lookup input is no longer on screen -> advancing!")
                    return True
                if self._is_step12_continue_ready_js():
                    logger.info("Step 12: MVD department is selected and 'Продолжить' is active -> clicking 'Продолжить'...")
                    self._click_step12_continue_js()
                    self.page.wait_for_timeout(1500)
                    self.check_and_stop_if_insufficient_permissions()
                    return True

                logger.info(
                    f"Step 12 (Attempt {mvd_try}/6): Typing 'МОСКВЕ' in #dic18_byHand to select '{target_dept}'..."
                )
                self.enable_background_focus_emulation()
                try:
                    inp_coords = self.page.evaluate(
                        """() => {
                            const clr = document.querySelector('lib-lookup button.search-clear, button.search-clear');
                            if (clr && clr.getBoundingClientRect().width > 5) {
                                clr.click();
                            }
                            const inp = document.querySelector('input#dic18_byHand, lib-lookup input.search-input');
                            if (!inp) return null;
                            inp.scrollIntoView({ block: 'center' });
                            const r = inp.getBoundingClientRect();
                            if (r.width <= 10) return null;
                            inp.focus();
                            inp.click();
                            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                        }"""
                    )
                    if inp_coords:
                        self.page.mouse.click(float(inp_coords["x"]), float(inp_coords["y"]))
                        self.page.wait_for_timeout(250)
                        self.page.keyboard.press("Control+A")
                        self.page.keyboard.press("Backspace")
                        self.page.wait_for_timeout(150)
                        self.page.keyboard.type("МОСКВЕ", delay=75)
                        self.page.wait_for_timeout(150)

                    self.page.evaluate(
                        """() => {
                            const inp = document.querySelector('input#dic18_byHand, lib-lookup input.search-input');
                            if (!inp) return;
                            inp.focus();
                            inp.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
                            inp.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
                            const cur = (inp.value || '').trim().toUpperCase();
                            if (!cur.includes('МОСКВ')) {
                                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                                const word = 'МОСКВЕ';
                                let acc = '';
                                for (const ch of word) {
                                    acc += ch;
                                    if (nativeSetter) nativeSetter.call(inp, acc);
                                    else inp.value = acc;
                                    inp.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
                                    try {
                                        inp.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: ch, inputType: 'insertText' }));
                                    } catch (e) {
                                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                                    }
                                    inp.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true, cancelable: true }));
                                }
                                inp.dispatchEvent(new Event('change', { bubbles: true }));
                            } else {
                                try {
                                    inp.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: 'Е', inputType: 'insertText' }));
                                } catch (e) {
                                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                                inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Е', bubbles: true, cancelable: true }));
                            }
                        }"""
                    )
                except Exception as e:
                    logger.warning(f"Step 12 input typing note: {e}")

                for tick in range(32):
                    self.check_and_handle_error_modal()
                    self.page.wait_for_timeout(250)
                    if self._click_step13_confirm_js():
                        return True
                    if self._has_advanced_past_step12_js():
                        return True
                    if tick >= 4 and not self._is_on_step12_mvd_screen_js():
                        return True
                    if self._is_step12_continue_ready_js():
                        logger.info("Step 12: 'Продолжить' is active (blue) -> clicking 'Продолжить' immediately!")
                        self._click_step12_continue_js()
                        self.page.wait_for_timeout(1500)
                        self.check_and_stop_if_insufficient_permissions()
                        return True

                    dom_opt = None
                    try:
                        dom_opt = self.page.evaluate(
                            """() => {
                                const inp = document.querySelector('input#dic18_byHand, lib-lookup input.search-input');
                                const inpRect = inp ? inp.getBoundingClientRect() : null;
                                const all = Array.from(document.querySelectorAll(
                                    '#lookup-list-wrap .lookup-item, lib-lookup .lookup-item, .lookup-item, [role="option"], #lookup-list-wrap li, #lookup-list-wrap div, lib-lookup li, lib-lookup div, div, li, span, p, a'
                                ));
                                let best = null;
                                let bestScore = Infinity;

                                for (const el of all) {
                                    if (!el || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') continue;
                                    if (el.querySelector && el.querySelector('input#dic18_byHand, input.search-input')) continue;
                                    if (el.classList && (el.classList.contains('nothing-found') || el.classList.contains('displayed'))) continue;

                                    const r = el.getBoundingClientRect();
                                    if (r.width < 80 || r.height < 16 || r.height > 180) continue;
                                    const st = window.getComputedStyle(el);
                                    if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity || '1') < 0.05) continue;

                                    const txt = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().toUpperCase();
                                    if (!txt || txt.length > 240 || txt === 'ПРОДОЛЖИТЬ' || txt === 'ИЗМЕНИТЬ' || txt === 'НАЗАД') continue;

                                    const isMoscowMvd =
                                        !txt.includes('РАЙОН') && (
                                            (txt.includes('ТРУДОВОЙ МИГРАЦИИ') && txt.includes('МОСКВ')) ||
                                            txt.includes('УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ')
                                        );
                                    if (!isMoscowMvd) continue;

                                    if (inpRect && inpRect.width > 20) {
                                        if (r.top < inpRect.top - 10 || r.top > inpRect.bottom + 260) continue;
                                    }

                                    const isLookupItem = el.classList && el.classList.contains('lookup-item');
                                    const area = r.width * r.height;
                                    const score = isLookupItem ? area * 0.1 : area;
                                    if (score < bestScore) {
                                        bestScore = score;
                                        best = { el, r, txt };
                                    }
                                }

                                if (best) {
                                    const itemContainer = best.el.closest('.lookup-item, [role="option"], li') || best.el;
                                    const targetRect = itemContainer.getBoundingClientRect();
                                    const useRect = (targetRect.width > 60 && targetRect.height >= 16 && targetRect.height <= 180) ? targetRect : best.r;

                                    for (const node of [best.el, itemContainer]) {
                                        try {
                                            node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
                                            node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                                            node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
                                            node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                                            node.click();
                                            node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                        } catch (e) {}
                                    }

                                    return {
                                        x: useRect.left + useRect.width / 2,
                                        y: useRect.top + useRect.height / 2,
                                        text: best.txt
                                    };
                                }
                                return null;
                            }"""
                        )
                    except Exception:
                        dom_opt = None

                    if dom_opt and dom_opt.get("x") and dom_opt.get("y"):
                        cx = float(dom_opt["x"])
                        cy = float(dom_opt["y"])
                        logger.info(f"Step 12: Clicking MVD dropdown option '{dom_opt.get('text')}' at ({int(cx)}, {int(cy)})...")
                        try:
                            self.page.mouse.move(cx, cy)
                            self.page.wait_for_timeout(50)
                            self.page.mouse.down()
                            self.page.wait_for_timeout(50)
                            self.page.mouse.up()
                        except Exception:
                            pass
                        self.page.wait_for_timeout(450)

                        if self._is_step12_continue_ready_js():
                            logger.info("Step 12: MVD option selected -> clicking 'Продолжить'...")
                            self._click_step12_continue_js()
                            self.page.wait_for_timeout(1500)
                            self.check_and_stop_if_insufficient_permissions()
                            return True

                        try:
                            self.page.keyboard.press("ArrowDown")
                            self.page.wait_for_timeout(150)
                            self.page.keyboard.press("Enter")
                            self.page.wait_for_timeout(450)
                        except Exception:
                            pass

                        if self._is_step12_continue_ready_js():
                            logger.info("Step 12: MVD option selected via keyboard -> clicking 'Продолжить'...")
                            self._click_step12_continue_js()
                            self.page.wait_for_timeout(1500)
                            self.check_and_stop_if_insufficient_permissions()
                            return True

                    if tick in (6, 13) and not dom_opt:
                        try:
                            self.enable_background_focus_emulation()
                            self.page.keyboard.press("End")
                            self.page.keyboard.press("Backspace")
                            self.page.wait_for_timeout(80)
                            self.page.keyboard.type("Е", delay=50)
                            self.page.evaluate(
                                """() => {
                                    const inp = document.querySelector('input#dic18_byHand, lib-lookup input.search-input');
                                    if (!inp) return;
                                    inp.focus();
                                    inp.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
                                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                                    if (nativeSetter) nativeSetter.call(inp, 'МОСКВЕ');
                                    else inp.value = 'МОСКВЕ';
                                    try {
                                        inp.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: 'Е', inputType: 'insertText' }));
                                    } catch (e) {
                                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                                    }
                                    inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Е', bubbles: true, cancelable: true }));
                                }"""
                            )
                        except Exception:
                            pass

                if self._click_step13_confirm_js() or self._has_advanced_past_step12_js():
                    return True
                if self._is_step12_continue_ready_js():
                    self._click_step12_continue_js()
                    self.page.wait_for_timeout(1500)
                    self.check_and_stop_if_insufficient_permissions()
                    return True

        return False

    def click_otpravit_bulletproof(self):
        """Clicks the blue 'Отправить' button using Playwright click, physical mouse click, and DOM JS dispatch."""
        try:
            coords = self.page.evaluate(
                """() => {
                    const btns = Array.from(document.querySelectorAll(
                        "epgu-cf-ui-constructor-screen-pad button, epgu-cf-ui-button button, lib-button button, button, a.button"
                    ));
                    let target = null;
                    for (const b of btns) {
                        const txt = (b.innerText || b.textContent || '').trim();
                        const r = b.getBoundingClientRect();
                        if (txt.includes('Отправить') && !txt.includes('ещё раз') && !txt.includes('еще раз') && r.width > 30 && r.height > 15) {
                            const st = window.getComputedStyle(b);
                            if (st.visibility !== 'hidden' && st.display !== 'none' && parseFloat(st.opacity || '1') > 0.05) {
                                target = b;
                            }
                        }
                    }
                    if (!target) return null;
                    target.scrollIntoView({ behavior: 'instant', block: 'center' });
                    const r = target.getBoundingClientRect();
                    target.focus();
                    target.click();
                    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                }"""
            )
            if isinstance(coords, dict) and coords.get("x") and coords.get("y"):
                self.page.mouse.click(float(coords["x"]), float(coords["y"]))
                logger.info(">>> 'Отправить' CLICKED! <<<")
        except Exception:
            pass

    def complete_mvd_and_submit_flow(self, target_dept_override: str = "") -> bool:
        """
        State-machine loop for Steps 12 -> 13 -> 14 -> 15:
        Advances through 'Подразделение МВД' (selecting employee's ПодразделениеМВД or default Moscow ОТДЕЛ ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ via 'МОСКВЕ'),
        'Подтвердить' consent modal, 'Согласие на обработку ПДн',
        and clicks 'Отправить' until 'Уведомление отправлено' / 'Заявление отправлено' is reached.
        """
        eff_dept = str(target_dept_override or self.cfg.get("UFMS_DEPARTMENT") or "МОСКВЕ").strip()
        logger.info(f"Steps 12-15: Advancing through MVD division ('{eff_dept}'), consents, and final 'Отправить' screen...")
        for _tick in range(65):
            self.check_and_handle_error_modal()
            self.wait_if_paused_or_logged_out()
            self.check_and_stop_if_insufficient_permissions()

            cur_url = self.page.url or ""
            sent_text = self.page.locator(
                "h1:has-text('Уведомление отправлено'):visible, "
                "h1:has-text('Заявление отправлено'):visible, "
                "h2:has-text('Уведомление отправлено'):visible, "
                "h2:has-text('Заявление отправлено'):visible, "
                "h3:has-text('Уведомление отправлено'):visible, "
                "div.title:has-text('Уведомление отправлено'):visible"
            )
            if (sent_text.count() > 0 or "lk.gosuslugi.ru/order/" in cur_url) and not self.is_service_unavailable_ip_block():
                self.check_and_stop_if_insufficient_permissions()
                logger.info(">>> Final confirmation screen ('Уведомление отправлено') reached! <<<")
                return True

            ready_to_send_heading = self.page.locator(
                "h1:has-text('Уведомление готово к отправке'):visible, "
                "h2:has-text('Уведомление готово к отправке'):visible, "
                "h3:has-text('Уведомление готово к отправке'):visible"
            )
            submit_candidates = self.page.locator(
                "button:has-text('Отправить уведомление'):visible, "
                "button:has-text('Отправить'):not(:has-text('ещё раз')):not(:has-text('еще раз')):visible, "
                "epgu-cf-ui-button:has-text('Отправить'):not(:has-text('ещё раз')):visible, "
                "lib-button:has-text('Отправить'):not(:has-text('ещё раз')):visible, "
                "a.button:has-text('Отправить'):not(:has-text('ещё раз')):visible"
            )
            if ready_to_send_heading.count() > 0 or submit_candidates.count() > 0:
                logger.info("Step 13: 'Уведомление готово к отправке' detected — clicking 'Отправить'...")
                self.click_otpravit_bulletproof()
                self.page.wait_for_timeout(2500)
                self.check_and_stop_if_insufficient_permissions()
                continue

            if self._click_step13_confirm_js():
                continue

            if self.ensure_moscow_mvd_department(target_dept_override=target_dept_override):
                continue

            if self._is_step12_continue_ready_js():
                logger.info("Steps 12/14: Clicking active 'Продолжить'...")
                self._click_step12_continue_js()
                self.page.wait_for_timeout(1500)
                self.check_and_stop_if_insufficient_permissions()
                continue

            self.page.wait_for_timeout(700)

        self.check_and_stop_if_insufficient_permissions()
        return False

    def download_and_rename_receipt_pdf(self, row: Dict[str, Any]):
        """Downloads the official Gosuslugi receipt PDF and renames it to <Sicil>_<GosuslugiNo>_<WorkerName>_Увольнение.pdf."""
        try:
            logger.info("Step 14: Checking for Gosuslugi Application Number & PDF Receipt...")
            self.page.wait_for_timeout(2500)

            gos_num = ""
            try:
                body_text = self.page.locator("body").inner_text(timeout=3000)
                m = re.search(r"№\s*(\d{7,12})", body_text)
                if m:
                    gos_num = m.group(1)
            except Exception:
                pass

            if not gos_num:
                m_url = re.search(r"/order/(\d+)", self.page.url)
                if m_url:
                    gos_num = m_url.group(1)

            if not gos_num:
                gos_num = str(row.get("Код") or row.get("Sicil") or int(time.time()))

            sicil = re.sub(r'[\\/*?:"<>|]', "", str(row.get("Sicil") or row.get("Код") or "").strip())
            last_n = str(row.get("Фамилия", "")).strip()
            first_n = str(row.get("Имя", "")).strip()
            worker_label = f"{last_n} {first_n}".strip() if last_n.lower() not in ["нет", ""] else first_n
            worker_label = re.sub(r'[\\/*?:"<>|]', "_", worker_label)

            downloads_dir = os.path.expandvars(r"%USERPROFILE%\Downloads")
            if sicil and sicil != gos_num:
                target_pdf_name = f"{sicil}_{gos_num}_{worker_label}_Увольнение.pdf"
            else:
                target_pdf_name = f"{gos_num}_{worker_label}_Увольнение.pdf"
            target_pdf_path = os.path.join(downloads_dir, target_pdf_name)

            entry = {
                "sicil": sicil,
                "sicil_no": sicil,
                "worker_name": worker_label,
                "citizenship": str(row.get("ТекущееГражданство", "")).strip(),
                "notification_type": "dismissal",
                "period_code": str(row.get("ДатаУволь", "")).strip(),
                "application_no": gos_num,
                "gosuslugi_status": "Заявление зарегистрировано",
                "pdf_filename": target_pdf_name,
                "submitted_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }
            logger.info(f"APPLICATION_REGISTERED: {json.dumps(entry, ensure_ascii=False)}")
            try:
                import urllib.request
                import ssl
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
                            data=json.dumps({"records": [entry]}, ensure_ascii=False).encode("utf-8"),
                            headers={"Content-Type": "application/json; charset=utf-8"},
                            method="POST",
                        )
                        with urllib.request.urlopen(req, timeout=3.5, context=ctx if api_url.startswith("https") else None) as _:
                            break
                    except Exception:
                        pass
            except Exception:
                pass

            # Click "Показать все" if visible
            show_all = self.page.locator("button:has-text('Показать все'), span:has-text('Показать все'), a:has-text('Показать все')").first
            if show_all.count() > 0 and show_all.is_visible():
                show_all.click()
                self.page.wait_for_timeout(1200)

            pdf_btn = self.page.locator(
                "a:has-text('Скачать'), button:has-text('Скачать'), "
                "a[href*='pdf'], button:has-text('Распечатать'), a:has-text('файлы')"
            ).first

            if pdf_btn.count() > 0 and pdf_btn.is_visible():
                try:
                    with self.page.expect_download(timeout=12000) as dl_info:
                        pdf_btn.click()
                    dl = dl_info.value
                    dl.save_as(target_pdf_path)
                    logger.info(f"Saved Gosuslugi Dismissal PDF receipt: {target_pdf_path}")
                    return
                except Exception:
                    pass

            req_preview = os.path.join(downloads_dir, "req_preview.pdf")
            if os.path.exists(req_preview) and (time.time() - os.path.getmtime(req_preview)) < 120:
                shutil.copy2(req_preview, target_pdf_path)
                logger.info(f"Copied req_preview.pdf -> {target_pdf_path}")
        except Exception as e:
            logger.warning(f"PDF receipt download note: {e}")

    def fill_notification(self, row: Dict[str, Any]) -> bool:
        """
        Executes the complete Gosuslugi Form 600585/1 dismissal filling process for a single worker.
        """
        self.enable_background_focus_emulation()
        full_name = f"{row.get('Фамилия', '')} {row.get('Имя', '')} {row.get('Отчество', '')}".strip()
        logger.info(f"=== Starting Gosuslugi Dismissal for: {full_name} (Код: {row.get('Код', '')}) ===")

        logger.info("Step 1: Navigating to Gosuslugi Service 600585/1...")
        try:
            self.page.goto(self.cfg["FORM_URL"], wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            logger.warning(f"Navigation warning: {e}")
        self.page.wait_for_timeout(1500)
        self.check_and_handle_error_modal()

        # Steps 2 & 3a Unified State-Machine Polling Loop:
        # Handles Drafts Modal ('Начать заново' / 'Создать заявление' + automatic old draft deletion if limit reached),
        # 'Начать' landing screen, and 'О расторжении договора' option button. Never advances until 'О расторжении договора' is clicked!
        step3a_selected = False
        create_click_attempts = 0
        delete_old_drafts_enabled = bool(self.cfg.get("DELETE_OLD_DRAFTS", True))
        max_wait_sec = max(120, int(self.cfg.get("MAX_SCREEN_WAIT_SEC") or 120))

        for _tick in range(120):
            if os.path.exists(PAUSE_SIGNAL_FILE):
                self.wait_if_paused_or_logged_out()
            self.check_and_handle_error_modal()

            # Priority 1: Drafts Modal ('Выберите черновик' -> delete old drafts if needed -> 'Начать заново' / 'Создать заявление')
            draft_items = self.page.locator(".draft-list .draft, epgu-constructor-draft-list .draft")
            create_btn = self.page.locator(
                "button:has-text('Начать заново'), "
                "button:has-text('Создать заявление'), "
                "button:has-text('Создать новое заявление'), "
                "button:has-text('Новое заявление'), "
                "lib-button.conf-modal__button button"
            ).first

            if (create_btn.count() > 0 and create_btn.is_visible()) or draft_items.count() > 0:
                logger.info("Detected Gosuslugi draft modal. Scrolling modal to bottom...")
                try:
                    self.page.evaluate(
                        """() => {
                            const scrollTargets = document.querySelectorAll(
                                'ng-scrollbar, .ng-scroll-viewport, .ng-scroll-content, .conf-modal__body, .conf-modal__content, .modal-body'
                            );
                            scrollTargets.forEach(el => {
                                try { el.scrollTop = el.scrollHeight; } catch (e) {}
                            });
                            document.querySelectorAll('div').forEach(el => {
                                if (el.scrollHeight > el.clientHeight + 10) {
                                    try { el.scrollTop = el.scrollHeight; } catch (e) {}
                                }
                            });
                            const btn = Array.from(document.querySelectorAll('button')).find(
                                b => (b.innerText || '').includes('Начать заново') || (b.innerText || '').includes('Создать заявление') || (b.innerText || '').includes('Создать новое')
                            ) || document.querySelector('lib-button.conf-modal__button button');
                            if (btn) {
                                let p = btn.parentElement;
                                while (p) {
                                    if (p.scrollHeight > p.clientHeight) {
                                        try { p.scrollTop = p.scrollHeight; } catch (e) {}
                                    }
                                    p = p.parentElement;
                                }
                                btn.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
                            }
                            window.scrollTo(0, document.body.scrollHeight);
                        }"""
                    )
                except Exception:
                    pass
                self.page.wait_for_timeout(300)

                # Check via JS if 'Начать заново' / 'Создать заявление' (or its parent lib-button) is disabled OR if draft count >= 8
                draft_state = {}
                try:
                    draft_state = self.page.evaluate(
                        """() => {
                            const drafts = document.querySelectorAll('.draft-list .draft, epgu-constructor-draft-list .draft, .conf-modal .draft');
                            const delBtns = Array.from(document.querySelectorAll(
                                ".draft-list .draft button.draft-link, epgu-constructor-draft-list button, button.draft-link, .draft button, button, a"
                            )).filter(el => (el.innerText || el.textContent || '').trim() === 'Удалить' && el.getBoundingClientRect().width > 5);
                            const createBtn = Array.from(document.querySelectorAll('button')).find(
                                b => {
                                    const t = (b.innerText || b.textContent || '').trim();
                                    return t.includes('Начать заново') || t.includes('Создать заявление') || t.includes('Создать новое') || t.includes('Новое заявление');
                                }
                            ) || document.querySelector('lib-button.conf-modal__button button');
                            let btnDisabled = true;
                            if (createBtn) {
                                const wrap = createBtn.closest('lib-button, epgu-cf-ui-button');
                                const st = window.getComputedStyle(createBtn);
                                btnDisabled = !!(
                                    createBtn.disabled ||
                                    createBtn.getAttribute('disabled') !== null ||
                                    (createBtn.className || '').includes('disabled') ||
                                    st.pointerEvents === 'none' ||
                                    (wrap && ((wrap.className || '').includes('disabled') || wrap.getAttribute('disabled') !== null))
                                );
                            }
                            return {
                                draftCount: Math.max(drafts.length, delBtns.length),
                                delCount: delBtns.length,
                                btnDisabled
                            };
                        }"""
                    ) or {}
                except Exception:
                    draft_state = {}

                btn_disabled = bool(draft_state.get("btnDisabled", True))
                draft_cnt = int(draft_state.get("draftCount", draft_items.count()) or 0)

                if delete_old_drafts_enabled and (btn_disabled or draft_cnt >= 8 or create_click_attempts >= 1):
                    for _del_round in range(3):
                        del_btns = self.page.locator(
                            ".draft-list .draft button.draft-link:has-text('Удалить'), "
                            "epgu-constructor-draft-list button:has-text('Удалить'), "
                            "button.draft-link:has-text('Удалить'), "
                            ".draft button:has-text('Удалить')"
                        )
                        if del_btns.count() == 0:
                            break
                        oldest_del = del_btns.last
                        logger.info(
                            f"Step 2: Удаление самого старого черновика (всего черновиков: {del_btns.count()}), чтобы активировать кнопку «Начать заново / Создать заявление»..."
                        )
                        try:
                            oldest_del.scroll_into_view_if_needed(timeout=1500)
                        except Exception:
                            pass
                        try:
                            oldest_del.click(timeout=2500)
                        except Exception:
                            try:
                                oldest_del.evaluate("el => el.click()")
                            except Exception:
                                pass
                        self.page.wait_for_timeout(850)

                        # Re-check if 'Начать заново' / 'Создать заявление' is now active and draft count < 9
                        still_disabled = bool(
                            self.page.evaluate(
                                """() => {
                                    const createBtn = Array.from(document.querySelectorAll('button')).find(
                                        b => {
                                            const t = (b.innerText || b.textContent || '').trim();
                                            return t.includes('Начать заново') || t.includes('Создать заявление') || t.includes('Создать новое') || t.includes('Новое заявление');
                                        }
                                    ) || document.querySelector('lib-button.conf-modal__button button');
                                    if (!createBtn) return false;
                                    const wrap = createBtn.closest('lib-button, epgu-cf-ui-button');
                                    return !!(
                                        createBtn.disabled ||
                                        createBtn.getAttribute('disabled') !== null ||
                                        (createBtn.className || '').includes('disabled') ||
                                        (wrap && ((wrap.className || '').includes('disabled') || wrap.getAttribute('disabled') !== null))
                                    );
                                }"""
                            )
                        )
                        if not still_disabled and del_btns.count() < 9:
                            break

                if create_btn.count() > 0:
                    try:
                        create_btn.scroll_into_view_if_needed(timeout=1500)
                    except Exception:
                        pass
                    disabled_now = (
                        (create_btn.get_attribute("disabled") is not None)
                        or ("disabled" in (create_btn.get_attribute("class") or ""))
                        or (not create_btn.is_enabled())
                    )
                    if not disabled_now:
                        logger.info("Step 2: Clicking 'Начать заново' / 'Создать заявление'...")
                        create_click_attempts += 1
                        try:
                            create_btn.click(timeout=2500)
                        except Exception:
                            try:
                                box = create_btn.bounding_box()
                                if box and box["width"] > 5 and box["height"] > 5:
                                    self.page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                                else:
                                    create_btn.evaluate("el => el.click()")
                            except Exception:
                                pass
                self.page.wait_for_timeout(900)
                continue

            # Priority 2: 'Начать' button on the service landing screen
            start_btn = self.page.locator(
                "button:has-text('Начать'):visible, "
                "lib-button:has-text('Начать') button:visible, "
                "epgu-cf-ui-button:has-text('Начать') button:visible, "
                "a.button:has-text('Начать'):visible"
            ).first
            if start_btn.count() > 0 and start_btn.is_visible():
                logger.info("Step 2: Clicking start/new application button ('Начать')...")
                try:
                    start_btn.scroll_into_view_if_needed(timeout=1500)
                except Exception:
                    pass
                try:
                    start_btn.click(timeout=2500)
                except Exception:
                    try:
                        box = start_btn.bounding_box()
                        if box and box["width"] > 5 and box["height"] > 5:
                            self.page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                        else:
                            self.page.evaluate(
                                """() => {
                                    const b = Array.from(document.querySelectorAll('button, a.button')).find(
                                        el => (el.innerText || '').trim() === 'Начать'
                                    );
                                    if (b) b.click();
                                }"""
                            )
                    except Exception:
                        pass
                self.page.wait_for_timeout(900)
                continue

            # Priority 3: Step 3a ('О расторжении договора')
            term_btn = self.page.locator(
                "epgu-cf-ui-long-button:has-text('О расторжении договора'):visible, "
                "button:has-text('О расторжении договора'):visible, "
                "div.long-button:has-text('О расторжении'):visible"
            ).first
            if term_btn.count() > 0 and term_btn.is_visible():
                logger.info("Step 3a: Selecting 'О расторжении договора'...")
                try:
                    term_btn.scroll_into_view_if_needed(timeout=1500)
                except Exception:
                    pass
                try:
                    term_btn.click(timeout=2500)
                except Exception:
                    try:
                        self.page.evaluate(
                            """() => {
                                const b = Array.from(document.querySelectorAll('epgu-cf-ui-long-button, button, div.long-button')).find(
                                    el => (el.innerText || '').includes('О расторжении договора')
                                );
                                if (b) b.click();
                            }"""
                        )
                    except Exception:
                        pass
                step3a_selected = True
                self.page.wait_for_timeout(1200)
                break

            self.page.wait_for_timeout(500)

        if not step3a_selected:
            logger.info("Step 3a (Fallback): Waiting up to 120s for 'О расторжении договора'...")
            term_btn = self.page.locator(
                "epgu-cf-ui-long-button:has-text('О расторжении договора'), "
                "button:has-text('О расторжении договора')"
            ).first
            term_btn.wait_for(state="visible", timeout=max_wait_sec * 1000)
            term_btn.click()
            self.page.wait_for_timeout(1200)

        # Steps 3b -> 4 -> 5 -> 6 -> 7 Smart Transition Polling Loop until Step 8 (#si13_lastNameRu) appears!
        # Waits up to 2+ minutes (max_wait_sec = 120s+) if Gosuslugi shows 'Это может занять несколько секунд' after Screen 2 ('Верно').
        last_name_input = self.page.locator("#si13_lastNameRu, input[name*='lastNameRu'], input[id*='lastNameRu']").first
        verno_clicks = 0
        okved_done = False
        total_step_ticks = max(260, int(max_wait_sec * 2.2))
        spinner_ticks = 0

        for _step_tick in range(total_step_ticks):
            if os.path.exists(PAUSE_SIGNAL_FILE):
                self.wait_if_paused_or_logged_out()
            self.check_and_handle_error_modal()

            # Check if we have reached Step 8 (Personal Info)
            try:
                if last_name_input.count() > 0 and last_name_input.is_visible():
                    break
            except Exception:
                pass

            # 1) Step 3b: Select 'Патент' if on document choice screen
            try:
                patent_btn = self.page.locator(
                    "epgu-cf-ui-long-button:has-text('Патент'):visible, "
                    "button:has-text('Патент'):visible, "
                    "div.long-button:has-text('Патент'):visible"
                ).first
                if patent_btn.count() > 0 and patent_btn.is_visible():
                    logger.info("Step 3b: Selecting 'Патент'...")
                    patent_btn.click()
                    self.page.wait_for_timeout(1400)
                    continue
            except Exception:
                pass

            # 2) Step 4: Click 'Перейти к уведомлению' / 'Перейти к заявлению'
            try:
                go_btn = self.page.locator(
                    "button:has-text('Перейти к уведомлению'):visible, "
                    "button:has-text('Перейти к заявлению'):visible, "
                    "lib-button:has-text('Перейти к уведомлению') button:visible, "
                    "span:has-text('Перейти к уведомлению'):visible"
                ).first
                if go_btn.count() > 0 and go_btn.is_visible():
                    logger.info("Step 4: Clicking 'Перейти к уведомлению'...")
                    go_btn.click()
                    self.page.wait_for_timeout(1400)
                    continue
            except Exception:
                pass

            # 3) Step 5: Confirm company & manager info ('Верно')
            try:
                verno_btn = self.page.locator(
                    "button:has-text('Верно'):visible, "
                    "button.primary:has-text('Верно'):visible, "
                    "span:has-text('Верно'):visible"
                ).first
                if verno_btn.count() > 0 and verno_btn.is_visible():
                    verno_clicks += 1
                    logger.info(f"Step 5: Clicking 'Верно' (screen {verno_clicks})...")
                    verno_btn.click()
                    spinner_ticks = 0
                    self.page.wait_for_timeout(1500)
                    continue
            except Exception:
                pass

            # 4) Step 6: Select Organization Status ('Укажите статус организации' -> #dic11_UL_TD)
            try:
                status_input = self.page.locator("#dic11_UL_TD:visible").first
                if status_input.count() > 0 and status_input.is_visible():
                    logger.info("Step 6: Selecting Organization Status ('Статус организации')...")
                    self.select_lookup_option_mvd_style(
                        input_selector="input#dic11_UL_TD",
                        type_text=self.cfg["TYPE_COMPANY"],
                        match_keywords=[self.cfg["TYPE_COMPANY"], "ЮРИДИЧЕСКОЕ ЛИЦО", "КОММЕРЧЕСКАЯ ОРГАНИЗАЦИЯ"],
                        step_label="Step 6 (Статус организации)",
                        click_continue_after=True,
                    )
                    spinner_ticks = 0
                    continue
            except Exception:
                pass

            # 5) Step 7: Select OKVED 43.29 ('Укажите вид деятельности по ОКВЭД' -> #dic12) — ONLY ONCE!
            if not okved_done:
                try:
                    is_okved_screen = bool(
                        self.page.evaluate(
                            """() => {
                                const vis = (el) => el && el.getBoundingClientRect().width > 5 && el.getBoundingClientRect().height > 5;
                                const step8 = document.querySelector('#si13_lastNameRu, input[name*="lastNameRu"]');
                                if (vis(step8)) return false;
                                const dic12 = document.querySelector('input#dic12, input[id*="dic12"]');
                                return vis(dic12);
                            }"""
                        )
                    )
                    if is_okved_screen:
                        if self.ensure_okved_selected():
                            okved_done = True
                            break
                        continue
                except Exception:
                    pass

            # Log every 10 seconds if Gosuslugi is showing 'Это может занять несколько секунд' after Screen 2
            spinner_ticks += 1
            if spinner_ticks % 20 == 0:
                try:
                    is_slow_loading = bool(
                        self.page.evaluate(
                            """() => {
                                const txt = (document.body && document.body.innerText) || '';
                                return txt.includes('Это может занять несколько секунд') || txt.includes('Подождите');
                            }"""
                        )
                    )
                    if is_slow_loading:
                        logger.info(
                            f"Step 5->7: Ожидание ответа Госуслуг («Это может занять несколько секунд»)... прошло {int(spinner_ticks * 0.5)} сек / макс. {max_wait_sec} сек"
                        )
                except Exception:
                    pass

            self.page.wait_for_timeout(500)

        # Step 8: Fill Employee Personal Details
        logger.info(f"Step 8: Filling Personal Info for {row.get('Фамилия')}...")
        self.check_and_handle_error_modal()
        last_name_input.wait_for(state="visible", timeout=max_wait_sec * 1000)

        fam_raw = str(row.get("Фамилия") or "").strip()
        fam_clean = (
            "Нет"
            if (not fam_raw or fam_raw.lower() in ("нет", "-", "—", "–", "не заполнено", "none"))
            else self.sanitize_cyrillic_field(fam_raw, "Нет")
        )
        imya_clean = self.sanitize_cyrillic_field(str(row.get("Имя", "")))
        otch_raw = str(row.get("Отчество") or "").strip()
        otch_clean = (
            "Нет"
            if (not otch_raw or otch_raw.lower() in ("нет", "-", "—", "–", "не заполнено", "none"))
            else self.sanitize_cyrillic_field(otch_raw, "Нет")
        )

        self.type_masked_input(
            "#si13_lastNameRu:visible, input[name*='lastNameRu']:visible, input[id*='lastNameRu']:visible",
            fam_clean,
        )
        self.type_masked_input(
            "#si13_firstNameRu:visible, input[name*='firstNameRu']:visible, input[id*='firstNameRu']:visible",
            imya_clean,
        )
        self.type_masked_input(
            "#si13_secondNameRu:visible, input[name*='secondNameRu']:visible, input[id*='secondNameRu']:visible",
            otch_clean,
        )

        # Birth date (uses di13_birth / lib-date-picker input / label 'Дата рождения')
        bdate_str = str(row.get("ДатаРождения", "")).strip()
        self.fill_date_input_smart(
            primary_selector="input[name='di13_birth']:visible, input#di13_birth:visible, input[id*='birth']:visible, lib-date-picker input:visible",
            label_keywords=["дата рождения", "рождения"],
            value=bdate_str,
        )
        self.page.wait_for_timeout(300)

        # Citizenship (#dic13_ctz via strict lookup)
        citizenship = str(row.get("ТекущееГражданство", "Узбекистан")).strip()
        self.fill_citizenship_strict(citizenship)

        # Place of birth (#si13_pob)
        pob_val = self.sanitize_cyrillic_field(
            str(row.get("МестоРождения") or citizenship).strip(),
            "Республика Узбекистан",
        )
        self.type_masked_input(
            "#si13_pob:visible, input[name*='pob']:visible, input[id*='pob']:visible",
            pob_val,
        )

        # Gender selection
        gender = str(row.get("Пол", "Мужской")).strip()
        gender_label = "Женский" if gender.lower().startswith("ж") or gender.lower().startswith("k") else "Мужской"
        gender_loc = self.page.locator(
            f"label.radio:has-text('{gender_label}'):visible, "
            f"lib-radio:has-text('{gender_label}') label:visible, "
            f"span:has-text('{gender_label}'):visible, "
            f"label:has-text('{gender_label}'):visible"
        )
        if gender_loc.count() > 0:
            try:
                gender_loc.first.click(timeout=2500)
            except Exception:
                pass
        self.page.wait_for_timeout(500)

        # Click 'Продолжить' and ensure transition to Step 9
        for _ in range(3):
            self._click_continue_js_and_mouse()
            self.page.wait_for_timeout(1200)
            self.check_and_handle_error_modal()
            if self.page.locator("#si13_lastNameRu:visible, input[name*='lastNameRu']:visible").count() == 0:
                break

        # Step 9: Passport Details
        logger.info(f"Step 9: Filling Passport {row.get('СерияПаспорта')} {row.get('НомерПаспорта')}...")
        self.check_and_handle_error_modal()
        pass_num = self.page.locator("#number:visible, input[name*='number']:visible, input[id*='number']:visible").first
        pass_num.wait_for(state="visible", timeout=max_wait_sec * 1000)

        p_series_val = str(row.get("СерияПаспорта", "")).strip()
        if p_series_val and p_series_val.lower() not in ("нет", "-", "не заполнено"):
            self.type_masked_input(
                "#series:visible, input[name*='series']:visible, input[id*='series']:visible",
                p_series_val,
            )
        self.type_masked_input(
            "#number:visible, input[name*='number']:visible, input[id*='number']:visible",
            str(row.get("НомерПаспорта", "")).strip(),
        )

        # Passport Issue Date (di14_issue / lib-date-picker input / label 'Дата выдачи')
        pass_date = str(row.get("ДатаВыдачи", "")).strip()
        self.fill_date_input_smart(
            primary_selector="input[name='di14_issue']:visible, input#di14_issue:visible, input[id*='issue']:visible, lib-date-picker input:visible",
            label_keywords=["дата выдачи", "выдачи"],
            value=pass_date,
        )

        # Issued by (#si14_issuedBy_125)
        issued_by = self.sanitize_cyrillic_field(
            str(row.get("ПаспортКемВыдан", "")).strip() or "МВД",
            "МВД",
            allow_digits=True,
        )
        self.type_masked_input(
            "#si14_issuedBy_125:visible, input[name*='issuedBy']:visible, input[id*='issuedBy']:visible",
            issued_by,
        )
        self.page.wait_for_timeout(500)

        for _ in range(4):
            self._click_continue_js_and_mouse()
            for _w in range(12):
                self.page.wait_for_timeout(300)
                self.check_and_handle_error_modal()
                # Wait until Passport-specific fields (#si14_issuedBy_125 / di14_issue) are gone AND no .loader button is spinning
                still_on_step9 = bool(
                    self.page.evaluate(
                        """() => {
                            const vis = (el) => el && el.getBoundingClientRect().width > 5 && el.getBoundingClientRect().height > 5;
                            const iss = document.querySelector("#si14_issuedBy_125, input[id*='issuedBy'], input[name='di14_issue']");
                            const loader = document.querySelector("button.loader");
                            return !!(vis(iss) || vis(loader));
                        }"""
                    )
                )
                if not still_on_step9:
                    break
            if self.page.locator("#si14_issuedBy_125:visible, input[id*='issuedBy']:visible, input[name='di14_issue']:visible").count() == 0:
                break

        # Step 10: Wait for and handle optional INN (Step 9b), Patent Region (Step 10a), and Patent Details (Step 10)
        patent_series_str = str(row.get("Серия", "")).strip()
        logger.info(f"Step 10: Filling Patent Series {patent_series_str} No {row.get('Номер')}...")
        row_reg_short = str(row.get("РегионПатента") or "").strip()
        row_reg_full = str(row.get("РегионПатентаПолный") or "").strip()
        if row_reg_short or row_reg_full:
            reg_short = row_reg_short or row_reg_full.split()[0]
            reg_full = row_reg_full or row_reg_short
        else:
            reg_short, reg_full = PATENT_SERIES_TO_REGION.get(
                patent_series_str,
                (self.cfg["PATENT_REGION"], self.cfg["PATENT_REGION_FULL"]),
            )

        for _step10_tick in range(int(max_wait_sec * 2.2)):
            if os.path.exists(PAUSE_SIGNAL_FILE):
                self.wait_if_paused_or_logged_out()
            self.check_and_handle_error_modal()

            # ONLY break when we are genuinely on the Patent Details screen ('Укажите данные патента' / #s15_dict_2_seriaBlank)
            # Never break on Step 9's #series!
            on_patent_details = bool(
                self.page.evaluate(
                    """() => {
                        const vis = (el) => el && el.getBoundingClientRect().width > 5 && el.getBoundingClientRect().height > 5;
                        if (vis(document.querySelector("#si14_issuedBy_125, input[id*='issuedBy'], input[name='di14_issue']"))) return false;
                        const blankInp = document.querySelector("#s15_dict_2_seriaBlank, input[name*='seriaBlank'], input[name*='numberBlank']");
                        if (vis(blankInp)) return true;
                        const h1 = Array.from(document.querySelectorAll("h1, h2, h3")).find(
                            h => vis(h) && (h.innerText || "").toLowerCase().includes("данные патента")
                        );
                        return !!h1 && vis(document.querySelector("#series"));
                    }"""
                )
            )
            if on_patent_details:
                break

            # Optional Step 9b: Foreigner INN ('ИНН иностранного гражданина')
            inn_loc = self.page.locator("#c_foreignerINN:visible, input[id*='foreignerINN']:visible, input[name*='foreignerINN']:visible")
            if inn_loc.count() > 0 and inn_loc.first.is_visible():
                inn_val = re.sub(r"\D", "", str(row.get("ИНН") or ""))
                if len(inn_val) == 12:
                    self.type_masked_input("#c_foreignerINN:visible, input[id*='foreignerINN']:visible", inn_val)
                self._click_continue_js_and_mouse()
                self.page.wait_for_timeout(1200)
                continue

            # Step 10a: Patent Region ('В каком регионе выдан патент?')
            region_input = self.page.locator(
                "input[placeholder*='Регион']:visible, input[name*='region']:visible, input[id*='region']:visible, lib-lookup input.search-input:visible"
            )
            if region_input.count() > 0 and region_input.first.is_visible():
                self.select_lookup_option_mvd_style(
                    input_selector="input[placeholder*='Регион'], input[name*='region'], input[id*='region'], lib-lookup input.search-input",
                    type_text=reg_short,
                    match_keywords=[reg_full, reg_short],
                    step_label=f"Step 10a (Регион патента: {reg_full})",
                    click_continue_after=True,
                )
                self.page.wait_for_timeout(1000)
                continue

            self.page.wait_for_timeout(500)

        # Patent Series & Number, Blank Series & Number
        patent_series_inputs = self.page.locator("#series:visible, input[name*='series']:visible, input[id*='series']:visible").first
        patent_series_inputs.wait_for(state="visible", timeout=max_wait_sec * 1000)
        self.type_masked_input(
            "#series:visible, input[name*='series']:visible, input[id*='series']:visible",
            patent_series_str,
        )
        self.type_masked_input(
            "#number:visible, input[name*='number']:visible, input[id*='number']:visible",
            str(row.get("Номер", "")).strip(),
        )

        blank_series_val = self.sanitize_cyrillic_field(str(row.get("СерийныйНомер1", "")).strip()).replace(" ", "")
        if blank_series_val:
            self.type_masked_input(
                "#s15_dict_2_seriaBlank:visible, #dic15_seriaBlank:visible, input[name*='seriaBlank']:visible, input[id*='seriaBlank']:visible, input[placeholder*='Серия бланка']:visible",
                blank_series_val,
            )
            # If 'Серия бланка' opened a lookup dropdown (#lookup-list-wrap .lookup-item), click the matching item
            try:
                lookup_item = self.page.locator("#lookup-list-wrap .lookup-item:visible, lib-lookup .lookup-item:visible").first
                if lookup_item.count() > 0 and lookup_item.is_visible():
                    lookup_item.click(timeout=1500)
                    self.page.wait_for_timeout(200)
            except Exception:
                pass

        blank_num_val = str(row.get("СерийныйНомер2", "")).strip()
        if blank_num_val:
            self.type_masked_input(
                "input[name='s15_dict_2_numberBlank']:visible, input[name='s15_numberBlank']:visible, input[name*='numberBlank']:visible, input[id*='numberBlank']:visible, input[placeholder*='Номер бланка']:visible",
                blank_num_val,
            )

        # Only fill patent issue date if a date-picker is actually present on the Patent screen
        patent_issue_date = str(row.get("ДатаВыдачиВКС", "")).strip()
        if patent_issue_date and self.page.locator("input[name*='di15']:visible, lib-date-picker input:visible").count() > 0:
            self.fill_date_input_smart(
                primary_selector="input[name*='di15']:visible, input[id*='di15']:visible, lib-date-picker input:visible",
                label_keywords=["дата выдачи", "выдачи"],
                value=patent_issue_date,
            )

        self.page.wait_for_timeout(500)
        for _ in range(4):
            self._click_continue_js_and_mouse()
            for _w in range(15):
                self.page.wait_for_timeout(300)
                self.check_and_handle_error_modal()
                reached_step11 = bool(
                    self.page.evaluate(
                        """() => {
                            const vis = (el) => el && el.getBoundingClientRect().width > 5 && el.getBoundingClientRect().height > 5;
                            if (vis(document.querySelector("button.loader"))) return false;
                            if (vis(document.querySelector("#s15_dict_2_seriaBlank, input[name*='numberBlank']"))) return false;
                            const step11El = document.querySelector("input#dic16, input#si16, input[name='di16_2'], input[name='ri16_type']");
                            if (vis(step11El)) return true;
                            const h1 = Array.from(document.querySelectorAll("h1, h2, h3")).find(
                                h => vis(h) && (h.innerText || "").toLowerCase().includes("расторжении договора")
                            );
                            return !!h1;
                        }"""
                    )
                )
                if reached_step11:
                    break
            if self.page.locator("#s15_dict_2_seriaBlank:visible, input[name*='numberBlank']:visible").count() == 0:
                break

        # Step 11: Contract Termination Details ('Укажите информацию о расторжении договора')
        raw_dismiss_date = str(row.get("ДатаУволь", "")).strip()
        dismiss_date = self.normalize_past_or_today_date_ru(raw_dismiss_date)
        pos_str = self.sanitize_cyrillic_field(str(row.get("Должность", "Монтажник")).strip(), "Монтажник", allow_digits=True)
        logger.info(f"Step 11: Setting Termination Date {dismiss_date} & Position {pos_str}...")
        self.check_and_handle_error_modal()
        for _ in range(int(max_wait_sec * 2.2)):
            if os.path.exists(PAUSE_SIGNAL_FILE):
                self.wait_if_paused_or_logged_out()
            if (
                self.page.locator(
                    "h1:has-text('расторжении договора'):visible, "
                    "input#dic16:visible, input#si16:visible, input[name='di16_2']:visible, "
                    "lib-radio:has-text('Трудовой'):visible"
                ).count()
                > 0
            ):
                break
            self.page.wait_for_timeout(500)

        # 11a. Contract type radio ('Трудовой' -> input[name='ri16_type'])
        try:
            self.page.evaluate(
                """() => {
                    const radios = Array.from(document.querySelectorAll("lib-radio"));
                    for (const r of radios) {
                        const txt = (r.innerText || "").trim();
                        if (txt.includes("Трудовой")) {
                            const lbl = r.querySelector("label.radio") || r;
                            lbl.click();
                        }
                    }
                }"""
            )
        except Exception:
            pass
        trudovoy_lbl = self.page.locator("lib-radio:has-text('Трудовой') label.radio:visible, label.radio:has-text('Трудовой'):visible").first
        if trudovoy_lbl.count() > 0 and trudovoy_lbl.is_visible():
            try:
                trudovoy_lbl.click(timeout=2000)
            except Exception:
                pass
        self.page.wait_for_timeout(200)

        # 11b. Profession ('Профессия')
        # Check 'Нет подходящей профессии' (input#cb16_) to unlock input#si16 and type the exact position from Excel immediately
        try:
            self.page.evaluate(
                """() => {
                    const cb = document.querySelector("input#cb16_");
                    const libCb = cb ? cb.closest("lib-checkbox") : Array.from(document.querySelectorAll("lib-checkbox")).find(el => (el.innerText || "").includes("Нет подходящей профессии"));
                    if (libCb) {
                        const inp = libCb.querySelector("input[type='checkbox']");
                        if (!inp || !inp.checked) {
                            const lbl = libCb.querySelector("label.check") || libCb;
                            lbl.click();
                        }
                    }
                }"""
            )
            self.page.wait_for_timeout(300)
        except Exception:
            pass

        if self.page.locator("input#si16:visible, input[name='si16']:visible").count() > 0:
            self.type_masked_input("input#si16:visible, input[name='si16']:visible", pos_str)
        else:
            # Fallback if #si16 didn't appear: use #dic16 lookup
            ok_prof = self.select_lookup_option_mvd_style(
                input_selector="input#dic16, input#dic16_prof, input[id*='dic16'], lib-lookup input.search-input",
                type_text=pos_str,
                match_keywords=[pos_str, pos_str.split()[0] if pos_str.split() else "Монтажник"],
                step_label=f"Step 11 (Профессия: {pos_str})",
                click_continue_after=False,
            )
            if not ok_prof:
                self.select_lookup_option_mvd_style(
                    input_selector="input#dic16, input#dic16_prof, input[id*='dic16'], lib-lookup input.search-input",
                    type_text="Монтажник",
                    match_keywords=["МОНТАЖНИК"],
                    step_label="Step 11 (Профессия fallback: Монтажник)",
                    click_continue_after=False,
                )

        # 11c. Dates on Step 11 (optional 'Дата заключения' + mandatory 'Дата расторжения' [di16_2])
        hire_date = str(row.get("ДатаПриема", "")).strip()
        if hire_date and self.page.locator("lib-date-picker input:visible").count() >= 2:
            self.fill_date_input_smart(
                primary_selector="input[name*='start']:visible, input[id*='start']:visible",
                label_keywords=["дата заключения", "заключения"],
                value=hire_date,
            )

        self.fill_date_input_smart(
            primary_selector="input[name='di16_2']:visible, input[name*='di16']:visible, input[id*='di16']:visible, lib-date-picker input:visible",
            label_keywords=["дата расторжения", "дата прекращения", "расторжения", "прекращения", "увольнения", "дата"],
            value=dismiss_date,
        )

        # 11d. Voluntary termination radio ('По инициативе работника' -> input[name='ri16_2_ini'][value='Y'|'N'])
        is_voluntary = str(row.get("УвПоСобствЖел", self.cfg.get("DEFAULT_VOLUNTARY", "Да"))).strip()
        vol_val = "Y" if is_voluntary.lower() in ["да", "yes", "true", "1"] else "N"
        vol_label = "Да" if vol_val == "Y" else "Нет"
        try:
            vol_box = self.page.evaluate(
                """(val) => {
                    const inp = document.querySelector(`input[name='ri16_2_ini'][value='${val}']`);
                    if (!inp) return null;
                    const libRadio = inp.closest("lib-radio");
                    const lbl = libRadio ? (libRadio.querySelector("label.radio") || libRadio) : inp;
                    lbl.scrollIntoView({ block: 'center' });
                    const r = lbl.getBoundingClientRect();
                    lbl.click();
                    return (r.width > 5 && r.height > 5) ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
                }""",
                vol_val,
            )
            if vol_box and not self.page.evaluate(f"() => !!(document.querySelector(\"input[name='ri16_2_ini'][value='{vol_val}']\")?.checked)"):
                self.page.mouse.click(float(vol_box["x"]), float(vol_box["y"]))
        except Exception:
            vol_loc = self.page.locator(f"lib-radio:has-text('{vol_label}') label.radio:visible").last
            if vol_loc.count() > 0:
                try:
                    vol_loc.click(timeout=2000)
                except Exception:
                    pass
        self.page.wait_for_timeout(400)

        # 11e. Work Address (if present on Step 11) — uses employee row's АдресРаботы if filled, else global WORK_ADDRESS
        raw_work_addr = str(row.get("АдресРаботы") or "").strip()
        work_addr = raw_work_addr if raw_work_addr else self.cfg["WORK_ADDRESS"]

        m_post = re.search(r"\b(\d{6})\b", work_addr)
        postal_code = m_post.group(1) if m_post else str(self.cfg.get("WORK_POSTAL_CODE") or "626150")

        if self.page.locator("epgu-constructor-address-input textarea:visible, lib-dadata-widget textarea:visible, textarea.search-input:visible").count() > 0:
            self.select_dadata_work_address(work_addr)
            try:
                if self.page.locator("input#index:visible").count() == 0:
                    clarify_btn = self.page.locator(
                        "button.clarify-address:visible, "
                        "button:has-text('Уточнить адрес'):visible, "
                        "span:has-text('Уточнить адрес'):visible"
                    ).first
                    if clarify_btn.count() > 0 and clarify_btn.is_visible():
                        clarify_btn.click(timeout=2500)
                        self.page.wait_for_timeout(700)
            except Exception:
                pass
            self.fill_postal_code_strict(postal_code)
            self.set_address_checkbox("Нет дома", "houseCheckbox", True)
            self.set_address_checkbox("Нет квартиры", "apartmentCheckbox", True)

        self.page.wait_for_timeout(500)
        for _ in range(4):
            self._click_continue_js_and_mouse()
            for _w in range(12):
                self.page.wait_for_timeout(300)
                self.check_and_handle_error_modal()
                if self._is_on_step12_mvd_screen_js() or self._has_advanced_past_step12_js():
                    break
            if self._is_on_step12_mvd_screen_js() or self._has_advanced_past_step12_js():
                break

        # Steps 12 -> 13 -> 14 -> 15: MVD Destination Division (uses row's ПодразделениеМВД if filled, else global UFMS_DEPARTMENT),
        # Employee Consent ('Подтвердить'), and Final Submission ('Отправить')
        row_mvd_dept = str(row.get("ПодразделениеМВД") or self.cfg.get("UFMS_DEPARTMENT") or "").strip()
        self.complete_mvd_and_submit_flow(target_dept_override=row_mvd_dept)

        # Step 14: Personal Cabinet & PDF Receipt Archiving
        self.download_and_rename_receipt_pdf(row)

        logger.info("Step 14: Verifying Personal Cabinet Order History...")
        cabinet_btn = self.page.locator("button:has-text('В личный кабинет')")
        if cabinet_btn.count() > 0 and cabinet_btn.first.is_visible():
            cabinet_btn.first.click()
            self.page.wait_for_timeout(3000)

        logger.info(f"SUCCESS: Notification submitted for {full_name}!")
        return True


def load_excel_records(file_path: str, sheet_name: str = "Sheet1") -> List[Dict[str, Any]]:
    logger.info(f"Loading records from Excel: {file_path} (Sheet: {sheet_name})")
    wb = openpyxl.load_workbook(file_path, data_only=True)
    if sheet_name not in wb.sheetnames:
        sheet_name = wb.sheetnames[0]

    sheet = wb[sheet_name]
    header = [cell.value for cell in sheet[1]]
    records = []

    for row_idx in range(2, sheet.max_row + 1):
        vals = [sheet.cell(row_idx, c).value for c in range(1, len(header) + 1)]
        if not any(vals):
            continue
        row_dict = {str(header[i]): (vals[i] if vals[i] is not None else "") for i in range(len(header))}
        row_dict["_row_idx"] = row_idx
        records.append(row_dict)

    logger.info(f"Loaded {len(records)} records from Excel.")
    return records


def mark_row_completed(file_path: str, row_idx: int, success: bool, note: str = ""):
    try:
        wb = openpyxl.load_workbook(file_path)
        sheet = wb["Sheet1"] if "Sheet1" in wb.sheetnames else wb.active
        status_col = sheet.max_column + 1
        cell = sheet.cell(row_idx, status_col)
        cell.value = f"OK: {datetime.now().strftime('%d.%m.%Y %H:%M')}" if success else f"ERROR: {note}"
        color = "C6EFCE" if success else "FFC7CE"
        cell.fill = PatternFill(start_color=color, end_color=color, fill_type="solid")
        wb.save(file_path)
    except Exception as e:
        logger.warning(f"Could not update Excel status for row {row_idx}: {e}")


def prevent_windows_sleep():
    if sys.platform != "win32":
        return
    try:
        import ctypes
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001 | 0x00000002 | 0x00000040)
    except Exception:
        pass


def main():
    prevent_windows_sleep()
    parser = argparse.ArgumentParser(description="Pondera HR & Powerise Gosuslugi Dismissal RPA Bot")
    parser.add_argument("--excel", default=DEFAULT_CONFIG["DEFAULT_EXCEL_PATH"], help="Path to GosUsluga_ увольнения.xlsx")
    parser.add_argument("--sheet", default="Sheet1", help="Sheet name to process (e.g. Sheet1, Лист2)")
    parser.add_argument("--json", default="", help="Path to JSON file with worker records")
    parser.add_argument("--config-json", default="", help="Path to JSON file with config overrides")
    parser.add_argument("--attach", action="store_true", default=True, help="Attach to running Chrome session on port 9222")
    parser.add_argument("--cdp-port", type=int, default=9222, help="Chrome Remote Debugging Port (default 9222)")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of rows to process (0 = all)")
    args = parser.parse_args()

    config_overrides = {}
    if args.config_json and os.path.exists(args.config_json):
        try:
            with open(args.config_json, "r", encoding="utf-8") as cf:
                config_overrides = json.load(cf)
            logger.info(f"Loaded dismissal config overrides: {list(config_overrides.keys())}")
        except Exception as e:
            logger.warning(f"Could not read config JSON {args.config_json}: {e}")

    records = []
    json_candidates = [
        args.json,
        os.path.join(os.path.dirname(__file__), "active_dismissal_queue.json"),
        os.path.join(os.path.dirname(__file__), "active_queue.json"),
        os.path.expandvars(r"%USERPROFILE%\Downloads\active_dismissal_queue.json"),
    ]
    for jpath in json_candidates:
        if jpath and os.path.exists(jpath):
            try:
                with open(jpath, "r", encoding="utf-8") as f:
                    records = json.load(f)
                logger.info(f"Loaded {len(records)} dismissal records from queue: {jpath}")
                break
            except Exception as e:
                logger.warning(f"Could not load JSON queue {jpath}: {e}")

    if not records:
        excel_candidates = [
            args.excel,
            os.path.expandvars(r"%USERPROFILE%\Downloads\GosUsluga_uvolneniya_2026-09-02.xlsx"),
            os.path.expandvars(r"%USERPROFILE%\Downloads\GosUsluga_ увольнения.xlsx"),
        ]
        for epath in excel_candidates:
            if epath and os.path.exists(epath):
                try:
                    records = load_excel_records(epath, args.sheet)
                    if records:
                        break
                except Exception as e:
                    logger.warning(f"Could not load Excel file {epath}: {e}")

    if not records:
        logger.warning("No records found to process.")
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
            logger.info(f"Successfully connected to Chrome! Active Tab URL: {page.url}")
        except Exception:
            logger.info(f"Chrome remote debugging not detected on port {args.cdp_port}. Launching Chrome automatically...")
            chrome_paths = [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
            ]
            chrome_exe = next((cp for cp in chrome_paths if os.path.exists(cp)), "chrome.exe")
            user_data = os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data RPA")
            import subprocess
            subprocess.Popen([
                chrome_exe,
                f"--remote-debugging-port={args.cdp_port}",
                f"--user-data-dir={user_data}",
                DEFAULT_CONFIG["FORM_URL"]
            ])
            time.sleep(3)
            try:
                browser = p.chromium.connect_over_cdp(f"http://localhost:{args.cdp_port}")
                context = browser.contexts[0] if browser.contexts else browser.new_context()
                page = context.pages[0] if context.pages else context.new_page()
                page.bring_to_front()
                logger.info(f"Successfully launched Chrome and connected! Active Tab URL: {page.url}")
            except Exception as ex2:
                logger.error(f"Could not connect to Chrome on port {args.cdp_port} ({ex2})!")
                return

        bot = GosuslugiDismissalBot(page, config=config_overrides)

        success_count = 0
        fail_count = 0

        for idx, record in enumerate(records):
            bot.wait_if_paused_or_logged_out()
            logger.info(f"\n--- Processing Dismissal Record {idx+1}/{len(records)} ---")
            row_idx = record.get("_row_idx")
            try:
                ok = bot.fill_notification(record)
                if ok:
                    success_count += 1
                    if args.excel and row_idx is not None:
                        mark_row_completed(args.excel, row_idx, True)
                else:
                    fail_count += 1
                    if args.excel and row_idx is not None:
                        mark_row_completed(args.excel, row_idx, False, "Submission failed")
            except InsufficientPermissionsError as perm_ex:
                fail_count += 1
                logger.error(f"Error processing {record.get('Фамилия')}: {perm_ex}")
                if args.excel and row_idx is not None:
                    mark_row_completed(args.excel, row_idx, False, str(perm_ex))
                logger.error("=== ОСТАНОВКА РОБОТА: В текущем аккаунте Госуслуг недостаточно полномочий для отправки уведомлений ===")
                break
            except Exception as ex:
                if bot.is_on_login_page() or bot.is_service_unavailable_ip_block():
                    bot.wait_if_paused_or_logged_out()
                    try:
                        ok_retry = bot.fill_notification(record)
                        if ok_retry:
                            success_count += 1
                            if args.excel and row_idx is not None:
                                mark_row_completed(args.excel, row_idx, True)
                            continue
                    except InsufficientPermissionsError as perm_ex2:
                        fail_count += 1
                        logger.error(f"Error processing {record.get('Фамилия')}: {perm_ex2}")
                        break
                    except Exception as ex2:
                        ex = ex2
                fail_count += 1
                logger.error(f"Error processing {record.get('Фамилия')}: {ex}")
                if args.excel and row_idx is not None:
                    mark_row_completed(args.excel, row_idx, False, str(ex))

            time.sleep(2)

        logger.info(f"\n=== Dismissal RPA Batch Complete ===\nTotal: {len(records)}, Success: {success_count}, Failed: {fail_count}")


if __name__ == "__main__":
    main()
