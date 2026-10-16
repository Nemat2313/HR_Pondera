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
    "PERIOD_END": "19.08.2026",
    "PERIOD_CODE": "2026-3",
    "DEFAULT_EXCEL_PATH": r"C:\Users\nemat\Downloads\GosUsluga_ ЗП.xlsx",
    "CDP_PORT": 9222,
}


class RestartZayavkaException(Exception):
    """Raised when step auto-repair cannot activate 'Продолжить' on Attempt 1 so the entire Zayavka restarts from Step 1."""
    pass


class GosuslugiVksBot:
    def __init__(self, page: Page, config: Dict[str, Any] = None):
        self.page = page
        self.cfg = {**DEFAULT_CONFIG, **(config or {})}
        self.current_row: Dict[str, Any] = {}
        self.allow_full_restart: bool = True

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
            mvd_warning = self.page.locator("text='Данные не найдены в базе МВД', text='МВД может отказать'")
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
            if self.page.locator("input[name='di16_1']:visible, input[name='c_startDate']:visible, input#index:visible").count() > 0 or "Шаг 10" in step_name:
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
                if end_date and self.is_input_empty_or_invalid("input[name='c_endDate']:visible"):
                    self.type_masked_input("input[name='c_endDate']", end_date, delay=35)
                postal_code = str(row.get("Индекс", "")).strip() or str(self.cfg["WORK_POSTAL_CODE"])
                self.fill_postal_code_strict(postal_code)
                self.set_address_checkbox("Нет дома", "houseCheckbox", True)
                self.set_address_checkbox("Нет квартиры", "apartmentCheckbox", True)
                repaired = True

            # 6) Step 11: Salary Payment Period & Amount
            if self.page.locator("input[name='di17_start']:visible, #si17_paid:visible").count() > 0 or "Шаг 11" in step_name:
                period_start = str(row.get("НачалоПериода", "")).strip() or self.cfg["PERIOD_START"]
                period_end = str(row.get("КонецПериода", "")).strip() or self.cfg["PERIOD_END"]
                paid_amount = str(row.get("РазмерВыплаты", "")).strip()
                if self.is_input_empty_or_invalid("input[name='di17_start']:visible"):
                    self.type_masked_input("input[name='di17_start']", period_start, delay=35)
                if self.is_input_empty_or_invalid("input[name='di17_end']:visible"):
                    self.type_masked_input("input[name='di17_end']", period_end, delay=35)
                yes_radio = self.page.locator("label.radio:has-text('Да'):visible, lib-radio:has-text('Да') label:visible").first
                if yes_radio.count() > 0 and yes_radio.is_visible():
                    yes_radio.click()
                    self.page.wait_for_timeout(300)
                if self.is_input_empty_or_invalid("#si17_paid:visible, input[name='si17_paid']:visible"):
                    self.type_masked_input("#si17_paid, input[name='si17_paid']", paid_amount, delay=35)
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
        3) If still inactive after 3 repair passes on Attempt 1 (`self.allow_full_restart`), raises `RestartZayavkaException`
           so the robot automatically restarts the entire Zayavka from Step 1!
        4) On Attempt 2, enters Human-in-the-Loop pause mode if still blocked.
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

        # Phase 2: Automatic Field-Level Self-Healing (up to 3 repair passes)
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

        # Phase 3: If auto-repair exhausted on Attempt 1 -> Restart the entire Zayavka from Step 1!
        red_errs = self.has_red_validation_errors()
        err_desc = ", ".join(red_errs) if red_errs else "Кнопка «Продолжить» неактивна (серая)"
        if self.allow_full_restart:
            logger.warning(
                f"[{step_name}] Auto-repair exhausted ({err_desc}) -> Restarting this Zayavka from Step 1!"
            )
            raise RestartZayavkaException(f"[{step_name}] {err_desc}")

        # Phase 4 (Attempt 2 last resort): Human-in-the-Loop Manual Intervention Mode
        logger.warning(
            f"WAITING_FOR_USER: [{step_name}] На странице Госуслуг требуется проверка ({err_desc}). "
            f"Исправьте поле в Chrome и нажмите «Продолжить» (или кнопку «Продолжить» в Pondera HR)."
        )

        for tick in range(300):
            self.check_and_handle_error_modal()

            current_heading = self.get_current_heading()
            if initial_heading and current_heading and current_heading != initial_heading:
                logger.info(f"USER_RESOLVED: Page advanced to '{current_heading}'. Resuming robot...")
                self.page.wait_for_timeout(1000)
                return

            user_signaled = os.path.exists(MANUAL_CONTINUE_SIGNAL)
            if user_signaled:
                try:
                    os.remove(MANUAL_CONTINUE_SIGNAL)
                except Exception:
                    pass

            red_errs_now = self.has_red_validation_errors()
            btn_now = self.page.locator("button:has-text('Продолжить'):visible").last
            if btn_now.count() > 0:
                disabled_attr = btn_now.get_attribute("disabled")
                cls_attr = btn_now.get_attribute("class") or ""
                is_disabled = (disabled_attr is not None) or ("disabled" in cls_attr) or (not btn_now.is_enabled())

                if not is_disabled and (len(red_errs_now) == 0 or user_signaled):
                    logger.info(f"USER_RESOLVED: [{step_name}] Validation passed! Clicking 'Продолжить'...")
                    btn_now.focus()
                    btn_now.click()
                    self.wait_for_screen_transition(initial_heading, wait_ms)
                    return

            self.page.wait_for_timeout(1000)

        raise RuntimeError(f"Timeout waiting for manual correction on step: {step_name}")

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
        Executes the complete Gosuslugi VKS Salary Notification flow for a single employee.
        If any step cannot activate 'Продолжить' even after 3 field-level auto-repair attempts,
        automatically restarts the entire Zayavka from Step 1 (Attempt 2/2).
        """
        self.current_row = row
        last_name = str(row.get("Фамилия", "")).strip()
        first_name = str(row.get("Имя", "")).strip()
        middle_name = str(row.get("Отчество", "")).strip()
        code = str(row.get("Код", row.get("Sicil", ""))).strip()
        full_name = f"{last_name} {first_name} {middle_name}".strip()

        for form_attempt in (1, 2):
            self.allow_full_restart = (form_attempt == 1)
            try:
                if form_attempt > 1:
                    logger.warning(
                        f"=== RETRYING ZAYAVKA FROM SCRATCH (Attempt {form_attempt}/2) for {full_name} (Код: {code}) ==="
                    )
                return self._execute_vks_notification_attempt(row, full_name, code, last_name, first_name, middle_name, form_attempt)
            except RestartZayavkaException as rex:
                logger.warning(
                    f"Attempt {form_attempt} triggered full Zayavka restart ({rex}) -> starting fresh Zayavka from Step 1..."
                )
                self.page.wait_for_timeout(1500)
                continue
            except Exception as ex:
                if form_attempt == 1:
                    logger.warning(
                        f"Attempt 1 encountered error ({ex}) -> restarting Zayavka from Step 1 (Attempt 2/2)..."
                    )
                    self.page.wait_for_timeout(1500)
                    continue
                raise

        return False

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

        # Resume check: if Chrome is ALREADY on 'Уведомление отправлено' ('В личный кабинет') or lk.gosuslugi.ru (and PDF not yet saved), jump to Step 16!
        try:
            cur_url = self.page.url or ""
            sent_heading = self.page.locator("text='Уведомление отправлено':visible")
            cab_btn = self.page.locator("button:has-text('В личный кабинет'):visible, a:has-text('В личный кабинет'):visible, span:has-text('В личный кабинет'):visible")
            is_on_sent_screen = sent_heading.count() > 0 and cab_btn.count() > 0

            clean_w_name = self.build_clean_worker_name(row)
            p_code = self.compute_vks_period_code(row)
            already_downloaded = list((Path.home() / "Downloads").glob(f"*_{clean_w_name}_{p_code}.pdf"))
            is_on_lk_for_pending_pdf = ("lk.gosuslugi.ru/notifications" in cur_url or "lk.gosuslugi.ru/order/" in cur_url) and len(already_downloaded) == 0

            if is_on_sent_screen or is_on_lk_for_pending_pdf:
                logger.info("Detected open submission/cabinet screen in Chrome! Proceeding directly to Step 16 (PDF Download & Rename)...")
                order_no = self.extract_gosuslugi_order_number()
                self.execute_step16_cabinet_and_download(row, order_no)
                logger.info(f"SUCCESS: Notification submitted for {full_name}!")
                return True
        except Exception:
            pass

        # Step 1: Navigate to https://www.gosuslugi.ru/600585/1/form (or reuse immediately if already open on form/modal)
        cur_url_now = self.page.url or ""
        already_on_form_modal = (
            "600585/1/form" in cur_url_now
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

            # Priority 1: Drafts Modal ('Выберите черновик...' -> delete oldest draft if needed, scroll modal & click 'Создать заявление')
            draft_items = self.page.locator(".draft-list .draft, epgu-constructor-draft-list .draft")
            create_btn = self.page.locator(
                "lib-button.conf-modal__button button, "
                ".conf-modal__controls button, "
                "button:has-text('Создать заявление'), "
                "button:has-text('Создать новое заявление'), "
                "button:has-text('Новое заявление')"
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
                            const btn = document.querySelector(
                                'lib-button.conf-modal__button button, .conf-modal__controls button'
                            ) || Array.from(document.querySelectorAll('button')).find(
                                b => (b.innerText || '').includes('Создать заявление') || (b.innerText || '').includes('Создать новое')
                            );
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

                # Check if 'Создать заявление' is disabled/inactive OR if too many drafts block creation
                btn_disabled = True
                if create_btn.count() > 0 and create_btn.is_visible():
                    dis_attr = create_btn.get_attribute("disabled")
                    cls_attr = create_btn.get_attribute("class") or ""
                    btn_disabled = (dis_attr is not None) or ("disabled" in cls_attr) or (not create_btn.is_enabled())

                if btn_disabled or create_click_attempts >= 1 or draft_items.count() >= 9:
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

        # 10b. Contract Dates (Дата заключения, Дата начала действия, Дата окончания действия)
        contract_date = str(row.get("ДатаЗаключения", row.get("ДатаПриема", ""))).strip()
        if contract_date:
            self.type_masked_input("input[name='di16_1'], input[name='di16_2']", contract_date, delay=35)

        start_date = str(row.get("ДатаНачалаДействия", contract_date)).strip()
        if start_date:
            self.type_masked_input("input[name='c_startDate']", start_date, delay=35)

        end_date = str(row.get("ДатаОканчанияДействия", row.get("ДатаОкончанияДействия", ""))).strip()
        if end_date:
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

        # Normalize query for DaData if it contains 'Восточный промышленный район' and ('5-й' or 'квартал 5')
        is_tobolsk_kv5 = "Восточный промышленный район" in work_addr and ("5-й" in work_addr or "квартал 5" in work_addr or "кв-л 5" in work_addr)
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
            self.page.wait_for_timeout(200)
            addr_textarea.fill(dadata_query)
        else:
            self.page.keyboard.press("Tab")
            self.page.wait_for_timeout(200)
            self.page.keyboard.type(dadata_query, delay=30)

        self.page.wait_for_timeout(1800)

        # Select matching FIAS/DaData suggestion item from dropdown
        try:
            lookup_items = self.page.locator("epgu-constructor-address-input .lookup-item:not(.nothing-found):visible")
            item_count = lookup_items.count()
            if is_tobolsk_kv5 and item_count > 0:
                clicked_kv5 = False
                for idx_i in range(item_count):
                    txt_i = lookup_items.nth(idx_i).inner_text().strip()
                    if txt_i.endswith("квартал 5") or txt_i.endswith("кв-л 5") or txt_i.endswith("5-й"):
                        lookup_items.nth(idx_i).click()
                        clicked_kv5 = True
                        self.page.wait_for_timeout(900)
                        break
                if not clicked_kv5:
                    lookup_items.first.click()
                    self.page.wait_for_timeout(900)
            elif item_count > 0:
                lookup_items.first.click()
                self.page.wait_for_timeout(900)
        except Exception:
            pass

        # Expand 'Уточнить адрес' (button.clarify-address) if detailed fields (input#index) are not yet visible
        try:
            if self.page.locator("input#index:visible").count() == 0:
                clarify_btn = self.page.locator("button.clarify-address, text='Уточнить адрес'").first
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

        # Step 11: VKS Salary Payment Details ('Укажите информацию о выплате зарплаты иностранцу')
        logger.info(
            f"Step 11: Filling Salary Payment Period ({row.get('НачалоПериода')} - {row.get('КонецПериода')}) "
            f"& Amount: {row.get('РазмерВыплаты')}..."
        )
        self.check_and_handle_error_modal()

        period_start = str(row.get("НачалоПериода", "")).strip() or self.cfg["PERIOD_START"]
        period_end = str(row.get("КонецПериода", "")).strip() or self.cfg["PERIOD_END"]
        paid_amount = str(row.get("РазмерВыплаты", "")).strip()

        p_start_input = self.page.locator("input[name='di17_start']").first
        p_start_input.wait_for(state="visible", timeout=20000)
        self.type_masked_input("input[name='di17_start']", period_start, delay=35)
        self.type_masked_input("input[name='di17_end']", period_end, delay=35)

        # Select Radio 'Да'
        yes_radio = self.page.locator("label.radio:has-text('Да'), lib-radio:has-text('Да') label").first
        if yes_radio.count() > 0 and yes_radio.is_visible():
            yes_radio.click()
            self.page.wait_for_timeout(400)

        # Populate Salary Amount (#si17_paid)
        self.type_masked_input("#si17_paid, input[name='si17_paid']", paid_amount, delay=35)
        self.page.wait_for_timeout(600)

        self.click_continue_strict("Шаг 11: Выплата зарплаты ВКС", 2000)

        # Steps 12 -> 13 -> 14 -> 15: Resilient State-Machine Loop through MVD Division, Consents, and Final 'Отправить'
        gosuslugi_order_no = self.complete_mvd_and_submit_flow()

        # Step 16: Personal Cabinet & Receipt PDF Download + Rename (<Sicil>_<GosuslugiNo>_<Ad Soyad>_<Donem>.pdf)
        self.execute_step16_cabinet_and_download(row, gosuslugi_order_no)

        # IMPORTANT: Do not change this log prefix — rpa_bridge_server.py parses it to count success
        logger.info(f"SUCCESS: Notification submitted for {full_name}!")
        return True

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
        if needed and selects 'ОТДЕЛ ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ'
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

            if not (cont_ready and "ТРУДОВОЙ МИГРАЦИИ" in cur_disp_txt and "МОСКВ" in cur_disp_txt):
                logger.info(
                    f"Step 12: Typing 'мос' in #dic18_byHand to select '{target_dept}'..."
                )
                # Clear existing text or wrong selection via the X ('button.search-clear') button if present
                clr_btn = self.page.locator("lib-lookup button.search-clear:visible, button.search-clear:visible").first
                if clr_btn.count() > 0 and clr_btn.is_visible():
                    try:
                        clr_btn.click(timeout=2000)
                    except Exception:
                        clr_btn.evaluate("el => el.click()")
                    self.page.wait_for_timeout(300)

                by_hand_inp = self.page.locator("input#dic18_byHand, lib-lookup input.search-input").first
                if by_hand_inp.count() > 0:
                    by_hand_inp.click()
                    self.page.wait_for_timeout(150)
                    self.page.keyboard.press("Control+A")
                    self.page.keyboard.press("Backspace")
                    self.page.wait_for_timeout(200)
                    # Type 'мос' character-by-character so Gosuslugi's <lib-lookup> opens the Moscow MVD list!
                    by_hand_inp.press_sequentially("мос", delay=90)
                    self.page.wait_for_timeout(1100)

                options = self.page.locator(
                    "#lookup-list-wrap .lookup-item:not(.nothing-found):visible, "
                    "div[role='listbox'] .lookup-item:not(.nothing-found):visible, "
                    ".lookup-item:not(.nothing-found):visible"
                )
                matched_mvd = None
                opt_count = options.count()
                for idx in range(opt_count):
                    cand = options.nth(idx)
                    txt_up = cand.inner_text().strip().upper()
                    if "ТРУДОВОЙ МИГРАЦИИ" in txt_up and "МОСКВ" in txt_up:
                        matched_mvd = cand
                        break
                if matched_mvd is None:
                    for idx in range(opt_count):
                        cand = options.nth(idx)
                        txt_up = cand.inner_text().strip().upper()
                        if "ГУ МВД РОССИИ ПО Г. МОСКВЕ" in txt_up or "УВМ ГУ МВД" in txt_up:
                            matched_mvd = cand
                            break

                if matched_mvd is not None:
                    opt_txt = matched_mvd.inner_text().strip()
                    logger.info(f"Step 12: Clicking MVD lookup option: '{opt_txt}'...")
                    try:
                        matched_mvd.click(timeout=3000)
                    except Exception:
                        matched_mvd.evaluate("el => el.click()")
                    self.page.wait_for_timeout(800)

            # Now click 'Продолжить' if enabled
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
                return True

        return False

    def complete_mvd_and_submit_flow(self) -> str:
        """
        State-machine loop for Steps 12 -> 13 -> 14 -> 15:
        Advances through 'Подразделение МВД' (selecting Moscow OВТМ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ),
        'Подтвердить' consent modal, 'Согласие на обработку ПДн',
        and reliably clicks 'Отправить' on 'Уведомление готово к отправке' until 'Уведомление отправлено'
        or 'В личный кабинет' is reached.
        """
        logger.info("Steps 12-15: Advancing through MVD division, consents, and final 'Отправить' screen...")
        gosuslugi_order_no = ""

        for tick in range(55):
            self.check_and_handle_error_modal()
            cur_url = self.page.url or ""

            # 1) Check if we have ALREADY reached the final confirmation screen ('Уведомление отправлено' / 'В личный кабинет') or lk.gosuslugi.ru
            sent_text = self.page.locator("text='Уведомление отправлено':visible, text='Заявление отправлено':visible")
            cabinet_btn = self.page.locator(
                "button:has-text('В личный кабинет'):visible, "
                "a:has-text('В личный кабинет'):visible, "
                "span:has-text('В личный кабинет'):visible"
            )
            if sent_text.count() > 0 or cabinet_btn.count() > 0 or "lk.gosuslugi.ru" in cur_url:
                no_poa = self.page.locator("text='недостаточно полномочий':visible")
                if no_poa.count() > 0:
                    logger.warning(
                        "Step 15 Warning: Gosuslugi displayed 'У вас недостаточно полномочий для отправки уведомлений' (требуется доверенность руководителя)."
                    )
                else:
                    logger.info(">>> Final confirmation screen ('Уведомление отправлено' / 'В личный кабинет') reached! <<<")
                gosuslugi_order_no = self.extract_gosuslugi_order_number()
                if gosuslugi_order_no:
                    logger.info(f"Step 15: Captured Gosuslugi Application No: {gosuslugi_order_no}")
                return gosuslugi_order_no

            # 2) Check if 'Уведомление готово к отправке' or 'Отправить' button is visible on screen
            ready_to_send_heading = self.page.locator("text='Уведомление готово к отправке':visible")
            submit_candidates = self.page.locator(
                "button:has-text('Отправить уведомление'):visible, "
                "button:has-text('Отправить'):visible, "
                "epgu-cf-ui-button:has-text('Отправить'):visible, "
                "lib-button:has-text('Отправить'):visible, "
                "a.button:has-text('Отправить'):visible"
            )
            if ready_to_send_heading.count() > 0 or submit_candidates.count() > 0:
                logger.info("Step 15: 'Уведомление готово к отправке' detected — clicking 'Отправить'...")
                self.click_otpravit_bulletproof()
                self.page.wait_for_timeout(2200)
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
                    continue

            self.page.wait_for_timeout(800)

        gosuslugi_order_no = self.extract_gosuslugi_order_number()
        return gosuslugi_order_no

    def click_otpravit_bulletproof(self):
        """
        Clicks the blue 'Отправить' button on the 'Уведомление готово к отправке' screen
        using 3 independent strategies (Playwright click, Mouse bounding-box click, and DOM JS dispatch)
        so Angular/Gosuslugi always registers the submission.
        """
        selectors = [
            "epgu-cf-ui-constructor-screen-pad button:has-text('Отправить'):visible",
            "epgu-cf-ui-button:has-text('Отправить') button:visible",
            "lib-button:has-text('Отправить') button:visible",
            "button.button:has-text('Отправить'):visible",
            "button:has-text('Отправить уведомление'):visible",
            "button:has-text('Отправить'):visible",
            "epgu-cf-ui-button:has-text('Отправить'):visible",
            "lib-button:has-text('Отправить'):visible",
            "span:has-text('Отправить'):visible",
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
        if self.page.locator("text='Уведомление готово к отправке':visible").count() == 0 and clicked:
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
        if self.page.locator("text='Уведомление готово к отправке':visible").count() == 0:
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

    def execute_step16_cabinet_and_download(self, row: Dict[str, Any], gosuslugi_order_no: str = ""):
        """
        Executes all clicks required after 'Отправить' to download and rename the PDF receipt:
        1) Click 'В личный кабинет' on 'Уведомление отправлено' screen
        2) On lk.gosuslugi.ru/notifications ('Уведомления'), click the worker's 'Заявление'
        3) On lk.gosuslugi.ru/order/... ('Уведомления о трудовой деятельности иностранцев'), capture '№ 8265228795' and click 'Показать историю'
        4) Under 'Документы', click 'Скачать' next to 'req_preview' and rename the downloaded PDF to <GosuslugiNo>_<WorkerName>_<Period>.pdf
        """
        logger.info("Step 16: Navigating to Personal Cabinet to download and rename submission receipt PDF...")
        try:
            # 16.1 Click 'В личный кабинет' if currently on the 'Уведомление отправлено' confirmation screen
            cabinet_btn = self.page.locator(
                "button:has-text('В личный кабинет'):visible, "
                "a:has-text('В личный кабинет'):visible, "
                "span:has-text('В личный кабинет'):visible"
            ).first
            if "lk.gosuslugi.ru" not in (self.page.url or ""):
                try:
                    cabinet_btn.wait_for(state="visible", timeout=15000)
                except Exception:
                    pass
            if cabinet_btn.count() > 0 and cabinet_btn.is_visible():
                logger.info("Step 16.1: Clicking 'В личный кабинет'...")
                try:
                    cabinet_btn.click(timeout=5000)
                except Exception:
                    cabinet_btn.evaluate("el => (el.closest('button, a') || el).click()")
                self.page.wait_for_timeout(3500)

            # 16.2 On lk.gosuslugi.ru/notifications ('Уведомления'), click the worker's 'Заявление' item
            if "/order/" not in (self.page.url or ""):
                zayavlenie = self.page.locator(
                    "h5:has-text('Заявление'), a:has-text('Заявление'), span:has-text('Заявление зарегистрировано'), div:has-text('Заявление зарегистрировано')"
                ).first
                try:
                    zayavlenie.wait_for(state="visible", timeout=12000)
                except Exception:
                    pass

                first_name = str(row.get("Имя", "")).strip()
                clicked_worker_item = False
                if first_name:
                    worker_item = self.page.locator(f"text='{first_name}'").first
                    if worker_item.count() > 0 and worker_item.is_visible():
                        logger.info(f"Step 16.2: Clicking notification item for '{first_name}'...")
                        try:
                            worker_item.click(timeout=4000)
                            clicked_worker_item = True
                        except Exception:
                            pass

                if not clicked_worker_item and zayavlenie.count() > 0 and zayavlenie.is_visible():
                    logger.info("Step 16.2: Clicking top 'Заявление' in notifications list...")
                    try:
                        zayavlenie.click(timeout=5000)
                    except Exception:
                        zayavlenie.evaluate("el => (el.closest('a, div.feed-item, lib-feed-item') || el).click()")
                self.page.wait_for_timeout(3500)

            # 16.3 Capture the Gosuslugi Application No (e.g. '№ 8265228795') from the order details page
            extracted_no = self.extract_gosuslugi_order_number()
            if extracted_no:
                gosuslugi_order_no = extracted_no
                logger.info(f"Step 16.3: Captured Gosuslugi Application No: {gosuslugi_order_no}")

            # 16.4 Click 'Показать историю' if 'req_preview' is not already expanded on screen
            req_preview_loc = self.page.locator("text='req_preview':visible")
            if req_preview_loc.count() == 0:
                show_history = self.page.locator(
                    "a:has-text('Показать историю'):visible, "
                    "button:has-text('Показать историю'):visible, "
                    "span:has-text('Показать историю'):visible"
                ).first
                try:
                    show_history.wait_for(state="visible", timeout=10000)
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
                    self.page.wait_for_timeout(2500)

            # 16.5 Click 'Скачать' next to 'req_preview' under 'Документы' and rename the PDF
            saved_pdf_path = self.download_and_rename_receipt_pdf(row, gosuslugi_order_no)
            if saved_pdf_path:
                logger.info(f"Step 16.5: Official Gosuslugi PDF saved as: {saved_pdf_path}")
        except Exception as e:
            logger.warning(f"Step 16 receipt download/rename note: {e}")

    def extract_gosuslugi_order_number(self) -> str:
        """
        Extracts the Gosuslugi application number (e.g. '8265228795' from '№ 8265228795' under
        'Уведомления о трудовой деятельности иностранцев').
        Prioritizes page text ('№ <digits>') over URL '/order/20000...' which is an internal feed ID.
        """
        try:
            body_text = self.page.locator("body").inner_text(timeout=3000)
            m = re.search(r"(?:Заявление|Уведомлени\w+)[^\n\r№]*\s*№\s*(\d{6,14})", body_text, re.IGNORECASE)
            if m:
                return m.group(1)
            m2 = re.search(r"№\s*(\d{7,14})", body_text)
            if m2:
                return m2.group(1)
        except Exception:
            pass
        try:
            url_match = re.search(r"/order/(\d{6,16})", self.page.url or "")
            if url_match:
                return url_match.group(1)
        except Exception:
            pass
        return ""

    def build_clean_worker_name(self, row: Dict[str, Any]) -> str:
        """
        Builds clean employee full name for PDF filename, stripping placeholder values like 'Нет'.
        Example: Фамилия='Нет', Имя='АБДУЛ РАШИД', Отчество='НЕТ' -> 'АБДУЛ РАШИД'
        """
        skip_tokens = {"нет", "не заполнено", "-", "none", "null", ""}
        parts = []
        for key in ("Фамилия", "Имя", "Отчество"):
            val = str(row.get(key, "")).strip()
            if val and val.lower() not in skip_tokens:
                parts.append(val)
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
        Clicks the 'Скачать' link for 'req_preview' inside 'Документы' on Gosuslugi,
        waits for the PDF to land in ~/Downloads, and renames it to:
            <GosuslugiNo>_<Ad Soyad>_<Donem>.pdf
        Example:
            8265228795_АБДУЛ РАШИД_2026-3.pdf
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

        # Wait briefly for 'req_preview' to be visible in the expanded history
        try:
            self.page.locator("text='req_preview'").first.wait_for(state="visible", timeout=8000)
        except Exception:
            pass

        # Locate the specific 'Скачать' button for 'req_preview' (not 'pd_Agreement' and not 'Скачать всё')
        download_selectors = [
            "lib-file:has-text('req_preview') a:has-text('Скачать')",
            "lib-file:has-text('req_preview') a",
            "a[aria-label*='req_preview']",
            "a[title*='req_preview']",
            "div.history-status.open lk-files lib-file a",
            "lk-files lib-file:has-text('PDF') a",
            "lk-files a:has-text('Скачать'):not(:has-text('всё'))",
            "a:has-text('Скачать'):not(:has-text('всё'))",
        ]
        download_link = None
        for sel in download_selectors:
            loc = self.page.locator(sel).first
            if loc.count() > 0 and loc.is_visible():
                download_link = loc
                break

        if not download_link:
            logger.warning("Step 16: Could not find visible 'Скачать' PDF link for 'req_preview' in order history.")
            return None

        try:
            download_link.scroll_into_view_if_needed(timeout=3000)
        except Exception:
            pass

        downloaded_path: Optional[Path] = None
        click_time = time.time()

        logger.info("Step 16.5: Clicking 'Скачать' for 'req_preview' PDF...")
        # Attempt Playwright download capture + native Chrome ~/Downloads fallback
        try:
            with self.page.expect_download(timeout=6000) as download_info:
                try:
                    download_link.click(timeout=4000)
                except Exception:
                    download_link.evaluate("el => el.click()")
            dl = download_info.value
            suggested_name = dl.suggested_filename or f"{gosuslugi_order_no or 'req_preview'}.pdf"
            temp_target = downloads_dir / suggested_name
            dl.save_as(str(temp_target))
            downloaded_path = temp_target
        except Exception:
            # In CDP mode Chrome often handles the download directly in ~/Downloads without triggering expect_download
            pass

        # If Chrome handled the download natively, poll ~/Downloads for the newly created/updated .pdf file
        if not downloaded_path or not downloaded_path.exists():
            for _ in range(30):
                self.page.wait_for_timeout(500)
                # Wait if Chrome is still writing a .crdownload partial file
                active_crdownloads = [
                    p for p in downloads_dir.glob("*.crdownload")
                    if (time.time() - p.stat().st_mtime) < 30
                ]
                if active_crdownloads:
                    continue

                candidates = []
                for p in downloads_dir.glob("*.pdf"):
                    try:
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

        # Determine Gosuslugi Number prefix:
        # 1) If downloaded file is already named with Gosuslugi number (e.g. '8255536023.pdf' or '8255536023 (1).pdf'), keep that number
        # 2) Otherwise use gosuslugi_order_no extracted from the page
        stem = downloaded_path.stem
        stem_digits_match = re.match(r"^(\d{5,15})", stem)
        final_gosuslugi_no = (
            stem_digits_match.group(1)
            if stem_digits_match
            else (gosuslugi_order_no or self.extract_gosuslugi_order_number() or stem)
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
        Records the Gosuslugi Application Number (№ Заявления) and PDF filename for EBA upload & status tracking:
        1) Emits structured 'APPLICATION_REGISTERED: {...}' log line for rpa_bridge_server.py
        2) Persists to local 'gosuslugi_applications.json'
        3) Posts to Pondera HR '/api/gosuslugi/submissions' SQLite endpoint
        """
        app_no = str(application_no or "").strip()
        if not app_no:
            return
        sicil = str(row.get("Sicil") or row.get("Код") or "").strip()
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
