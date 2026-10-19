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
from typing import Dict, Any, List, Optional
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


class GosuslugiVksBot:
    def __init__(self, page: Page, config: Dict[str, Any] = None):
        self.page = page
        self.cfg = {**DEFAULT_CONFIG, **(config or {})}
        self.current_row: Dict[str, Any] = {}
        self.allow_full_restart: bool = True

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

    def check_and_handle_error_modal(self) -> bool:
        """Equivalent to PAD GetError subflow: Click 'Попробовать ещё раз' or MVD warning continue."""
        handled = False
        try:
            retry_btn = self.page.locator("button:has-text('Попробовать ещё раз'), span:has-text('Попробовать ещё раз')")
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
                logger.warning("Detected MVD warning modal. Clicking continue...")
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

    def type_masked_input(self, selector: str, value: str, delay: int = 35) -> bool:
        """Fills a Gosuslugi Angular masked input using physical keyboard strokes so validation triggers."""
        val = str(value or "").strip()
        if not val:
            return False
        loc = self.page.locator(selector).first
        if loc.count() == 0:
            return False
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

    def fill_citizenship_strict(self, citizenship: str) -> bool:
        """
        Reliably fills 'Гражданство' (#dic13_ctz) on Step 6 using real keystrokes (`press_sequentially`)
        so Gosuslugi's <lib-lookup> filters the country list, then clicks the exact matching option
        inside `#lookup-list-wrap` and verifies `.displayed.lookup-item` matches `citizenship`
        (preventing accidental selection of the first unfiltered item 'Абхазия').
        """
        ctz_val = str(citizenship or "Турция").strip()
        ctz_lower = ctz_val.lower()

        for attempt in range(1, 4):
            try:
                # 1) Check if `.displayed.lookup-item` already shows the right country
                displayed = self.page.locator("lib-lookup .displayed.lookup-item").first
                if displayed.count() > 0 and displayed.is_visible():
                    cur_selected = displayed.inner_text().strip()
                    if cur_selected and ctz_lower in cur_selected.lower():
                        logger.info(f"Step 6: Гражданство already verified as '{cur_selected}'.")
                        return True
                    # Wrong country selected (e.g. 'Абхазия') -> click 'button.search-clear' (X)
                    logger.warning(
                        f"Step 6: Гражданство shows '{cur_selected}' instead of '{ctz_val}' -> clearing..."
                    )

                clr_btn = self.page.locator("lib-lookup button.search-clear:visible, button.search-clear:visible").first
                if clr_btn.count() > 0 and clr_btn.is_visible():
                    try:
                        clr_btn.click(timeout=2000)
                    except Exception:
                        clr_btn.evaluate("el => el.click()")
                    self.page.wait_for_timeout(300)

                ctz_inp = self.page.locator(
                    "#dic13_ctz, input[id*='ctz'], lib-lookup input.search-input"
                ).first
                if ctz_inp.count() == 0:
                    return False

                try:
                    ctz_inp.scroll_into_view_if_needed(timeout=2000)
                except Exception:
                    pass

                # 2) Focus #dic13_ctz, clear any text, and type character-by-character so Angular filters the list!
                ctz_inp.click()
                self.page.wait_for_timeout(150)
                self.page.keyboard.press("Control+A")
                self.page.keyboard.press("Backspace")
                self.page.wait_for_timeout(200)
                ctz_inp.press_sequentially(ctz_val, delay=65)
                self.page.wait_for_timeout(900)

                # 3) Find the exact matching option inside `#lookup-list-wrap .lookup-item` (never pick unfiltered index 0!)
                options = self.page.locator(
                    "#lookup-list-wrap .lookup-item:not(.nothing-found):visible, "
                    "div[role='listbox'] .lookup-item:not(.nothing-found):visible"
                )
                matched_opt = None
                opt_count = options.count()
                # Prefer exact case-insensitive match first, then substring match
                for idx in range(opt_count):
                    cand = options.nth(idx)
                    txt = cand.inner_text().strip()
                    if txt.lower() == ctz_lower:
                        matched_opt = cand
                        break
                if matched_opt is None:
                    for idx in range(opt_count):
                        cand = options.nth(idx)
                        txt = cand.inner_text().strip()
                        if ctz_lower in txt.lower():
                            matched_opt = cand
                            break

                if matched_opt is not None:
                    opt_text = matched_opt.inner_text().strip()
                    logger.info(f"Step 6: Selecting Гражданство option '{opt_text}' (attempt {attempt})...")
                    try:
                        matched_opt.click(timeout=2500)
                    except Exception:
                        matched_opt.evaluate("el => el.click()")
                    self.page.wait_for_timeout(550)

                # 4) Verify `.displayed.lookup-item` now contains the requested country
                displayed_after = self.page.locator("lib-lookup .displayed.lookup-item").first
                if displayed_after.count() > 0 and displayed_after.is_visible():
                    sel_after = displayed_after.inner_text().strip()
                    if ctz_lower in sel_after.lower():
                        logger.info(f"Step 6: Confirmed Гражданство = '{sel_after}'.")
                        return True
                    logger.warning(
                        f"Step 6: Expected '{ctz_val}' in Гражданство, but got '{sel_after}' on attempt {attempt}."
                    )
            except Exception as e:
                logger.debug(f"fill_citizenship_strict attempt {attempt} note: {e}")
                self.page.wait_for_timeout(400)

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
        """Returns True if the visible input matching `selector` is empty or has class `invalid`."""
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
        ('Обязательно для заполнения', etc.) appear, and automatically re-fills/selects
        any missing or invalid fields.
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
                last_name = str(row.get("Фамилия", "")).strip() or "Нет"
                first_name = str(row.get("Имя", "")).strip()
                middle_name = str(row.get("Отчество", "")).strip() or "НЕТ"
                bdate_str = str(row.get("ДатаРождения", "")).strip()
                citizenship = str(row.get("ТекущееГражданство", "Турция")).strip()
                pob_val = str(row.get("МестоРождения", "")).strip() or citizenship
                gender = str(row.get("Пол", "Мужской")).strip()
                gender_label = "Женский" if gender.lower().startswith("ж") or gender.lower().startswith("k") else "Мужской"

                if self.is_input_empty_or_invalid("#si13_lastNameRu, input[name*='lastNameRu']"):
                    logger.info("Auto-repair Step 6: Re-filling Фамилия...")
                    self.type_masked_input("#si13_lastNameRu, input[name*='lastNameRu']", last_name, delay=30)
                    repaired = True

                if self.is_input_empty_or_invalid("#si13_firstNameRu, input[name*='firstNameRu']"):
                    logger.info("Auto-repair Step 6: Re-filling Имя...")
                    self.type_masked_input("#si13_firstNameRu, input[name*='firstNameRu']", first_name, delay=30)
                    repaired = True

                if self.is_input_empty_or_invalid("#si13_secondNameRu, input[name*='secondNameRu']"):
                    logger.info("Auto-repair Step 6: Re-filling Отчество...")
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

                if self.is_input_empty_or_invalid("#si13_pob, input[name*='pob']"):
                    logger.info("Auto-repair Step 6: Re-filling Место рождения...")
                    self.type_masked_input("#si13_pob, input[name*='pob']", pob_val, delay=30)
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
                if self.is_input_empty_or_invalid("#si14_issuedBy_125:visible, input[id*='issuedBy']:visible"):
                    self.type_masked_input("#si14_issuedBy_125, input[id*='issuedBy'], input[name*='issuedBy']", str(row.get("ПаспортКемВыдан", "")).strip(), delay=25)
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

        try:
            return self._execute_vks_notification_attempt(
                row, full_name, code, last_name, first_name, middle_name, form_attempt=1
            )
        except InsufficientPermissionsError:
            # Never retry when the Gosuslugi account lacks authority ('У вас недостаточно полномочий для отправки уведомлений')
            raise
        except Exception as ex:
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

        last_name_input = self.page.locator("#si13_lastNameRu, input[name*='lastNameRu']").first
        last_name_input.wait_for(state="visible", timeout=25000)
        self.type_masked_input("#si13_lastNameRu, input[name*='lastNameRu']", last_name, delay=25)

        citizenship = str(row.get("ТекущееГражданство", "Турция")).strip()

        # First Name & Middle Name
        self.type_masked_input("#si13_firstNameRu, input[name*='firstNameRu']", first_name, delay=25)
        self.type_masked_input("#si13_secondNameRu, input[name*='secondNameRu']", middle_name if middle_name else "НЕТ", delay=25)

        # Birth Date (di13_birth / __.__.____)
        bdate_str = str(row.get("ДатаРождения", "")).strip()
        self.type_masked_input("input[name='di13_birth'], input[placeholder*='__.__.____']", bdate_str, delay=35)

        # Citizenship selection (Гражданство -> #dic13_ctz + .lookup-item click)
        self.fill_citizenship_strict(citizenship)

        # Place of Birth (si13_pob)
        pob_val = str(row.get("МестоРождения", "")).strip() or citizenship
        self.type_masked_input("#si13_pob, input[name*='pob']", pob_val, delay=25)

        # Gender ('Мужской' / 'Женский')
        gender = str(row.get("Пол", "Мужской")).strip()
        gender_label = "Женский" if gender.lower().startswith("ж") or gender.lower().startswith("k") else "Мужской"
        gender_span = self.page.locator(f"label.radio:has-text('{gender_label}'), span:has-text('{gender_label}'), label:has-text('{gender_label}')").first
        if gender_span.count() > 0 and gender_span.is_visible():
            gender_span.click()
        self.page.wait_for_timeout(600)

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
        self.type_masked_input("#si14_issuedBy_125, input[id*='issuedBy'], input[name*='issuedBy']", str(row.get("ПаспортКемВыдан", "")).strip(), delay=25)
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

        # Step 16: Personal Cabinet & Receipt PDF Download + Rename (<Sicil>_<GosuslugiNo>_<Ad Soyad>_<Donem>.pdf)
        self.execute_step16_cabinet_and_download(row, gosuslugi_order_no)

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

        # Case A: Pre-selected MVD screen ('Подразделение МВД, куда отправится уведомление') with #dic18 & 'Изменить' button
        dic18_readonly = self.page.locator("input#dic18:visible").first
        izmenit_btn = self.page.locator(
            "lib-button[data-button-type='skipstep'] button:visible, "
            "button:has-text('Изменить'):visible"
        ).first

        if dic18_readonly.count() > 0 or izmenit_btn.count() > 0:
            cur_dept = ""
            if dic18_readonly.count() > 0:
                try:
                    cur_dept = dic18_readonly.input_value().strip()
                except Exception:
                    pass

            if "МОСКВ" not in cur_dept.upper():
                logger.info(
                    f"Step 12: Pre-selected MVD is '{cur_dept or 'non-Moscow'}' -> clicking 'Изменить' to select '{target_dept}'..."
                )
                if izmenit_btn.count() > 0 and izmenit_btn.is_visible():
                    try:
                        izmenit_btn.click(timeout=3000)
                    except Exception:
                        izmenit_btn.evaluate("el => (el.closest('button') || el).click()")
                    self.page.wait_for_timeout(800)
            else:
                logger.info(f"Step 12: MVD department already set to '{cur_dept}' -> clicking 'Продолжить'...")
                cont_btn = self.page.locator(
                    "lib-button[data-button-type='nextstep'] button:visible, "
                    "button:has-text('Продолжить'):visible"
                ).last
                if cont_btn.count() > 0 and cont_btn.is_enabled():
                    cont_btn.click(timeout=3000)
                    self.page.wait_for_timeout(1500)
                    return True

        # Case B: Manual MVD lookup screen ('Выберите подразделение МВД, куда отправится уведомление') with #dic18_byHand
        by_hand_inp = self.page.locator("input#dic18_byHand, lib-lookup input.search-input").first
        mvd_heading = self.page.locator("h1:has-text('Выберите подразделение МВД'):visible")
        if (by_hand_inp.count() > 0 and by_hand_inp.is_visible()) or mvd_heading.count() > 0:
            for mvd_try in range(1, 4):
                cont_btn = self.page.locator(
                    "lib-button[data-button-type='nextstep'] button:visible, "
                    "button:has-text('Продолжить'):visible"
                ).last

                displayed_mvd = self.page.locator("lib-lookup .displayed.lookup-item").first
                cur_disp_txt = (
                    displayed_mvd.inner_text().strip().upper()
                    if (displayed_mvd.count() > 0 and displayed_mvd.is_visible())
                    else ""
                )

                cont_ready = (
                    cont_btn.count() > 0
                    and cont_btn.is_enabled()
                    and (cont_btn.get_attribute("disabled") is None)
                    and ("disabled" not in (cont_btn.get_attribute("class") or ""))
                )

                if cont_ready and "МОСКВ" in cur_disp_txt:
                    break

                by_hand_inp = self.page.locator("input#dic18_byHand, lib-lookup input.search-input").first
                logger.info(
                    f"Step 12 (Attempt {mvd_try}/3): Typing 'МОСКВЕ' in #dic18_byHand to select '{target_dept}'..."
                )
                clr_btn = self.page.locator("lib-lookup button.search-clear:visible, button.search-clear:visible").first
                if clr_btn.count() > 0 and clr_btn.is_visible():
                    try:
                        clr_btn.click(timeout=2000)
                    except Exception:
                        clr_btn.evaluate("el => el.click()")
                    self.page.wait_for_timeout(250)

                if by_hand_inp.count() > 0:
                    by_hand_inp.click()
                    self.page.wait_for_timeout(150)
                    self.page.keyboard.press("Control+A")
                    self.page.keyboard.press("Backspace")
                    self.page.wait_for_timeout(200)
                    # Type 'МОСКВЕ' so the dropdown immediately filters to the exact Moscow MVD division
                    by_hand_inp.press_sequentially("МОСКВЕ", delay=80)

                logger.info("Step 12: Waiting up to 4.5s for MVD dropdown option ('МОСКВЕ')...")
                options_selector = (
                    "#lookup-list-wrap .lookup-item:not(.nothing-found):visible, "
                    "div[role='listbox'] .lookup-item:not(.nothing-found):visible, "
                    "lib-lookup .lookup-item:not(.nothing-found):visible, "
                    ".lookup-item:not(.nothing-found):visible, "
                    "[role='option']:visible"
                )
                options = self.page.locator(options_selector)
                clicked_option = False

                for _ in range(15):  # 15 * 300ms = 4.5 seconds max wait
                    self.page.wait_for_timeout(300)

                    # Strategy 1: Standard Playwright locator match
                    opt_count = options.count()
                    if opt_count > 0:
                        matched_mvd = None
                        for idx in range(opt_count):
                            cand = options.nth(idx)
                            try:
                                txt_up = cand.inner_text().strip().upper()
                            except Exception:
                                continue
                            if ("ТРУДОВОЙ МИГРАЦИИ" in txt_up and "МОСКВ" in txt_up) or ("ГУ МВД РОССИИ ПО Г. МОСКВЕ" in txt_up):
                                matched_mvd = cand
                                break
                        if matched_mvd is None:
                            matched_mvd = options.first

                        if matched_mvd is not None:
                            try:
                                opt_txt = matched_mvd.inner_text().strip()
                                logger.info(f"Step 12: Clicking MVD lookup option: '{opt_txt}'...")
                                matched_mvd.click(timeout=2500)
                            except Exception:
                                try:
                                    matched_mvd.evaluate("el => el.click()")
                                except Exception:
                                    pass
                            clicked_option = True
                            self.page.wait_for_timeout(800)
                            break

                    # Strategy 2: Deep DOM JavaScript scan for any visible dropdown item containing 'ТРУДОВОЙ МИГРАЦИИ' or 'ПО Г. МОСКВЕ'
                    dom_box = None
                    try:
                        dom_box = self.page.evaluate(
                            """() => {
                                const all = Array.from(document.querySelectorAll('div, li, span, p, a'));
                                let best = null;
                                let bestArea = Infinity;
                                for (const el of all) {
                                    if (el.closest('button') || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') continue;
                                    const txt = (el.innerText || '').trim().toUpperCase();
                                    if (!txt || txt.length > 220) continue;
                                    if (
                                        (txt.includes('ТРУДОВОЙ МИГРАЦИИ') && txt.includes('МОСКВ')) ||
                                        txt.includes('УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ')
                                    ) {
                                        const r = el.getBoundingClientRect();
                                        if (r.width > 40 && r.height >= 14 && r.height <= 130) {
                                            const area = r.width * r.height;
                                            if (area < bestArea) {
                                                bestArea = area;
                                                best = { el, x: r.left + r.width / 2, y: r.top + r.height / 2, text: txt };
                                            }
                                        }
                                    }
                                }
                                if (best) {
                                    const target = best.el.closest('.lookup-item, [role="option"], li') || best.el;
                                    target.click();
                                    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                                    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                                    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                    return { x: best.x, y: best.y, text: best.text };
                                }
                                return null;
                            }"""
                        )
                    except Exception:
                        dom_box = None

                    if dom_box:
                        logger.info(f"Step 12: Clicked MVD option via DOM scan: '{dom_box.get('text')}'...")
                        try:
                            self.page.mouse.click(float(dom_box["x"]), float(dom_box["y"]))
                        except Exception:
                            pass
                        clicked_option = True
                        self.page.wait_for_timeout(800)
                        break

                # Strategy 3: Keyboard ArrowDown + Enter fallback if 'Продолжить' is still disabled
                cont_btn = self.page.locator(
                    "lib-button[data-button-type='nextstep'] button:visible, "
                    "button:has-text('Продолжить'):visible"
                ).last
                is_cont_enabled = (
                    cont_btn.count() > 0
                    and cont_btn.is_enabled()
                    and (cont_btn.get_attribute("disabled") is None)
                    and ("disabled" not in (cont_btn.get_attribute("class") or ""))
                )
                if not is_cont_enabled:
                    try:
                        self.page.keyboard.press("ArrowDown")
                        self.page.wait_for_timeout(200)
                        self.page.keyboard.press("Enter")
                        self.page.wait_for_timeout(700)
                    except Exception:
                        pass

                # Check if 'Продолжить' is now enabled and click it
                cont_btn = self.page.locator(
                    "lib-button[data-button-type='nextstep'] button:visible, "
                    "button:has-text('Продолжить'):visible"
                ).last
                if (
                    cont_btn.count() > 0
                    and cont_btn.is_enabled()
                    and (cont_btn.get_attribute("disabled") is None)
                    and ("disabled" not in (cont_btn.get_attribute("class") or ""))
                ):
                    logger.info("Step 12: MVD department selected -> clicking 'Продолжить'...")
                    try:
                        cont_btn.focus()
                        cont_btn.click(timeout=3000)
                    except Exception:
                        cont_btn.evaluate("el => (el.closest('button') || el).click()")
                    self.page.wait_for_timeout(1500)
                    self.check_and_stop_if_insufficient_permissions()
                    return True

                logger.warning(f"Step 12: MVD selection attempt {mvd_try}/3 did not enable 'Продолжить' yet...")

            err_msg = "Ошибка [Шаг 12: Подразделение МВД]: Не удалось выбрать подразделение МВД по фильтру «МОСКВЕ» после 3 попыток"
            self.register_worker_error(self.current_row or {}, err_msg)
            raise RuntimeError(err_msg)

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

    def does_citizen_match_worker(self, citizen_text: str, row: Dict[str, Any], page_body_text: str = "") -> bool:
        """
        Verifies that the 'Гражданин' field on the Gosuslugi order page/card matches the employee in `row`.
        Handles cases where Фамилия or Отчество is 'Нет' (e.g. 'Нет АДЖАД Нет' -> significant token ['аджад']).
        """
        # Build required significant tokens from Фамилия, Имя, Отчество (excluding 'Нет')
        raw_last = str(row.get("Фамилия", "")).strip()
        raw_first = str(row.get("Имя", "")).strip()
        raw_mid = str(row.get("Отчество", "")).strip()

        primary_tokens = self._normalize_ru_tokens(f"{raw_last} {raw_first}")
        if not primary_tokens:
            primary_tokens = self._normalize_ru_tokens(f"{raw_last} {raw_first} {raw_mid}")
        if not primary_tokens:
            primary_tokens = self._normalize_ru_tokens(self.build_clean_worker_name(row))
        if not primary_tokens:
            return False

        citizen_tokens = self._normalize_ru_tokens(citizen_text)

        # Fallback: if citizen_tokens is empty (e.g. DOM extracted only 'Нет'), inspect the 'Гражданин' block in page_body_text
        if not citizen_tokens and page_body_text:
            m_block = re.search(
                r"Гражданин\s*:?\s*([\s\S]{1,120}?)(?:Документы|История|Показать историю|Скачать|Адрес|Статус|Инициатор|$)",
                page_body_text,
                re.IGNORECASE,
            )
            if m_block:
                citizen_tokens = self._normalize_ru_tokens(m_block.group(1))

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
        haystack = re.sub(r"\s+", " ", f"{citizen_text} {page_body_text}".lower().replace("ё", "е")).strip()
        if full_with_net and len(full_with_net) >= 3 and full_with_net in haystack:
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

    def inspect_open_order_page(self) -> Dict[str, str]:
        """
        Inspects the currently open Gosuslugi order details page (https://lk.gosuslugi.ru/order/<feed_id>)
        and extracts:
        - order_no: e.g. '8281910041'
        - service_title: e.g. 'Уведомления о трудовой деятельности иностранцев'
        - citizen_name: value displayed under 'Гражданин' (e.g. 'Нет АДЖАД Нет'), joining multi-line spans so 'Нет' never truncates the real name!
        - body_text: full visible text of the page for fallback verification
        """
        for _ in range(12):
            try:
                body_now = self.page.locator("body").inner_text(timeout=1500)
                if "Гражданин" in body_now or "Заявление" in body_now or "req_preview" in body_now:
                    break
            except Exception:
                pass
            self.page.wait_for_timeout(500)

        info = {"order_no": "", "service_title": "", "citizen_name": "", "body_text": ""}
        try:
            dom_extracted = self.page.evaluate(
                """() => {
                    const res = { order_no: "", service_title: "", citizen_name: "" };
                    const stopWords = /^(документы|история|показать историю|скачать|адрес|статус|сведения|отправитель|инициатор)$/i;

                    // 1. Heading / Service title
                    const headings = Array.from(document.querySelectorAll('h1, h2, h3, .order-title, .title-h3'));
                    for (const h of headings) {
                        const t = (h.innerText || "").trim();
                        if (t.includes("Уведомлени") || t.includes("Заявлени")) {
                            res.service_title = t.split("\\n")[0].trim();
                            break;
                        }
                    }

                    // 2. Find 'Гражданин' label and read the complete value next to / below it (joining multi-span/multi-line FIO like 'Нет АДЖАД Нет')
                    const allEls = Array.from(document.querySelectorAll('div, span, p, dt, td, label'));
                    for (const el of allEls) {
                        const txt = (el.innerText || "").trim();
                        if (txt === "Гражданин" || txt === "Гражданин:" || txt === "Иностранный гражданин") {
                            let cur = el;
                            for (let depth = 0; depth < 4 && cur; depth++) {
                                const next = cur.nextElementSibling;
                                if (next && (next.innerText || "").trim()) {
                                    const lines = (next.innerText || "")
                                        .split("\\n")
                                        .map(s => s.trim())
                                        .filter(s => s && !stopWords.test(s));
                                    if (lines.length > 0) {
                                        res.citizen_name = lines.join(" ").replace(/\\s+/g, " ").trim();
                                        break;
                                    }
                                }
                                if (cur.parentElement) {
                                    const pLines = (cur.parentElement.innerText || "")
                                        .split("\\n")
                                        .map(s => s.trim())
                                        .filter(Boolean);
                                    const gIdx = pLines.findIndex(l => /^Гражданин\\s*:?$/i.test(l) || l.startsWith("Гражданин"));
                                    if (gIdx !== -1 && pLines.length > gIdx + 1) {
                                        const collected = [];
                                        for (let k = gIdx + 1; k < Math.min(pLines.length, gIdx + 4); k++) {
                                            if (stopWords.test(pLines[k])) break;
                                            collected.push(pLines[k]);
                                        }
                                        if (collected.length > 0) {
                                            res.citizen_name = collected.join(" ").replace(/\\s+/g, " ").trim();
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
            body_text = self.page.locator("body").inner_text(timeout=3000)
            info["body_text"] = body_text
            # If citizen_name is empty or only captured 'Нет' (1 word when full name has more lines), parse from body_text
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
                        if re.match(r"^(документы|история|показать историю|скачать|адрес|статус|сведения|действия)", ln, re.IGNORECASE):
                            break
                        filtered_lines.append(ln)
                    if filtered_lines:
                        info["citizen_name"] = " ".join(filtered_lines).strip()

            if not info["service_title"]:
                m_srv = re.search(r"(Уведомлени[ея]\s+о\s+[^\r\n№]+)", body_text, re.IGNORECASE)
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

    def find_worker_order_via_feeds_api(self, row: Dict[str, Any], expected_order_no: str = "") -> Optional[Dict[str, str]]:
        """
        Queries Gosuslugi's internal /api/lk/v1/feeds/ JSON API directly inside the browser session
        to find the exact order belonging to `row` (matching 'Гражданин' or `expected_order_no`).
        """
        sicil = str(row.get("Sicil") or row.get("Код") or "").strip()
        feed_url = (
            "https://www.gosuslugi.ru/api/lk/v1/feeds/"
            "?unread=false&isArchive=false&isHide=&types=ORDER,EQUEUE,APPEAL,CLAIM,SIGN,KND_APPEAL,LICENSING,LICENSING_APPEAL"
            "&pageSize=25&status=&startDate=&lastFeedId=&lastFeedDate=&q="
        )
        try:
            raw_items = self.page.evaluate(
                """async (url) => {
                    const resp = await fetch(url, { credentials: "include", headers: { "Accept": "application/json" } });
                    if (!resp.ok) return [];
                    const data = await resp.json();
                    return Array.isArray(data.items) ? data.items : [];
                }""",
                feed_url,
            )
        except Exception as e:
            logger.debug(f"Feeds API lookup note: {e}")
            raw_items = []

        if not isinstance(raw_items, list):
            return None

        candidates = []
        for raw_it in raw_items:
            if not isinstance(raw_it, dict):
                continue
            data_obj = raw_it.get("data") or {}
            ext_id = str(raw_it.get("extId") or data_obj.get("orderId") or "").strip()
            feed_id = str(raw_it.get("id") or "").strip()
            sub_title = str(raw_it.get("subTitle") or "").strip().strip("«»\"'")
            raw_title = str(raw_it.get("title") or "").strip()

            if not ext_id or not ext_id.isdigit():
                continue

            # Exclude 'Уведомления о прибытии и убытии иностранцев' (migration registration, not labor/VKS)
            if "прибытии" in sub_title.lower() or "убытии" in sub_title.lower():
                continue

            # Exclude drafts
            if "черновик" in raw_title.lower():
                continue

            # Exclude orders already linked to another worker
            if self.is_order_already_linked_to_another_worker(ext_id, sicil):
                continue

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
                    return item_info

            if citizen_name and self.does_citizen_match_worker(citizen_name, row):
                candidates.append(item_info)

        if candidates:
            return candidates[0]
        return None

    def execute_step16_cabinet_and_download(self, row: Dict[str, Any], gosuslugi_order_no: str = ""):
        """
        Executes Step 16 after 'Уведомление отправлено' with strict multi-computer & citizen verification:
        1) Verifies no 'У вас недостаточно полномочий' error is on screen
        2) Clicks 'В личный кабинет' or navigates to https://lk.gosuslugi.ru/orders
        3) Finds the exact order where 'Гражданин' matches `row` (including names with 'Нет' like 'Нет АДЖАД Нет')
        4) Downloads 'req_preview' PDF (whether 'Скачать' is an <a>, <button>, or <span>) and renames it to
           <Sicil>_<VerifiedGosuslugiNo>_<WorkerName>_<Period>.pdf
        """
        self.check_and_stop_if_insufficient_permissions()
        clean_worker_name = self.build_clean_worker_name(row)
        sicil = str(row.get("Sicil") or row.get("Код") or "").strip()
        expected_order_no = str(gosuslugi_order_no or "").strip()

        logger.info(
            f"Step 16: Searching Personal Cabinet for verified Zayavka of Гражданин '{clean_worker_name}' (Код: {sicil})..."
        )

        # 16.1 Click 'В личный кабинет' if currently on the 'Уведомление отправлено' confirmation screen
        cabinet_btn = self.page.locator(
            "button:has-text('В личный кабинет'):visible, "
            "a:has-text('В личный кабинет'):visible, "
            "span:has-text('В личный кабинет'):visible"
        ).first
        if "lk.gosuslugi.ru" not in (self.page.url or ""):
            try:
                cabinet_btn.wait_for(state="visible", timeout=10000)
            except Exception:
                pass
        if cabinet_btn.count() > 0 and cabinet_btn.is_visible():
            logger.info("Step 16.1: Clicking 'В личный кабинет'...")
            try:
                cabinet_btn.click(timeout=5000)
            except Exception:
                cabinet_btn.evaluate("el => (el.closest('button, a') || el).click()")
            self.page.wait_for_timeout(3000)

        verified_order_no = ""
        checked_urls = set()

        # Check if we are ALREADY on an '/order/...' details page right now
        if "lk.gosuslugi.ru/order/" in (self.page.url or ""):
            page_info = self.inspect_open_order_page()
            if (
                "прибытии" not in page_info["service_title"].lower()
                and "убытии" not in page_info["service_title"].lower()
                and self.does_citizen_match_worker(page_info["citizen_name"], row, page_info.get("body_text", ""))
                and not self.is_order_already_linked_to_another_worker(page_info["order_no"], sicil)
            ):
                verified_order_no = page_info["order_no"] or expected_order_no

        # Up to 3 search passes (allowing Gosuslugi a few seconds to index the newly submitted notification)
        for search_pass in range(1, 4):
            if verified_order_no:
                break

            # Pass Strategy A: Query Gosuslugi's /api/lk/v1/feeds/ JSON API for Citizen Name or expected_order_no match
            api_match = self.find_worker_order_via_feeds_api(row, expected_order_no)
            if api_match and api_match.get("feed_id"):
                target_order_url = f"https://lk.gosuslugi.ru/order/{api_match['feed_id']}"
                logger.info(
                    f"Step 16.2 (API Match): Found order № {api_match['application_no']} for Гражданин '{api_match['citizen_name']}' -> opening {target_order_url}..."
                )
                try:
                    self.page.goto(target_order_url, wait_until="domcontentloaded", timeout=30000)
                    self.page.wait_for_timeout(2500)
                except Exception as e:
                    logger.warning(f"Step 16.2 navigation note: {e}")

                page_info = self.inspect_open_order_page()
                logger.info(
                    f"Step 16.3: Order Page Check -> № {page_info['order_no']} | Услуга: '{page_info['service_title']}' | Гражданин: '{page_info['citizen_name']}'"
                )
                is_citizen_ok = self.does_citizen_match_worker(
                    page_info["citizen_name"] or api_match["citizen_name"],
                    row,
                    page_info.get("body_text", ""),
                ) or (expected_order_no and page_info["order_no"] == expected_order_no)
                if (
                    "прибытии" not in page_info["service_title"].lower()
                    and "убытии" not in page_info["service_title"].lower()
                    and is_citizen_ok
                    and not self.is_order_already_linked_to_another_worker(page_info["order_no"] or api_match["application_no"], sicil)
                ):
                    verified_order_no = page_info["order_no"] or api_match["application_no"]
                    logger.info(
                        f"Step 16.3 VERIFIED: Заявление № {verified_order_no} принадлежит сотруднику '{clean_worker_name}' (Гражданин: '{page_info['citizen_name'] or api_match['citizen_name']}')!"
                    )
                    break

            # Pass Strategy B: Inspect https://lk.gosuslugi.ru/orders list and check recent order cards
            orders_list_url = "https://lk.gosuslugi.ru/orders?type=ORDER,EQUEUE,APPEAL,CLAIM,SIGN,KND_APPEAL,LICENSING,LICENSING_APPEAL"
            if "lk.gosuslugi.ru/orders" not in (self.page.url or ""):
                logger.info(f"Step 16.2 (Pass {search_pass}/3): Navigating to Заявления (lk.gosuslugi.ru/orders)...")
                try:
                    self.page.goto(orders_list_url, wait_until="domcontentloaded", timeout=35000)
                    self.page.wait_for_timeout(3000)
                except Exception as e:
                    logger.warning(f"Orders page navigation note: {e}")

            worker_tokens = self._normalize_ru_tokens(clean_worker_name)
            candidate_hrefs: List[str] = []
            try:
                raw_cards = self.page.evaluate(
                    """() => {
                        const results = [];
                        const links = Array.from(document.querySelectorAll("a[href*='/order/']"));
                        for (const a of links) {
                            const href = a.getAttribute("href") || "";
                            const card = a.closest("div.feed-item, lib-feed-item, .order-item") || a;
                            const text = (card.innerText || "").trim();
                            if (href) results.push({ href, text });
                        }
                        return results;
                    }"""
                )
                if isinstance(raw_cards, list):
                    # Pass 0: Card explicitly containing expected_order_no from Step 15
                    if expected_order_no:
                        for c in raw_cards:
                            c_text = str(c.get("text") or "")
                            c_href = str(c.get("href") or "").strip()
                            if c_href and expected_order_no in c_text:
                                full_u = c_href if c_href.startswith("http") else f"https://lk.gosuslugi.ru{c_href if c_href.startswith('/') else '/' + c_href}"
                                if full_u not in candidate_hrefs:
                                    candidate_hrefs.append(full_u)

                    # Pass 1: Cards explicitly mentioning the worker's significant name tokens (e.g. 'аджад')
                    for c in raw_cards:
                        c_text_low = str(c.get("text") or "").lower().replace("ё", "е")
                        c_href = str(c.get("href") or "").strip()
                        if not c_href or "прибытии" in c_text_low or "убытии" in c_text_low or "черновик" in c_text_low:
                            continue
                        if worker_tokens and all(tok in c_text_low for tok in worker_tokens):
                            full_u = c_href if c_href.startswith("http") else f"https://lk.gosuslugi.ru{c_href if c_href.startswith('/') else '/' + c_href}"
                            if full_u not in candidate_hrefs:
                                candidate_hrefs.append(full_u)

                    # Pass 2: Top 4 recent labor activity orders that haven't been checked yet
                    for c in raw_cards[:6]:
                        c_text_low = str(c.get("text") or "").lower().replace("ё", "е")
                        c_href = str(c.get("href") or "").strip()
                        if not c_href or "прибытии" in c_text_low or "убытии" in c_text_low or "черновик" in c_text_low:
                            continue
                        m_card_cit = re.search(r"гражданин\s*:?\s*([^\n\r]+)", c_text_low)
                        if m_card_cit and not self.does_citizen_match_worker(m_card_cit.group(1), row, c_text_low):
                            logger.info(
                                f"Step 16.2: Skipping card in list because Гражданин '{m_card_cit.group(1).strip()}' != '{clean_worker_name}'"
                            )
                            continue
                        full_u = c_href if c_href.startswith("http") else f"https://lk.gosuslugi.ru{c_href if c_href.startswith('/') else '/' + c_href}"
                        if full_u not in candidate_hrefs and full_u not in checked_urls:
                            candidate_hrefs.append(full_u)
            except Exception:
                pass

            for cand_url in candidate_hrefs[:4]:
                checked_urls.add(cand_url)
                logger.info(f"Step 16.2: Opening candidate order {cand_url} to verify 'Гражданин'...")
                try:
                    self.page.goto(cand_url, wait_until="domcontentloaded", timeout=30000)
                    self.page.wait_for_timeout(2500)
                except Exception:
                    continue

                page_info = self.inspect_open_order_page()
                p_no = page_info["order_no"]
                p_srv = page_info["service_title"]
                p_cit = page_info["citizen_name"]
                p_body = page_info.get("body_text", "")

                logger.info(
                    f"Step 16.3: Order Page Check -> № {p_no or '?'} | Услуга: '{p_srv}' | Гражданин: '{p_cit}'"
                )

                if "прибытии" in p_srv.lower() or "убытии" in p_srv.lower():
                    logger.warning(
                        f"Step 16 MISMATCH: Заявление № {p_no} относится к услуге '{p_srv}' (Гражданин: '{p_cit}'), а не к ВКС! Пропускаем..."
                    )
                    continue

                is_match = self.does_citizen_match_worker(p_cit, row, p_body) or (
                    expected_order_no and p_no == expected_order_no
                )
                if not is_match:
                    logger.warning(
                        f"Step 16 MISMATCH: В заявлении № {p_no} указан Гражданин '{p_cit}', а робот ищет '{clean_worker_name}'! "
                        f"Чужое заявление пропускается..."
                    )
                    continue

                if self.is_order_already_linked_to_another_worker(p_no, sicil):
                    logger.warning(
                        f"Step 16 MISMATCH: Заявление № {p_no} уже привязано к другому сотруднику! Пропускаем..."
                    )
                    continue

                verified_order_no = p_no or expected_order_no
                logger.info(
                    f"Step 16.3 VERIFIED: Найдено верное заявление № {verified_order_no} для Гражданина '{p_cit}' (Код: {sicil})!"
                )
                break

            if verified_order_no:
                break

            logger.info(
                f"Step 16: Waiting 3 seconds before retry pass {search_pass + 1}/3 for '{clean_worker_name}' to appear in Заявления..."
            )
            self.page.wait_for_timeout(3000)

        if not verified_order_no:
            err_msg = (
                f"Step 16 Error: В личном кабинете Госуслуг не найдено зарегистрированное заявление для гражданина "
                f"'{clean_worker_name}' (Код: {sicil}). Чужие заявления были отфильтрованы."
            )
            logger.error(err_msg)
            raise RuntimeError(err_msg)

        # 16.4 Click 'Показать историю' if 'req_preview' is not already visible on the verified order screen
        req_preview_loc = self.page.locator("text='req_preview'")
        if req_preview_loc.count() == 0 or not req_preview_loc.first.is_visible():
            show_history = self.page.locator(
                "a:has-text('Показать историю'):visible, "
                "button:has-text('Показать историю'):visible, "
                "span:has-text('Показать историю'):visible"
            ).first
            try:
                show_history.wait_for(state="visible", timeout=6000)
            except Exception:
                pass
            if show_history.count() > 0 and show_history.is_visible():
                logger.info("Step 16.4: Clicking 'Показать историю'...")
                try:
                    show_history.scroll_into_view_if_needed(timeout=3000)
                except Exception:
                    pass
                try:
                    show_history.click(timeout=5000)
                except Exception:
                    show_history.evaluate("el => (el.closest('a, button') || el).click()")
                self.page.wait_for_timeout(2000)

        # 16.5 Click 'Скачать' next to 'req_preview' under 'Документы' and rename the PDF
        saved_pdf_path = self.download_and_rename_receipt_pdf(row, verified_order_no)
        if saved_pdf_path:
            logger.info(f"Step 16.5: Official Gosuslugi PDF saved as: {saved_pdf_path}")

    def extract_gosuslugi_order_number(self) -> str:
        """
        Extracts the Gosuslugi application number (e.g. '8265228795' from '№ 8265228795' under
        'Уведомления о трудовой деятельности иностранцев').
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
        Supports <a>, <button>, <span>, and DOM coordinate click fallbacks.
        """
        downloads_dir = Path.home() / "Downloads"
        downloads_dir.mkdir(parents=True, exist_ok=True)

        # Snapshot existing PDFs in ~/Downloads before clicking download
        existing_pdfs = {}
        try:
            for p in downloads_dir.glob("*.pdf"):
                try:
                    existing_pdfs[p.resolve()] = p.stat().st_mtime
                except Exception:
                    pass
        except Exception:
            pass

        # Wait briefly for 'req_preview' or 'Документы' to be visible
        try:
            self.page.locator("text='req_preview'").first.wait_for(state="visible", timeout=8000)
        except Exception:
            pass

        # Locate the specific 'Скачать' control for 'req_preview' (supporting <a>, <button>, <span>, etc., excluding 'Скачать всё')
        download_selectors = [
            "lib-file:has-text('req_preview') a:has-text('Скачать')",
            "lib-file:has-text('req_preview') button:has-text('Скачать')",
            "lib-file:has-text('req_preview') span:has-text('Скачать')",
            "lib-file:has-text('req_preview') a",
            "lib-file:has-text('req_preview') button",
            "a[aria-label*='req_preview'], button[aria-label*='req_preview']",
            "a[title*='req_preview'], button[title*='req_preview']",
            "div.history-status.open lk-files lib-file a",
            "lk-files lib-file:has-text('PDF') a, lk-files lib-file:has-text('PDF') button",
            "lk-files a:has-text('Скачать'):not(:has-text('всё')), lk-files button:has-text('Скачать'):not(:has-text('всё'))",
            "a:has-text('Скачать'):not(:has-text('всё'))",
            "button:has-text('Скачать'):not(:has-text('всё'))",
            "span:has-text('Скачать'):not(:has-text('всё'))",
        ]
        download_link = None
        for sel in download_selectors:
            loc = self.page.locator(sel)
            if loc.count() > 0:
                for idx in range(loc.count()):
                    cand = loc.nth(idx)
                    try:
                        if cand.is_visible() and "всё" not in (cand.inner_text() or "").lower():
                            download_link = cand
                            break
                    except Exception:
                        continue
            if download_link is not None:
                break

        downloaded_path: Optional[Path] = None
        click_time = time.time()

        logger.info("Step 16.5: Clicking 'Скачать' for 'req_preview' PDF...")

        def trigger_download_click():
            if download_link is not None:
                try:
                    download_link.scroll_into_view_if_needed(timeout=2500)
                except Exception:
                    pass
                try:
                    download_link.click(timeout=3500)
                    return True
                except Exception:
                    try:
                        download_link.evaluate("el => (el.closest('a, button') || el).click()")
                        return True
                    except Exception:
                        pass

            # Deep DOM JavaScript + Mouse Coordinate fallback: find 'req_preview' row and click its 'Скачать' button/link
            try:
                box = self.page.evaluate(
                    """() => {
                        const all = Array.from(document.querySelectorAll('a, button, span, div'));
                        // Find all visible elements whose exact text is 'Скачать' (not 'Скачать всё')
                        const dlButtons = all.filter(el => {
                            const t = (el.innerText || '').trim();
                            if (t !== 'Скачать') return false;
                            const r = el.getBoundingClientRect();
                            return r.width > 20 && r.height > 10 && r.height < 80;
                        });
                        // Prefer the one inside the same container as 'req_preview'
                        for (const btn of dlButtons) {
                            let p = btn.parentElement;
                            for (let d = 0; d < 5 && p; d++) {
                                if ((p.innerText || '').includes('req_preview')) {
                                    const target = btn.closest('a, button') || btn;
                                    target.click();
                                    const r = target.getBoundingClientRect();
                                    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                                }
                                p = p.parentElement;
                            }
                        }
                        if (dlButtons.length > 0) {
                            const target = dlButtons[0].closest('a, button') || dlButtons[0];
                            target.click();
                            const r = target.getBoundingClientRect();
                            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                        }
                        return null;
                    }"""
                )
                if box:
                    self.page.mouse.click(float(box["x"]), float(box["y"]))
                    return True
            except Exception:
                pass
            return False

        # Attempt Playwright download capture + native Chrome ~/Downloads fallback
        try:
            with self.page.expect_download(timeout=6000) as download_info:
                trigger_download_click()
            dl = download_info.value
            suggested_name = dl.suggested_filename or f"{gosuslugi_order_no or 'req_preview'}.pdf"
            temp_target = downloads_dir / f"tmp_{os.getpid()}_{int(click_time)}_{suggested_name}"
            dl.save_as(str(temp_target))
            downloaded_path = temp_target
        except Exception:
            # In CDP mode Chrome often handles the download directly in ~/Downloads without triggering expect_download
            pass

        # Regex matching already-renamed Pondera PDFs so we never pick up an already-renamed PDF from another worker
        already_renamed_re = re.compile(r"^(?:\d+_)?\d{8,14}_.+_20\d{2}-[1-4]\.pdf$", re.IGNORECASE)

        # If Chrome handled the download natively, poll ~/Downloads for the newly created/updated .pdf file
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
                for p in downloads_dir.glob("*.pdf"):
                    try:
                        if already_renamed_re.match(p.name):
                            continue
                        resolved = p.resolve()
                        mtime = p.stat().st_mtime
                        if resolved not in existing_pdfs or mtime > existing_pdfs[resolved] or mtime >= (click_time - 2.0):
                            candidates.append((mtime, p))
                    except Exception:
                        pass
                if candidates:
                    candidates.sort(key=lambda item: item[0], reverse=True)
                    downloaded_path = candidates[0][1]
                    break

        if not downloaded_path or not downloaded_path.exists():
            logger.warning("Step 16: PDF download was triggered, but the new file was not detected in ~/Downloads.")
            if gosuslugi_order_no:
                self.register_application_submission(row, gosuslugi_order_no, "")
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

    def register_application_submission(self, row: Dict[str, Any], application_no: str, pdf_filename: str = ""):
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
        if self.is_order_already_linked_to_another_worker(app_no, sicil):
            logger.error(
                f"Prevented duplicate linking: Application № {app_no} is already linked to another employee!"
            )
            return

        worker_name = self.build_clean_worker_name(row)
        citizenship = str(row.get("ТекущееГражданство", "")).strip()
        period_code = self.compute_vks_period_code(row)
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        entry = {
            "sicil": sicil,
            "sicil_no": sicil,
            "worker_name": worker_name,
            "citizenship": citizenship,
            "notification_type": "vks_salary",
            "period_code": period_code,
            "application_no": app_no,
            "gosuslugi_status": "Заявление зарегистрировано",
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

        # 3) Post to Pondera HR Next.js API (non-blocking)
        try:
            import urllib.request
            req = urllib.request.Request(
                "http://localhost:3000/api/gosuslugi/submissions",
                data=json.dumps(entry, ensure_ascii=False).encode("utf-8"),
                headers={"Content-Type": "application/json; charset=utf-8"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=2.5) as _:
                pass
        except Exception:
            pass

    def register_worker_error(self, row: Dict[str, Any], error_reason: str):
        """
        Records a worker-level error so the system remembers why this worker's notification failed
        and displays it in the Pondera HR table while the robot immediately moves to the next worker.
        """
        if not row:
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

        try:
            import urllib.request
            req = urllib.request.Request(
                "http://localhost:3000/api/gosuslugi/submissions",
                data=json.dumps(entry, ensure_ascii=False).encode("utf-8"),
                headers={"Content-Type": "application/json; charset=utf-8"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=2.5) as _:
                pass
        except Exception:
            pass


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


def main():
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
                logger.error(f"Could not connect to Chrome on port {args.cdp_port}: {ex2}")
                return

        bot = GosuslugiVksBot(page, custom_cfg)
        success_count = 0
        fail_count = 0

        for idx, record in enumerate(records):
            logger.info(f"\n--- Processing Record {idx+1}/{len(records)} ---")
            row_idx = record.get("_row_idx")
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
                fail_count += 1
                logger.error(f"Error processing {record.get('Фамилия')}: {ex}")
                if args.excel and row_idx is not None and os.path.exists(args.excel):
                    mark_row_completed(args.excel, row_idx, False, str(ex))
                try:
                    page.screenshot(path=os.path.join(CURRENT_DIR, f"error_vks_{record.get('Код', idx)}.png"))
                except Exception:
                    pass

            time.sleep(2)

        logger.info(f"\n=== RPA Batch Complete ===\nTotal: {len(records)}, Success: {success_count}, Failed: {fail_count}")


if __name__ == "__main__":
    main()
