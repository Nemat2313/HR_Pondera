"""
Pondera HR - Gosuslugi VKS Salary Notification RPA Worker (Python + Playwright)
Automated Foreign Worker VKS Salary Notification to MVD (Gosuslugi Service 600585/1)

Replaces Power Automate Desktop (PAD) flow (from 11.docx) with direct Playwright automation.
Supports:
1. Attaching to open Chrome with active Gosuslugi/Rutoken session (CDP: http://localhost:9222)
2. Launching Chrome with Persistent User Profile
3. Processing data from Excel or Pondera HR UI Queue (active_vks_queue.json)
4. Complete error recovery, retry modals ('Попробовать ещё раз'), and PDF receipt download
"""

import sys
import os
import time
import json
import argparse
import logging
from datetime import datetime
from typing import Dict, Any, List
import openpyxl
from openpyxl.styles import PatternFill

# Configure UTF-8 stdout
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

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


# Default Company & Facility Parameters (matching 11.docx PAD flow variables)
DEFAULT_CONFIG = {
    "FORM_URL": "https://www.gosuslugi.ru/600585/1/form",
    "COMPANY_ADDRESS": "121108, г. Москва, ул. Ивана Франко, д. 8",
    "TYPE_COMPANY": "Российская коммерческая организация",
    "OKVED_TEXT": "Деятельность в области инженерных",
    "WORK_REGION": "Тюменская",
    "WORK_ADDRESS": "Тюменская область, г. Тобольск, территория «Восточный промышленный район», квартал 9, дом 1/1",
    "WORK_POSTAL_CODE": "626150",
    "UFMS_DEPARTMENT": "ОПВМ ОМВД России по Кингисеппскому району Ленинградской области",
    "PERIOD_START": "01.03.2023",
    "PERIOD_END": "30.03.2023",
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

    def click_continue(self, wait_ms: int = 1500):
        """Finds and clicks the visible 'Продолжить' button."""
        self.check_and_handle_error_modal()
        btn = self.page.locator("button:has-text('Продолжить'):visible, span:has-text('Продолжить'):visible").last
        if btn.count() > 0:
            btn.focus()
            btn.click()
            self.page.wait_for_timeout(wait_ms)
        self.check_and_handle_error_modal()

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

        # Step 1: Navigate to https://www.gosuslugi.ru/600585/1/form
        logger.info("Step 1: Navigating to Gosuslugi Service 600585/1/form...")
        try:
            self.page.goto(self.cfg["FORM_URL"], wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            logger.warning(f"Navigation warning: {e}")

        self.page.wait_for_timeout(2500)
        self.check_and_handle_error_modal()

        # Wait for page text 'Уведомления о трудовой деятельности'
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
                opt = self.page.locator(f".lookup-item:has-text('{self.cfg['TYPE_COMPANY']}'), span:has-text('коммерческая'), span:has-text('Юридическое')").first
                if opt.count() > 0 and opt.is_visible():
                    opt.click()
                else:
                    self.page.keyboard.press("ArrowDown")
                    self.page.keyboard.press("Enter")
                self.page.wait_for_timeout(800)
                self.click_continue()
        except Exception:
            pass

        # Step 6: Personal Details (Lines 32-57 in 11.docx)
        logger.info(f"Step 6: Filling VKS Specialist Personal Info for {full_name}...")
        self.check_and_handle_error_modal()

        last_name_input = self.page.locator("#si13_lastNameRu, input[name*='lastNameRu']").first
        last_name_input.wait_for(state="visible", timeout=25000)
        last_name_input.fill(last_name)

        citizenship = str(row.get("ТекущееГражданство", "Турция")).strip()

        # Line 33-38 in PAD: Focus si13_lastNameRu -> Shift+Tab -> Citizenship dropdown -> Down -> Enter
        try:
            last_name_input.focus()
            self.page.keyboard.press("Shift+Tab")
            self.page.wait_for_timeout(300)
            self.page.keyboard.type(citizenship, delay=25)
            self.page.wait_for_timeout(1000)
            self.page.keyboard.press("ArrowDown")
            self.page.wait_for_timeout(100)
            self.page.keyboard.press("Enter")
            self.page.wait_for_timeout(500)
        except Exception as e:
            logger.debug(f"Pre-surname citizenship field skipped: {e}")

        # First Name & Middle Name (si13_firstNameRu, si13_secondNameRu)
        first_name_input = self.page.locator("#si13_firstNameRu, input[name*='firstNameRu']").first
        first_name_input.fill(first_name)

        second_name_input = self.page.locator("#si13_secondNameRu, input[name*='secondNameRu']").first
        if second_name_input.count() > 0:
            second_name_input.fill(middle_name if middle_name else "НЕТ")

        # Birth Date (di13_birth / __.__.____)
        bdate_str = str(row.get("ДатаРождения", "")).strip()
        birth_input = self.page.locator("input[name='di13_birth'], input[placeholder*='__.__.____']").first
        birth_input.click()
        birth_input.fill("")
        self.page.keyboard.type(bdate_str, delay=30)
        self.page.wait_for_timeout(400)

        # Line 43-47 in PAD: Tab from BirthDate -> Type Citizenship -> Wait -> Down -> Return
        self.page.keyboard.press("Tab")
        self.page.wait_for_timeout(300)
        self.page.keyboard.type(citizenship, delay=25)
        self.page.wait_for_timeout(1500)
        self.page.keyboard.press("ArrowDown")
        self.page.wait_for_timeout(100)
        self.page.keyboard.press("Enter")
        self.page.wait_for_timeout(500)

        # Place of Birth (si13_pob) - Line 48 in PAD
        pob_val = str(row.get("МестоРождения", "")).strip() or citizenship
        pob_input = self.page.locator("#si13_pob, input[name*='pob']").first
        if pob_input.count() > 0 and pob_input.is_visible():
            pob_input.fill(pob_val)

        # Gender ('Мужской' / 'Женский') - Lines 49-53 in PAD
        gender = str(row.get("Пол", "Мужской")).strip()
        gender_label = "Женский" if gender.lower().startswith("ж") or gender.lower().startswith("k") else "Мужской"
        gender_span = self.page.locator(f"span:has-text('{gender_label}')").first
        if gender_span.count() > 0 and gender_span.is_visible():
            gender_span.click()
        self.page.wait_for_timeout(600)

        self.click_continue(2000)

        # Step 7: Passport Details ('Укажите данные документа, удостоверяющего личность' - Lines 58-70 in PAD)
        logger.info(f"Step 7: Filling Passport {row.get('СерияПаспорта')} {row.get('НомерПаспорта')}...")
        self.check_and_handle_error_modal()

        pass_series = self.page.locator("#series, input[name*='series']").first
        pass_series.wait_for(state="visible", timeout=15000)
        pass_series.fill(str(row.get("СерияПаспорта", "")).strip())

        pass_number = self.page.locator("#number, input[name*='number']").first
        pass_number.fill(str(row.get("НомерПаспорта", "")).strip())

        pass_issue_date = str(row.get("ДатаВыдачи", "")).strip()
        issue_date_input = self.page.locator("input[name='di14_issue'], input[placeholder*='__.__.____']").first
        issue_date_input.click()
        issue_date_input.fill("")
        self.page.keyboard.type(pass_issue_date, delay=30)
        self.page.wait_for_timeout(400)

        issued_by = str(row.get("ПаспортКемВыдан", "")).strip()
        issued_by_input = self.page.locator("#si14_issuedBy_125, input[id*='issuedBy'], input[name*='issuedBy']").first
        issued_by_input.fill(issued_by)
        self.page.wait_for_timeout(600)

        self.click_continue(2000)

        # Step 8: Foreigner INN ('Укажите ИНН иностранца' -> Input 'c_foreignerINN' - Lines 71-76 in PAD)
        logger.info(f"Step 8: Filling Foreigner INN: {row.get('ИНН')}...")
        self.check_and_handle_error_modal()

        inn_input = self.page.locator("#c_foreignerINN, input[name*='foreignerINN'], input[id*='INN']").first
        try:
            inn_input.wait_for(state="visible", timeout=12000)
            inn_val = str(row.get("ИНН", "")).strip()
            if inn_val:
                inn_input.fill(inn_val)
            self.page.wait_for_timeout(500)
            self.click_continue(2000)
        except Exception as e:
            logger.warning(f"Step 8 INN screen note: {e}")

        # Step 9: Work Permit Details ('Укажите данные разрешения на работу' - Lines 77-90 in PAD)
        logger.info(f"Step 9: Filling Work Permit (РНР) {row.get('Серия')} {row.get('Номер')}...")
        self.check_and_handle_error_modal()

        rnr_series = self.page.locator("#series, input[name*='series']").first
        rnr_series.wait_for(state="visible", timeout=15000)
        rnr_series.fill(str(row.get("Серия", "")).strip())

        rnr_number = self.page.locator("#number, input[name*='number']").first
        rnr_number.fill(str(row.get("Номер", "")).strip())

        blank_series = self.page.locator("#s15_dict_2_seriaBlank, #dic15_seriaBlank, input[id*='seriaBlank'], input[name*='seriaBlank']").first
        if blank_series.count() > 0:
            blank_series.fill(str(row.get("СерийныйНомер1", "")).strip())

        blank_number = self.page.locator("input[name='s15_dict_2_numberBlank'], input[name='s15_numberBlank'], input[name*='numberBlank'], input[id*='numberBlank']").first
        if blank_number.count() > 0:
            blank_number.fill(str(row.get("СерийныйНомер2", "")).strip())

        # Optional issue date or issued by if visible on RNR screen
        rnr_issue_date = str(row.get("ДатаВыдачиВКС", "")).strip()
        if rnr_issue_date:
            rnr_date_loc = self.page.locator("input[placeholder*='__.__.____']:visible")
            if rnr_date_loc.count() > 0:
                rnr_date_loc.first.click()
                self.page.keyboard.type(rnr_issue_date, delay=30)

        self.page.wait_for_timeout(600)
        self.click_continue(2000)

        # Step 10: Employment Contract Details ('Укажите сведения о заключении договора' - Lines 91-109 in PAD)
        logger.info("Step 10: Filling Contract Details & Work Address...")
        self.check_and_handle_error_modal()

        # Note: Line 94 in PAD clicks 'Продолжить' if there is an intermediate confirmation screen
        try:
            if self.page.locator("input[name='c_startDate']:visible, #app-radio-3:visible").count() == 0:
                inter_btn = self.page.locator("button:has-text('Продолжить'):visible").first
                if inter_btn.count() > 0:
                    inter_btn.click()
                    self.page.wait_for_timeout(1500)
        except Exception:
            pass

        # Select radio 'ri16_type' (#app-radio-3 / Трудовой договор)
        radio_contract = self.page.locator("#app-radio-3, input[name*='ri16_type']").first
        if radio_contract.count() > 0:
            try:
                radio_contract.check(force=True)
            except Exception:
                self.page.locator("label:has-text('Трудовой договор'), span:has-text('Трудовой договор')").first.click()
        self.page.wait_for_timeout(400)

        # Contract Conclusion Date ('ДатаЗаключения' -> input[name='di16_2'] or input[name='di16_1'])
        contract_date = str(row.get("ДатаЗаключения", row.get("ДатаПриема", ""))).strip()
        c_date_input = self.page.locator("input[name='di16_2'], input[name='di16_1'], input[placeholder*='__.__.____']").first
        if c_date_input.count() > 0 and contract_date:
            c_date_input.click()
            c_date_input.fill("")
            self.page.keyboard.type(contract_date, delay=30)

        # Contract Start Date ('ДатаНачалаДействия' -> input[name='c_startDate'])
        start_date = str(row.get("ДатаНачалаДействия", contract_date)).strip()
        start_input = self.page.locator("input[name='c_startDate']").first
        if start_input.count() > 0 and start_date:
            start_input.click()
            start_input.fill("")
            self.page.keyboard.type(start_date, delay=30)

        # Contract End Date ('ДатаОканчанияДействия' -> input[name='c_endDate'])
        end_date = str(row.get("ДатаОканчанияДействия", row.get("ДатаОкончанияДействия", ""))).strip()
        end_input = self.page.locator("input[name='c_endDate']").first
        if end_input.count() > 0 and end_date:
            end_input.click()
            end_input.fill("")
            self.page.keyboard.type(end_date, delay=30)

        # Work Address (Month1End in PAD) & Postal Index (Month2End in PAD = 626150)
        work_addr = str(row.get("АдресРаботы", "")).strip() or self.cfg["WORK_ADDRESS"]
        postal_code = str(row.get("Индекс", "")).strip() or str(self.cfg["WORK_POSTAL_CODE"])

        # Line 101-104 in PAD: Tab -> Tab -> Type Address -> Tab
        self.page.keyboard.press("Tab")
        self.page.wait_for_timeout(150)
        self.page.keyboard.press("Tab")
        self.page.wait_for_timeout(150)
        self.page.keyboard.type(work_addr, delay=20)
        self.page.wait_for_timeout(1000)
        self.page.keyboard.press("Tab")
        self.page.wait_for_timeout(300)

        # Populate Postal Index (#index) - Line 105 in PAD
        index_input = self.page.locator("#index, input[name*='index']").first
        if index_input.count() > 0 and index_input.is_visible():
            index_input.fill(postal_code)
        self.page.wait_for_timeout(800)

        # Click 'Нет квартиры' - Line 107 in PAD
        no_apt = self.page.locator("div:has-text('Нет квартиры'), span:has-text('Нет квартиры'), label:has-text('Нет квартиры')").first
        if no_apt.count() > 0 and no_apt.is_visible():
            no_apt.click()
            self.page.wait_for_timeout(400)

        self.click_continue(2000)

        # Step 11: VKS Salary Payment Details ('Укажите сведения о выплате зарплаты иностранцу' - Lines 110-115 in PAD)
        logger.info(
            f"Step 11: Filling Salary Payment Period ({row.get('НачалоПериода')} - {row.get('КонецПериода')}) "
            f"& Amount: {row.get('РазмерВыплаты')}..."
        )
        self.check_and_handle_error_modal()

        period_start = str(row.get("НачалоПериода", "")).strip() or self.cfg["PERIOD_START"]
        period_end = str(row.get("КонецПериода", "")).strip() or self.cfg["PERIOD_END"]
        paid_amount = str(row.get("РазмерВыплаты", "")).strip()

        p_start_input = self.page.locator("input[name='di17_start'], input[placeholder*='__.__.____']").first
        p_start_input.wait_for(state="visible", timeout=15000)
        p_start_input.click()
        p_start_input.fill("")
        self.page.keyboard.type(period_start, delay=30)

        p_end_input = self.page.locator("input[name='di17_end'], input[placeholder*='__.__.____']").nth(1)
        if p_end_input.count() > 0:
            p_end_input.click()
            p_end_input.fill("")
            self.page.keyboard.type(period_end, delay=30)

        # Select Radio 'Да' (Line 113 in PAD: SelectRadioButton Div 'Да')
        yes_radio = self.page.locator("label:has-text('Да'), div:has-text('Да'), span:has-text('Да')").first
        if yes_radio.count() > 0 and yes_radio.is_visible():
            yes_radio.click()
            self.page.wait_for_timeout(400)

        # Populate Salary Amount (#si17_paid - Line 114 in PAD)
        paid_input = self.page.locator("#si17_paid, input[name*='si17_paid'], input[id*='paid']").first
        paid_input.wait_for(state="visible", timeout=10000)
        paid_input.fill(paid_amount)
        self.page.wait_for_timeout(600)

        self.click_continue(2000)

        # Step 12: MVD Destination Division ('Подразделение МВД, куда отправится уведомление' - Lines 116-119 in PAD)
        logger.info("Step 12: Confirming MVD Destination Division...")
        self.check_and_handle_error_modal()
        self.page.wait_for_timeout(1000)
        self.click_continue(1500)

        # Step 13: Employee Consent Modal ('Подтвердите, что получили согласие работника' -> 'Подтвердить' - Lines 120-122 in PAD)
        logger.info("Step 13: Confirming Employee Consent ('Подтвердить')...")
        self.check_and_handle_error_modal()
        try:
            confirm_btn = self.page.locator("button:has-text('Подтвердить'), span:has-text('Подтвердить')").first
            confirm_btn.wait_for(state="visible", timeout=10000)
            confirm_btn.click()
            self.page.wait_for_timeout(1500)
        except Exception as e:
            logger.debug(f"Consent modal note: {e}")

        # Step 14: Organization Personal Data Consent ('Согласие на обработку персональных данных' -> 'Продолжить' - Lines 123-125 in PAD)
        logger.info("Step 14: Confirming Personal Data Processing Consent ('Продолжить')...")
        self.check_and_handle_error_modal()
        try:
            self.click_continue(1500)
        except Exception:
            pass

        # Step 15: Submit Notification ('Отправить уведомление' - Lines 126-130 in PAD)
        logger.info("Step 15: Clicking 'Отправить уведомление'...")
        self.check_and_handle_error_modal()
        submit_btn = self.page.locator("button:has-text('Отправить уведомление'), span:has-text('Отправить уведомление')").first
        submit_btn.wait_for(state="visible", timeout=15000)
        submit_btn.focus()
        submit_btn.click()
        logger.info(">>> 'Отправить уведомление' CLICKED! <<<")
        self.page.wait_for_timeout(3500)

        # Step 16: Personal Cabinet & Receipt Download ('В личный кабинет' -> 'Заявление' -> 'Показать историю' -> Download PDF - Lines 131-138 in PAD)
        logger.info("Step 16: Navigating to Personal Cabinet to download submission receipt...")
        try:
            cabinet_btn = self.page.locator("button:has-text('В личный кабинет'), span:has-text('В личный кабинет')").first
            cabinet_btn.wait_for(state="visible", timeout=20000)
            cabinet_btn.click()
            self.page.wait_for_timeout(3000)

            zayavlenie = self.page.locator("h5:has-text('Заявление'), a:has-text('Заявление')").first
            if zayavlenie.count() > 0 and zayavlenie.is_visible():
                zayavlenie.click()
                self.page.wait_for_timeout(2500)

            show_history = self.page.locator("a:has-text('Показать историю'), button:has-text('Показать историю')").first
            if show_history.count() > 0 and show_history.is_visible():
                show_history.click()
                self.page.wait_for_timeout(1500)

            download_link = self.page.locator("a:has-text('Скачать'), a[title*='req_preview']").first
            if download_link.count() > 0 and download_link.is_visible():
                download_link.click()
                self.page.wait_for_timeout(1500)
        except Exception as e:
            logger.debug(f"Cabinet receipt download optional step note: {e}")

        # IMPORTANT: Do not change this log prefix — rpa_bridge_server.py parses it to count success
        logger.info(f"SUCCESS: Notification submitted for {full_name}!")
        return True


def load_excel_records(file_path: str, sheet_name: str = "Sheet1") -> List[Dict[str, Any]]:
    """Loads VKS worker records from the specified Excel sheet."""
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
    """Marks a processed row in Excel with green (OK) or red (Error)."""
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
    parser.add_argument("--config-json", default="", help="Optional JSON string or file with company/address config overrides")
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
        os.path.join(os.path.dirname(__file__), "active_vks_queue.json"),
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
                    page.screenshot(path=os.path.join(os.path.dirname(__file__), f"error_vks_{record.get('Код', idx)}.png"))
                except Exception:
                    pass

            time.sleep(2)

        logger.info(f"\n=== RPA Batch Complete ===\nTotal: {len(records)}, Success: {success_count}, Failed: {fail_count}")


if __name__ == "__main__":
    main()
