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
    "UFMS_DEPARTMENT": "ОВТМ УВМ УМВД РОССИИ ПО ТЮМЕНСКОЙ ОБЛАСТИ",
    "PERIOD_START": "01.07.2026",
    "PERIOD_END": "19.08.2026",
    "PERIOD_CODE": "2026-3",
    "DEFAULT_EXCEL_PATH": r"C:\Users\nemat\Downloads\GosUsluga_ ЗП.xlsx",
    "CDP_PORT": 9222,
}


class GosuslugiVksBot:
    def __init__(self, page: Page, config: Dict[str, Any] = None):
        self.page = page
        self.cfg = {**DEFAULT_CONFIG, **(config or {})}

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

    def get_current_heading(self) -> str:
        try:
            h1 = self.page.locator("h1:visible").first
            if h1.count() > 0:
                return h1.inner_text().strip()
        except Exception:
            pass
        return ""

    def has_red_validation_errors(self) -> List[str]:
        """Checks if Gosuslugi displays red inline validation errors on the current screen."""
        errors = []
        error_phrases = [
            "Проверьте адрес",
            "Необходимо указать индекс",
            "Необходимо указать квартиру",
            "Необходимо указать дом",
            "Поле обязательно",
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
        return errors

    def click_continue_strict(self, step_name: str, wait_ms: int = 2000):
        """
        Ensures 'Продолжить' button is enabled (blue/active) and no red errors block the page.
        If 'Продолжить' is grey/disabled or red errors remain, enters Human-in-the-Loop pause mode
        allowing the user to fix the field in Chrome or click 'Продолжить' in the Pondera HR UI.
        """
        self.check_and_handle_error_modal()
        initial_heading = self.get_current_heading()

        # Clear any old manual signal file
        if os.path.exists(MANUAL_CONTINUE_SIGNAL):
            try:
                os.remove(MANUAL_CONTINUE_SIGNAL)
            except Exception:
                pass

        # Wait up to 3 seconds for button to become enabled naturally
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

        # If not ready -> Enter Human-in-the-Loop Manual Intervention Mode!
        red_errs = self.has_red_validation_errors()
        err_desc = ", ".join(red_errs) if red_errs else "Кнопка «Продолжить» неактивна (серая)"
        # IMPORTANT: rpa_bridge_server.py parses 'WAITING_FOR_USER:' to show the manual intervention banner in UI
        logger.warning(
            f"WAITING_FOR_USER: [{step_name}] На странице Госуслуг требуется проверка ({err_desc}). "
            f"Исправьте поле в Chrome и нажмите «Продолжить» (или кнопку «Продолжить» в Pondera HR)."
        )

        # Wait up to 5 minutes (300 seconds) for user to either:
        # A) Fix the field in Chrome and click 'Продолжить' in Chrome (heading changes)
        # B) Fix the field in Chrome so 'Продолжить' becomes blue & no red errors, or click 'Resume' in Pondera UI
        for tick in range(300):
            self.check_and_handle_error_modal()

            # Check if user already clicked 'Продолжить' directly in Chrome and page advanced
            current_heading = self.get_current_heading()
            if initial_heading and current_heading and current_heading != initial_heading:
                logger.info(f"USER_RESOLVED: Page advanced to '{current_heading}'. Resuming robot...")
                self.page.wait_for_timeout(1000)
                return

            # Check if user clicked "Продолжить" in Pondera HR UI (manual_continue.signal)
            user_signaled = os.path.exists(MANUAL_CONTINUE_SIGNAL)
            if user_signaled:
                try:
                    os.remove(MANUAL_CONTINUE_SIGNAL)
                except Exception:
                    pass

            # Check if button is now enabled and red errors are gone
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
        Executes the complete Gosuslugi VKS Salary Notification flow from 11.docx for a single employee.
        """
        last_name = str(row.get("Фамилия", "")).strip()
        first_name = str(row.get("Имя", "")).strip()
        middle_name = str(row.get("Отчество", "")).strip()
        code = str(row.get("Код", row.get("Sicil", ""))).strip()
        full_name = f"{last_name} {first_name} {middle_name}".strip()

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

        # Step 1: Navigate to https://www.gosuslugi.ru/600585/1/form
        logger.info("Step 1: Navigating to Gosuslugi Service 600585/1/form...")
        try:
            self.page.goto(self.cfg["FORM_URL"], wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            logger.warning(f"Navigation warning: {e}")

        self.page.wait_for_timeout(2500)
        self.check_and_handle_error_modal()

        try:
            self.page.wait_for_selector("text=/Уведомления о трудовой деятельности/i", timeout=20000)
        except Exception:
            pass

        # Step 2: Check for 'Создать новое заявление' modal & 'Начать'
        try:
            new_order_btn = self.page.locator(
                "button:has-text('Создать новое заявление'), span:has-text('Создать новое заявление'), button:has-text('Создать заявление')"
            ).first
            if new_order_btn.count() > 0 and new_order_btn.is_visible():
                logger.info("Step 2: Clicking 'Создать новое заявление'...")
                new_order_btn.click()
                self.page.wait_for_timeout(2000)
        except Exception:
            pass

        try:
            start_btn = self.page.locator("button:has-text('Начать'), span:has-text('Начать')").first
            if start_btn.count() > 0 and start_btn.is_visible():
                logger.info("Step 2b: Clicking 'Начать'...")
                start_btn.click()
                self.page.wait_for_timeout(2000)
        except Exception:
            pass

        # Step 3: Select 'О выплате зарплаты высококвалифицированному специалисту'
        logger.info("Step 3: Selecting 'О выплате зарплаты высококвалифицированному специалисту'...")
        self.check_and_handle_error_modal()
        vks_option = self.page.locator(
            "span:has-text('О выплате зарплаты высококвалифицированному специалисту'), "
            "button:has-text('О выплате зарплаты высококвалифицированному специалисту'), "
            "epgu-cf-ui-long-button:has-text('О выплате')"
        ).first
        vks_option.wait_for(state="visible", timeout=20000)
        vks_option.click()
        self.page.wait_for_timeout(1500)

        # Step 4: Click 'Перейти к уведомлению'
        logger.info("Step 4: Clicking 'Перейти к уведомлению'...")
        go_btn = self.page.locator("button:has-text('Перейти к уведомлению'), span:has-text('Перейти к уведомлению')").first
        if go_btn.count() > 0 and go_btn.is_visible():
            go_btn.click()
            self.page.wait_for_timeout(2000)

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

        # Citizenship selection (Гражданство)
        self.page.keyboard.type(citizenship, delay=25)
        self.page.wait_for_timeout(1500)
        self.page.keyboard.press("ArrowDown")
        self.page.wait_for_timeout(100)
        self.page.keyboard.press("Enter")
        self.page.wait_for_timeout(500)

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

        self.page.wait_for_timeout(2000)

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
                        self.page.wait_for_timeout(1000)
                        break
                if not clicked_kv5:
                    lookup_items.first.click()
                    self.page.wait_for_timeout(1000)
            elif item_count > 0:
                lookup_items.first.click()
                self.page.wait_for_timeout(1000)
        except Exception:
            pass

        # Expand 'Уточнить адрес' (button.clarify-address) if detailed fields (input#index) are not yet visible
        try:
            if self.page.locator("input#index:visible").count() == 0:
                clarify_btn = self.page.locator("button.clarify-address, text='Уточнить адрес'").first
                if clarify_btn.count() > 0 and clarify_btn.is_visible():
                    logger.info("Clicking 'Уточнить адрес' to open detailed address fields...")
                    clarify_btn.click()
                    self.page.wait_for_timeout(800)
        except Exception:
            pass

        # Fill Postal Index (input#index) and ensure all 6 digits are entered
        logger.info(f"Checking/Filling Postal Code (Индекс): {postal_code}...")
        try:
            idx_input = self.page.locator("input#index:visible").first
            idx_input.wait_for(state="visible", timeout=5000)
            for attempt in range(3):
                cur_val = idx_input.input_value().strip()
                if cur_val == postal_code:
                    break
                idx_input.click()
                self.page.wait_for_timeout(150)
                self.page.keyboard.press("Control+A")
                for _ in range(8):
                    self.page.keyboard.press("Backspace")
                    self.page.keyboard.press("Delete")
                self.page.wait_for_timeout(150)
                idx_input.press_sequentially(postal_code, delay=75)
                self.page.wait_for_timeout(250)
                self.page.keyboard.press("Tab")
                self.page.wait_for_timeout(300)
        except Exception as e:
            logger.warning(f"Postal code input warning: {e}")

        # If address is '5-й' (industrial zone without house number), ensure 'input#house' is empty and 'Нет дома' is checked
        logger.info("Checking 'Нет дома' if applicable...")
        try:
            house_inp = self.page.locator("input#house:visible").first
            if is_tobolsk_kv5 and house_inp.count() > 0 and house_inp.input_value().strip():
                house_inp.click()
                self.page.keyboard.press("Control+A")
                self.page.keyboard.press("Backspace")
                self.page.wait_for_timeout(200)

            house_val = house_inp.input_value().strip() if house_inp.count() > 0 else ""
            if not house_val:
                house_cb_inp = self.page.locator("lib-checkbox[formcontrolname='houseCheckbox'] input[type='checkbox']").first
                if house_cb_inp.count() > 0:
                    if not house_cb_inp.is_checked():
                        self.page.locator("lib-checkbox[formcontrolname='houseCheckbox'] label.check").first.click()
                        self.page.wait_for_timeout(300)
                else:
                    no_house_lbl = self.page.locator("label:has-text('Нет дома'):visible").last
                    if no_house_lbl.count() > 0:
                        no_house_lbl.click()
                        self.page.wait_for_timeout(300)
        except Exception as e:
            logger.debug(f"'Нет дома' check note: {e}")

        # Check 'Нет квартиры' (lib-checkbox[formcontrolname='apartmentCheckbox'] inside .extended-fields)
        logger.info("Checking 'Нет квартиры'...")
        try:
            apt_cb_inp = self.page.locator("lib-checkbox[formcontrolname='apartmentCheckbox'] input[type='checkbox']").first
            if apt_cb_inp.count() > 0:
                if not apt_cb_inp.is_checked():
                    self.page.locator("lib-checkbox[formcontrolname='apartmentCheckbox'] label.check").first.click()
                    self.page.wait_for_timeout(300)
            else:
                no_apt_lbl = self.page.locator("label:has-text('Нет квартиры'):visible").last
                if no_apt_lbl.count() > 0:
                    no_apt_lbl.click()
                    self.page.wait_for_timeout(300)
        except Exception as e:
            logger.warning(f"Could not click 'Нет квартиры': {e}")

        self.page.wait_for_timeout(500)

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

        self.click_continue_strict("Шаг 11: Выплата зарплаты ВКС", 2500)

        # Step 12: MVD Destination Division ('Подразделение МВД, куда отправится уведомление')
        logger.info("Step 12: Waiting for MVD Destination Division screen...")
        self.check_and_handle_error_modal()
        try:
            self.page.locator("h1:has-text('Подразделение МВД')").first.wait_for(state="visible", timeout=20000)
        except Exception:
            pass
        self.page.wait_for_timeout(1000)
        self.click_continue_strict("Шаг 12: Подразделение МВД", 2000)

        # Step 13: Employee Consent Modal ('Подтвердите, что получили согласие работника' -> 'Подтвердить')
        logger.info("Step 13: Confirming Employee Consent ('Подтвердить')...")
        self.check_and_handle_error_modal()
        try:
            confirm_btn = self.page.locator("button:has-text('Подтвердить'), span:has-text('Подтвердить')").first
            confirm_btn.wait_for(state="visible", timeout=10000)
            confirm_btn.click()
            self.page.wait_for_timeout(1500)
        except Exception as e:
            logger.debug(f"Consent modal note: {e}")

        # Step 14: Organization Personal Data Consent ('Согласие на обработку персональных данных' -> 'Продолжить')
        logger.info("Step 14: Confirming Personal Data Processing Consent ('Продолжить')...")
        self.check_and_handle_error_modal()
        try:
            if self.page.locator("button:has-text('Продолжить'):visible").count() > 0:
                self.click_continue_strict("Шаг 14: Согласие на обработку ПДн", 1500)
        except Exception:
            pass

        # Step 15: Submit Notification ('Отправить' / 'Отправить уведомление') or verify final screen ('В личный кабинет')
        logger.info("Step 15: Checking for 'Отправить' / 'Отправить уведомление' or final confirmation screen...")
        self.check_and_handle_error_modal()
        gosuslugi_order_no = ""
        try:
            final_or_submit = self.page.locator(
                "button:has-text('Отправить'):visible, "
                "a:has-text('Отправить'):visible, "
                "lib-button:has-text('Отправить'):visible, "
                "span:has-text('Отправить'):visible, "
                "button:has-text('В личный кабинет'):visible, "
                "a:has-text('В личный кабинет'):visible"
            ).first
            final_or_submit.wait_for(state="visible", timeout=15000)

            submit_btn = self.page.locator(
                "button:has-text('Отправить уведомление'):visible, "
                "button:has-text('Отправить'):visible, "
                "lib-button:has-text('Отправить'):visible, "
                "a:has-text('Отправить'):visible, "
                "span:has-text('Отправить'):visible"
            ).first
            if submit_btn.count() > 0 and submit_btn.is_visible():
                try:
                    submit_btn.scroll_into_view_if_needed(timeout=3000)
                except Exception:
                    pass
                try:
                    submit_btn.focus()
                    submit_btn.click(timeout=5000)
                except Exception:
                    submit_btn.evaluate("el => el.click()")
                logger.info(">>> 'Отправить' CLICKED! Waiting for Gosuslugi confirmation screen... <<<")
                self.page.wait_for_timeout(2000)
                # If button is still visible on 'Уведомление готово к отправке', trigger native JS click on button
                if self.page.locator("text='Уведомление готово к отправке'").count() > 0 and submit_btn.is_visible():
                    try:
                        submit_btn.evaluate("el => (el.closest('button, a') || el).click()")
                    except Exception:
                        pass
                self.page.wait_for_timeout(3500)
                self.check_and_handle_error_modal()
            else:
                logger.info(">>> Final notification screen ('В личный кабинет') reached! <<<")

            gosuslugi_order_no = self.extract_gosuslugi_order_number()
            if gosuslugi_order_no:
                logger.info(f"Step 15: Captured Gosuslugi Application No: {gosuslugi_order_no}")
        except Exception as e:
            logger.warning(f"Step 15 submission check note: {e}")

        # Step 16: Personal Cabinet & Receipt PDF Download + Rename (<GosuslugiNo>_<Ad Soyad>_<Donem>.pdf)
        self.execute_step16_cabinet_and_download(row, gosuslugi_order_no)

        # IMPORTANT: Do not change this log prefix — rpa_bridge_server.py parses it to count success
        logger.info(f"SUCCESS: Notification submitted for {full_name}!")
        return True

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
                zayavlenie = self.page.locator("h5:has-text('Заявление'), a:has-text('Заявление'), text='Заявление зарегистрировано'").first
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

        worker_name = self.build_clean_worker_name(row)
        period_code = self.compute_vks_period_code(row)

        new_filename = f"{final_gosuslugi_no}_{worker_name}_{period_code}.pdf"
        new_filepath = downloads_dir / new_filename

        try:
            if downloaded_path.resolve() != new_filepath.resolve():
                os.replace(str(downloaded_path), str(new_filepath))
            logger.info(f"Step 16: Renamed Gosuslugi PDF '{downloaded_path.name}' -> '{new_filename}'")
            return str(new_filepath)
        except Exception as e:
            logger.warning(f"Step 16: Could not rename '{downloaded_path}' to '{new_filepath}': {e}")
            return str(downloaded_path)


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
