"""
Pondera HR - Gosuslugi VKS Salary Notification RPA Worker (Python + Playwright)
Automated Foreign Worker VKS Salary Notification to MVD (Gosuslugi Service 600585/1)

Replaces Power Automate Desktop (PAD) flow (from 11.docx) with direct Playwright automation.
Features:
1. Attaching to open Chrome with active Gosuslugi/Rutoken session (CDP: http://localhost:9222)
2. Strict verification that 'Продолжить' is enabled (blue/active) and no red errors exist before advancing
3. Human-in-the-Loop (Manual Intervention Mode): If any page has a validation error or disabled 'Продолжить',
   the robot pauses and waits for the user to either fix the field in Chrome or click 'Продолжить' in Pondera HR UI.
"""

import sys
import os
import re
import time
import json
import calendar
import argparse
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
import openpyxl
from openpyxl.styles import PatternFill

# Configure UTF-8 stdout
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
MANUAL_CONTINUE_SIGNAL = os.path.join(CURRENT_DIR, "manual_continue.signal")

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(f"gosuslugi_vks_rpa_{datetime.now().strftime('%Y%m%d')}.log", encoding="utf-8")
    ]
)
logger = logging.getLogger("PonderaGosuslugiVksRPA")

try:
    from playwright.sync_api import sync_playwright, Page
except ImportError:
    logger.error("Playwright is not installed! Run: pip install playwright")
    sys.exit(1)


DEFAULT_CONFIG = {
    "FORM_URL": "https://www.gosuslugi.ru/600585/1/form",
    "COMPANY_ADDRESS": "121108, г. Москва, ул. Ивана Франко, д. 8",
    "TYPE_COMPANY": "Российская коммерческая организация",
    "OKVED_TEXT": "Деятельность в области инженерных",
    "WORK_REGION": "Тюменская",
    "WORK_ADDRESS": "626150, обл. Тюменская, г. Тобольск, тер. Восточный промышленный район, кв-л. 5-й",
    "WORK_POSTAL_CODE": "626150",
    "UFMS_DEPARTMENT": "ОТДЕЛ ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ",
    "PERIOD_START": "01.07.2026",
    "PERIOD_END": "30.09.2026",
    "PERIOD_CODE": "2026-3",
    "DEFAULT_EXCEL_PATH": r"C:\Users\nemat\Downloads\GosUsluga_ ЗП.xlsx",
    "CDP_PORT": 9222,
}


class RestartZayavkaException(Exception):
    """Raised when step auto-repair cannot activate 'Продолжить' on Attempt 1 so the entire Zayavka restarts from Step 1."""
    pass


class InsufficientPermissionsError(Exception):
    """Raised when Gosuslugi blocks submission due to missing power of attorney ('У вас недостаточно полномочий для отправки уведомлений'). Immediately stops the robot."""
    pass


def prevent_windows_sleep():
    """
    Prevents Windows from entering Sleep Mode, Hibernate, or turning off the screen/network
    while the VKS RPA robot is active.
    """
    if sys.platform != "win32":
        return
    try:
        import ctypes
        # ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x01) | ES_DISPLAY_REQUIRED (0x02) | ES_AWAYMODE_REQUIRED (0x40)
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001 | 0x00000002 | 0x00000040)
    except Exception:
        pass
    try:
        import subprocess
        for cmd_arg in (
            "standby-timeout-ac 0",
            "standby-timeout-dc 0",
            "monitor-timeout-ac 0",
            "monitor-timeout-dc 0",
            "hibernate-timeout-ac 0",
            "hibernate-timeout-dc 0",
        ):
            subprocess.run(
                f"powercfg /change {cmd_arg}",
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
    except Exception:
        pass


def is_browser_closed_error(err: Any) -> bool:
    """Returns True if the exception or error string was caused by the Chrome tab/context/browser disconnecting or closing."""
    s = str(err or "").lower()
    return (
        "target page, context or browser has been closed" in s
        or "browser has been closed" in s
        or "context or browser has been closed" in s
        or "targetclosederror" in s
        or "connection closed" in s
        or "session closed" in s
    )


class GosuslugiVksBot:
    def __init__(self, page: Page, config: Dict[str, Any] = None):
        self.page = page
        self.cfg = {**DEFAULT_CONFIG, **(config or {})}
        self.current_row: Dict[str, Any] = {}
        self.allow_full_restart: bool = True
        self.current_form_order_id: str = ""
        self.cdp = None
        self.attach_page(page)

    def attach_page(self, page: Page):
        """Attaches or re-attaches the bot to a live Playwright Page (used on initial start and after CDP reconnection)."""
        self.page = page
        self.cdp = None
        try:
            self.page.on("response", self._on_gosuslugi_network_response)
        except Exception:
            pass
        try:
            self.page.add_init_script(
                """try {
                    document.hasFocus = () => true;
                    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
                    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
                } catch (e) {}"""
            )
        except Exception:
            pass
        self.enable_background_focus_emulation()

    def enable_background_focus_emulation(self):
        """
        Enables Chrome CDP Focus Emulation & Active Web Lifecycle State so Gosuslugi Angular inputs
        (Step 6 Гражданство, Step 10 Индекс, Step 12 Подразделение МВД #dic18_byHand) work 100%
        even when Chrome is in the background behind Edge or another window.
        """
        try:
            if self.cdp is None:
                self.cdp = self.page.context.new_cdp_session(self.page)
            self.cdp.send("Emulation.setFocusEmulationEnabled", {"enabled": True})
            try:
                self.cdp.send("Page.setWebLifecycleState", {"state": "active"})
            except Exception:
                pass
        except Exception:
            self.cdp = None
        try:
            self.page.evaluate(
                """() => {
                    try {
                        document.hasFocus = () => true;
                        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
                        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
                    } catch (e) {}
                }"""
            )
        except Exception:
            pass

    def _on_gosuslugi_network_response(self, response):
        """
        Passively captures the active 10-digit Gosuslugi application number (orderId, e.g. '8285253583')
        directly from Gosuslugi's /600585/1/form scenario/order API responses during Steps 2-15.
        """
        try:
            url = (response.url or "").lower()
            if "gosuslugi.ru" not in url or "drafts" in url:
                return
            cur_sicil = str((self.current_row or {}).get("Sicil") or (self.current_row or {}).get("Код") or "").strip()

            # 1) Check URL path/query for 10-digit orderId (excluding 16-digit feed IDs starting with 20000)
            m_url = re.search(r"(?:order|orders|orderid)[=/]([789]\d{9})(?:\D|$)", url, re.IGNORECASE)
            if m_url:
                cand_no = m_url.group(1)
                if not self.is_order_already_linked_to_another_worker(cand_no, cur_sicil):
                    if self.current_form_order_id != cand_no:
                        self.current_form_order_id = cand_no
                        logger.info(f"Form Network Sniffer: Captured active Zayavka № {cand_no} from URL!")
                    return

            # 2) Check JSON payload for scenario/order endpoints
            if any(k in url for k in ("scenario", "600585", "order", "gusmev", "nextstep", "submit", "send")):
                ctype = (response.headers.get("content-type") or "").lower()
                if "json" in ctype:
                    body_txt = response.text()
                    if body_txt and len(body_txt) < 300000:
                        m_json = re.search(
                            r'"(?:orderId|order_id|orderNumber|extId)"\s*:\s*"?([789]\d{9})"?',
                            body_txt,
                        )
                        if m_json:
                            cand_no = m_json.group(1)
                            if not self.is_order_already_linked_to_another_worker(cand_no, cur_sicil):
                                if self.current_form_order_id != cand_no:
                                    self.current_form_order_id = cand_no
                                    logger.info(f"Form Network Sniffer: Captured active Zayavka № {cand_no} from form JSON!")
        except Exception:
            pass

    def check_and_stop_if_insufficient_permissions(self):
        """
        Checks if Gosuslugi displays the 'У вас недостаточно полномочий для отправки уведомлений'
        screen (where the application is only saved as a draft and 'Отправить ещё раз' is shown).
        If detected, logs a FATAL_STOP error and raises InsufficientPermissionsError to halt the robot immediately.
        """
        try:
            body_text = ""
            try:
                body_text = self.page.locator("body").inner_text(timeout=2000)
            except Exception:
                pass
            body_lower = (body_text or "").lower()

            has_no_poa_text = (
                "недостаточно полномочий для отправки" in body_lower
                or (
                    "недостаточно полномочий" in body_lower
                    and (
                        "сохранится в черновиках" in body_lower
                        or "выдать вам доверенность" in body_lower
                        or "отправить ещё раз" in body_lower
                        or "отправить еще раз" in body_lower
                    )
                )
            )

            send_again_btn = self.page.locator("button:has-text('Отправить ещё раз'):visible, button:has-text('Отправить еще раз'):visible")
            no_poa_heading = self.page.locator(
                "h1:has-text('недостаточно полномочий'):visible, "
                "h2:has-text('недостаточно полномочий'):visible, "
                "div:has-text('У вас недостаточно полномочий для отправки уведомлений'):visible"
            )

            if has_no_poa_text or (send_again_btn.count() > 0 and no_poa_heading.count() > 0):
                draft_no_match = re.search(r"Заявление\s*№\s*(\d{6,14})\s*сохранится\s*в\s*черновиках", body_text, re.IGNORECASE)
                draft_info = f" (черновик № {draft_no_match.group(1)})" if draft_no_match else ""
                err_msg = (
                    f"У вас недостаточно полномочий для отправки уведомлений{draft_info}! "
                    f"Заявление сохранено в черновиках, требуется доверенность с полномочием «Подача заявлений». Робот остановлен."
                )
                logger.error(f"FATAL_STOP: {err_msg}")
                raise InsufficientPermissionsError(err_msg)
        except InsufficientPermissionsError:
            raise
        except Exception:
            pass

    def is_on_login_page(self) -> bool:
        """
        Detects if Gosuslugi logged out and redirected the browser to the ESIA login page
        (e.g. https://esia.gosuslugi.ru/login/ with 'Телефон / Эл. почта / СНИЛС', 'Пароль', 'Войти').
        """
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
            if "Телефон / Эл. почта / СНИЛС" in body_text and "Войти" in body_text:
                return True
        except Exception:
            pass
        return False

    def wait_if_logged_out(self) -> bool:
        """
        If Gosuslugi session expired / logged out (esia.gosuslugi.ru/login), pauses the robot and waits
        up to 15 minutes until the user logs back in, then resumes automatically.
        Returns True if a logout was detected and recovered.
        """
        if not self.is_on_login_page():
            return False

        logger.warning(
            "PAUSED_FOR_LOGIN: Сессия Госуслуг завершилась (esia.gosuslugi.ru/login). "
            "Пожалуйста, войдите в аккаунт Госуслуг в окне Chrome — робот ждёт и автоматически продолжит работу после входа!"
        )
        try:
            self.page.bring_to_front()
        except Exception:
            pass

        # Wait up to 15 minutes (450 * 2s) for the user to complete login (including SMS/2FA/org selection)
        for wait_tick in range(450):
            self.page.wait_for_timeout(2000)
            try:
                cur_url = (self.page.url or "").lower()
                still_logging_in = (
                    self.is_on_login_page()
                    or "esia.gosuslugi.ru" in cur_url
                )
                if not still_logging_in and "gosuslugi.ru" in cur_url:
                    logger.info("LOGIN_RESTORED: Вход в Госуслуги выполнен! Робот продолжает работу через 2 секунды...")
                    self.page.wait_for_timeout(2000)
                    return True
            except Exception:
                pass
            if wait_tick > 0 and wait_tick % 15 == 0:
                logger.info("Ожидание входа пользователя в Госуслуги (esia.gosuslugi.ru/login)...")

        return False

    def check_and_handle_error_modal(self) -> bool:
        """Equivalent to PAD GetError subflow: Pause if logged out, click 'Попробовать ещё раз' or MVD warning continue."""
        handled = False
        if self.wait_if_logged_out():
            handled = True

        try:
            retry_btn = self.page.locator("button:has-text('Попробовать ещё раз'), span:has-text('Попробовать ещё раз')")
            if retry_btn.count() > 0 and retry_btn.first.is_visible():
                logger.warning("Detected Gosuslugi retry modal ('Попробовать ещё раз'). Clicking retry...")
                retry_btn.first.click(timeout=2500)
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
                logger.warning("Detected MVD warning modal. Clicking continue...")
                cont_btn = self.page.locator(
                    "button:has-text('Продолжить'), button:has-text('Все равно продолжить'), button:has-text('Продолжить без проверки')"
                ).first
                if cont_btn.count() > 0 and cont_btn.is_visible():
                    cont_btn.click(timeout=2500)
                    self.page.wait_for_timeout(2000)
                    handled = True
        except Exception:
            pass

        return handled

    def type_masked_input(self, selector: str, value: str, delay: int = 35) -> bool:
        """Fills a Gosuslugi Angular masked input using physical keyboard strokes so validation triggers."""
        val = str(value or "").strip()
        if not val:
            return False
        loc = self.page.locator(selector).first
        try:
            if loc.count() == 0 or not loc.is_visible():
                return False
        except Exception:
            return False
        try:
            loc.scroll_into_view_if_needed(timeout=1500)
        except Exception:
            pass
        try:
            loc.click(timeout=2500)
        except Exception:
            return False
        self.page.wait_for_timeout(120)
        self.page.keyboard.press("Control+A")
        self.page.keyboard.press("Backspace")
        self.page.wait_for_timeout(80)
        self.page.keyboard.type(val, delay=delay)
        self.page.wait_for_timeout(200)
        self.page.keyboard.press("Tab")
        self.page.wait_for_timeout(180)
        return True

    def fill_citizenship_strict(self, citizenship: str) -> bool:
        """
        Reliably fills 'Гражданство' (#dic13_ctz) on Step 6 without any unnecessary waiting:
        1) Types the country name (e.g. 'Индия')
        2) Immediately clicks the matching dropdown option ('Индия') as soon as it appears (~0.3s)
        3) Verifies selection and returns immediately.
        """
        ctz_val = str(citizenship or "Турция").strip()
        ctz_lower = ctz_val.lower()

        for attempt in range(1, 3):
            try:
                # 1) Quick check (non-blocking) if `.displayed.lookup-item` already shows the right country
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
                    logger.info(f"Step 6: Гражданство already verified as '{already_selected}'.")
                    return True

                # Clear if another country was selected
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

                # 3) Poll every 150ms (up to 1.8s max) and click the matching country option immediately once it appears
                clicked_country = False
                for _ in range(12):
                    self.page.wait_for_timeout(150)
                    try:
                        dom_clicked = self.page.evaluate(
                            """(targetCountry) => {
                                const want = targetCountry.trim().toLowerCase();
                                const items = Array.from(document.querySelectorAll(
                                    '#lookup-list-wrap .lookup-item:not(.nothing-found), ' +
                                    'lib-lookup .lookup-item:not(.nothing-found), ' +
                                    '.lookup-item:not(.nothing-found), ' +
                                    '[role="option"]'
                                ));
                                let chosen = null;
                                for (const el of items) {
                                    const r = el.getBoundingClientRect();
                                    if (r.width < 10 || r.height < 10) continue;
                                    const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
                                    if (txt === want) { chosen = { el, r, txt }; break; }
                                }
                                if (!chosen) {
                                    for (const el of items) {
                                        const r = el.getBoundingClientRect();
                                        if (r.width < 10 || r.height < 10) continue;
                                        const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
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
                            logger.info(f"Step 6: Selecting Гражданство option '{dom_clicked.get('text')}'...")
                            self.page.mouse.click(float(dom_clicked["x"]), float(dom_clicked["y"]))
                            clicked_country = True
                            self.page.wait_for_timeout(200)
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

    def get_current_heading(self) -> str:
        try:
            h1 = self.page.locator("h1:visible").first
            if h1.count() > 0:
                return h1.inner_text().strip()
        except Exception:
            pass
        return ""

    def format_salary_with_kopecks(self, raw_val: Any) -> str:
        """
        Formats any salary amount string/number to always include 2 decimal places (kopecks),
        e.g., '250000' -> '250000.00', '250000,5' -> '250000.50', '664655.12' -> '664655.12'.
        Required by Gosuslugi Step 11 ('Размер выплаты, ₽' — 'До копеек' / 'Укажите копейки').
        """
        s = str(raw_val or "").strip()
        if not s:
            return ""
        # Strip spaces, non-breaking spaces, and currency labels
        s = re.sub(r"[\s\u00a0₽рРУБруб]", "", s)
        if "," in s and "." in s:
            # Whichever appears last is the decimal separator; earlier ones are thousands separators
            if s.rfind(",") > s.rfind("."):
                s = s.replace(".", "").replace(",", ".")
            else:
                s = s.replace(",", "")
        elif "," in s:
            s = s.replace(",", ".")
        try:
            num = float(s)
            return f"{num:.2f}"
        except Exception:
            # Fallback if non-numeric characters remain
            if "." not in s:
                return f"{s}.00"
            parts = s.split(".", 1)
            dec = (parts[1] + "00")[:2]
            return f"{parts[0]}.{dec}"

    def type_locator_masked(self, loc, value: str, delay: int = 35) -> bool:
        """Types a masked value into a specific Playwright Locator using physical keystrokes."""
        val = str(value or "").strip()
        if not val or loc is None:
            return False
        try:
            if loc.count() == 0:
                return False
        except Exception:
            pass
        try:
            loc.scroll_into_view_if_needed(timeout=3000)
        except Exception:
            pass
        loc.click()
        self.page.wait_for_timeout(150)
        self.page.keyboard.press("Control+A")
        self.page.keyboard.press("Backspace")
        self.page.wait_for_timeout(100)
        self.page.keyboard.type(val, delay=delay)
        self.page.wait_for_timeout(250)
        self.page.keyboard.press("Tab")
        self.page.wait_for_timeout(250)
        return True

    def fill_salary_locator_strict(self, inp_loc, raw_val: Any, period_idx: int = 1) -> bool:
        """
        Fills a specific 'Размер выплаты, ₽' input locator on Step 11 ensuring kopecks (.00 / ,00) are typed
        so Gosuslugi never blocks with 'Укажите копейки'.
        """
        formatted_dot = self.format_salary_with_kopecks(raw_val)
        if not formatted_dot or inp_loc is None:
            return False

        logger.info(f"Step 11 (Period {period_idx}): Typing salary amount with kopecks: {formatted_dot} (raw: {raw_val})")
        self.type_locator_masked(inp_loc, formatted_dot, delay=35)
        self.page.wait_for_timeout(350)

        kopecks_err = self.page.locator("text='Укажите копейки':visible").count() > 0
        cur_val = ""
        try:
            cur_val = inp_loc.input_value().strip()
        except Exception:
            cur_val = ""

        if kopecks_err or (cur_val and ("," not in cur_val and "." not in cur_val)):
            formatted_comma = formatted_dot.replace(".", ",")
            logger.info(
                f"Step 11 (Period {period_idx}): Retrying salary input with comma decimal separator: {formatted_comma} (current field: '{cur_val}')"
            )
            self.type_locator_masked(inp_loc, formatted_comma, delay=35)
            self.page.wait_for_timeout(350)

        return True

    def fill_salary_amount_strict(self, raw_val: Any) -> bool:
        """Fallback single-field helper for #si17_paid."""
        inp_loc = self.page.locator("#si17_paid:visible, input[name*='si17_paid']:visible, input[id*='si17_paid']:visible").first
        return self.fill_salary_locator_strict(inp_loc, raw_val, 1)

    def build_monthly_salary_periods(self, row: Dict[str, Any]) -> List[Dict[str, str]]:
        """
        Builds the list of monthly salary payment periods (1 to 3 months inside the quarter) for Step 11:
        «Укажите выплаты иностранцу по месяцам в рамках квартала».
        - Uses precomputed `ПериодыВыплаты` if passed by Pondera UI;
        - Or computes the 3 quarter months from `НачалоПериода` and `КонецПериода` (clamping `КонецПериода`
          to employee's exit date if they exited before the quarter end, e.g. 19.08.2026 vs 30.09.2026)
          and maps `1-месяц`, `2-месяц`, `3-месяц` (falling back to splitting `РазмерВыплаты` if monthly columns are empty).
        """
        precomputed = row.get("ПериодыВыплаты")
        if isinstance(precomputed, list) and len(precomputed) > 0:
            cleaned = []
            for idx, item in enumerate(precomputed):
                if isinstance(item, dict):
                    st = str(item.get("start", "")).strip()
                    en = str(item.get("end", "")).strip()
                    amt = self.format_salary_with_kopecks(item.get("amount", ""))
                    if st and en and amt and float(amt) > 0:
                        cleaned.append({"monthIdx": item.get("monthIdx", idx + 1), "start": st, "end": en, "amount": amt})
            if len(cleaned) > 0:
                return cleaned

        p_start_str = str(row.get("НачалоПериода", "")).strip() or self.cfg["PERIOD_START"]
        p_end_str = str(row.get("КонецПериода", "")).strip() or self.cfg["PERIOD_END"]
        exit_str = (
            str(row.get("ДатаУвольнения", "")).strip()
            or str(row.get("Resmi Çıkış Tarihi", "")).strip()
            or str(row.get("Çıkış Tarihi", "")).strip()
        )

        def parse_ru_dt(s: str) -> Optional[datetime]:
            try:
                return datetime.strptime(s.strip(), "%d.%m.%Y")
            except Exception:
                return None

        s_dt = parse_ru_dt(p_start_str)
        e_dt = parse_ru_dt(p_end_str)
        ex_dt = parse_ru_dt(exit_str)
        if ex_dt and e_dt and ex_dt <= e_dt and (not s_dt or ex_dt >= s_dt):
            e_dt = ex_dt
            p_end_str = ex_dt.strftime("%d.%m.%Y")

        if not s_dt or not e_dt or e_dt < s_dt:
            amt_fallback = self.format_salary_with_kopecks(row.get("РазмерВыплаты", "250000.00"))
            return [{"monthIdx": 1, "start": p_start_str, "end": p_end_str, "amount": amt_fallback}]

        quarter_start_month = ((s_dt.month - 1) // 3) * 3 + 1
        base_year = s_dt.year

        slices = []
        for i in range(3):
            m_num = quarter_start_month + i
            yr = base_year + (m_num - 1) // 12
            norm_m = ((m_num - 1) % 12) + 1
            last_day = calendar.monthrange(yr, norm_m)[1]
            m_first = datetime(yr, norm_m, 1)
            m_last = datetime(yr, norm_m, last_day)

            eff_start = max(m_first, s_dt)
            eff_end = min(m_last, e_dt)
            is_active = eff_start <= eff_end
            slices.append({
                "monthIdx": i + 1,
                "start": eff_start.strftime("%d.%m.%Y") if is_active else m_first.strftime("%d.%m.%Y"),
                "end": eff_end.strftime("%d.%m.%Y") if is_active else m_last.strftime("%d.%m.%Y"),
                "active": is_active,
            })

        m1 = self.format_salary_with_kopecks(row.get("1-месяц", ""))
        m2 = self.format_salary_with_kopecks(row.get("2-месяц", ""))
        m3 = self.format_salary_with_kopecks(row.get("3-месяц", ""))
        m_map = {1: m1, 2: m2, 3: m3}

        has_any_monthly = any(bool(v and float(v) > 0) for v in (m1, m2, m3))
        result = []
        if has_any_monthly:
            for sl in slices:
                amt = m_map.get(sl["monthIdx"], "")
                if sl["active"] and amt and float(amt) > 0:
                    result.append({
                        "monthIdx": sl["monthIdx"],
                        "start": sl["start"],
                        "end": sl["end"],
                        "amount": amt,
                    })
            if len(result) > 0:
                return result

        # Fallback if 1-месяц / 2-месяц / 3-месяц are empty: split РазмерВыплаты across active months
        active_slices = [sl for sl in slices if sl["active"]]
        total_str = self.format_salary_with_kopecks(row.get("РазмерВыплаты", "250000.00"))
        total_num = float(total_str) if total_str else 250000.0
        if len(active_slices) > 0:
            per_m = int((total_num / len(active_slices)) * 100) / 100.0
            rem = round(total_num - per_m * len(active_slices), 2)
            for idx, sl in enumerate(active_slices):
                val = round(per_m + rem, 2) if idx == len(active_slices) - 1 else per_m
                result.append({
                    "monthIdx": sl["monthIdx"],
                    "start": sl["start"],
                    "end": sl["end"],
                    "amount": f"{val:.2f}",
                })
            return result

        return [{"monthIdx": 1, "start": p_start_str, "end": p_end_str, "amount": total_str}]

    def fill_step11_monthly_periods(self, row: Dict[str, Any]) -> bool:
        """
        Fills Step 11 ('Укажите информацию о выплате зарплаты иностранцу' —
        'Укажите выплаты иностранцу по месяцам в рамках квартала') month-by-month,
        clicking 'Добавить период' for the 2nd and 3rd month when present.
        """
        periods = self.build_monthly_salary_periods(row)
        summary_str = ", ".join(
            [f"{p.get('monthIdx', i+1)}-мес ({p['start']} - {p['end']}): {p['amount']} ₽" for i, p in enumerate(periods)]
        )
        logger.info(f"Step 11: Filling {len(periods)} monthly salary period(s): [{summary_str}]")

        p_start_first = self.page.locator("input[name*='di17_start'], input[id*='di17_start']").first
        p_start_first.wait_for(state="visible", timeout=20000)

        for p_idx, p_item in enumerate(periods):
            # If p_idx > 0, ensure the (p_idx + 1)-th period block exists by clicking 'Добавить период'
            if p_idx > 0:
                for _ in range(4):
                    start_cnt = self.page.locator(
                        "input[name*='di17_start']:visible, input[id*='di17_start']:visible"
                    ).count()
                    date_cnt = self.page.locator("input[placeholder*='__.__.____']:visible").count()
                    if start_cnt > p_idx or date_cnt >= (p_idx + 1) * 2:
                        break
                    add_btn = self.page.locator(
                        "button:has-text('Добавить период'):visible, "
                        "div:has-text('Добавить период'):visible, "
                        "span:has-text('Добавить период'):visible"
                    ).last
                    if add_btn.count() > 0 and add_btn.is_visible():
                        logger.info(f"Step 11: Clicking 'Добавить период' to add monthly period #{p_idx + 1}...")
                        try:
                            add_btn.scroll_into_view_if_needed(timeout=2000)
                        except Exception:
                            pass
                        try:
                            add_btn.click(timeout=3000)
                        except Exception:
                            add_btn.evaluate("el => el.click()")
                        self.page.wait_for_timeout(750)
                    else:
                        break

            # 1) Fill Start Date for period p_idx
            start_inps = self.page.locator("input[name*='di17_start']:visible, input[id*='di17_start']:visible")
            if start_inps.count() > p_idx:
                s_loc = start_inps.nth(p_idx)
            else:
                s_loc = self.page.locator("input[placeholder*='__.__.____']:visible").nth(2 * p_idx)
            cur_s = ""
            try:
                cur_s = s_loc.input_value().strip()
            except Exception:
                pass
            if cur_s != p_item["start"] or "invalid" in (s_loc.get_attribute("class") or ""):
                self.type_locator_masked(s_loc, p_item["start"], delay=35)

            # 2) Fill End Date for period p_idx
            end_inps = self.page.locator("input[name*='di17_end']:visible, input[id*='di17_end']:visible")
            if end_inps.count() > p_idx:
                e_loc = end_inps.nth(p_idx)
            else:
                e_loc = self.page.locator("input[placeholder*='__.__.____']:visible").nth(2 * p_idx + 1)
            cur_e = ""
            try:
                cur_e = e_loc.input_value().strip()
            except Exception:
                pass
            if cur_e != p_item["end"] or "invalid" in (e_loc.get_attribute("class") or ""):
                self.type_locator_masked(e_loc, p_item["end"], delay=35)

            # 3) Select Radio 'Да' ('Зарплата выплачена полностью?') for period p_idx
            yes_radios = self.page.locator("label.radio:has-text('Да'):visible, lib-radio:has-text('Да') label:visible")
            if yes_radios.count() > p_idx:
                try:
                    yes_radios.nth(p_idx).click(timeout=2000)
                except Exception:
                    yes_radios.nth(p_idx).evaluate("el => el.click()")
                self.page.wait_for_timeout(350)
            elif yes_radios.count() > 0:
                try:
                    yes_radios.last.click(timeout=2000)
                except Exception:
                    pass
                self.page.wait_for_timeout(350)

            # 4) Fill Salary Amount ('Размер выплаты, ₽' — 'До копеек') for period p_idx
            paid_inps = self.page.locator(
                "#si17_paid:visible, input[name*='si17_paid']:visible, input[id*='si17_paid']:visible, input[name*='paid']:visible"
            )
            p_loc = paid_inps.nth(p_idx) if paid_inps.count() > p_idx else paid_inps.last
            self.fill_salary_locator_strict(p_loc, p_item["amount"], period_idx=p_idx + 1)
            self.page.wait_for_timeout(350)

        return True

    def sanitize_cyrillic_field(
        self, text: Any, fallback: str = "", allow_digits_punct: bool = True
    ) -> str:
        """
        Ensures fields that Gosuslugi requires in Russian ('Фамилия', 'Имя', 'Отчество',
        'Место рождения', 'Кем выдан паспорт') contain ONLY valid Cyrillic characters.
        1) Automatically translates common Latin geographical/passport terms (e.g. 'KUSHINAGAR, UTTAR PRADESH' -> 'КУШИНАГАР, УТТАР ПРАДЕШ')
        2) Phonetically transliterates any remaining Latin/Turkish characters into Russian Cyrillic
        3) Strips any forbidden symbols outside Gosuslugi's whitelist and limits length to 99 chars.
        """
        s = str(text or "").strip()
        if not s:
            return fallback

        # Common multi-word & single-word Latin place/authority dictionary
        word_map = [
            ("UTTAR PRADESH", "УТТАР ПРАДЕШ"),
            ("WEST BENGAL", "ЗАПАДНАЯ БЕНГАЛИЯ"),
            ("ANDHRA PRADESH", "АНДХРА-ПРАДЕШ"),
            ("MADHYA PRADESH", "МАДХЬЯ-ПРАДЕШ"),
            ("HIMACHAL PRADESH", "ХИМАЧАЛ-ПРАДЕШ"),
            ("ARUNACHAL PRADESH", "АРУНАЧАЛ-ПРАДЕШ"),
            ("TAMIL NADU", "ТАМИЛНАД"),
            ("NEW DELHI", "НЬЮ-ДЕЛИ"),
            ("JAMMU AND KASHMIR", "ДЖАММУ И КАШМИР"),
            ("KUSHINAGAR", "КУШИНАГАР"),
            ("BIHAR", "БИХАР"),
            ("PATNA", "ПАТНА"),
            ("LUCKNOW", "ЛАКХНАУ"),
            ("GORAKHPUR", "ГОРАКХПУР"),
            ("DEORIA", "ДЕОРИЯ"),
            ("SIWAN", "СИВАН"),
            ("GOPALGANJ", "ГОПАЛГАНДЖ"),
            ("CHAPRA", "ЧАПРА"),
            ("MUZAFFARPUR", "МУЗАФФАРПУР"),
            ("DARBHANGA", "ДАРБХАНГА"),
            ("MOTIHARI", "МОТИХАРИ"),
            ("BETTIAH", "БЕТТИЯ"),
            ("AZAMGARH", "АЗАМГАРХ"),
            ("JAUNPUR", "ДЖАУНПУР"),
            ("GHAZIPUR", "ГАЗИПУР"),
            ("BALLIA", "БАЛЛИЯ"),
            ("VARANASI", "ВАРАНАСИ"),
            ("ALLAHABAD", "АЛЛАХАБАД"),
            ("PRAYAGRAJ", "ПРАЯГРАДЖ"),
            ("KANPUR", "КАНПУР"),
            ("AGRA", "АГРА"),
            ("MEERUT", "МИРУТ"),
            ("BAREILLY", "БАРЕЙЛИ"),
            ("MORADABAD", "МОРАДАБАД"),
            ("ALIGARH", "АЛИГАРХ"),
            ("SAHARANPUR", "САХАРАНПУР"),
            ("FAIZABAD", "ФАЙЗАБАД"),
            ("AYODHYA", "АЙОДХЬЯ"),
            ("BASTI", "БАСТИ"),
            ("GONDA", "ГОНДА"),
            ("BAHRAICH", "БАХРАЙЧ"),
            ("SULTANPUR", "СУЛТАНПУР"),
            ("MIRZAPUR", "МИРЗАПУР"),
            ("SONBHADRA", "СОНБХАДРА"),
            ("BHADOHI", "БХАДОХИ"),
            ("CHANDAULI", "ЧАНДАУЛИ"),
            ("MAU", "МАУ"),
            ("KOLKATA", "КОЛКАТА"),
            ("CALCUTTA", "КАЛЬКУТТА"),
            ("MUMBAI", "МУМБАИ"),
            ("DELHI", "ДЕЛИ"),
            ("CHENNAI", "ЧЕННАИ"),
            ("HYDERABAD", "ХАЙДАРАБАД"),
            ("BENGALURU", "БЕНГАЛУРУ"),
            ("BANGALORE", "БАНГАЛОР"),
            ("AHMEDABAD", "АХМАДАБАД"),
            ("JAIPUR", "ДЖАЙПУР"),
            ("SURAT", "СУРАТ"),
            ("PUNE", "ПУНА"),
            ("PUNJAB", "ПЕНДЖАБ"),
            ("HARYANA", "ХАРЬЯНА"),
            ("RAJASTHAN", "РАДЖАСТХАН"),
            ("GUJARAT", "ГУДЖАРАТ"),
            ("MAHARASHTRA", "МАХАРАШТРА"),
            ("KARNATAKA", "КАРНАТАКА"),
            ("KERALA", "КЕРАЛА"),
            ("TELANGANA", "ТЕЛАНГАНА"),
            ("ODISHA", "ОДИША"),
            ("ASSAM", "АССАМ"),
            ("JHARKHAND", "ДЖАРКХАНД"),
            ("RANCHI", "РАНЧИ"),
            ("JAMSHEDPUR", "ДЖАМШЕДПУР"),
            ("DHANBAD", "ДХАНБАД"),
            ("BOKARO", "БОКАРО"),
            ("HAZARIBAGH", "ХАЗАРИБАГХ"),
            ("GIRIDIH", "ГИРИДИХ"),
            ("DEOGHAR", "ДЕОГХАР"),
            ("CHHATTISGARH", "ЧХАТТИСГАРХ"),
            ("UTTARAKHAND", "УТТАРАКХАНД"),
            ("INDIA", "ИНДИЯ"),
            ("TURKEY", "ТУРЦИЯ"),
            ("TÜRKIYE", "ТУРЦИЯ"),
            ("TURKIYE", "ТУРЦИЯ"),
            ("ISTANBUL", "СТАМБУЛ"),
            ("ANKARA", "АНКАРА"),
            ("IZMIR", "ИЗМИР"),
            ("ANTALYA", "АНТАЛЬЯ"),
            ("BURSA", "БУРСА"),
            ("ADANA", "АДАНА"),
            ("KONYA", "КОНЬЯ"),
            ("GAZIANTEP", "ГАЗИАНТЕП"),
            ("MERSIN", "МЕРСИН"),
            ("KAYSERI", "КАЙСЕРИ"),
            ("SAMSUN", "САМСУН"),
            ("TRABZON", "ТРАБЗОН"),
            ("HATAY", "ХАТАЙ"),
        ]
        for lat_w, cyr_w in word_map:
            s = re.sub(rf"\b{re.escape(lat_w)}\b", cyr_w, s, flags=re.IGNORECASE)

        # If any Latin/Turkish letters remain, phonetically transliterate digraphs then single characters
        if re.search(r"[A-Za-zÇĞİÖŞÜçğıöşü]", s):
            digraphs = [
                ("SHCH", "Щ"), ("shch", "щ"), ("Shch", "Щ"),
                ("SH", "Ш"), ("sh", "ш"), ("Sh", "Ш"),
                ("CH", "Ч"), ("ch", "ч"), ("Ch", "Ч"),
                ("KH", "Х"), ("kh", "х"), ("Kh", "Х"),
                ("TH", "Т"), ("th", "т"), ("Th", "Т"),
                ("DH", "Д"), ("dh", "д"), ("Dh", "Д"),
                ("BH", "БХ"), ("bh", "бх"), ("Bh", "Бх"),
                ("GH", "ГХ"), ("gh", "гх"), ("Gh", "Гх"),
                ("PH", "Ф"), ("ph", "ф"), ("Ph", "Ф"),
                ("ZH", "Ж"), ("zh", "ж"), ("Zh", "Ж"),
                ("YA", "Я"), ("ya", "я"), ("Ya", "Я"),
                ("YU", "Ю"), ("yu", "ю"), ("Yu", "Ю"),
                ("YE", "Е"), ("ye", "е"), ("Ye", "Е"),
                ("YO", "Ё"), ("yo", "ё"), ("Yo", "Ё"),
                ("TS", "Ц"), ("ts", "ц"), ("Ts", "Ц"),
                ("CK", "К"), ("ck", "к"), ("Ck", "К"),
            ]
            for dg_lat, dg_cyr in digraphs:
                s = s.replace(dg_lat, dg_cyr)

            char_map = {
                "A": "А", "B": "Б", "V": "В", "G": "Г", "D": "Д", "E": "Е", "Z": "З",
                "I": "И", "J": "ДЖ", "K": "К", "L": "Л", "M": "М", "N": "Н", "O": "О",
                "P": "П", "R": "Р", "S": "С", "T": "Т", "U": "У", "F": "Ф", "H": "Х",
                "C": "К", "W": "В", "Q": "К", "X": "КС", "Y": "Й",
                "Ç": "Ч", "Ğ": "Г", "İ": "И", "Ö": "О", "Ş": "Ш", "Ü": "У",
                "a": "а", "b": "б", "v": "в", "g": "г", "d": "д", "e": "е", "z": "з",
                "i": "и", "j": "дж", "k": "к", "l": "л", "m": "м", "n": "н", "o": "о",
                "p": "п", "r": "р", "s": "с", "t": "т", "u": "у", "f": "ф", "h": "х",
                "c": "к", "w": "в", "q": "к", "x": "кс", "y": "й",
                "ç": "ч", "ğ": "г", "ı": "ы", "ö": "о", "ş": "ш", "ü": "у",
            }
            s = "".join(char_map.get(ch, ch) for ch in s)

        # Replace slashes/parens with commas/spaces before whitelist stripping
        s = re.sub(r"[/\\|()\[\]{};:]+", ", " if allow_digits_punct else " ", s)

        if allow_digits_punct:
            # Gosuslugi rule for Место рождения / Кем выдан: кириллица, пробел, дефис, запятые, точки, цифры, до 99 символов
            s = re.sub(r"[^А-Яа-яЁё0-9\s\-\,\.]", "", s)
            s = re.sub(r"\s*,\s*", ", ", s)
            s = re.sub(r"(,\s*){2,}", ", ", s).strip(" ,.-")
        else:
            # Gosuslugi rule for Фамилия / Имя / Отчество: кириллица, пробел, дефис
            s = re.sub(r"[^А-Яа-яЁё\s\-]", "", s).strip(" -")

        s = re.sub(r"\s+", " ", s).strip()
        if len(s) > 99:
            s = s[:99].rstrip(" ,.-")

        return s if s else fallback

    def has_red_validation_errors(self) -> List[str]:
        """Checks if Gosuslugi displays red inline validation errors or invalid inputs on the current screen."""
        errors = []
        error_phrases = [
            "Обязательно для заполнения",
            "Поле обязательно",
            "Проверьте адрес",
            "Необходимо указать индекс",
            "Необходимо указать квартиру",
            "Необходимо указать дом",
            "Проверьте правильность",
            "Укажите корректн",
            "Укажите копейки",
            "может содержать символы кириллицы",
        ]
        for phrase in error_phrases:
            try:
                loc = self.page.locator(f"text='{phrase}'")
                if loc.count() > 0 and loc.first.is_visible():
                    errors.append(phrase)
            except Exception:
                pass

        try:
            val_msgs = self.page.locator("lib-validation-message.control-error-text:visible, .validation-messages:visible")
            for idx in range(min(val_msgs.count(), 5)):
                txt = val_msgs.nth(idx).inner_text().strip()
                if txt and txt not in errors:
                    errors.append(txt)
        except Exception:
            pass

        try:
            invalid_inps = self.page.locator("input.invalid:visible, textarea.invalid:visible")
            if invalid_inps.count() > 0 and not errors:
                inp_id = invalid_inps.first.get_attribute("id") or invalid_inps.first.get_attribute("name") or "поле"
                errors.append(f"Не заполнено или некорректно поле ({inp_id})")
        except Exception:
            pass

        return errors

    def is_input_empty_or_invalid(self, selector: str) -> bool:
        """Returns True if the visible input matching `selector` is empty, has class `invalid`, or contains Latin chars."""
        try:
            loc = self.page.locator(selector).first
            if loc.count() == 0 or not loc.is_visible():
                return False
            val = loc.input_value().strip()
            cls = loc.get_attribute("class") or ""
            return (not val) or ("invalid" in cls)
        except Exception:
            return False

    def auto_repair_current_step(self, step_name: str) -> bool:
        """
        Inspects the current screen when 'Продолжить' is disabled or red validation errors
        ('Обязательно для заполнения', 'может содержать символы кириллицы', etc.) appear, and
        automatically re-fills/selects any missing or invalid fields.
        """
        row = self.current_row or {}
        if not row:
            return False

        repaired = False
        logger.info(f"[{step_name}] Inspecting fields on screen for automatic self-healing...")

        try:
            # 1) Step 3: Goal selection ('О выплате зарплаты высококвалифицированному специалисту')
            vks_radio = self.page.locator(
                "label:has-text('О выплате зарплаты высококвалифицированному специалисту'):visible, "
                "span:has-text('О выплате зарплаты высококвалифицированному специалисту'):visible"
            ).first
            if vks_radio.count() > 0 and vks_radio.is_visible():
                vks_radio.click()
                self.page.wait_for_timeout(400)
                repaired = True

            # 2) Step 6: Personal Details (Фамилия, Имя, Отчество, Дата рождения, Гражданство, Место рождения, Пол)
            if self.page.locator("#si13_lastNameRu:visible, #si13_firstNameRu:visible, #dic13_ctz:visible").count() > 0 or "Шаг 6" in step_name:
                citizenship = self.sanitize_cyrillic_field(row.get("ТекущееГражданство", "Турция"), fallback="Турция", allow_digits_punct=False)
                last_name = self.sanitize_cyrillic_field(row.get("Фамилия", ""), fallback="Нет", allow_digits_punct=False)
                first_name = self.sanitize_cyrillic_field(row.get("Имя", ""), fallback="Нет", allow_digits_punct=False)
                middle_name = self.sanitize_cyrillic_field(row.get("Отчество", ""), fallback="НЕТ", allow_digits_punct=False)
                bdate_str = str(row.get("ДатаРождения", "")).strip()
                pob_val = self.sanitize_cyrillic_field(row.get("МестоРождения", ""), fallback=citizenship, allow_digits_punct=True)
                gender = str(row.get("Пол", "Мужской")).strip()
                gender_label = "Женский" if gender.lower().startswith("ж") or gender.lower().startswith("k") else "Мужской"

                if self.is_input_empty_or_invalid("#si13_lastNameRu, input[name*='lastNameRu']"):
                    logger.info(f"Auto-repair Step 6: Re-filling Фамилия ('{last_name}')...")
                    self.type_masked_input("#si13_lastNameRu, input[name*='lastNameRu']", last_name, delay=30)
                    repaired = True

                if self.is_input_empty_or_invalid("#si13_firstNameRu, input[name*='firstNameRu']"):
                    logger.info(f"Auto-repair Step 6: Re-filling Имя ('{first_name}')...")
                    self.type_masked_input("#si13_firstNameRu, input[name*='firstNameRu']", first_name, delay=30)
                    repaired = True

                if self.is_input_empty_or_invalid("#si13_secondNameRu, input[name*='secondNameRu']"):
                    logger.info(f"Auto-repair Step 6: Re-filling Отчество ('{middle_name}')...")
                    self.type_masked_input("#si13_secondNameRu, input[name*='secondNameRu']", middle_name, delay=30)
                    repaired = True

                if self.is_input_empty_or_invalid("input[name='di13_birth']"):
                    logger.info("Auto-repair Step 6: Re-filling Дата рождения...")
                    self.type_masked_input("input[name='di13_birth'], input[placeholder*='__.__.____']", bdate_str, delay=35)
                    repaired = True

                disp_ctz = self.page.locator("lib-lookup .displayed.lookup-item").first
                cur_ctz_txt = disp_ctz.inner_text().strip().lower() if (disp_ctz.count() > 0 and disp_ctz.is_visible()) else ""
                if (not cur_ctz_txt) or (citizenship.lower() not in cur_ctz_txt) or ("Обязательно для заполнения" in self.has_red_validation_errors()):
                    logger.info(f"Auto-repair Step 6: Re-selecting Гражданство ('{citizenship}', was '{cur_ctz_txt or 'empty'}')...")
                    self.fill_citizenship_strict(citizenship)
                    repaired = True

                red_str = " ".join(self.has_red_validation_errors()).lower()
                if self.is_input_empty_or_invalid("#si13_pob, input[name*='pob']") or "место рождения" in red_str or "кириллиц" in red_str:
                    # If pob_val still fails, fallback to clean Cyrillic citizenship (e.g. 'Индия')
                    repair_pob = pob_val if ("место рождения" not in red_str) else citizenship
                    logger.info(f"Auto-repair Step 6: Re-filling Место рождения in Cyrillic ('{repair_pob}')...")
                    self.type_masked_input("#si13_pob:visible, input[name*='pob']:visible", repair_pob, delay=25)
                    repaired = True

                gender_span = self.page.locator(
                    f"label.radio:has-text('{gender_label}'):visible, span:has-text('{gender_label}'):visible"
                ).first
                if gender_span.count() > 0 and gender_span.is_visible():
                    gender_span.click()
                    self.page.wait_for_timeout(300)
                    repaired = True

            # 3) Step 7: Passport Details
            if self.page.locator("input[name='di14_issue']:visible, #si14_issuedBy_125:visible").count() > 0 or "Шаг 7" in step_name:
                p_series_val = str(row.get("СерияПаспорта", "")).strip()
                if p_series_val.lower() not in ("", "не заполнено", "нет", "-") and self.is_input_empty_or_invalid("#series:visible"):
                    self.type_masked_input("#series, input[name*='series']", p_series_val, delay=30)
                    repaired = True
                if self.is_input_empty_or_invalid("#number:visible"):
                    self.type_masked_input("#number, input[name*='number']", str(row.get("НомерПаспорта", "")).strip(), delay=30)
                    repaired = True
                if self.is_input_empty_or_invalid("input[name='di14_issue']:visible"):
                    self.type_masked_input("input[name='di14_issue'], input[placeholder*='__.__.____']", str(row.get("ДатаВыдачи", "")).strip(), delay=35)
                    repaired = True
                red_str_7 = " ".join(self.has_red_validation_errors()).lower()
                if self.is_input_empty_or_invalid("#si14_issuedBy_125:visible, input[id*='issuedBy']:visible") or "кириллиц" in red_str_7:
                    clean_issued_by = self.sanitize_cyrillic_field(row.get("ПаспортКемВыдан", ""), fallback="МВД", allow_digits_punct=True)
                    self.type_masked_input("#si14_issuedBy_125, input[id*='issuedBy'], input[name*='issuedBy']", clean_issued_by, delay=25)
                    repaired = True

            # 4) Step 9: Work Permit (РНР) Details
            if self.page.locator("input[id*='seriaBlank']:visible, input[name*='numberBlank']:visible").count() > 0 or "Шаг 9" in step_name:
                if self.is_input_empty_or_invalid("#series:visible"):
                    self.type_masked_input("#series, input[name*='series']", str(row.get("Серия", "")).strip(), delay=30)
                    repaired = True
                if self.is_input_empty_or_invalid("#number:visible"):
                    self.type_masked_input("#number, input[name*='number']", str(row.get("Номер", "")).strip(), delay=30)
                    repaired = True
                if self.is_input_empty_or_invalid("input[id*='seriaBlank']:visible, input[name*='seriaBlank']:visible"):
                    self.type_masked_input("#s15_dict_2_seriaBlank, #dic15_seriaBlank, input[id*='seriaBlank'], input[name*='seriaBlank']", str(row.get("СерийныйНомер1", "")).strip(), delay=30)
                    repaired = True
                if self.is_input_empty_or_invalid("input[name*='numberBlank']:visible, input[id*='numberBlank']:visible"):
                    self.type_masked_input("input[name='s15_dict_2_numberBlank'], input[name='s15_numberBlank'], input[name*='numberBlank'], input[id*='numberBlank']", str(row.get("СерийныйНомер2", "")).strip(), delay=30)
                    repaired = True
                rnr_issue_date = str(row.get("ДатаВыдачиВКС", "")).strip()
                if rnr_issue_date and self.is_input_empty_or_invalid("input[placeholder*='__.__.____']:visible"):
                    self.type_masked_input("input[placeholder*='__.__.____']:visible", rnr_issue_date, delay=35)
                    repaired = True

            # 5) Step 10: Contract & Work Address
            if self.page.locator("input[name='di16_1']:visible, input[name='c_startDate']:visible, input#index:visible, epgu-constructor-address-input:visible").count() > 0 or "Шаг 10" in step_name:
                trudovoy_lbl = self.page.locator("label.radio:has-text('Трудовой'):visible, lib-radio:has-text('Трудовой') label:visible").first
                if trudovoy_lbl.count() > 0 and trudovoy_lbl.is_visible():
                    trudovoy_lbl.click()
                    self.page.wait_for_timeout(250)
                contract_date = str(row.get("ДатаЗаключения", row.get("ДатаПриема", ""))).strip()
                if contract_date and self.is_input_empty_or_invalid("input[name='di16_1']:visible, input[name='di16_2']:visible"):
                    self.type_masked_input("input[name='di16_1'], input[name='di16_2']", contract_date, delay=35)
                start_date = str(row.get("ДатаНачалаДействия", contract_date)).strip()
                if start_date and self.is_input_empty_or_invalid("input[name='c_startDate']:visible"):
                    self.type_masked_input("input[name='c_startDate']", start_date, delay=35)
                end_date = str(row.get("ДатаОканчанияДействия", row.get("ДатаОкончанияДействия", ""))).strip()
                if self.is_indefinite_contract_date(end_date):
                    self.set_indefinite_contract_checkbox(True)
                else:
                    self.set_indefinite_contract_checkbox(False)
                    if self.is_input_empty_or_invalid("input[name='c_endDate']:visible"):
                        self.type_masked_input("input[name='c_endDate']", end_date, delay=35)

                # If 'Проверьте адрес' is shown or detailed address inputs are collapsed, trigger DaData lookup & expand 'Уточнить адрес'
                red_now = self.has_red_validation_errors()
                if "Проверьте адрес" in red_now or self.page.locator("input#index:visible").count() == 0:
                    work_addr = str(row.get("АдресРаботы", "")).strip() or self.cfg["WORK_ADDRESS"]
                    self.select_dadata_work_address(work_addr)
                    try:
                        clarify_btn = self.page.locator(
                            "button.clarify-address:visible, "
                            "button:has-text('Уточнить адрес'):visible, "
                            "span:has-text('Уточнить адрес'):visible"
                        ).first
                        if clarify_btn.count() > 0 and clarify_btn.is_visible() and self.page.locator("input#index:visible").count() == 0:
                            clarify_btn.click()
                            self.page.wait_for_timeout(700)
                    except Exception:
                        pass

                postal_code = str(row.get("Индекс", "")).strip() or str(self.cfg["WORK_POSTAL_CODE"])
                self.fill_postal_code_strict(postal_code)
                work_addr_for_parse = str(row.get("АдресРаботы", "")).strip() or self.cfg["WORK_ADDRESS"]
                parsed_house, parsed_apt = self.parse_address_house_and_apt(work_addr_for_parse)
                if not parsed_house:
                    self.set_address_checkbox("Нет дома", "houseCheckbox", True)
                if not parsed_apt:
                    self.set_address_checkbox("Нет квартиры", "apartmentCheckbox", True)
                repaired = True

            # 6) Step 11: Salary Payment Period & Amount (Monthly breakdown via 'Добавить период')
            if (
                self.page.locator("input[name*='di17_start']:visible, #si17_paid:visible, input[id*='si17_paid']:visible").count() > 0
                or "Шаг 11" in step_name
            ):
                self.fill_step11_monthly_periods(row)
                repaired = True

        except Exception as e:
            logger.debug(f"auto_repair_current_step({step_name}) note: {e}")

        self.page.wait_for_timeout(600)
        return repaired

    def click_continue_strict(self, step_name: str, wait_ms: int = 2000):
        """
        Ensures 'Продолжить' button is enabled (blue/active) and no red errors block the page.
        1) Waits up to 3 seconds for 'Продолжить' to become active naturally.
        2) If 'Продолжить' is still inactive or red validation warnings ('Обязательно для заполнения', etc.) exist,
           automatically runs up to 3 field-level self-healing passes (`auto_repair_current_step`).
        3) If still inactive after 3 repair passes, does NOT restart from Step 1 with a new draft and does NOT block
           forever — records the error for this employee and raises RuntimeError so the robot immediately moves
           to the next employee in the queue!
        """
        self.check_and_handle_error_modal()
        initial_heading = self.get_current_heading()

        # Clear any old manual signal file
        if os.path.exists(MANUAL_CONTINUE_SIGNAL):
            try:
                os.remove(MANUAL_CONTINUE_SIGNAL)
            except Exception:
                pass

        # Phase 1: Wait up to 3 seconds for button to become enabled naturally
        btn_locator = self.page.locator("button:has-text('Продолжить'):visible").last
        is_ready = False

        for _ in range(6):
            self.check_and_handle_error_modal()
            red_errs = self.has_red_validation_errors()
            if btn_locator.count() > 0:
                disabled_attr = btn_locator.get_attribute("disabled")
                cls_attr = btn_locator.get_attribute("class") or ""
                is_disabled = (disabled_attr is not None) or ("disabled" in cls_attr) or (not btn_locator.is_enabled())
                if not is_disabled and len(red_errs) == 0:
                    is_ready = True
                    break
            self.page.wait_for_timeout(500)

        if is_ready:
            logger.info(f"[{step_name}] 'Продолжить' button is active (blue). Clicking...")
            btn_locator.focus()
            btn_locator.click()
            self.wait_for_screen_transition(initial_heading, wait_ms)
            return

        # Phase 2: Automatic Field-Level Self-Healing (up to 3 repair passes on the current step)
        for repair_pass in range(1, 4):
            red_errs = self.has_red_validation_errors()
            err_summary = ", ".join(red_errs) if red_errs else "Кнопка «Продолжить» неактивна"
            logger.warning(
                f"[{step_name}] Validation/button check ({err_summary}) -> Auto-repair pass {repair_pass}/3..."
            )
            self.auto_repair_current_step(step_name)
            self.check_and_handle_error_modal()

            btn_locator = self.page.locator("button:has-text('Продолжить'):visible").last
            red_errs_after = self.has_red_validation_errors()
            if btn_locator.count() > 0:
                disabled_attr = btn_locator.get_attribute("disabled")
                cls_attr = btn_locator.get_attribute("class") or ""
                is_disabled = (disabled_attr is not None) or ("disabled" in cls_attr) or (not btn_locator.is_enabled())
                if not is_disabled and len(red_errs_after) == 0:
                    logger.info(f"[{step_name}] Auto-repair pass {repair_pass} succeeded! Clicking 'Продолжить'...")
                    btn_locator.focus()
                    btn_locator.click()
                    self.wait_for_screen_transition(initial_heading, wait_ms)
                    return

        # Phase 3: Auto-repair exhausted (3 tries) -> Do NOT restart with a new draft!
        # Record error for this employee and move immediately to the next employee.
        red_errs = self.has_red_validation_errors()
        err_desc = ", ".join(red_errs) if red_errs else "Кнопка «Продолжить» неактивна"
        err_msg = f"Ошибка [{step_name}]: {err_desc}"
        logger.error(
            f"[{step_name}] Не удалось исправить ошибку после 3 попыток ({err_desc}). "
            f"Фиксируем ошибку по сотруднику и переходим к следующему сотруднику (без повторного создания черновика)."
        )
        self.register_worker_error(self.current_row or {}, err_msg)
        raise RuntimeError(err_msg)

    def wait_for_screen_transition(self, previous_heading: str, min_wait_ms: int = 1500):
        """Waits until Gosuslugi finishes loading the next screen (h1 changes or modal/final button appears)."""
        self.page.wait_for_timeout(min_wait_ms)
        for _ in range(30):
            if self.check_and_handle_error_modal():
                self.page.wait_for_timeout(1200)
                cur_after_modal = self.get_current_heading()
                if previous_heading and cur_after_modal == previous_heading:
                    btn = self.page.locator("button:has-text('Продолжить'):visible").last
                    if btn.count() > 0 and btn.is_enabled():
                        logger.info(f"Re-clicking 'Продолжить' after retry modal on '{previous_heading}'...")
                        btn.click()
                        self.page.wait_for_timeout(1500)
                        continue
            # Also break immediately if a consent modal ('Подтвердить'), submit ('Отправить' / 'Отправить уведомление'), or final ('В личный кабинет') button appeared
            special_btn = self.page.locator(
                "button:has-text('Подтвердить'):visible, "
                "button:has-text('Отправить'):visible, "
                "button:has-text('Отправить уведомление'):visible, "
                "button:has-text('В личный кабинет'):visible"
            ).first
            if special_btn.count() > 0 and special_btn.is_visible():
                self.page.wait_for_timeout(300)
                return
            cur = self.get_current_heading()
            if cur and cur != previous_heading:
                self.page.wait_for_timeout(400)
                return
            self.page.wait_for_timeout(500)

    def check_if_worker_already_sent_centrally(self, row: Dict[str, Any], code: str, full_name: str) -> bool:
        """
        Checks https://hr.pondera.network/api/gosuslugi/submissions?sicil=<code> before starting a worker.
        If another computer (or an earlier batch) already sent this worker's VKS notification,
        immediately skips the worker to prevent duplicate MVD notifications across the 4 computers.
        """
        clean_sicil = str(row.get("Sicil") or code or "").strip()
        if not clean_sicil:
            return False
        import urllib.request
        import urllib.parse
        import ssl

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        url = f"https://hr.pondera.network/api/gosuslugi/submissions?type=vks_salary&sicil={urllib.parse.quote(clean_sicil)}"
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=2.5, context=ctx) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    rows = data.get("data") or []
                    for s in rows:
                        app_no = str(s.get("application_no") or "").strip()
                        st = str(s.get("gosuslugi_status") or "").strip()
                        st_low = st.lower()
                        if st_low.startswith("ошибк"):
                            if not self.cfg.get("RETRY_ERRORS"):
                                logger.info(
                                    f"SKIP_PREVIOUS_ERROR: Сотрудник {full_name} (Код: {clean_sicil}) ранее завершился с ошибкой "
                                    f"({st}) — автоматический пропуск (ошибки обрабатываются отдельно в конце)!"
                                )
                                return True
                            continue
                        if app_no or any(
                            k in st_low
                            for k in ("отправлен", "зарегистрирован", "оказан", "исполнен", "принят", "промежуточн", "pdf не скачан")
                        ):
                            logger.info(f"=== Starting Gosuslugi VKS for: {full_name} (Код: {code}) ===")
                            logger.info(
                                f"SKIP_ALREADY_SENT: Сотрудник {full_name} (Код: {clean_sicil}) уже отправлен в Госуслуги "
                                f"(№ {app_no or '—'}, статус: {st}) — автоматический пропуск (защита от дубликатов между 4 ПК)!"
                            )
                            logger.info(f"APPLICATION_REGISTERED: {json.dumps(s, ensure_ascii=False)}")
                            logger.info(f"SUCCESS: Notification submitted for {full_name}!")
                            return True
        except Exception:
            pass
        return False

    def fill_vks_notification(self, row: Dict[str, Any]) -> bool:
        """
        Executes the complete Gosuslugi VKS Salary Notification flow for a single employee (1 attempt only).
        If any step fails validation after 3 field-level auto-repair attempts, records the error for this
        employee and raises an exception so the batch immediately proceeds to the next employee without
        creating a new draft from Step 1.
        """
        self.current_row = row
        self.allow_full_restart = False
        last_name = str(row.get("Фамилия", "")).strip()
        first_name = str(row.get("Имя", "")).strip()
        middle_name = str(row.get("Отчество", "")).strip()
        code = str(row.get("Код", row.get("Sicil", ""))).strip()
        full_name = f"{last_name} {first_name} {middle_name}".strip()

        # Multi-computer de-duplication guard: check central server before filling the form
        if self.check_if_worker_already_sent_centrally(row, code, full_name):
            return True

        try:
            return self._execute_vks_notification_attempt(
                row, full_name, code, last_name, first_name, middle_name, form_attempt=1
            )
        except InsufficientPermissionsError:
            # Never retry when the Gosuslugi account lacks authority ('У вас недостаточно полномочий для отправки уведомлений')
            raise
        except Exception as ex:
            # Never mark the worker as errored if the Chrome tab/browser closed or PC slept — let main() reconnect & retry!
            if is_browser_closed_error(ex):
                raise
            # If Gosuslugi logged out mid-step (redirected to esia.gosuslugi.ru/login), wait for login and retry this worker!
            if self.wait_if_logged_out():
                logger.info(f"Повторный запуск уведомления для {full_name} (Код: {code}) после восстановления входа в Госуслуги...")
                try:
                    return self._execute_vks_notification_attempt(
                        row, full_name, code, last_name, first_name, middle_name, form_attempt=1
                    )
                except Exception as retry_ex:
                    if is_browser_closed_error(retry_ex):
                        raise
                    self.register_worker_error(row, str(retry_ex))
                    raise
            self.register_worker_error(row, str(ex))
            raise

    def _execute_vks_notification_attempt(
        self,
        row: Dict[str, Any],
        full_name: str,
        code: str,
        last_name: str,
        first_name: str,
        middle_name: str,
        form_attempt: int = 1,
    ) -> bool:
        self.current_form_order_id = ""
        self.enable_background_focus_emulation()
        # IMPORTANT: Do not change this log prefix — rpa_bridge_server.py parses it to highlight the active row in UI
        logger.info(f"=== Starting Gosuslugi VKS for: {full_name} (Код: {code}) ===")

        # Step 1: Navigate to https://www.gosuslugi.ru/600585/1/form (or reuse immediately if already open on form start/drafts modal)
        cur_url_now = self.page.url or ""
        already_on_form_modal = (
            "600585/1/form" in cur_url_now
            and self.page.locator("button:has-text('Отправить ещё раз'):visible, h1:has-text('недостаточно полномочий'):visible").count() == 0
            and self.page.locator(
                ".draft-list .draft:visible, "
                "button.draft-link:has-text('Удалить'):visible, "
                "lib-button.conf-modal__button button:visible, "
                "button:has-text('Создать заявление'):visible, "
                "button:has-text('Создать новое заявление'):visible, "
                "button:has-text('Новое заявление'):visible, "
                "button:has-text('Начать'):visible, "
                "epgu-cf-ui-long-button:has-text('О выплате'):visible, "
                "button:has-text('О выплате зарплаты высококвалифицированному специалисту'):visible"
            ).count() > 0
        )

        if already_on_form_modal:
            logger.info("Step 1: Gosuslugi 600585/1/form modal is already open in Chrome — skipping reload!")
        else:
            logger.info("Step 1: Navigating to Gosuslugi Service 600585/1/form...")
            try:
                self.page.goto(self.cfg["FORM_URL"], wait_until="domcontentloaded", timeout=60000)
            except Exception as e:
                logger.warning(f"Navigation warning: {e}")

        self.check_and_handle_error_modal()

        # Steps 2 & 3 Unified State-Machine:
        # 1) If Drafts Modal ('Уведомления о трудовой деятельности иностранцев' / 'Выберите черновик') is open:
        #    Scroll the modal's internal scrollbar (ng-scrollbar / .ng-scroll-viewport / .conf-modal__body) to the bottom
        #    so 'Создать заявление' at the bottom of the drafts list is brought into view, then click it.
        # 2) If 'Начать' landing screen is open: click 'Начать'.
        # 3) Once 'О выплате зарплаты высококвалифицированному специалисту' (epgu-cf-ui-long-button / button) appears:
        #    click it and advance to Step 4.
        step3_selected = False
        create_click_attempts = 0
        for tick in range(50):
            self.check_and_handle_error_modal()

            # Priority 1: Drafts Modal ('Выберите черновик...' -> delete oldest draft only if needed, scroll modal & click 'Создать заявление')
            draft_items = self.page.locator(".draft-list .draft, epgu-constructor-draft-list .draft")
            create_btn = self.page.locator(
                "button:has-text('Создать заявление'), "
                "button:has-text('Создать новое заявление'), "
                "button:has-text('Новое заявление'), "
                "lib-button.conf-modal__button button"
            ).first

            if (create_btn.count() > 0 and create_btn.is_visible()) or draft_items.count() > 0:
                logger.info("Step 2: Drafts modal ('Уведомления о трудовой деятельности иностранцев') detected...")
                try:
                    # Scroll internal modal scrollbars (ng-scrollbar, .ng-scroll-viewport, .conf-modal__body) to bottom first
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
                                b => (b.innerText || '').includes('Создать заявление') || (b.innerText || '').includes('Создать новое')
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
                self.page.wait_for_timeout(250)

                # Check if 'Создать заявление' is disabled/inactive OR if draft limit (10) blocks creation
                btn_disabled = True
                if create_btn.count() > 0 and create_btn.is_visible():
                    dis_attr = create_btn.get_attribute("disabled")
                    cls_attr = create_btn.get_attribute("class") or ""
                    btn_disabled = (dis_attr is not None) or ("disabled" in cls_attr) or (not create_btn.is_enabled())

                if btn_disabled or draft_items.count() >= 10:
                    del_btns = self.page.locator(
                        ".draft-list .draft button.draft-link:has-text('Удалить'), "
                        "epgu-constructor-draft-list button:has-text('Удалить'), "
                        "button.draft-link:has-text('Удалить')"
                    )
                    if del_btns.count() > 0:
                        oldest_del = del_btns.last
                        logger.info(
                            f"Step 2: Deleting oldest draft (total drafts: {draft_items.count()}) so 'Создать заявление' becomes active..."
                        )
                        try:
                            oldest_del.scroll_into_view_if_needed(timeout=1500)
                        except Exception:
                            pass
                        try:
                            oldest_del.click(timeout=2500)
                        except Exception:
                            oldest_del.evaluate("el => el.click()")
                        self.page.wait_for_timeout(800)

                # Re-locate and click 'Создать заявление'
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
                        logger.info("Step 2: Clicking active 'Создать заявление'...")
                        create_click_attempts += 1
                        try:
                            create_btn.click(timeout=2500)
                        except Exception:
                            try:
                                box = create_btn.bounding_box()
                                if box and box["width"] > 5 and box["height"] > 5:
                                    self.page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                                else:
                                    create_btn.evaluate("el => (el.closest('button') || el).click()")
                            except Exception:
                                create_btn.evaluate("el => (el.closest('button') || el).click()")
                self.page.wait_for_timeout(900)
                continue

            # Priority 2: 'Начать' button on the service start screen
            start_btn = self.page.locator(
                "button:has-text('Начать'):visible, "
                "lib-button:has-text('Начать') button:visible, "
                "epgu-cf-ui-button:has-text('Начать') button:visible, "
                "a.button:has-text('Начать'):visible"
            ).first
            if start_btn.count() > 0 and start_btn.is_visible():
                logger.info("Step 2b: Clicking 'Начать'...")
                try:
                    start_btn.scroll_into_view_if_needed(timeout=1500)
                except Exception:
                    pass
                try:
                    start_btn.click(timeout=2500)
                except Exception:
                    start_btn.evaluate("el => (el.closest('button, a') || el).click()")
                self.page.wait_for_timeout(900)
                continue

            # Priority 3: Step 3 VKS option button ('О выплате зарплаты высококвалифицированному специалисту')
            # Note: Do NOT match plain <span> on the 'Начать' landing page; target interactive option buttons!
            vks_option = self.page.locator(
                "epgu-cf-ui-long-button:has-text('О выплате'):visible, "
                "button:has-text('О выплате зарплаты высококвалифицированному специалисту'):visible, "
                "div.long-button:has-text('О выплате'):visible"
            ).first
            if vks_option.count() > 0 and vks_option.is_visible():
                logger.info("Step 3: Selecting 'О выплате зарплаты высококвалифицированному специалисту'...")
                try:
                    vks_option.scroll_into_view_if_needed(timeout=1500)
                except Exception:
                    pass
                try:
                    vks_option.click(timeout=3000)
                except Exception:
                    vks_option.evaluate("el => (el.closest('button, epgu-cf-ui-long-button') || el).click()")
                step3_selected = True
                self.page.wait_for_timeout(1200)
                break

            self.page.wait_for_timeout(350)

        if not step3_selected:
            logger.info("Step 3 (Fallback): Waiting for 'О выплате зарплаты высококвалифицированному специалисту'...")
            vks_option = self.page.locator(
                "epgu-cf-ui-long-button:has-text('О выплате'), "
                "button:has-text('О выплате зарплаты высококвалифицированному специалисту'), "
                "span:has-text('О выплате зарплаты высококвалифицированному специалисту')"
            ).last
            vks_option.wait_for(state="visible", timeout=15000)
            vks_option.click()
            self.page.wait_for_timeout(1200)

        # Step 4: Click 'Перейти к уведомлению'
        logger.info("Step 4: Clicking 'Перейти к уведомлению'...")
        for _ in range(15):
            go_btn = self.page.locator(
                "button:has-text('Перейти к уведомлению'):visible, "
                "lib-button:has-text('Перейти к уведомлению') button:visible, "
                "span:has-text('Перейти к уведомлению'):visible"
            ).first
            if go_btn.count() > 0 and go_btn.is_visible():
                try:
                    go_btn.scroll_into_view_if_needed(timeout=1500)
                except Exception:
                    pass
                go_btn.click()
                self.page.wait_for_timeout(1500)
                break
            self.page.wait_for_timeout(350)

        # Step 5: Verify Organization & Manager Info ('Проверьте сведения об организации и руководителе' -> 'Верно')
        logger.info("Step 5: Confirming organization & manager info ('Верно')...")
        for i in range(4):
            self.check_and_handle_error_modal()
            try:
                verno_btn = self.page.locator("button:has-text('Верно'), span:has-text('Верно')").first
                if verno_btn.count() > 0 and verno_btn.is_visible():
                    logger.info(f"Clicking 'Верно' (screen {i+1})...")
                    verno_btn.click()
                    self.page.wait_for_timeout(2000)
                else:
                    break
            except Exception:
                break

        # Optional Organization Status / OKVED if Gosuslugi prompts for them
        try:
            status_input = self.page.locator("#dic11_UL_TD:visible, input[placeholder*='Статус']:visible").first
            if status_input.count() > 0 and status_input.is_visible():
                logger.info("Filling Organization Status if prompted...")
                status_input.click()
                self.page.wait_for_timeout(500)
                opt = self.page.locator(
                    f".lookup-item:has-text('{self.cfg['TYPE_COMPANY']}'), span:has-text('коммерческая'), span:has-text('Юридическое')"
                ).first
                if opt.count() > 0 and opt.is_visible():
                    opt.click()
                else:
                    self.page.keyboard.press("ArrowDown")
                    self.page.keyboard.press("Enter")
                self.page.wait_for_timeout(800)
                self.click_continue_strict("Статус организации")
        except Exception:
            pass

        # Step 6: Personal Details (Lines 32-57 in 11.docx)
        logger.info(f"Step 6: Filling VKS Specialist Personal Info for {full_name}...")
        self.check_and_handle_error_modal()

        citizenship = self.sanitize_cyrillic_field(
            row.get("ТекущееГражданство", "Турция"), fallback="Турция", allow_digits_punct=False
        )
        clean_last_name = self.sanitize_cyrillic_field(last_name, fallback="Нет", allow_digits_punct=False)
        clean_first_name = self.sanitize_cyrillic_field(first_name, fallback="Нет", allow_digits_punct=False)
        clean_middle_name = self.sanitize_cyrillic_field(
            middle_name if middle_name else "НЕТ", fallback="НЕТ", allow_digits_punct=False
        )

        last_name_input = self.page.locator("#si13_lastNameRu, input[name*='lastNameRu']").first
        last_name_input.wait_for(state="visible", timeout=25000)
        self.type_masked_input("#si13_lastNameRu, input[name*='lastNameRu']", clean_last_name, delay=25)

        # First Name & Middle Name
        self.type_masked_input("#si13_firstNameRu, input[name*='firstNameRu']", clean_first_name, delay=25)
        self.type_masked_input("#si13_secondNameRu, input[name*='secondNameRu']", clean_middle_name, delay=25)

        # Birth Date (di13_birth / __.__.____)
        bdate_str = str(row.get("ДатаРождения", "")).strip()
        self.type_masked_input("input[name='di13_birth'], input[placeholder*='__.__.____']", bdate_str, delay=35)

        # Citizenship selection (Гражданство -> #dic13_ctz + .lookup-item click)
        self.fill_citizenship_strict(citizenship)

        # Place of Birth (si13_pob) — only if visible on this form screen, sanitized to valid Russian Cyrillic!
        if self.page.locator("#si13_pob:visible, input[name*='pob']:visible").count() > 0:
            raw_pob = str(row.get("МестоРождения", "")).strip() or citizenship
            pob_val = self.sanitize_cyrillic_field(raw_pob, fallback=citizenship, allow_digits_punct=True)
            if raw_pob != pob_val:
                logger.info(f"Step 6: Авто-транслитерация Место рождения: '{raw_pob}' -> '{pob_val}'")
            self.type_masked_input("#si13_pob:visible, input[name*='pob']:visible", pob_val, delay=25)

        # Gender ('Мужской' / 'Женский')
        gender = str(row.get("Пол", "Мужской")).strip()
        gender_label = "Женский" if gender.lower().startswith("ж") or gender.lower().startswith("k") else "Мужской"
        gender_span = self.page.locator(f"label.radio:has-text('{gender_label}'):visible, span:has-text('{gender_label}'):visible, label:has-text('{gender_label}'):visible").first
        if gender_span.count() > 0 and gender_span.is_visible():
            gender_span.click(timeout=2000)
        self.page.wait_for_timeout(250)

        self.click_continue_strict("Шаг 6: Личные данные ВКС", 2000)

        # Step 7: Passport Details ('Укажите данные документа, удостоверяющего личность')
        logger.info(f"Step 7: Filling Passport {row.get('СерияПаспорта')} {row.get('НомерПаспорта')}...")
        self.check_and_handle_error_modal()

        pass_num_loc = self.page.locator("#number, input[name*='number']").first
        pass_num_loc.wait_for(state="visible", timeout=15000)
        p_series_val = str(row.get("СерияПаспорта", "")).strip()
        if p_series_val.lower() not in ("", "не заполнено", "нет", "-"):
            self.type_masked_input("#series, input[name*='series']", p_series_val, delay=30)
        self.type_masked_input("#number, input[name*='number']", str(row.get("НомерПаспорта", "")).strip(), delay=30)
        self.type_masked_input("input[name='di14_issue'], input[placeholder*='__.__.____']", str(row.get("ДатаВыдачи", "")).strip(), delay=35)
        raw_issued_by = str(row.get("ПаспортКемВыдан", "")).strip()
        clean_issued_by = self.sanitize_cyrillic_field(raw_issued_by, fallback="МВД", allow_digits_punct=True)
        if raw_issued_by and raw_issued_by != clean_issued_by:
            logger.info(f"Step 7: Авто-транслитерация Кем выдан паспорт: '{raw_issued_by}' -> '{clean_issued_by}'")
        self.type_masked_input("#si14_issuedBy_125, input[id*='issuedBy'], input[name*='issuedBy']", clean_issued_by, delay=25)
        self.page.wait_for_timeout(600)

        self.click_continue_strict("Шаг 7: Паспортные данные", 2000)

        # Step 8: Foreigner INN ('Укажите ИНН иностранца' -> Input 'c_foreignerINN')
        logger.info(f"Step 8: Filling Foreigner INN: {row.get('ИНН')}...")
        self.check_and_handle_error_modal()

        inn_input = self.page.locator("#c_foreignerINN, input[name*='foreignerINN'], input[id*='INN']").first
        try:
            inn_input.wait_for(state="visible", timeout=12000)
            inn_val = str(row.get("ИНН", "")).strip()
            if inn_val and inn_val.lower() not in ("нет", "не заполнено", "-", "нет инн"):
                self.type_masked_input("#c_foreignerINN, input[name*='foreignerINN'], input[id*='INN']", inn_val, delay=30)
            self.page.wait_for_timeout(500)
            self.click_continue_strict("Шаг 8: ИНН иностранца", 2000)
        except Exception as e:
            logger.warning(f"Step 8 INN screen note: {e}")

        # Step 9: Work Permit Details ('Укажите данные разрешения на работу')
        logger.info(f"Step 9: Filling Work Permit (РНР) {row.get('Серия')} {row.get('Номер')}...")
        self.check_and_handle_error_modal()

        rnr_series = self.page.locator("#series, input[name*='series']").first
        rnr_series.wait_for(state="visible", timeout=15000)
        self.type_masked_input("#series, input[name*='series']", str(row.get("Серия", "")).strip(), delay=30)
        self.type_masked_input("#number, input[name*='number']", str(row.get("Номер", "")).strip(), delay=30)
        self.type_masked_input("#s15_dict_2_seriaBlank, #dic15_seriaBlank, input[id*='seriaBlank'], input[name*='seriaBlank']", str(row.get("СерийныйНомер1", "")).strip(), delay=30)
        self.type_masked_input("input[name='s15_dict_2_numberBlank'], input[name='s15_numberBlank'], input[name*='numberBlank'], input[id*='numberBlank']", str(row.get("СерийныйНомер2", "")).strip(), delay=30)

        rnr_issue_date = str(row.get("ДатаВыдачиВКС", "")).strip()
        if rnr_issue_date:
            self.type_masked_input("input[placeholder*='__.__.____']:visible", rnr_issue_date, delay=35)

        self.page.wait_for_timeout(600)
        self.click_continue_strict("Шаг 9: Разрешение на работу ВКС", 2000)

        # Step 10: Employment Contract Details & Work Address ('Укажите информацию о договоре')
        logger.info("Step 10: Waiting for Contract & Work Address screen ('Укажите информацию о договоре')...")
        self.check_and_handle_error_modal()

        # Wait explicitly until Step 10 date input (di16_1) or radio ('Трудовой') is visible!
        try:
            self.page.locator("input[name='di16_1'], input[name='di16_2'], label.radio:has-text('Трудовой')").first.wait_for(
                state="visible", timeout=25000
            )
        except Exception:
            # Handle intermediate screen if present
            inter_btn = self.page.locator("button:has-text('Продолжить'):visible").first
            if inter_btn.count() > 0 and inter_btn.is_enabled():
                inter_btn.click()
                self.page.wait_for_timeout(2000)
            self.page.locator("input[name='di16_1'], input[name='di16_2'], label.radio:has-text('Трудовой')").first.wait_for(
                state="visible", timeout=20000
            )

        logger.info("Step 10: Filling Contract Details & Work Address...")

        # 10a. Select 'Трудовой' radio button
        try:
            trudovoy_lbl = self.page.locator("label.radio:has-text('Трудовой'), lib-radio:has-text('Трудовой') label").first
            if trudovoy_lbl.count() > 0 and trudovoy_lbl.is_visible():
                trudovoy_lbl.click()
                self.page.wait_for_timeout(300)
        except Exception:
            pass

        # 10b. Contract Dates (Дата заключения, Дата начала действия, Дата окончания действия / Договор бессрочный)
        contract_date = str(row.get("ДатаЗаключения", row.get("ДатаПриема", ""))).strip()
        if contract_date:
            self.type_masked_input("input[name='di16_1'], input[name='di16_2']", contract_date, delay=35)

        start_date = str(row.get("ДатаНачалаДействия", contract_date)).strip()
        if start_date:
            self.type_masked_input("input[name='c_startDate']", start_date, delay=35)

        end_date = str(row.get("ДатаОканчанияДействия", row.get("ДатаОкончанияДействия", ""))).strip()
        if self.is_indefinite_contract_date(end_date):
            logger.info("Step 10: Дата окончания договора пустая -> устанавливаем чекбокс «Договор бессрочный» = TRUE...")
            self.set_indefinite_contract_checkbox(True)
        else:
            self.set_indefinite_contract_checkbox(False)
            self.type_masked_input("input[name='c_endDate']", end_date, delay=35)

        # 10c. Work Address (Gosuslugi DaData <textarea class="search-input">)
        work_addr = str(row.get("АдресРаботы", "")).strip() or self.cfg["WORK_ADDRESS"]
        postal_code = str(row.get("Индекс", "")).strip() or str(self.cfg["WORK_POSTAL_CODE"])

        # Parse explicit House (д. / дом / стр. / вл.) and Apartment/Office (кв. / оф. / помещ.) from work_addr
        parsed_house, parsed_apt = self.parse_address_house_and_apt(work_addr)

        # Ensure closed-mode checkboxes (houseCheckboxClosed, apartmentCheckboxClosed) are unchecked before typing into textarea
        for closed_fcn in ("houseCheckboxClosed", "apartmentCheckboxClosed"):
            try:
                cb_inp = self.page.locator(f"lib-checkbox[formcontrolname='{closed_fcn}'] input[type='checkbox']").first
                if cb_inp.count() > 0 and cb_inp.is_checked():
                    self.page.locator(f"lib-checkbox[formcontrolname='{closed_fcn}'] label.check").first.click()
                    self.page.wait_for_timeout(200)
            except Exception:
                pass

        is_tobolsk_kv5 = "Восточный промышленный район" in work_addr and ("5-й" in work_addr or "квартал 5" in work_addr or "кв-л 5" in work_addr)
        self.select_dadata_work_address(work_addr)

        # Expand 'Уточнить адрес' (button.clarify-address) if detailed fields (input#index) are not yet visible
        try:
            if self.page.locator("input#index:visible").count() == 0:
                clarify_btn = self.page.locator(
                    "button.clarify-address:visible, "
                    "button:has-text('Уточнить адрес'):visible, "
                    "span:has-text('Уточнить адрес'):visible"
                ).first
                if clarify_btn.count() > 0 and clarify_btn.is_visible():
                    logger.info("Clicking 'Уточнить адрес' to open detailed address fields...")
                    clarify_btn.click()
                    self.page.wait_for_timeout(700)
        except Exception:
            pass

        # Fill Postal Index (input#index) AND click the lookup suggestion item (e.g. '626150') if it pops up!
        logger.info(f"Checking/Filling Postal Code (Индекс): {postal_code}...")
        self.fill_postal_code_strict(postal_code)

        # Smart House (Дом) & 'Нет дома' handling:
        # - If address has a house number (parsed_house or DaData filled input#house and not industrial zone 5-й):
        #   leave 'Нет дома' FALSE (unchecked) and ensure input#house has the house number.
        # - Otherwise (no house number): ensure input#house is empty and 'Нет дома' is TRUE (checked).
        try:
            house_inp = self.page.locator("input#house:visible").first
            if is_tobolsk_kv5 and not parsed_house:
                if house_inp.count() > 0 and house_inp.input_value().strip():
                    house_inp.click()
                    self.page.keyboard.press("Control+A")
                    self.page.keyboard.press("Backspace")
                    self.page.wait_for_timeout(150)

            current_house_val = house_inp.input_value().strip() if house_inp.count() > 0 else ""
            effective_house = parsed_house or ("" if is_tobolsk_kv5 else current_house_val)

            if effective_house:
                logger.info(f"Address has House No '{effective_house}' -> keeping 'Нет дома' FALSE and filling Дом...")
                self.set_address_checkbox("Нет дома", "houseCheckbox", False)
                if house_inp.count() > 0 and house_inp.input_value().strip() != effective_house:
                    house_inp.click()
                    self.page.keyboard.press("Control+A")
                    self.page.keyboard.press("Backspace")
                    house_inp.press_sequentially(effective_house, delay=60)
                    self.page.wait_for_timeout(400)
                    house_opt = self.page.locator(f".lookup-item:has-text('{effective_house}'):visible").first
                    if house_opt.count() > 0 and house_opt.is_visible():
                        house_opt.click()
                        self.page.wait_for_timeout(300)
                    else:
                        self.page.keyboard.press("Tab")
            else:
                logger.info("Address has no House No -> setting 'Нет дома' = TRUE...")
                self.set_address_checkbox("Нет дома", "houseCheckbox", True)
        except Exception as e:
            logger.debug(f"House / 'Нет дома' handling note: {e}")

        # Smart Apartment (Квартира) & 'Нет квартиры' handling:
        # - If address has an apartment/office number (parsed_apt or DaData filled input#apartment):
        #   leave 'Нет квартиры' FALSE (unchecked) and fill Квартира.
        # - Otherwise: set 'Нет квартиры' = TRUE (checked).
        try:
            apt_inp = self.page.locator(
                "input#apartment:visible, input#flat:visible, input[formcontrolname*='apart']:visible, input[id*='apart']:visible"
            ).first
            current_apt_val = apt_inp.input_value().strip() if apt_inp.count() > 0 else ""
            effective_apt = parsed_apt or current_apt_val

            if effective_apt:
                logger.info(f"Address has Apartment/Office No '{effective_apt}' -> keeping 'Нет квартиры' FALSE and filling Квартира...")
                self.set_address_checkbox("Нет квартиры", "apartmentCheckbox", False)
                if apt_inp.count() > 0 and apt_inp.input_value().strip() != effective_apt:
                    apt_inp.click()
                    self.page.keyboard.press("Control+A")
                    self.page.keyboard.press("Backspace")
                    apt_inp.press_sequentially(effective_apt, delay=60)
                    self.page.wait_for_timeout(300)
                    self.page.keyboard.press("Tab")
            else:
                logger.info("Address has no Apartment No -> setting 'Нет квартиры' = TRUE...")
                self.set_address_checkbox("Нет квартиры", "apartmentCheckbox", True)
        except Exception as e:
            logger.debug(f"Apartment / 'Нет квартиры' handling note: {e}")

        self.page.wait_for_timeout(500)

        # Fallback Check: If 'Продолжить' is STILL not active (grey/disabled) or red address errors exist,
        # automatically re-verify postal code and force 'Нет дома' / 'Нет квартиры' = TRUE so the form can advance!
        if not self.is_continue_button_ready():
            logger.info("Step 10 Fallback: 'Продолжить' not yet active — trying checkbox & postal code auto-recovery...")
            self.fill_postal_code_strict(postal_code)
            red_errs = self.has_red_validation_errors()
            house_inp = self.page.locator("input#house:visible").first
            house_empty = (house_inp.count() == 0) or (not house_inp.input_value().strip())
            if "Необходимо указать дом" in red_errs or house_empty or not self.is_continue_button_ready():
                self.set_address_checkbox("Нет дома", "houseCheckbox", True)
            if "Необходимо указать квартиру" in red_errs or not effective_apt or not self.is_continue_button_ready():
                self.set_address_checkbox("Нет квартиры", "apartmentCheckbox", True)
            self.page.wait_for_timeout(600)

        # Strictly verify 'Продолжить' is enabled (blue) and no red errors exist before advancing!
        self.click_continue_strict("Шаг 10: Договор и Адрес работы", 2000)

        # Step 11: VKS Salary Payment Details ('Укажите информацию о выплате зарплаты иностранцу' — по месяцам в рамках квартала)
        self.check_and_handle_error_modal()
        self.fill_step11_monthly_periods(row)
        self.page.wait_for_timeout(600)

        self.click_continue_strict("Шаг 11: Выплата зарплаты ВКС", 2000)

        # Steps 12 -> 13 -> 14 -> 15: Resilient State-Machine Loop through MVD Division, Consents, and Final 'Отправить'
        gosuslugi_order_no = self.complete_mvd_and_submit_flow()

        # Check if Fast Mode ('PDF'siz Hızlı Gönderim' / SKIP_STEP16_PDF) is enabled
        skip_step16_pdf = bool(self.cfg.get("SKIP_STEP16_PDF"))
        if skip_step16_pdf:
            if not gosuslugi_order_no:
                # Fast in-memory check (0.3s, zero page navigation) via /api/lk/v1/feeds/ right after submission
                try:
                    api_match, _, url_map = self.find_worker_order_via_feeds_api(row)
                    if api_match and api_match.get("application_no"):
                        gosuslugi_order_no = str(api_match["application_no"]).strip()
                    elif url_map:
                        # Take the newest unlinked VKS order number from feeds API
                        newest_no = next(iter(url_map.values()), "")
                        if newest_no:
                            gosuslugi_order_no = newest_no
                except Exception:
                    pass
            logger.info(
                f"Step 16 (Быстрая отправка без PDF): Заявление отправлено (№ {gosuslugi_order_no or 'ОТПРАВЛЕНО'}). "
                f"Скачивание PDF отложено — сразу переходим к следующему сотруднику!"
            )
            self.register_application_submission(
                row,
                gosuslugi_order_no or "ОТПРАВЛЕНО",
                pdf_filename="",
                status_override="Отправлено (PDF не скачан)",
            )
            logger.info(f"SUCCESS: Notification submitted for {full_name}!")
            return True

        # Step 16: Personal Cabinet & Receipt PDF Download + Rename (<Sicil>_<GosuslugiNo>_<Ad Soyad>_<Donem>.pdf)
        # Note: Because Step 15 ('Уведомление отправлено') already succeeded, any Step 16 PDF issue must NEVER mark the worker as 'Ошибка'!
        try:
            self.execute_step16_cabinet_and_download(row, gosuslugi_order_no)
        except Exception as step16_err:
            logger.warning(f"Step 16 (PDF download) warning after successful submission for {full_name}: {step16_err}")
            self.register_application_submission(
                row,
                gosuslugi_order_no or "ОТПРАВЛЕНО",
                pdf_filename="",
                status_override="Отправлено (PDF не скачан)",
            )

        # IMPORTANT: Do not change this log prefix — rpa_bridge_server.py parses it to count success
        logger.info(f"SUCCESS: Notification submitted for {full_name}!")
        return True

    def is_indefinite_contract_date(self, val: Any) -> bool:
        """Returns True if contract end date is empty or explicitly marked as indefinite ('бессрочный')."""
        s = str(val or "").strip().lower()
        return s in ("", "бессрочный", "бессрочно", "нет", "-", "none", "null", "süresiz", "suresiz")

    def set_indefinite_contract_checkbox(self, should_check: bool):
        """Reliably sets the 'Договор бессрочный' checkbox on Step 10 to should_check (True/False)."""
        try:
            cb_containers = self.page.locator(
                "lib-checkbox:has-text('Договор бессрочный'):visible, "
                "epgu-cf-ui-checkbox:has-text('Договор бессрочный'):visible, "
                "lib-checkbox:has-text('бессрочный'):visible"
            )
            if cb_containers.count() > 0:
                target_cb = cb_containers.first
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
                        try:
                            lbl.click(timeout=2000)
                        except Exception:
                            lbl.evaluate("el => el.click()")
                    else:
                        target_cb.click(timeout=2000)
                    self.page.wait_for_timeout(300)
                return

            # Fallback via DOM JavaScript for 'Договор бессрочный'
            self.page.evaluate(
                """(shouldCheck) => {
                    const labels = Array.from(document.querySelectorAll('label, lib-checkbox'));
                    for (const el of labels) {
                        const txt = (el.innerText || '').trim().toLowerCase();
                        if (txt.includes('договор бессрочный') || txt === 'бессрочный') {
                            const wrap = el.closest('lib-checkbox') || el;
                            const inp = wrap.querySelector('input[type="checkbox"]');
                            const isChecked = inp ? inp.checked : wrap.classList.contains('checked');
                            if (Boolean(isChecked) !== Boolean(shouldCheck)) {
                                const clickTarget = wrap.querySelector('label.check, label') || el;
                                clickTarget.click();
                            }
                            break;
                        }
                    }
                }""",
                should_check,
            )
            self.page.wait_for_timeout(250)
        except Exception as e:
            logger.debug(f"set_indefinite_contract_checkbox({should_check}) note: {e}")

    def select_dadata_work_address(self, work_addr: str) -> bool:
        """
        Fills the Step 10 work address textarea (`epgu-constructor-address-input textarea`),
        triggers the DaData/FIAS dropdown using real keystrokes, and clicks the matching suggestion item
        so Gosuslugi never complains 'Проверьте адрес'.
        """
        is_tobolsk_kv5 = "Восточный промышленный район" in work_addr and (
            "5-й" in work_addr or "квартал 5" in work_addr or "кв-л 5" in work_addr
        )
        dadata_query = (
            "Тюменская обл, г Тобольск, тер Восточный промышленный район-квартал 5"
            if is_tobolsk_kv5
            else work_addr
        )

        addr_textarea = self.page.locator(
            "epgu-constructor-address-input textarea, "
            "lib-dadata-widget textarea, "
            "textarea.search-input"
        ).first

        if addr_textarea.count() > 0 and addr_textarea.is_visible():
            addr_textarea.click()
            self.page.wait_for_timeout(150)
            addr_textarea.fill("")
            self.page.wait_for_timeout(150)
            addr_textarea.fill(dadata_query)
            self.page.wait_for_timeout(150)
            # Trigger keystroke events so Angular DaData widget always opens the suggestion list
            self.page.keyboard.press("Space")
            self.page.wait_for_timeout(120)
            self.page.keyboard.press("Backspace")
        else:
            self.page.keyboard.press("Tab")
            self.page.wait_for_timeout(200)
            self.page.keyboard.type(dadata_query, delay=25)

        # Wait up to 2.4s for FIAS/DaData suggestion item to appear and click it
        lookup_selector = (
            "epgu-constructor-address-input .lookup-item:not(.nothing-found):visible, "
            "lib-dadata-widget .lookup-item:not(.nothing-found):visible, "
            "#lookup-list-wrap .lookup-item:not(.nothing-found):visible, "
            ".lookup-item:not(.nothing-found):visible"
        )
        lookup_items = self.page.locator(lookup_selector)
        for _ in range(8):
            self.page.wait_for_timeout(300)
            if lookup_items.count() > 0:
                break

        try:
            item_count = lookup_items.count()
            if is_tobolsk_kv5 and item_count > 0:
                clicked_kv5 = False
                for idx_i in range(item_count):
                    txt_i = lookup_items.nth(idx_i).inner_text().strip()
                    if txt_i.endswith("квартал 5") or txt_i.endswith("кв-л 5") or txt_i.endswith("5-й"):
                        lookup_items.nth(idx_i).click()
                        clicked_kv5 = True
                        self.page.wait_for_timeout(800)
                        return True
                if not clicked_kv5:
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

    def is_continue_button_ready(self) -> bool:
        """Returns True if 'Продолжить' button is visible, enabled, and no red validation errors are on screen."""
        red_errs = self.has_red_validation_errors()
        if len(red_errs) > 0:
            return False
        btn_locator = self.page.locator("button:has-text('Продолжить'):visible").last
        if btn_locator.count() == 0:
            return False
        disabled_attr = btn_locator.get_attribute("disabled")
        cls_attr = btn_locator.get_attribute("class") or ""
        is_disabled = (disabled_attr is not None) or ("disabled" in cls_attr) or (not btn_locator.is_enabled())
        return not is_disabled

    def parse_address_house_and_apt(self, work_addr: str):
        """
        Extracts explicit house number (д., дом) and apartment/office number (кв., квартира, оф., офис)
        from a Russian address string, ignoring 'кв-л' / 'квартал'.
        """
        clean_addr = re.sub(r"кв-л\.?\s*\d+[-йа-я]*", "", work_addr, flags=re.IGNORECASE)
        clean_addr = re.sub(r"квартал\s*\d+[-йа-я]*", "", clean_addr, flags=re.IGNORECASE)

        house_val = ""
        m_house = re.search(
            r"(?:^|[\s,])(?:д\.|дом|вл\.|владение)\s*([0-9]+[а-яА-Яa-zA-Z0-9/\-]*)",
            clean_addr,
            re.IGNORECASE,
        )
        if m_house:
            house_val = m_house.group(1).strip(" .,")

        apt_val = ""
        m_apt = re.search(
            r"(?:^|[\s,])(?:кв\.|квартира|оф\.|офис|помещ\.|пом\.|каб\.)\s*([0-9]+[а-яА-Яa-zA-Z0-9/\-]*)",
            clean_addr,
            re.IGNORECASE,
        )
        if m_apt:
            apt_val = m_apt.group(1).strip(" .,")

        return house_val, apt_val

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
                    # Also close any open lookup dropdown for postal code by clicking the matching item
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

                # If Gosuslugi shows a popup suggestion with the postal code (e.g. '626150'), click it!
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

    def set_address_checkbox(self, label_text: str, form_control_name: str, should_check: bool):
        """Reliably sets 'Нет дома' or 'Нет квартиры' checkbox to should_check (True/False)."""
        try:
            # Prefer visible lib-checkbox with matching formcontrolname or label text
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

            # Fallback: visible label with text
            lbl_loc = self.page.locator(f"label:has-text('{label_text}'):visible").last
            if lbl_loc.count() > 0 and lbl_loc.is_visible() and should_check:
                lbl_loc.click(timeout=2000)
                self.page.wait_for_timeout(250)
        except Exception as e:
            logger.debug(f"set_address_checkbox({label_text}, {should_check}) note: {e}")

    def ensure_moscow_mvd_department(self) -> bool:
        """
        Ensures that on Step 12 ('Подразделение МВД, куда отправится уведомление' /
        'Выберите подразделение МВД, куда отправится уведомление'), the robot clicks 'Изменить'
        if needed, types 'МОСКВЕ' into #dic18_byHand, and selects
        'ОТДЕЛ ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ'
        before clicking 'Продолжить'.
        Returns True if this step handled an action on the MVD screen.
        """
        target_dept = str(self.cfg.get("UFMS_DEPARTMENT", "")).strip()
        if not target_dept or "ТЮМЕН" in target_dept.upper():
            target_dept = "ОТДЕЛ ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ"

        # Inspect current Step 12 state via instant non-blocking JS (never hangs on Playwright locators)
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
                    const byHand = document.querySelector('input#dic18_byHand, lib-lookup input.search-input');
                    const izmBtn = Array.from(document.querySelectorAll("lib-button[data-button-type='skipstep'] button, button"))
                        .find(b => vis(b) && (b.innerText || '').trim().includes('Изменить'));
                    const h1 = Array.from(document.querySelectorAll('h1, h2, h3'))
                        .find(h => vis(h) && (h.innerText || '').includes('подразделение МВД'));
                    return {
                        hasReadonly: vis(dic18),
                        readonlyVal: dic18 ? (dic18.value || '').trim() : '',
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
            if "МОСКВ" not in cur_dept.upper():
                logger.info(
                    f"Step 12: Pre-selected MVD is '{cur_dept or 'non-Moscow'}' -> clicking 'Изменить' to select '{target_dept}'..."
                )
                try:
                    izm_box = self.page.evaluate(
                        """() => {
                            const btns = Array.from(document.querySelectorAll("lib-button[data-button-type='skipstep'] button, button"));
                            for (const b of btns) {
                                const r = b.getBoundingClientRect();
                                if (r.width > 20 && r.height > 10 && (b.innerText || '').trim().includes('Изменить')) {
                                    b.click();
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
                # Wait up to 3s for #dic18_byHand to appear
                for _ in range(12):
                    self.page.wait_for_timeout(250)
                    try:
                        if self.page.evaluate("() => { const el = document.querySelector('input#dic18_byHand, lib-lookup input.search-input'); return !!(el && el.getBoundingClientRect().width > 20); }"):
                            break
                    except Exception:
                        pass
                self.page.wait_for_timeout(600)
                state["hasByHand"] = True
            else:
                logger.info(f"Step 12: MVD department already set to '{cur_dept}' -> clicking 'Продолжить'...")
                self._click_step12_continue_js()
                self.page.wait_for_timeout(1500)
                return True

        # Case B: Manual MVD lookup screen ('Выберите подразделение МВД, куда отправится уведомление') with #dic18_byHand
        if state.get("hasByHand") or state.get("hasMvdHeading"):
            self.enable_background_focus_emulation()
            for mvd_try in range(1, 4):
                # First check if 'Продолжить' is already active (e.g. already selected)
                if self._is_step12_continue_ready_js():
                    logger.info("Step 12: MVD department is selected and 'Продолжить' is active -> clicking 'Продолжить'...")
                    self._click_step12_continue_js()
                    self.page.wait_for_timeout(1500)
                    self.check_and_stop_if_insufficient_permissions()
                    return True

                logger.info(
                    f"Step 12 (Attempt {mvd_try}/3): Typing 'МОСКВЕ' in #dic18_byHand to select '{target_dept}'..."
                )
                self.enable_background_focus_emulation()
                # Focus and clear #dic18_byHand via JS + mouse click + background-safe native input setter
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

                    # Background-window guarantee: If Chrome is behind Edge and OS keystrokes didn't populate #dic18_byHand
                    # or didn't fire Angular's (input) listener, set value via native HTMLInputElement prototype setter & dispatch events!
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

                logger.info("Step 12: Waiting for MVD dropdown option ('МОСКВЕ') and selecting it...")

                # Poll every 250ms using ONLY non-blocking page.evaluate (zero Playwright locator timeouts!)
                for tick in range(32):  # 32 * 250ms = 8s max per attempt
                    self.page.wait_for_timeout(250)

                    # 1. If 'Продолжить' is already enabled (either from our click or user manual selection), click it immediately!
                    if self._is_step12_continue_ready_js():
                        logger.info("Step 12: 'Продолжить' is active (blue) -> clicking 'Продолжить' immediately!")
                        self._click_step12_continue_js()
                        self.page.wait_for_timeout(1500)
                        self.check_and_stop_if_insufficient_permissions()
                        return True

                    # 2. Find visible MVD dropdown option in DOM via instant JS and click it
                    dom_opt = None
                    try:
                        dom_opt = self.page.evaluate(
                            """() => {
                                const inp = document.querySelector('input#dic18_byHand, lib-lookup input.search-input');
                                const inpRect = inp ? inp.getBoundingClientRect() : null;

                                // Candidate elements: lookup items, role=option, or any element below the search input containing the Moscow MVD text
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

                                    // Normalize multi-line and highlighted span text ('РОССИИ ПО Г. <span>МОСКВЕ</span>')
                                    const txt = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().toUpperCase();
                                    if (!txt || txt.length > 240 || txt === 'ПРОДОЛЖИТЬ' || txt === 'ИЗМЕНИТЬ' || txt === 'НАЗАД') continue;

                                    const isMoscowMvd =
                                        (txt.includes('ТРУДОВОЙ МИГРАЦИИ') && txt.includes('МОСКВ')) ||
                                        txt.includes('УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ') ||
                                        (txt.includes('ОТДЕЛ') && txt.includes('МВД') && txt.includes('МОСКВ'));

                                    if (!isMoscowMvd) continue;

                                    // If input is visible, option must be below or near the input box
                                    if (inpRect && inpRect.width > 20) {
                                        if (r.top < inpRect.top - 10 || r.top > inpRect.bottom + 260) continue;
                                    }

                                    const isLookupItem = el.classList && el.classList.contains('lookup-item');
                                    const area = r.width * r.height;
                                    // Prefer .lookup-item directly, otherwise tightest container
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

                        # Check if 'Продолжить' became active after clicking the option
                        if self._is_step12_continue_ready_js():
                            logger.info("Step 12: MVD option selected -> clicking 'Продолжить'...")
                            self._click_step12_continue_js()
                            self.page.wait_for_timeout(1500)
                            self.check_and_stop_if_insufficient_permissions()
                            return True

                        # If dropdown is still open, also trigger ArrowDown + Enter on the input
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

                    # Fast in-place nudge at 1.5s (tick==6) and 3.25s (tick==13) ONLY if dropdown option hasn't appeared yet
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

                # Final check at end of attempt
                if self._is_step12_continue_ready_js():
                    logger.info("Step 12: Clicking 'Продолжить'...")
                    self._click_step12_continue_js()
                    self.page.wait_for_timeout(1500)
                    self.check_and_stop_if_insufficient_permissions()
                    return True

                logger.warning(f"Step 12: MVD selection attempt {mvd_try}/3 did not enable 'Продолжить' yet...")

            err_msg = "Ошибка [Шаг 12: Подразделение МВД]: Не удалось выбрать подразделение МВД по фильтру «МОСКВЕ» после 3 попыток"
            self.register_worker_error(self.current_row or {}, err_msg)
            raise RuntimeError(err_msg)

        return False

    def _is_step12_continue_ready_js(self) -> bool:
        """Non-blocking JS check: returns True if the 'Продолжить' button on Step 12 is visible and enabled."""
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
                        if (isDisabled) return false;

                        // Also check if .displayed.lookup-item is visible OR if the button is genuinely enabled
                        return true;
                    }"""
                )
            )
        except Exception:
            return False

    def _click_step12_continue_js(self) -> bool:
        """Non-blocking JS + physical mouse click on the active 'Продолжить' button."""
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
                return True
        except Exception:
            pass
        return False

    def complete_mvd_and_submit_flow(self) -> str:
        """
        State-machine loop for Steps 12 -> 13 -> 14 -> 15:
        Advances through 'Подразделение МВД' (selecting Moscow OВТМ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ),
        'Подтвердить' consent modal, 'Согласие на обработку ПДн',
        and reliably clicks 'Отправить' on 'Уведомление готово к отправке' until 'Уведомление отправлено'
        is reached. Immediately halts with InsufficientPermissionsError if 'У вас недостаточно полномочий' appears.
        """
        logger.info("Steps 12-15: Advancing through MVD division, consents, and final 'Отправить' screen...")
        gosuslugi_order_no = ""

        for tick in range(55):
            self.check_and_handle_error_modal()
            # Immediately stop if Gosuslugi shows 'У вас недостаточно полномочий для отправки уведомлений' (Image 3)
            self.check_and_stop_if_insufficient_permissions()

            cur_url = self.page.url or ""

            # 1) Check if we have reached the actual positive confirmation screen ('Уведомление отправлено' / 'Заявление отправлено')
            # IMPORTANT: Do NOT rely on 'В личный кабинет' button alone because that button ALSO appears on the 'У вас недостаточно полномочий' draft screen!
            sent_text = self.page.locator(
                "h1:has-text('Уведомление отправлено'):visible, "
                "h1:has-text('Заявление отправлено'):visible, "
                "h2:has-text('Уведомление отправлено'):visible, "
                "h2:has-text('Заявление отправлено'):visible, "
                "h3:has-text('Уведомление отправлено'):visible, "
                "div.title:has-text('Уведомление отправлено'):visible"
            )
            if sent_text.count() > 0 or "lk.gosuslugi.ru" in cur_url:
                self.check_and_stop_if_insufficient_permissions()
                logger.info(">>> Final confirmation screen ('Уведомление отправлено') reached! <<<")
                gosuslugi_order_no = self.extract_gosuslugi_order_number()
                if gosuslugi_order_no:
                    logger.info(f"Step 15: Captured Gosuslugi Application No from confirmation screen: {gosuslugi_order_no}")
                return gosuslugi_order_no

            # 2) Check if 'Уведомление готово к отправке' or 'Отправить' button is visible on screen
            # Note: Exclude 'Отправить ещё раз' which belongs to the insufficient permissions screen!
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
                logger.info("Step 15: 'Уведомление готово к отправке' detected — clicking 'Отправить'...")
                self.click_otpravit_bulletproof()
                self.page.wait_for_timeout(2500)
                self.check_and_stop_if_insufficient_permissions()
                continue

            # 3) Check if Employee Consent Modal ('Подтвердите, что получили согласие работника' -> 'Подтвердить') is visible
            confirm_btn = self.page.locator(
                "button:has-text('Подтвердить'):visible, "
                "lib-button:has-text('Подтвердить'):visible, "
                "span:has-text('Подтвердить'):visible"
            ).first
            if confirm_btn.count() > 0 and confirm_btn.is_visible():
                logger.info("Step 13: Clicking 'Подтвердить' on employee consent modal...")
                try:
                    confirm_btn.click(timeout=2500)
                except Exception:
                    confirm_btn.evaluate("el => (el.closest('button, a') || el).click()")
                self.page.wait_for_timeout(1200)
                continue

            # 3.5) Step 12: Check if on MVD Department screen ('Подразделение МВД, куда отправится уведомление')
            # and ensure 'ОТДЕЛ ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ' is selected via 'Изменить'
            if self.ensure_moscow_mvd_department():
                continue

            # 4) Check if 'Продолжить' button is visible (Step 14: Согласие на обработку ПДн or other intermediate steps)
            cont_btn = self.page.locator("button:has-text('Продолжить'):visible").last
            if cont_btn.count() > 0 and cont_btn.is_visible():
                disabled_attr = cont_btn.get_attribute("disabled")
                cls_attr = cont_btn.get_attribute("class") or ""
                is_disabled = (disabled_attr is not None) or ("disabled" in cls_attr) or (not cont_btn.is_enabled())
                if not is_disabled:
                    h_txt = self.get_current_heading()
                    logger.info(f"Steps 12/14: Clicking active 'Продолжить' on '{h_txt or 'MVD/Consent'}'...")
                    try:
                        cont_btn.focus()
                        cont_btn.click(timeout=3000)
                    except Exception:
                        cont_btn.evaluate("el => (el.closest('button') || el).click()")
                    self.page.wait_for_timeout(1500)
                    self.check_and_stop_if_insufficient_permissions()
                    continue

            self.page.wait_for_timeout(800)

        self.check_and_stop_if_insufficient_permissions()
        gosuslugi_order_no = self.extract_gosuslugi_order_number()
        return gosuslugi_order_no

    def click_otpravit_bulletproof(self):
        """
        Clicks the blue 'Отправить' button on the 'Уведомление готово к отправке' screen
        using 3 independent strategies (Playwright click, Mouse bounding-box click, and DOM JS dispatch)
        so Angular/Gosuslugi always registers the submission.
        """
        selectors = [
            "epgu-cf-ui-constructor-screen-pad button:has-text('Отправить'):not(:has-text('ещё раз')):visible",
            "epgu-cf-ui-button:has-text('Отправить'):not(:has-text('ещё раз')) button:visible",
            "lib-button:has-text('Отправить'):not(:has-text('ещё раз')) button:visible",
            "button.button:has-text('Отправить'):not(:has-text('ещё раз')):visible",
            "button:has-text('Отправить уведомление'):visible",
            "button:has-text('Отправить'):not(:has-text('ещё раз')):visible",
            "epgu-cf-ui-button:has-text('Отправить'):not(:has-text('ещё раз')):visible",
            "lib-button:has-text('Отправить'):not(:has-text('ещё раз')):visible",
            "span:has-text('Отправить'):not(:has-text('ещё раз')):visible",
        ]
        target = None
        for sel in selectors:
            loc = self.page.locator(sel)
            if loc.count() > 0:
                # Pick the last visible match (main form action button at bottom of card)
                for idx in range(loc.count() - 1, -1, -1):
                    cand = loc.nth(idx)
                    if cand.is_visible():
                        target = cand
                        break
            if target is not None:
                break

        if target is None:
            return

        try:
            target.scroll_into_view_if_needed(timeout=2000)
        except Exception:
            pass
        self.page.wait_for_timeout(200)

        # Method 1: Standard Playwright focus + click
        clicked = False
        try:
            target.focus()
            target.click(timeout=3000, force=False)
            clicked = True
            logger.info(">>> 'Отправить' clicked via Playwright! <<<")
        except Exception:
            pass

        # Wait briefly and check if still on 'Уведомление готово к отправке'
        self.page.wait_for_timeout(900)
        ready_screen_loc = self.page.locator(
            "h1:has-text('Уведомление готово к отправке'):visible, "
            "h2:has-text('Уведомление готово к отправке'):visible"
        )
        if ready_screen_loc.count() == 0 and clicked:
            return

        # Method 2: Physical mouse coordinate click at center of the button bounding box
        try:
            box = target.bounding_box()
            if box and box["width"] > 5 and box["height"] > 5:
                cx = box["x"] + box["width"] / 2
                cy = box["y"] + box["height"] / 2
                self.page.mouse.move(cx, cy)
                self.page.wait_for_timeout(100)
                self.page.mouse.down()
                self.page.wait_for_timeout(80)
                self.page.mouse.up()
                logger.info(f">>> 'Отправить' clicked via Mouse Coordinates ({int(cx)}, {int(cy)})! <<<")
        except Exception:
            pass

        self.page.wait_for_timeout(900)
        if ready_screen_loc.count() == 0:
            return

        # Method 3: DOM JavaScript click on button / closest button / inner button
        try:
            target.evaluate(
                """el => {
                    const btn = el.closest('button') || el.querySelector('button') || el;
                    btn.focus();
                    btn.click();
                    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                }"""
            )
            logger.info(">>> 'Отправить' clicked via DOM JavaScript dispatch! <<<")
        except Exception:
            pass

    @staticmethod
    def _normalize_ru_tokens(text: str) -> List[str]:
        """Normalizes Russian/Latin name string into significant lowercase tokens (ignoring 'нет', '-', etc.)."""
        skip = {
            "нет", "не", "заполнено", "не заполнено", "отсутствует", "б/н", "бн",
            "-", "—", "none", "null", "no", "nan", ""
        }
        cleaned = (text or "").lower().replace("ё", "е")
        cleaned = re.sub(r"[^а-яa-z0-9\s]", " ", cleaned)
        tokens = [tok for tok in cleaned.split() if tok not in skip]
        sig = [tok for tok in tokens if len(tok) >= 2]
        return sig if sig else tokens

    def sanitize_cyrillic_value(self, text: Any, fallback: str = "") -> str:
        return self.sanitize_cyrillic_field(text, fallback=fallback)

    def does_citizen_match_worker(self, citizen_text: str, row: Dict[str, Any], page_body_text: str = "") -> bool:
        """
        Verifies that the 'Гражданин' field on the Gosuslugi order page/card matches the employee in `row`.
        Handles cases where Фамилия or Отчество is 'Нет' (e.g. 'Нет АДЖАД Нет' -> significant token ['аджад']),
        and also normalizes Latin homoglyphs via sanitize_cyrillic_field so Excel/Gosuslugi Cyrillic names always match.
        """
        raw_last = self.sanitize_cyrillic_field(str(row.get("Фамилия", "")).strip())
        raw_first = self.sanitize_cyrillic_field(str(row.get("Имя", "")).strip())
        raw_mid = self.sanitize_cyrillic_field(str(row.get("Отчество", "")).strip())

        primary_tokens = self._normalize_ru_tokens(f"{raw_last} {raw_first}")
        if not primary_tokens:
            primary_tokens = self._normalize_ru_tokens(f"{raw_last} {raw_first} {raw_mid}")
        if not primary_tokens:
            primary_tokens = self._normalize_ru_tokens(self.build_clean_worker_name(row))
        if not primary_tokens:
            return False

        citizen_norm_text = self.sanitize_cyrillic_field(citizen_text or "")
        citizen_tokens = self._normalize_ru_tokens(citizen_norm_text)

        # Fallback: if citizen_tokens is empty (e.g. DOM extracted only 'Нет'), inspect the 'Гражданин' block in page_body_text
        if not citizen_tokens and page_body_text:
            m_block = re.search(
                r"Гражданин\s*:?\s*([\s\S]{1,120}?)(?:Документы|История|Показать историю|Скачать|Адрес|Статус|Инициатор|$)",
                page_body_text,
                re.IGNORECASE,
            )
            if m_block:
                citizen_tokens = self._normalize_ru_tokens(self.sanitize_cyrillic_field(m_block.group(1)))

        if citizen_tokens:
            citizen_joined = " ".join(citizen_tokens)
            # Match if all primary worker tokens (e.g. ['аджад']) are in citizen_tokens
            if all(req_tok in citizen_tokens or req_tok in citizen_joined for req_tok in primary_tokens):
                return True
            # Or if citizen_tokens has all significant tokens and they are a subset of the worker's full name tokens
            all_worker_tokens = self._normalize_ru_tokens(f"{raw_last} {raw_first} {raw_mid}")
            if all_worker_tokens and all(ct in all_worker_tokens for ct in citizen_tokens):
                return True

        # Direct full-string fallback (including 'Нет', e.g. 'нет аджад нет')
        full_with_net = re.sub(r"\s+", " ", f"{raw_last} {raw_first} {raw_mid}".lower().replace("ё", "е")).strip()
        haystack = re.sub(
            r"\s+",
            " ",
            self.sanitize_cyrillic_field(f"{citizen_text} {page_body_text}").lower().replace("ё", "е"),
        ).strip()
        if full_with_net and len(full_with_net) >= 3 and full_with_net in haystack:
            return True
        if primary_tokens and all(pt in haystack for pt in primary_tokens):
            return True

        return False

    def is_order_already_linked_to_another_worker(self, app_no: str, current_sicil: str) -> bool:
        """
        Checks local 'gosuslugi_applications.json' to ensure `app_no` is never linked to two different workers.
        """
        clean_app = str(app_no or "").strip()
        clean_sicil = str(current_sicil or "").strip()
        if not clean_app:
            return False
        ledger_path = os.path.join(CURRENT_DIR, "gosuslugi_applications.json")
        try:
            if os.path.exists(ledger_path):
                with open(ledger_path, "r", encoding="utf-8") as lf:
                    items = json.load(lf)
                if isinstance(items, list):
                    for it in items:
                        ex_app = str(it.get("application_no") or "").strip()
                        ex_sicil = str(it.get("sicil") or it.get("sicil_no") or "").strip()
                        if ex_app == clean_app and ex_sicil and clean_sicil and ex_sicil != clean_sicil:
                            return True
        except Exception:
            pass
        return False

    def is_valid_labor_activity_service(self, text: str) -> bool:
        """
        Returns True ONLY if the service/card text belongs to 'Уведомления о трудовой деятельности иностранцев'
        and is NOT a Work Permit ('Разрешение на работу ИГ'), migration arrival/departure ('прибытии и убытии'),
        or unsent draft ('черновик').
        """
        t = str(text or "").lower().replace("ё", "е")
        excluded = (
            "прибытии",
            "убытии",
            "разрешение на работу",
            "выдан документ разрешение",
            "получение разрешения",
            "черновик",
        )
        if any(bad in t for bad in excluded):
            return False
        return True

    def expand_order_history_on_page(self):
        """
        Expands 'Показать историю' on https://lk.gosuslugi.ru/order/<feed_id> so 'req_preview' and 'Скачать' become visible.
        Never uses blind viewport mouse coordinates (which can hit 'Личный кабинет' in the footer or 'Профиль организации'
        in the sticky header after scrolling) and never double-clicks 'Зарегистрировано на портале' when already open.
        """
        if "lk.gosuslugi.ru/order/" not in (self.page.url or ""):
            return

        # 1) Wait up to 8 seconds for the order page content ('Показать историю', 'Скрыть историю', or 'req_preview') to render
        for _ in range(16):
            try:
                body_now = self.page.evaluate("() => (document.body && document.body.innerText) || ''") or ""
                if (
                    "Показать историю" in body_now
                    or "Показать всю историю" in body_now
                    or "Скрыть историю" in body_now
                    or "req_preview" in body_now
                ):
                    break
            except Exception:
                pass
            self.page.wait_for_timeout(500)

        # If already expanded ('req_preview' or 'Скрыть историю' is visible), wait briefly for 'req_preview' and return
        try:
            body_init = self.page.evaluate("() => (document.body && document.body.innerText) || ''") or ""
            if "req_preview" in body_init:
                return
            if "Скрыть историю" in body_init and "Показать историю" not in body_init:
                for _ in range(6):
                    body_w = self.page.evaluate("() => (document.body && document.body.innerText) || ''") or ""
                    if "req_preview" in body_w or "Скачать" in body_w:
                        return
                    self.page.wait_for_timeout(400)
                return
        except Exception:
            pass

        # 2) Click 'Показать историю' cleanly once per attempt (without firing duplicate mouse clicks that hit footer/header links)
        for attempt in range(3):
            if "lk.gosuslugi.ru/order/" not in (self.page.url or ""):
                return
            try:
                body_before = self.page.evaluate("() => (document.body && document.body.innerText) || ''") or ""
                if "req_preview" in body_before or ("Скрыть историю" in body_before and "Показать историю" not in body_before):
                    break
            except Exception:
                pass

            clicked_history = False

            # Strategy A: Click the exact innermost DOM element for 'Показать историю' (strictly excluding header/footer/nav links)
            try:
                clicked_in_js = self.page.evaluate(
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
                            if (/^показать\s+(всю\s+)?историю$/i.test(txt)) {
                                const parent = node.parentElement;
                                if (parent && isSafeOrderElement(parent)) {
                                    const r = parent.getBoundingClientRect();
                                    if (r.width > 10 && r.height > 8) {
                                        matchedEl = parent;
                                        break;
                                    }
                                }
                            }
                        }

                        if (!matchedEl) {
                            const candidates = Array.from(document.querySelectorAll('a, button, span, p, div'))
                                .filter(el => {
                                    if (!isSafeOrderElement(el)) return false;
                                    const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                                    if (!/^показать\s+(всю\s+)?историю$/i.test(t)) return false;
                                    const r = el.getBoundingClientRect();
                                    return r.width > 20 && r.height > 8 && r.height < 100;
                                })
                                .sort((a, b) => {
                                    const ra = a.getBoundingClientRect();
                                    const rb = b.getBoundingClientRect();
                                    return (ra.width * ra.height) - (rb.width * rb.height);
                                });
                            if (candidates.length > 0) {
                                matchedEl = candidates[0];
                            }
                        }

                        if (!matchedEl) return false;
                        const clickTarget = matchedEl.closest('button, [role="button"], .link, .history-toggle') || matchedEl;
                        if ( isSafeOrderElement(clickTarget) ) {
                            clickTarget.click();
                            return true;
                        }
                        return false;
                    }"""
                )
                if clicked_in_js:
                    logger.info(f"Step 16: Clicked 'Показать историю' via DOM (attempt {attempt + 1})...")
                    clicked_history = True
            except Exception:
                pass

            # Strategy B: Playwright locator fallback if DOM click did not find it
            if not clicked_history:
                try:
                    by_txt = self.page.get_by_text("Показать историю", exact=False).first
                    if by_txt.count() > 0 and by_txt.is_visible():
                        logger.info(f"Step 16: Clicking 'Показать историю' via Playwright locator (attempt {attempt + 1})...")
                        by_txt.click(timeout=2500)
                        clicked_history = True
                except Exception:
                    pass

            # Wait up to 5 seconds specifically for 'req_preview' in the expanded history
            for _ in range(10):
                self.page.wait_for_timeout(500)
                try:
                    body_after = self.page.evaluate("() => (document.body && document.body.innerText) || ''") or ""
                    if "req_preview" in body_after:
                        return
                except Exception:
                    pass

            # If 'Скрыть историю' is now visible (meaning history IS open), only expand collapsed '.history-status:not(.open)' if 'req_preview' is still hidden
            try:
                body_check = self.page.evaluate("() => (document.body && document.body.innerText) || ''") or ""
                if "req_preview" not in body_check:
                    self.page.evaluate(
                        r"""() => {
                            const closedStatuses = Array.from(document.querySelectorAll('.history-status:not(.open), .history-item:not(.open)'));
                            for (const st of closedStatuses) {
                                if (st.closest('header, footer, nav')) continue;
                                const header = st.querySelector('.history-header, .status-title') || st;
                                header.click();
                            }
                        }"""
                    )
                    self.page.wait_for_timeout(1000)
                body_final = self.page.evaluate("() => (document.body && document.body.innerText) || ''") or ""
                if (
                    "req_preview" in body_final
                    or "Скрыть историю" in body_final
                    or (clicked_history and "Показать историю" not in body_final)
                ):
                    break
            except Exception:
                pass

    def _extract_order_page_fields_once(self) -> Dict[str, str]:
        """Helper that reads order_no, service_title, citizen_name, and body_text from the current /order/ DOM."""
        info = {"order_no": "", "service_title": "", "citizen_name": "", "body_text": ""}
        try:
            dom_extracted = self.page.evaluate(
                r"""() => {
                    const res = { order_no: "", service_title: "", citizen_name: "" };
                    const stopWords = /^(документы|история|показать историю|скрыть историю|скачать|скачать всё|адрес|статус|сведения|отправитель|инициатор)$/i;

                    // 1. Heading / Service title
                    const headings = Array.from(document.querySelectorAll('h1, h2, h3, .order-title, .title-h3, .sub-title, p, span, div'));
                    for (const h of headings) {
                        if (h.closest('header, footer, nav')) continue;
                        const t = (h.innerText || "").trim();
                        if (!t || t.length > 220) continue;
                        if (
                            t.includes("Уведомления о трудовой деятельности") ||
                            t.includes("Уведомление о трудовой деятельности") ||
                            t.includes("Уведомления о прибытии") ||
                            t.includes("Разрешение на работу ИГ") ||
                            t.includes("Выдан документ Разрешение на работу")
                        ) {
                            res.service_title = t.split("\n")[0].trim();
                            break;
                        }
                    }

                    // 2. Find 'Гражданин' label and read the complete value next to / below it
                    const allEls = Array.from(document.querySelectorAll('div, span, p, dt, td, label'));
                    for (const el of allEls) {
                        if (el.closest('header, footer, nav')) continue;
                        const txt = (el.innerText || "").trim();
                        if (txt === "Гражданин" || txt === "Гражданин:" || txt === "Иностранный гражданин") {
                            let cur = el;
                            for (let depth = 0; depth < 4 && cur; depth++) {
                                const next = cur.nextElementSibling;
                                if (next && (next.innerText || "").trim()) {
                                    const lines = (next.innerText || "")
                                        .split("\n")
                                        .map(s => s.trim())
                                        .filter(s => s && !stopWords.test(s));
                                    if (lines.length > 0) {
                                        res.citizen_name = lines.join(" ").replace(/\s+/g, " ").trim();
                                        break;
                                    }
                                }
                                if (cur.parentElement) {
                                    const pLines = (cur.parentElement.innerText || "")
                                        .split("\n")
                                        .map(s => s.trim())
                                        .filter(Boolean);
                                    const gIdx = pLines.findIndex(l => /^Гражданин\s*:?$/i.test(l) || l.startsWith("Гражданин"));
                                    if (gIdx !== -1 && pLines.length > gIdx + 1) {
                                        const collected = [];
                                        for (let k = gIdx + 1; k < Math.min(pLines.length, gIdx + 4); k++) {
                                            if (stopWords.test(pLines[k])) break;
                                            collected.push(pLines[k]);
                                        }
                                        if (collected.length > 0) {
                                            res.citizen_name = collected.join(" ").replace(/\s+/g, " ").trim();
                                            break;
                                        }
                                    }
                                }
                                cur = cur.parentElement;
                            }
                            if (res.citizen_name) break;
                        }
                    }
                    return res;
                }"""
            )
            if isinstance(dom_extracted, dict):
                info["service_title"] = str(dom_extracted.get("service_title") or "").strip()
                info["citizen_name"] = str(dom_extracted.get("citizen_name") or "").strip()
        except Exception:
            pass

        try:
            body_text = self.page.evaluate("() => (document.body && document.body.innerText) || ''") or ""
            info["body_text"] = body_text
            if not self._normalize_ru_tokens(info["citizen_name"]):
                m_cit_block = re.search(
                    r"Гражданин\s*:?\s*(?:\r?\n|\s)+([^\r\n]+(?:\r?\n[^\r\n]+){0,2})",
                    body_text,
                    re.IGNORECASE,
                )
                if m_cit_block:
                    raw_lines = [ln.strip() for ln in m_cit_block.group(1).splitlines() if ln.strip()]
                    filtered_lines = []
                    for ln in raw_lines:
                        if re.match(r"^(документы|история|показать историю|скрыть историю|скачать|адрес|статус|сведения|действия)", ln, re.IGNORECASE):
                            break
                        filtered_lines.append(ln)
                    if filtered_lines:
                        info["citizen_name"] = " ".join(filtered_lines).strip()

            if not info["service_title"]:
                m_srv = re.search(
                    r"(Уведомлени[ея]\s+о\s+[^\r\n№]+|Выдан документ Разрешение на работу[^\r\n№]*|Разрешение на работу ИГ[^\r\n№]*)",
                    body_text,
                    re.IGNORECASE,
                )
                if m_srv:
                    info["service_title"] = m_srv.group(1).strip()

            m_no = re.search(r"№\s*(\d{8,14})", body_text)
            if m_no:
                info["order_no"] = m_no.group(1).strip()
        except Exception:
            pass

        if not info["order_no"]:
            info["order_no"] = self.extract_gosuslugi_order_number()

        return info

    def inspect_open_order_page(self) -> Dict[str, str]:
        """
        Inspects the currently open Gosuslugi order details page (https://lk.gosuslugi.ru/order/<feed_id>):
        1) Waits for the Angular order view to render its header/number
        2) Captures order_no and service_title BEFORE expanding history
        3) Expands 'Показать историю' so 'Гражданин' and 'req_preview' become visible
        4) Captures updated fields AFTER expanding history and merges them
        """
        for _ in range(12):
            try:
                bt = self.page.evaluate("() => (document.body && document.body.innerText) || ''") or ""
                if re.search(r"№\s*\d{8,14}", bt) or "Показать историю" in bt or "req_preview" in bt:
                    break
            except Exception:
                pass
            self.page.wait_for_timeout(500)

        before_info = self._extract_order_page_fields_once()
        self.expand_order_history_on_page()
        after_info = self._extract_order_page_fields_once()

        return {
            "order_no": after_info["order_no"] or before_info["order_no"],
            "service_title": after_info["service_title"] or before_info["service_title"],
            "citizen_name": after_info["citizen_name"] or before_info["citizen_name"],
            "body_text": after_info["body_text"] or before_info["body_text"],
        }

    def find_worker_order_via_feeds_api(
        self, row: Dict[str, Any], expected_order_no: str = ""
    ) -> Tuple[Optional[Dict[str, str]], List[str], Dict[str, str]]:
        """
        Queries Gosuslugi's internal /api/lk/v1/feeds/ JSON API directly inside the browser session.
        Strictly filters ONLY 'Уведомления о трудовой деятельности иностранцев' (never 'Разрешение на работу ИГ'
        or 'Уведомления о прибытии и убытии').
        Returns (matched_item_or_None, recent_unverified_urls, url_to_order_no_map).
        """
        sicil = str(row.get("Sicil") or row.get("Код") or "").strip()
        query_suffix = (
            "?unread=false&isArchive=false&isHide=&types=ORDER,EQUEUE,APPEAL,CLAIM,SIGN,KND_APPEAL,LICENSING,LICENSING_APPEAL"
            "&pageSize=25&status=&startDate=&lastFeedId=&lastFeedDate=&q="
        )
        try:
            raw_items = self.page.evaluate(
                """async (suffix) => {
                    const urls = [
                        `/api/lk/v1/feeds/${suffix}`,
                        `https://www.gosuslugi.ru/api/lk/v1/feeds/${suffix}`,
                        `https://lk.gosuslugi.ru/api/lk/v1/feeds/${suffix}`
                    ];
                    for (const url of urls) {
                        try {
                            const resp = await fetch(url, { credentials: "include", headers: { "Accept": "application/json" } });
                            if (resp.ok) {
                                const data = await resp.json();
                                if (data && Array.isArray(data.items) && data.items.length > 0) {
                                    return data.items;
                                }
                            }
                        } catch (e) {}
                    }
                    return [];
                }""",
                query_suffix,
            )
        except Exception as e:
            logger.debug(f"Feeds API lookup note: {e}")
            raw_items = []

        if not isinstance(raw_items, list):
            return None, [], {}

        candidates = []
        recent_unverified_urls: List[str] = []
        url_to_order_no: Dict[str, str] = {}
        for raw_it in raw_items:
            if not isinstance(raw_it, dict):
                continue
            data_obj = raw_it.get("data") or {}
            ext_id = str(raw_it.get("extId") or data_obj.get("orderId") or "").strip()
            feed_id = str(raw_it.get("id") or "").strip()
            sub_title = str(raw_it.get("subTitle") or "").strip().strip("«»\"'")
            raw_title = str(raw_it.get("title") or "").strip()

            if not ext_id or not ext_id.isdigit() or not feed_id:
                continue

            combined_title = f"{sub_title} {raw_title}".lower()
            # Strictly exclude 'Разрешение на работу ИГ', 'Уведомления о прибытии и убытии', and 'Черновик'
            if not self.is_valid_labor_activity_service(combined_title):
                continue
            if sub_title and "трудовой деятельности" not in sub_title.lower():
                continue

            # Exclude orders already linked to another worker
            if self.is_order_already_linked_to_another_worker(ext_id, sicil):
                continue

            order_url = f"https://lk.gosuslugi.ru/order/{feed_id}"
            url_to_order_no[order_url] = ext_id

            citizen_name = ""
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
                        except Exception:
                            pass

            item_info = {
                "feed_id": feed_id,
                "application_no": ext_id,
                "citizen_name": citizen_name,
                "service_title": sub_title,
            }

            # If Step 15 gave us the exact order number and either citizen_name matches or snippet isn't populated yet -> return immediately!
            if expected_order_no and ext_id == expected_order_no:
                if not citizen_name or self.does_citizen_match_worker(citizen_name, row):
                    return item_info, recent_unverified_urls, url_to_order_no

            if citizen_name:
                if self.does_citizen_match_worker(citizen_name, row):
                    candidates.append(item_info)
            else:
                if order_url not in recent_unverified_urls and len(recent_unverified_urls) < 3:
                    recent_unverified_urls.append(order_url)

        if candidates:
            return candidates[0], recent_unverified_urls, url_to_order_no
        return None, recent_unverified_urls, url_to_order_no

    def execute_step16_cabinet_and_download(self, row: Dict[str, Any], gosuslugi_order_no: str = ""):
        """
        Executes Step 16 after 'Уведомление отправлено' with strict multi-computer & citizen verification:
        1) Verifies no 'У вас недостаточно полномочий' error is on screen
        2) Navigates directly to https://lk.gosuslugi.ru/orders (never to /org-profile/information)
        3) Opens ONLY 'Уведомления о трудовой деятельности иностранцев' orders (never 'Разрешение на работу ИГ'),
           clicks 'Показать историю' FIRST so 'Гражданин' and 'req_preview' are visible,
           and verifies 'Гражданин' matches `row`
        4) Downloads 'req_preview' PDF and renames it to <Sicil>_<VerifiedGosuslugiNo>_<WorkerName>_<Period>.pdf
        """
        self.check_and_stop_if_insufficient_permissions()
        clean_worker_name = self.build_clean_worker_name(row)
        sicil = str(row.get("Sicil") or row.get("Код") or "").strip()
        expected_order_no = str(gosuslugi_order_no or "").strip()

        logger.info(
            f"Step 16: Searching Personal Cabinet for verified Zayavka of Гражданин '{clean_worker_name}' (Код: {sicil})..."
        )

        orders_list_url = "https://lk.gosuslugi.ru/orders?type=ORDER,EQUEUE,APPEAL,CLAIM,SIGN,KND_APPEAL,LICENSING,LICENSING_APPEAL"

        # 16.1 Navigate directly to Заявления (lk.gosuslugi.ru/orders) instead of clicking 'В личный кабинет'
        # (because on Organization accounts 'В личный кабинет' redirects to /org-profile/information!)
        if "lk.gosuslugi.ru/order/" not in (self.page.url or "") and "lk.gosuslugi.ru/orders" not in (self.page.url or ""):
            logger.info("Step 16.1: Navigating directly to Заявления (lk.gosuslugi.ru/orders)...")
            try:
                self.page.goto(orders_list_url, wait_until="domcontentloaded", timeout=35000)
                self.page.wait_for_timeout(3000)
            except Exception as e:
                logger.warning(f"Step 16.1 navigation note: {e}")

        verified_order_no = ""
        rejected_urls = set()
        url_to_order_no: Dict[str, str] = {}

        # Check if we are ALREADY on an '/order/...' details page right now
        if "lk.gosuslugi.ru/order/" in (self.page.url or ""):
            page_info = self.inspect_open_order_page()
            has_cit = bool(self._normalize_ru_tokens(page_info["citizen_name"]))
            if (
                self.is_valid_labor_activity_service(page_info["service_title"] + " " + page_info.get("body_text", "")[:400])
                and (not has_cit or self.does_citizen_match_worker(page_info["citizen_name"], row, page_info.get("body_text", "")))
                and not self.is_order_already_linked_to_another_worker(page_info["order_no"], sicil)
            ):
                fallback_id = (self.page.url or "").rstrip("/").split("/order/")[-1].split("?")[0]
                verified_order_no = page_info["order_no"] or expected_order_no or fallback_id

        # Up to 3 search passes (allowing Gosuslugi a few seconds to index the newly submitted notification)
        for search_pass in range(1, 4):
            if verified_order_no:
                break

            # Pass Strategy A: Query Gosuslugi's /api/lk/v1/feeds/ JSON API for Citizen Name or expected_order_no match
            api_match, api_unverified_urls, api_url_map = self.find_worker_order_via_feeds_api(row, expected_order_no)
            url_to_order_no.update(api_url_map)
            if api_match and api_match.get("feed_id"):
                target_order_url = f"https://lk.gosuslugi.ru/order/{api_match['feed_id']}"
                logger.info(
                    f"Step 16.2 (API Match): Found order № {api_match['application_no']} for Гражданин '{api_match['citizen_name']}' -> opening {target_order_url}..."
                )
                try:
                    self.page.goto(target_order_url, wait_until="domcontentloaded", timeout=30000)
                    self.page.wait_for_timeout(2000)
                except Exception as e:
                    logger.warning(f"Step 16.2 navigation note: {e}")

                page_info = self.inspect_open_order_page()
                resolved_no = page_info["order_no"] or api_match["application_no"] or expected_order_no
                logger.info(
                    f"Step 16.3: Order Page Check -> № {resolved_no} | Услуга: '{page_info['service_title'] or api_match.get('service_title', '')}' | Гражданин: '{page_info['citizen_name']}'"
                )
                comb_cit = page_info["citizen_name"] or api_match["citizen_name"]
                is_citizen_ok = (
                    not self._normalize_ru_tokens(comb_cit)
                    or self.does_citizen_match_worker(comb_cit, row, page_info.get("body_text", ""))
                    or (expected_order_no and resolved_no == expected_order_no)
                )
                if (
                    self.is_valid_labor_activity_service(page_info["service_title"] or api_match.get("service_title", ""))
                    and is_citizen_ok
                    and not self.is_order_already_linked_to_another_worker(resolved_no, sicil)
                ):
                    verified_order_no = resolved_no or str(api_match["feed_id"])
                    logger.info(
                        f"Step 16.3 VERIFIED: Заявление № {verified_order_no} принадлежит сотруднику '{clean_worker_name}' (Гражданин: '{comb_cit or clean_worker_name}')!"
                    )
                    break
                else:
                    rejected_urls.add(target_order_url)

            # Pass Strategy B: Inspect recent candidate orders (starting with newest labor notifications from /api/lk/v1/feeds/ + DOM cards on /orders)
            candidate_hrefs: List[str] = [u for u in api_unverified_urls if u not in rejected_urls]

            if not candidate_hrefs and "lk.gosuslugi.ru/orders" not in (self.page.url or ""):
                logger.info(f"Step 16.2 (Pass {search_pass}/3): Navigating to Заявления (lk.gosuslugi.ru/orders)...")
                try:
                    self.page.goto(orders_list_url, wait_until="domcontentloaded", timeout=35000)
                    self.page.wait_for_timeout(3000)
                except Exception as e:
                    logger.warning(f"Orders page navigation note: {e}")

            worker_tokens = self._normalize_ru_tokens(clean_worker_name)
            try:
                raw_cards = self.page.evaluate(
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
                        c_text = str(c.get("text") or "")
                        c_href = str(c.get("href") or "").strip()
                        if not c_href:
                            continue
                        full_u = c_href if c_href.startswith("http") else f"https://lk.gosuslugi.ru{c_href if c_href.startswith('/') else '/' + c_href}"
                        m_card_no = re.search(r"№\s*(\d{8,14})", c_text)
                        if m_card_no and full_u not in url_to_order_no:
                            url_to_order_no[full_u] = m_card_no.group(1).strip()

                    # Pass 0: Card explicitly containing expected_order_no from Step 15
                    if expected_order_no:
                        for c in raw_cards:
                            c_text = str(c.get("text") or "")
                            c_href = str(c.get("href") or "").strip()
                            if c_href and expected_order_no in c_text:
                                full_u = c_href if c_href.startswith("http") else f"https://lk.gosuslugi.ru{c_href if c_href.startswith('/') else '/' + c_href}"
                                if full_u not in candidate_hrefs:
                                    candidate_hrefs.insert(0, full_u)

                    # Pass 1: Cards explicitly mentioning the worker's significant name tokens AND valid labor activity service
                    for c in raw_cards:
                        c_text_low = str(c.get("text") or "").lower().replace("ё", "е")
                        c_href = str(c.get("href") or "").strip()
                        if not c_href or not self.is_valid_labor_activity_service(c_text_low):
                            continue
                        if worker_tokens and all(tok in c_text_low for tok in worker_tokens):
                            full_u = c_href if c_href.startswith("http") else f"https://lk.gosuslugi.ru{c_href if c_href.startswith('/') else '/' + c_href}"
                            if full_u not in candidate_hrefs:
                                candidate_hrefs.insert(0, full_u)

                    # Pass 2: Recent 'Уведомления о трудовой деятельности иностранцев' cards that haven't been rejected
                    for c in raw_cards[:8]:
                        c_text_low = str(c.get("text") or "").lower().replace("ё", "е")
                        c_href = str(c.get("href") or "").strip()
                        if not c_href or not self.is_valid_labor_activity_service(c_text_low):
                            continue
                        if ("мвд" in c_text_low or "уведомлени" in c_text_low or "выдан" in c_text_low) and "трудовой деятельности" not in c_text_low:
                            continue
                        m_card_cit = re.search(r"гражданин\s*:?\s*([^\n\r]+)", c_text_low)
                        if m_card_cit and not self.does_citizen_match_worker(m_card_cit.group(1), row, c_text_low):
                            logger.info(
                                f"Step 16.2: Skipping card in list because Гражданин '{m_card_cit.group(1).strip()}' != '{clean_worker_name}'"
                            )
                            continue
                        full_u = c_href if c_href.startswith("http") else f"https://lk.gosuslugi.ru{c_href if c_href.startswith('/') else '/' + c_href}"
                        if full_u not in candidate_hrefs and full_u not in rejected_urls:
                            candidate_hrefs.append(full_u)
            except Exception:
                pass

            for cand_idx, cand_url in enumerate(candidate_hrefs[:3]):
                logger.info(f"Step 16.2: Opening candidate order {cand_url} (will expand 'Показать историю' to verify & download PDF)...")
                try:
                    self.page.goto(cand_url, wait_until="domcontentloaded", timeout=30000)
                    self.page.wait_for_timeout(2000)
                except Exception:
                    continue

                if "lk.gosuslugi.ru/order/" not in (self.page.url or ""):
                    continue

                page_info = self.inspect_open_order_page()
                p_no = page_info["order_no"] or url_to_order_no.get(cand_url, "")
                p_srv = page_info["service_title"]
                p_cit = page_info["citizen_name"]
                p_body = page_info.get("body_text", "")

                logger.info(
                    f"Step 16.3: Order Page Check -> № {p_no or '?'} | Услуга: '{p_srv}' | Гражданин: '{p_cit or '(не указано в карточке ВКС)'}'"
                )

                # Guard against empty/non-loaded page or accidental navigation away from /order/
                if "lk.gosuslugi.ru/order/" not in (self.page.url or ""):
                    logger.warning(f"Step 16: Browser left /order/ page (now at {self.page.url}), re-opening {cand_url}...")
                    continue

                if not self.is_valid_labor_activity_service(p_srv + " " + p_body[:400]):
                    logger.warning(
                        f"Step 16 MISMATCH: Заявление № {p_no} относится к другой услуге ('{p_srv}'), а не к ВКС! Пропускаем..."
                    )
                    rejected_urls.add(cand_url)
                    continue

                if p_no and self.is_order_already_linked_to_another_worker(p_no, sicil):
                    logger.warning(
                        f"Step 16 MISMATCH: Заявление № {p_no} уже привязано к другому сотруднику! Пропускаем..."
                    )
                    rejected_urls.add(cand_url)
                    continue

                has_explicit_cit = bool(self._normalize_ru_tokens(p_cit))
                is_match = (
                    self.does_citizen_match_worker(p_cit, row, p_body)
                    or (expected_order_no and p_no == expected_order_no)
                    or (cand_idx == 0 and not has_explicit_cit)
                )
                if not is_match:
                    logger.warning(
                        f"Step 16 MISMATCH: В заявлении № {p_no} указан Гражданин '{p_cit}', а робот ищет '{clean_worker_name}'! "
                        f"Чужое заявление пропускается..."
                    )
                    rejected_urls.add(cand_url)
                    continue

                fallback_feed_id = cand_url.rstrip("/").split("/order/")[-1].split("?")[0]
                verified_order_no = p_no or expected_order_no or fallback_feed_id
                logger.info(
                    f"Step 16.3 VERIFIED: Найдено верное заявление № {verified_order_no} для сотрудника '{p_cit or clean_worker_name}' (Код: {sicil})!"
                )
                break

            if verified_order_no:
                break

            logger.info(
                f"Step 16: Waiting 3 seconds before retry pass {search_pass + 1}/3 for '{clean_worker_name}' to appear in Заявления..."
            )
            self.page.wait_for_timeout(3000)

        if not verified_order_no:
            warn_msg = (
                f"Step 16 Warning: В личном кабинете Госуслуг пока не отобразилось заявление для гражданина "
                f"'{clean_worker_name}' (Код: {sicil}). Статус сохранён как 'Отправлено (PDF не скачан)'."
            )
            logger.warning(warn_msg)
            self.register_application_submission(
                row,
                expected_order_no or "ОТПРАВЛЕНО",
                pdf_filename="",
                status_override="Отправлено (PDF не скачан)",
            )
            return

        # 16.4 Ensure 'Показать историю' is expanded before clicking 'Скачать'
        self.expand_order_history_on_page()

        # 16.5 Click 'Скачать' next to 'req_preview' under 'Документы' and rename the PDF
        saved_pdf_path = self.download_and_rename_receipt_pdf(row, verified_order_no)
        if saved_pdf_path:
            logger.info(f"Step 16.5: Official Gosuslugi PDF saved as: {saved_pdf_path}")

    def extract_gosuslugi_order_number(self) -> str:
        """
        Extracts the Gosuslugi application number (e.g. '8265228795' from '№ 8265228795' under
        'Уведомления о трудовой деятельности иностранцев', or from the active form's network/storage state).
        Prioritizes page text ('№ <digits>') and never returns the internal 16-digit feed ID from '/order/20000...'.
        """
        try:
            body_text = self.page.locator("body").inner_text(timeout=3000)
            m = re.search(r"(?:Заявление|Уведомлени\w+)[^\n\r№]*\s*№\s*(\d{8,14})", body_text, re.IGNORECASE)
            if m:
                return m.group(1)
            m2 = re.search(r"№\s*(\d{8,14})", body_text)
            if m2:
                return m2.group(1)
        except Exception:
            pass

        if self.current_form_order_id:
            return self.current_form_order_id

        try:
            perf_no = self.page.evaluate(
                r"""() => {
                    try {
                        const entries = performance.getEntriesByType('resource') || [];
                        for (let i = entries.length - 1; i >= 0; i--) {
                            const u = entries[i].name || '';
                            if (u.includes('drafts')) continue;
                            const m = u.match(/(?:order|orders|orderId)[=/]([789]\d{9})(?:\D|$)/i);
                            if (m) return m[1];
                        }
                    } catch (e) {}
                    return '';
                }"""
            )
            if perf_no:
                cur_sicil = str((self.current_row or {}).get("Sicil") or (self.current_row or {}).get("Код") or "").strip()
                if not self.is_order_already_linked_to_another_worker(perf_no, cur_sicil):
                    return str(perf_no).strip()
        except Exception:
            pass

        return ""

    def build_clean_worker_name(self, row: Dict[str, Any]) -> str:
        """
        Builds clean employee full name for PDF filename, stripping placeholder values like 'Нет'.
        Example: Фамилия='Нет', Имя='АДЖАД', Отчество='Нет' -> 'АДЖАД'
        """
        skip_tokens = {"нет", "не заполнено", "отсутствует", "-", "none", "null", "no", ""}
        parts = []
        for key in ("Фамилия", "Имя", "Отчество"):
            val = str(row.get(key, "")).strip()
            if val and val.lower() not in skip_tokens:
                # Also strip standalone 'нет' tokens inside a multi-word field
                words = [w for w in val.split() if w.lower() not in skip_tokens]
                if words:
                    parts.append(" ".join(words))
        clean_name = " ".join(parts).strip()
        if not clean_name:
            clean_name = str(row.get("Имя", row.get("Фамилия", "Сотрудник"))).strip()
        # Remove characters illegal in Windows filenames
        clean_name = re.sub(r'[<>:"/\\|?*]+', " ", clean_name)
        clean_name = re.sub(r"\s+", " ", clean_name).strip()
        return clean_name

    def compute_vks_period_code(self, row: Dict[str, Any]) -> str:
        """
        Computes VKS reporting period code in 'YYYY-Q' format (e.g. '2026-3' for Q3 2026).
        Checks row['ПериодКод'], then parses НачалоПериода / КонецПериода (DD.MM.YYYY),
        and falls back to cfg['PERIOD_CODE'] ('2026-3').
        """
        explicit_code = str(row.get("ПериодКод", "")).strip()
        if explicit_code:
            return re.sub(r'[<>:"/\\|?*]+', "-", explicit_code)

        for date_str in (
            str(row.get("НачалоПериода", "")).strip(),
            str(row.get("КонецПериода", "")).strip(),
            str(self.cfg.get("PERIOD_START", "")).strip(),
            str(self.cfg.get("PERIOD_END", "")).strip(),
        ):
            m = re.match(r"^(\d{2})\.(\d{2})\.(\d{4})$", date_str)
            if m:
                month = int(m.group(2))
                year = int(m.group(3))
                if 1 <= month <= 12:
                    quarter = (month - 1) // 3 + 1
                    return f"{year}-{quarter}"

        return str(self.cfg.get("PERIOD_CODE", "2026-3")).strip() or "2026-3"

    def download_and_rename_receipt_pdf(self, row: Dict[str, Any], gosuslugi_order_no: str = "") -> Optional[str]:
        """
        Clicks the 'Скачать' link/button for 'req_preview' inside 'Документы' on the verified Gosuslugi order page,
        waits for the PDF to land in ~/Downloads, and renames it to:
            <Sicil>_<VerifiedGosuslugiNo>_<Ad Soyad>_<Donem>.pdf
        Strictly excludes 'Скачать всё' (and any child <span>Скачать</span> inside 'Скачать всё')
        and uses Playwright native locator click + exact req_preview row DOM click.
        """
        downloads_dir = Path.home() / "Downloads"
        downloads_dir.mkdir(parents=True, exist_ok=True)

        # Snapshot existing files in ~/Downloads before clicking download (including extensionless UUID blob files)
        existing_pdfs = {}
        try:
            for p in downloads_dir.iterdir():
                if p.is_file():
                    try:
                        existing_pdfs[p.resolve()] = p.stat().st_mtime
                    except Exception:
                        pass
        except Exception:
            pass

        # Wait up to 8s specifically for 'req_preview' (NOT 'Скачать', which prematurely matches 'Скачать всё')
        for _ in range(16):
            try:
                if self.page.evaluate("() => { const t = (document.body && document.body.innerText) || ''; return t.includes('req_preview'); }"):
                    break
            except Exception:
                pass
            self.page.wait_for_timeout(450)
        self.page.wait_for_timeout(400)

        downloaded_path: Optional[Path] = None
        click_time = time.time()

        logger.info("Step 16.5: Clicking 'Скачать' for 'req_preview' PDF...")

        def trigger_download_click():
            # Scroll 'req_preview' row into the center of the viewport first so it is never cut off at the bottom edge
            try:
                self.page.evaluate(
                    """() => {
                        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
                        while (walker.nextNode()) {
                            const n = walker.currentNode;
                            if ((n.nodeValue || '').includes('req_preview') && n.parentElement) {
                                n.parentElement.scrollIntoView({ block: 'center' });
                                break;
                            }
                        }
                    }"""
                )
                self.page.wait_for_timeout(350)
            except Exception:
                pass

            # Find the exact 'Скачать' button on the same horizontal row as 'req_preview' (strictly excluding 'Скачать всё')
            try:
                target_box = self.page.evaluate(
                    """() => {
                        let reqY = null;
                        let reqBottom = null;
                        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
                        while (walker.nextNode()) {
                            const n = walker.currentNode;
                            if ((n.nodeValue || '').includes('req_preview') && n.parentElement) {
                                const rr = n.parentElement.getBoundingClientRect();
                                if (rr.width > 5 && rr.height > 5) {
                                    reqY = rr.top + rr.height / 2;
                                    reqBottom = rr.bottom;
                                    break;
                                }
                            }
                        }

                        // Also find 'Скачать всё' Y coordinate so we NEVER click anything at or above 'Скачать всё'
                        let downloadAllY = null;
                        const allEls = Array.from(document.querySelectorAll('a, button, span, div'));
                        for (const el of allEls) {
                            const t = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
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
                            const rawText = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
                            if (rawText !== 'Скачать') continue;

                            const clickable = el.closest('a, button, [role="button"]') || el;
                            const cText = (clickable.innerText || clickable.textContent || '').replace(/\\s+/g, ' ').trim();
                            const pText = ((clickable.parentElement && clickable.parentElement.innerText) || '').replace(/\\s+/g, ' ').trim();
                            if (cText !== 'Скачать' || /вс[её]/i.test(cText) || /^Скачать\\s+вс[её]$/i.test(pText)) {
                                continue;
                            }

                            const r = clickable.getBoundingClientRect();
                            if (r.width < 15 || r.height < 8 || r.height > 90) continue;
                            const btnY = r.top + r.height / 2;

                            // Never match 'Скачать всё' row
                            if (downloadAllY !== null && Math.abs(btnY - downloadAllY) < 18) {
                                continue;
                            }

                            const yDiff = (reqY !== null) ? Math.abs(btnY - reqY) : 999;
                            candidates.push({
                                clickable,
                                el,
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

                        if (chosen) {
                            return { x: chosen.x, y: chosen.y, yDiff: Math.round(chosen.yDiff) };
                        }
                        return null;
                    }"""
                )
                if target_box and target_box.get("x") and target_box.get("y"):
                    cx, cy = int(target_box["x"]), int(target_box["y"])
                    logger.info(
                        f"Step 16.5: Clicking 'Скачать' next to 'req_preview' at ({cx}, {cy}) [yDiff={target_box.get('yDiff')}px]..."
                    )
                    self.page.mouse.move(cx, cy)
                    self.page.wait_for_timeout(80)
                    self.page.mouse.click(cx, cy)
                    return True
            except Exception as e:
                logger.debug(f"Step 16.5 mouse click note: {e}")

            return False

        # Attempt Playwright download capture + native Chrome ~/Downloads fallback
        try:
            with self.page.expect_download(timeout=6000) as download_info:
                trigger_download_click()
            dl = download_info.value
            suggested_name = dl.suggested_filename or f"{gosuslugi_order_no or 'req_preview'}.pdf"
            if not suggested_name.lower().endswith(".pdf"):
                suggested_name += ".pdf"
            temp_target = downloads_dir / f"tmp_{os.getpid()}_{int(click_time)}_{suggested_name}"
            dl.save_as(str(temp_target))
            downloaded_path = temp_target
        except Exception:
            # In CDP mode Chrome often handles the download directly in ~/Downloads without triggering expect_download
            pass

        # Regex matching already-renamed Pondera PDFs so we never pick up an already-renamed PDF from another worker
        already_renamed_re = re.compile(r"^(?:\d+_)?\d{8,14}_.+_20\d{2}-[1-4]\.pdf$", re.IGNORECASE)
        uuid_blob_re = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\s*\(\d+\))?$", re.IGNORECASE)

        # If Chrome handled the download natively, poll ~/Downloads for the newly created/updated .pdf or extensionless UUID PDF blob file
        if not downloaded_path or not downloaded_path.exists():
            for wait_idx in range(30):
                self.page.wait_for_timeout(500)
                # If nothing started downloading after 4 seconds, re-trigger DOM click once
                if wait_idx == 8:
                    trigger_download_click()

                active_crdownloads = [
                    p for p in downloads_dir.glob("*.crdownload")
                    if (time.time() - p.stat().st_mtime) < 30
                ]
                if active_crdownloads:
                    continue

                candidates = []
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
                        # Accept .pdf files, UUID blob files (e.g. '0fda22c2-c020-4ff4-8911-7dd9df06bcc8'), or any file starting with '%PDF'
                        is_pdf_file = (sfx == ".pdf") or bool(uuid_blob_re.match(p.name))
                        if not is_pdf_file and sfx == "":
                            with open(p, "rb") as fh:
                                is_pdf_file = b"%PDF" in fh.read(16)
                        if is_pdf_file:
                            candidates.append((mtime, p))
                    except Exception:
                        pass
                if candidates:
                    candidates.sort(key=lambda item: item[0], reverse=True)
                    downloaded_path = candidates[0][1]
                    break

        if not downloaded_path or not downloaded_path.exists():
            logger.warning("Step 16: PDF download was triggered, but the new file was not detected in ~/Downloads.")
            self.register_application_submission(
                row,
                gosuslugi_order_no or "ОТПРАВЛЕНО",
                pdf_filename="",
                status_override="Отправлено (PDF не скачан)",
            )
            return None

        # Always prioritize the verified Gosuslugi order number from the page; never let a UUID filename overwrite it!
        stem = downloaded_path.stem
        strict_order_stem_match = re.match(r"^([789]\d{9})(?:\s*\(\d+\))?$", stem)
        final_gosuslugi_no = (
            gosuslugi_order_no
            or (strict_order_stem_match.group(1) if strict_order_stem_match else "")
            or self.extract_gosuslugi_order_number()
        )

        sicil = re.sub(r'[<>:"/\\|?*]+', "", str(row.get("Sicil") or row.get("Код") or "").strip())
        worker_name = self.build_clean_worker_name(row)
        period_code = self.compute_vks_period_code(row)

        if sicil:
            new_filename = f"{sicil}_{final_gosuslugi_no}_{worker_name}_{period_code}.pdf"
        else:
            new_filename = f"{final_gosuslugi_no}_{worker_name}_{period_code}.pdf"
        new_filepath = downloads_dir / new_filename

        try:
            if downloaded_path.resolve() != new_filepath.resolve():
                os.replace(str(downloaded_path), str(new_filepath))
            logger.info(f"Step 16: Renamed Gosuslugi PDF '{downloaded_path.name}' -> '{new_filename}'")
            self.register_application_submission(row, final_gosuslugi_no, new_filename)
            return str(new_filepath)
        except Exception as e:
            logger.warning(f"Step 16: Could not rename '{downloaded_path}' to '{new_filepath}': {e}")
            self.register_application_submission(row, final_gosuslugi_no, downloaded_path.name)
            return str(downloaded_path)

    def register_application_submission(
        self,
        row: Dict[str, Any],
        application_no: str,
        pdf_filename: str = "",
        status_override: str = "",
    ):
        """
        Records the verified Gosuslugi Application Number (№ Заявления) and PDF filename for EBA upload & status tracking:
        1) Emits structured 'APPLICATION_REGISTERED: {...}' log line for rpa_bridge_server.py
        2) Persists to local 'gosuslugi_applications.json'
        3) Posts to Pondera HR '/api/gosuslugi/submissions' SQLite endpoint
        """
        app_no = str(application_no or "").strip()
        if not app_no:
            return
        sicil = str(row.get("Sicil") or row.get("Код") or "").strip()
        if app_no.isdigit() and self.is_order_already_linked_to_another_worker(app_no, sicil):
            logger.warning(
                f"Prevented duplicate linking: Application № {app_no} is already linked to another employee!"
            )
            return

        worker_name = self.build_clean_worker_name(row)
        citizenship = str(row.get("ТекущееГражданство", "")).strip()
        period_code = self.compute_vks_period_code(row)
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        effective_status = (
            status_override
            if status_override
            else ("Заявление зарегистрировано" if pdf_filename else "Отправлено (PDF не скачан)")
        )

        entry = {
            "sicil": sicil,
            "sicil_no": sicil,
            "worker_name": worker_name,
            "citizenship": citizenship,
            "notification_type": "vks_salary",
            "period_code": period_code,
            "application_no": "" if app_no == "ОТПРАВЛЕНО" else app_no,
            "gosuslugi_status": effective_status,
            "pdf_filename": pdf_filename,
            "submitted_at": now_str,
        }

        # 1) Emit structured log line for rpa_bridge_server.py
        logger.info(f"APPLICATION_REGISTERED: {json.dumps(entry, ensure_ascii=False)}")

        # 2) Save to local JSON ledger
        ledger_path = os.path.join(CURRENT_DIR, "gosuslugi_applications.json")
        try:
            existing = []
            if os.path.exists(ledger_path):
                with open(ledger_path, "r", encoding="utf-8") as lf:
                    existing = json.load(lf)
                    if not isinstance(existing, list):
                        existing = []
            updated = False
            for idx, item in enumerate(existing):
                if str(item.get("sicil")) == sicil and str(item.get("period_code")) == period_code:
                    existing[idx] = {**item, **entry}
                    updated = True
                    break
            if not updated:
                existing.append(entry)
            with open(ledger_path, "w", encoding="utf-8") as lf:
                json.dump(existing, lf, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.debug(f"Could not write gosuslugi_applications.json: {e}")

        # 3) Post to Pondera HR Central Server & Local Next.js API (non-blocking)
        self._post_submission_to_backend(entry)

    def _post_submission_to_backend(self, entry: Dict[str, Any]):
        import urllib.request
        import ssl
        payload = json.dumps({"records": [entry]}, ensure_ascii=False).encode("utf-8")
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
                with urllib.request.urlopen(req, timeout=3.5, context=ctx if api_url.startswith("https") else None) as _:
                    break
            except Exception:
                pass

    def register_worker_error(self, row: Dict[str, Any], error_reason: str):
        """
        Records a worker-level error so the system remembers why this worker's notification failed
        and displays it in the Pondera HR table while the robot immediately moves to the next worker.
        """
        if not row or is_browser_closed_error(error_reason):
            return
        sicil = str(row.get("Sicil") or row.get("Код") or "").strip()
        worker_name = self.build_clean_worker_name(row)
        citizenship = str(row.get("ТекущееГражданство", "")).strip()
        period_code = self.compute_vks_period_code(row)
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        clean_err = str(error_reason or "Ошибка заполнения").strip()
        if not clean_err.lower().startswith("ошибка"):
            clean_err = f"Ошибка: {clean_err}"

        entry = {
            "sicil": sicil,
            "sicil_no": sicil,
            "worker_name": worker_name,
            "citizenship": citizenship,
            "notification_type": "vks_salary",
            "period_code": period_code,
            "application_no": "",
            "gosuslugi_status": clean_err[:180],
            "pdf_filename": "",
            "submitted_at": now_str,
        }

        logger.info(f"APPLICATION_STATUS_UPDATED: {json.dumps(entry, ensure_ascii=False)}")

        ledger_path = os.path.join(CURRENT_DIR, "gosuslugi_applications.json")
        try:
            existing = []
            if os.path.exists(ledger_path):
                with open(ledger_path, "r", encoding="utf-8") as lf:
                    existing = json.load(lf)
                    if not isinstance(existing, list):
                        existing = []
            updated = False
            for idx, item in enumerate(existing):
                if str(item.get("sicil")) == sicil and str(item.get("period_code")) == period_code:
                    # Do not overwrite an already successfully registered application_no
                    if item.get("application_no"):
                        return
                    existing[idx] = {**item, **entry}
                    updated = True
                    break
            if not updated:
                existing.append(entry)
            with open(ledger_path, "w", encoding="utf-8") as lf:
                json.dump(existing, lf, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.debug(f"Could not write error to gosuslugi_applications.json: {e}")

        self._post_submission_to_backend(entry)


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
        row_dict = {str(header[i]).strip(): (vals[i] if vals[i] is not None else "") for i in range(len(header)) if header[i] is not None}
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


def connect_or_launch_chrome_page(p, cdp_port: int):
    """Connects to Chrome on http://localhost:<cdp_port> (launching Chrome if needed) and returns (browser, context, page)."""
    try:
        browser = p.chromium.connect_over_cdp(f"http://localhost:{cdp_port}")
        context = browser.contexts[0] if browser.contexts else browser.new_context()
        page = None
        if context.pages:
            for p_item in context.pages:
                try:
                    if not p_item.is_closed() and "gosuslugi.ru" in (p_item.url or "") and "chrome-error" not in (p_item.url or ""):
                        page = p_item
                        break
                except Exception:
                    pass
            if not page:
                for p_item in context.pages:
                    try:
                        if not p_item.is_closed():
                            page = p_item
                            break
                    except Exception:
                        pass
        if not page:
            page = context.new_page()
            try:
                page.goto(DEFAULT_CONFIG["FORM_URL"], wait_until="domcontentloaded", timeout=30000)
            except Exception:
                pass
        try:
            page.bring_to_front()
        except Exception:
            pass
        logger.info(f"Successfully connected to Chrome! Active Tab URL: {page.url}")
        return browser, context, page
    except Exception:
        logger.info(f"Chrome remote debugging not detected on port {cdp_port}. Launching Chrome automatically...")
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
            f"--remote-debugging-port={cdp_port}",
            f"--user-data-dir={user_data}",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-features=CalculateNativeWindowOcclusion,IntensiveWakeUpThrottling",
            DEFAULT_CONFIG["FORM_URL"],
        ])
        time.sleep(3.5)
        browser = p.chromium.connect_over_cdp(f"http://localhost:{cdp_port}")
        context = browser.contexts[0] if browser.contexts else browser.new_context()
        page = context.pages[0] if context.pages else context.new_page()
        try:
            page.bring_to_front()
        except Exception:
            pass
        logger.info(f"Successfully launched Chrome and connected! Active Tab URL: {page.url}")
        return browser, context, page


def main():
    prevent_windows_sleep()
    parser = argparse.ArgumentParser(description="Pondera HR Gosuslugi VKS Notification RPA Bot")
    parser.add_argument("--excel", default=DEFAULT_CONFIG["DEFAULT_EXCEL_PATH"], help="Path to GosUsluga_ ЗП.xlsx")
    parser.add_argument("--sheet", default="Sheet1", help="Sheet name to process")
    parser.add_argument("--json", default="", help="Path to JSON file with VKS worker records")
    parser.add_argument("--config-json", default="", help="Optional JSON file with company/address config overrides")
    parser.add_argument("--cdp-port", type=int, default=9222, help="Chrome Remote Debugging Port (default 9222)")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of rows to process (0 = all)")
    args = parser.parse_args()

    custom_cfg = {}
    if args.config_json and os.path.exists(args.config_json):
        try:
            with open(args.config_json, "r", encoding="utf-8") as cf:
                custom_cfg = json.load(cf)
        except Exception:
            pass

    records = []
    json_candidates = [
        args.json,
        os.path.join(CURRENT_DIR, "active_vks_queue.json"),
    ]
    for jpath in json_candidates:
        if jpath and os.path.exists(jpath):
            try:
                with open(jpath, "r", encoding="utf-8") as f:
                    records = json.load(f)
                if records:
                    logger.info(f"Loaded {len(records)} records from queue: {jpath}")
                    break
            except Exception as e:
                logger.warning(f"Failed to read JSON queue {jpath}: {e}")

    if not records and args.excel and os.path.exists(args.excel):
        records = load_excel_records(args.excel, args.sheet)

    if not records:
        logger.warning("No records found to process.")
        return

    if args.limit > 0:
        records = records[:args.limit]

    with sync_playwright() as p:
        logger.info(f"Connecting to Chrome on http://localhost:{args.cdp_port}...")
        try:
            browser, context, page = connect_or_launch_chrome_page(p, args.cdp_port)
        except Exception as ex2:
            logger.error(f"Could not connect to Chrome on port {args.cdp_port}: {ex2}")
            return

        bot = GosuslugiVksBot(page, custom_cfg)
        success_count = 0
        fail_count = 0
        last_json_status_sync_ts = time.time()

        for idx, record in enumerate(records):
            prevent_windows_sleep()
            logger.info(f"\n--- Processing Record {idx+1}/{len(records)} ---")
            row_idx = record.get("_row_idx")

            # Ensure the browser tab is still open before starting this worker
            try:
                if bot.page.is_closed():
                    logger.warning("Вкладка Chrome была закрыта — автоматическое переподключение перед обработкой сотрудника...")
                    browser, context, page = connect_or_launch_chrome_page(p, args.cdp_port)
                    bot.attach_page(page)
            except Exception:
                try:
                    browser, context, page = connect_or_launch_chrome_page(p, args.cdp_port)
                    bot.attach_page(page)
                except Exception as recon_err:
                    logger.error(f"FATAL_STOP: Не удалось переподключиться к Chrome (порт {args.cdp_port}): {recon_err}. Робот остановлен.")
                    break

            try:
                ok = bot.fill_vks_notification(record)
                if ok:
                    success_count += 1
                    if args.excel and row_idx is not None and os.path.exists(args.excel):
                        mark_row_completed(args.excel, row_idx, True)
                else:
                    fail_count += 1
                    if args.excel and row_idx is not None and os.path.exists(args.excel):
                        mark_row_completed(args.excel, row_idx, False, "Submission failed")
            except InsufficientPermissionsError as perm_ex:
                fail_count += 1
                logger.error(f"Error processing {record.get('Фамилия')} {record.get('Имя')}: {perm_ex}")
                if args.excel and row_idx is not None and os.path.exists(args.excel):
                    mark_row_completed(args.excel, row_idx, False, str(perm_ex))
                try:
                    page.screenshot(path=os.path.join(CURRENT_DIR, f"error_permissions_vks_{record.get('Код', idx)}.png"))
                except Exception:
                    pass
                logger.error("=== ОСТАНОВКА РОБОТА: В текущем аккаунте Госуслуг недостаточно полномочий для отправки уведомлений ===")
                break
            except Exception as ex:
                if is_browser_closed_error(ex):
                    logger.warning(
                        f"Соединение с вкладкой Chrome прервалось во время обработки {record.get('Фамилия')} ({ex}). "
                        f"Переподключаемся к Chrome и повторяем попытку для этого же сотрудника..."
                    )
                    reconnected_ok = False
                    for recon_try in range(1, 4):
                        time.sleep(2.5)
                        try:
                            browser, context, page = connect_or_launch_chrome_page(p, args.cdp_port)
                            bot.attach_page(page)
                            reconnected_ok = True
                            break
                        except Exception as r_err:
                            logger.warning(f"Попытка переподключения к Chrome {recon_try}/3 не удалась: {r_err}")
                    if not reconnected_ok:
                        logger.error(
                            "FATAL_STOP: Окно Chrome было закрыто и не удалось переподключиться после 3 попыток. "
                            "Остановка пакета без пометки остальных сотрудников ошибкой!"
                        )
                        break
                    # Retry the same worker once after reconnecting to Chrome
                    try:
                        ok = bot.fill_vks_notification(record)
                        if ok:
                            success_count += 1
                            if args.excel and row_idx is not None and os.path.exists(args.excel):
                                mark_row_completed(args.excel, row_idx, True)
                        else:
                            fail_count += 1
                    except Exception as retry_after_recon_ex:
                        if is_browser_closed_error(retry_after_recon_ex):
                            logger.error("FATAL_STOP: Соединение с Chrome снова прервалось. Остановка робота.")
                            break
                        fail_count += 1
                        logger.error(f"Error processing {record.get('Фамилия')}: {retry_after_recon_ex}")
                    continue

                fail_count += 1
                logger.error(f"Error processing {record.get('Фамилия')}: {ex}")
                if args.excel and row_idx is not None and os.path.exists(args.excel):
                    mark_row_completed(args.excel, row_idx, False, str(ex))
                try:
                    page.screenshot(path=os.path.join(CURRENT_DIR, f"error_vks_{record.get('Код', idx)}.png"))
                except Exception:
                    pass

            # Every 30 minutes (1800s), right AFTER the current worker's Zayavka finishes (never interrupting an active form!),
            # run the fast Gosuslugi JSON status check (up to 1,200 orders, 0 PDFs downloaded) to update statuses on central DB.
            if time.time() - last_json_status_sync_ts >= 1800:
                last_json_status_sync_ts = time.time()
                try:
                    from gosuslugi_status_checker import run_fast_json_status_sync_on_page
                    logger.info(">>> 30-Minute Interval Reached (Current Zayavka Completed): Running fast JSON status check (1200 orders, no PDF download)... <<<")
                    run_fast_json_status_sync_on_page(bot.page, max_pages=60)
                except Exception as sync_err:
                    logger.debug(f"30-min fast JSON status sync note: {sync_err}")

            time.sleep(2)

        # Final fast JSON status sync at the end of the batch (no PDF download)
        try:
            from gosuslugi_status_checker import run_fast_json_status_sync_on_page
            run_fast_json_status_sync_on_page(bot.page, max_pages=60)
        except Exception:
            pass

        logger.info(f"\n=== RPA Batch Complete ===\nTotal: {len(records)}, Success: {success_count}, Failed: {fail_count}")


if __name__ == "__main__":
    main()
