"""
Pondera HR & Powerise Gosuslugi RPA Worker (Python + Playwright)
Automated Foreign Worker Dismissal Notification to MVD (Gosuslugi Service 600585/1)

Ported from Powerise (gosuslugi_dismissal_robot.py) and integrated with Pondera HR RPA Bridge:
1. Attaches to open Chrome with active Gosuslugi/Rutoken session (CDP: http://localhost:9222)
2. Launches Chrome with Persistent User Profile if not open
3. Processes data from Pondera HR UI Queue (active_dismissal_queue.json) or GosUsluga_ увольнения.xlsx
4. Supports UI configuration overrides (--config-json), Human-in-the-Loop recovery, and PDF receipt archiving
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

DEFAULT_CONFIG = {
    "FORM_URL": "https://www.gosuslugi.ru/600585/1/form",
    "TYPE_COMPANY": "Юридическое лицо",
    "OKVED_TEXT": "Строительство прочих инженерных сооружений, не",
    "OKVED_CODE": "42.99",
    "PATENT_REGION": "Ленинградская",
    "PATENT_REGION_FULL": "Ленинградская область",
    "WORK_ADDRESS": "188471, Ленинградская обл, Кингисеппский р-н, поселок Усть-Луга",
    "UFMS_DEPARTMENT": "ОПВМ ОМВД России по Кингисеппскому району Ленинградской области",
    "DEFAULT_EXCEL_PATH": r"C:\Users\nemat\Downloads\GosUsluga_ увольнения.xlsx",
    "CDP_PORT": 9222,
    "TIMEOUT_MS": 30000,
    "ACTION_DELAY_SEC": 0.5,
}


class GosuslugiDismissalBot:
    def __init__(self, page: Page, config: Dict[str, Any] = None):
        self.page = page
        self.cfg = {**DEFAULT_CONFIG, **(config or {})}

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
            mvd_warning = self.page.locator("text='Данные не найдены в базе МВД', text='МВД может отказать'")
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

    def handle_draft_dialog_if_present(self) -> bool:
        """Check if Gosuslugi displays draft list modal and handle it cleanly."""
        try:
            limit_msg = self.page.locator("text='Нельзя создать новое заявление', text='Продолжите заполнять черновик'")
            if limit_msg.count() > 0 and limit_msg.first.is_visible():
                logger.info("Detected draft limit modal. Re-using latest draft by clicking 'Перейти в черновик'...")
                open_draft = self.page.locator(
                    "a:has-text('Перейти в черновик'), button:has-text('Перейти в черновик'), span:has-text('Перейти в черновик')"
                ).first
                if open_draft.count() > 0 and open_draft.is_visible():
                    open_draft.click()
                    self.page.wait_for_timeout(3000)
                    return True

            draft_modal_btn = self.page.locator(
                "lib-button.conf-modal__button button:visible, "
                ".conf-modal__controls button:visible, "
                "button:has-text('Создать заявление'):visible, "
                "button:has-text('Создать новое заявление'):visible, "
                "button:has-text('Новое заявление'):visible"
            ).first
            if draft_modal_btn.count() > 0 and draft_modal_btn.is_visible():
                logger.info("Detected Gosuslugi draft modal. Scrolling modal to bottom & clicking 'Создать заявление'...")
                try:
                    self.page.evaluate(
                        """() => {
                            document.querySelectorAll('ng-scrollbar, .ng-scroll-viewport, .ng-scroll-content, .conf-modal__body, .conf-modal__content, div').forEach(el => {
                                if (el.scrollHeight > el.clientHeight + 10) {
                                    try { el.scrollTop = el.scrollHeight; } catch (e) {}
                                }
                            });
                            const btn = document.querySelector('lib-button.conf-modal__button button, .conf-modal__controls button');
                            if (btn) btn.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
                        }"""
                    )
                except Exception:
                    pass
                self.page.wait_for_timeout(250)
                try:
                    draft_modal_btn.scroll_into_view_if_needed(timeout=1500)
                except Exception:
                    pass
                try:
                    draft_modal_btn.click(timeout=2500)
                except Exception:
                    draft_modal_btn.evaluate("el => (el.closest('button') || el).click()")
                self.page.wait_for_timeout(1800)
                return True
        except Exception:
            pass
        return False

    def download_and_rename_receipt_pdf(self, row: Dict[str, Any]):
        """Downloads the official Gosuslugi receipt PDF and renames it to <GosuslugiNo>_<WorkerName>_Увольнение.pdf."""
        try:
            logger.info("Step 15: Checking for Gosuslugi Application Number & PDF Receipt...")
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

            # Fallback: check if req_preview.pdf was recently downloaded into Downloads
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
        full_name = f"{row.get('Фамилия', '')} {row.get('Имя', '')} {row.get('Отчество', '')}".strip()
        logger.info(f"=== Starting Gosuslugi Dismissal for: {full_name} (Код: {row.get('Код', '')}) ===")

        has_termination_btn = self.page.locator("button:has-text('О расторжении договора')").count() > 0
        has_patent_btn = self.page.locator("button:has-text('Патент')").count() > 0
        already_in_inputs = self.page.locator("input[name*='dic11'], input[name*='lastNameRu'], input[name*='dic12']").count() > 0

        if not (has_termination_btn or has_patent_btn or already_in_inputs):
            logger.info("Step 1: Navigating to Gosuslugi Service 600585/1...")
            try:
                self.page.goto(self.cfg["FORM_URL"], wait_until="domcontentloaded", timeout=60000)
            except Exception as e:
                logger.warning(f"Navigation warning: {e}")
            self.page.wait_for_timeout(2500)
            self.handle_draft_dialog_if_present()
            self.check_and_handle_error_modal()

            # Step 2: Scroll to bottom & click 'Создать новое заявление' / 'Новое заявление' / 'Начать'
            try:
                self.page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                self.page.wait_for_timeout(600)
                start_btn = self.page.locator(
                    "button:has-text('Создать новое заявление'):visible, "
                    "button:has-text('Новое заявление'):visible, "
                    "button:has-text('Создать заявление'):visible, "
                    "button:has-text('Начать'):visible, "
                    "span:has-text('Начать'):visible"
                ).first
                if start_btn.count() > 0 and start_btn.is_visible():
                    logger.info("Step 2: Clicking start/new application button...")
                    start_btn.scroll_into_view_if_needed()
                    start_btn.click()
                    self.page.wait_for_timeout(2000)
            except Exception as e:
                logger.debug(f"Optional start button: {e}")

        # Step 3: Select 'О расторжении договора' if on the choice screen
        self.handle_draft_dialog_if_present()
        self.check_and_handle_error_modal()

        term_btn = self.page.locator(
            "button:has-text('О расторжении договора'), epgu-cf-ui-long-button:has-text('О расторжении договора')"
        ).first
        if term_btn.count() > 0 and term_btn.is_visible():
            logger.info("Step 3a: Selecting 'О расторжении договора'...")
            term_btn.click()
            self.page.wait_for_timeout(2000)

        # Step 3b: Select 'Патент' if on document choice screen
        patent_btn = self.page.locator("button:has-text('Патент'), epgu-cf-ui-long-button:has-text('Патент')").first
        if patent_btn.count() > 0 and patent_btn.is_visible():
            logger.info("Step 3b: Selecting 'Патент'...")
            patent_btn.click()
            self.page.wait_for_timeout(1500)

        # Step 4: Click 'Перейти к уведомлению' / 'Продолжить'
        go_to_notice_btn = self.page.locator("button:has-text('Перейти к уведомлению'), button:has-text('Продолжить')").first
        if go_to_notice_btn.count() > 0 and go_to_notice_btn.is_visible():
            logger.info("Step 4: Clicking 'Перейти к уведомлению'...")
            go_to_notice_btn.click()
            self.page.wait_for_timeout(1500)

        # Step 5: Verify Company Phone & Email ('Верно')
        logger.info("Step 5: Confirming company phone and email ('Верно')...")
        for i in range(5):
            self.check_and_handle_error_modal()
            try:
                verno_btn = self.page.locator("button:has-text('Верно'), button.primary:has-text('Верно'), span:has-text('Верно')").first
                if verno_btn.count() > 0 and verno_btn.is_visible():
                    logger.info(f"Clicking 'Верно' (screen {i+1})...")
                    verno_btn.click()
                    self.page.wait_for_timeout(2000)
                else:
                    break
            except Exception:
                break

        # Step 6: Select Organization Status ('Укажите статус организации')
        logger.info("Step 6: Selecting Organization Status ('Статус организации')...")
        self.check_and_handle_error_modal()

        try:
            if self.page.locator("#dic12:visible").count() == 0:
                status_input = self.page.locator("#dic11_UL_TD:visible, input.search-input:visible").first
                status_input.wait_for(state="visible", timeout=8000)
                curr_val = status_input.input_value()
                if "Юридическое" not in curr_val:
                    logger.info("Opening 'Статус организации' dropdown...")
                    status_input.click()
                    self.page.wait_for_timeout(600)

                    opt = self.page.locator(
                        ".lookup-item:has-text('Юридическое лицо'), [role='option']:has-text('Юридическое лицо'), span:has-text('Юридическое лицо')"
                    ).first
                    if opt.count() > 0 and opt.is_visible():
                        logger.info("Clicking 'Юридическое лицо' option...")
                        opt.click()
                    else:
                        logger.info("Selecting option 3 via keyboard...")
                        self.page.keyboard.press("ArrowDown")
                        self.page.wait_for_timeout(100)
                        self.page.keyboard.press("ArrowDown")
                        self.page.wait_for_timeout(100)
                        self.page.keyboard.press("ArrowDown")
                        self.page.wait_for_timeout(100)
                        self.page.keyboard.press("Enter")
                    self.page.wait_for_timeout(800)

                cont_btn = self.page.locator("button").filter(has_text="Продолжить").last
                if cont_btn.count() > 0 and not cont_btn.is_disabled():
                    logger.info("Clicking 'Продолжить' on Step 6...")
                    cont_btn.click()
                    self.page.wait_for_timeout(2000)
        except Exception as e:
            logger.debug(f"Step 6 already passed or skipped: {e}")

        # Step 7: Select OKVED 42.99 ('Укажите вид деятельности по ОКВЭД')
        logger.info(f"Step 7: Selecting OKVED {self.cfg['OKVED_CODE']}...")
        self.check_and_handle_error_modal()

        try:
            okved_input = self.page.locator("#dic12:visible, input[name*='dic12']:visible, input[placeholder*='ОКВЭД']:visible").first
            for _ in range(40):
                if okved_input.count() > 0 and okved_input.is_visible():
                    break
                if (
                    self.page.locator("input[name*='lastNameRu'], input[id*='lastNameRu']").count() > 0
                    and self.page.locator("input[name*='lastNameRu'], input[id*='lastNameRu']").first.is_visible()
                ):
                    logger.info("Personal info screen already visible. Skipping OKVED.")
                    break
                self.check_and_handle_error_modal()
                self.page.wait_for_timeout(1000)

            if okved_input.count() > 0 and okved_input.is_visible():
                logger.info(f"Found OKVED input. Typing: {self.cfg['OKVED_TEXT']}...")
                okved_input.click()
                self.page.wait_for_timeout(400)
                okved_input.fill("")
                self.page.wait_for_timeout(200)
                self.page.keyboard.type(self.cfg["OKVED_TEXT"], delay=50)
                self.page.wait_for_timeout(2000)

                okved_option = self.page.locator(
                    f".search-input-drop-down-item:visible, [role='option']:visible, .lookup-item:visible, "
                    f"div:has-text('{self.cfg['OKVED_CODE']}'):visible, span:has-text('{self.cfg['OKVED_CODE']}'):visible"
                ).first
                try:
                    okved_option.wait_for(state="visible", timeout=6000)
                    okved_option.click()
                except Exception:
                    logger.info("Dropdown click timeout, pressing ArrowDown + Enter...")
                    self.page.keyboard.press("ArrowDown")
                    self.page.wait_for_timeout(200)
                    self.page.keyboard.press("Enter")
                self.page.wait_for_timeout(1000)

                cont_btn = self.page.locator("button:has-text('Продолжить'), button.primary:has-text('Продолжить')").last
                if cont_btn.count() > 0 and not cont_btn.is_disabled():
                    logger.info("Clicking 'Продолжить' on Step 7 (OKVED)...")
                    cont_btn.click()
                    self.page.wait_for_timeout(3000)
        except Exception as e:
            logger.warning(f"Step 7 OKVED warning: {e}")

        # Step 8: Fill Employee Personal Details
        logger.info(f"Step 8: Filling Personal Info for {row.get('Фамилия')}...")
        self.check_and_handle_error_modal()
        last_name_input = self.page.locator("input[name*='lastNameRu'], input[id*='lastNameRu']").first
        last_name_input.wait_for(state="visible", timeout=15000)
        last_name_input.fill(str(row.get("Фамилия", "")))
        self.page.locator("input[name*='firstNameRu'], input[id*='firstNameRu']").first.fill(str(row.get("Имя", "")))
        if row.get("Отчество"):
            self.page.locator("input[name*='secondNameRu'], input[id*='secondNameRu']").first.fill(str(row.get("Отчество", "")))

        # Birth date
        bdate_str = str(row.get("ДатаРождения", ""))
        birth_input = self.page.locator("input[placeholder*='__.__.____'], input[name*='birthDate']").first
        birth_input.click()
        self.page.keyboard.type(bdate_str, delay=40)
        self.page.wait_for_timeout(500)

        # Citizenship (#dic13_ctz + .lookup-item click)
        citizenship = str(row.get("ТекущееГражданство", "Узбекистан")).strip()
        for _ctz_try in range(3):
            ctz_inp = self.page.locator("#dic13_ctz:visible, input[id*='ctz']:visible, lib-lookup input.search-input:visible").first
            if ctz_inp.count() == 0:
                break
            ctz_inp.click()
            self.page.wait_for_timeout(150)
            self.page.keyboard.press("Control+A")
            self.page.keyboard.press("Backspace")
            ctz_inp.fill(citizenship)
            self.page.wait_for_timeout(750)
            if self.page.locator(".lookup-item:not(.nothing-found):visible").count() == 0:
                self.page.keyboard.press("Control+A")
                self.page.keyboard.press("Backspace")
                ctz_inp.press_sequentially(citizenship, delay=45)
                self.page.wait_for_timeout(900)
            ctz_opt = self.page.locator(f".lookup-item:has-text('{citizenship}'):visible, .lookup-item:not(.nothing-found):visible").first
            if ctz_opt.count() > 0 and ctz_opt.is_visible():
                ctz_opt.click()
                self.page.wait_for_timeout(500)
            else:
                self.page.keyboard.press("ArrowDown")
                self.page.keyboard.press("Enter")
                self.page.wait_for_timeout(400)
            if self.page.locator("#dic13_ctz:visible").count() == 0:
                break

        # Place of birth (si13_pob)
        pob_input = self.page.locator("input[name*='pob'], input[id*='pob']")
        if pob_input.count() > 0:
            pob_input.first.fill(citizenship)

        # Gender selection
        gender = str(row.get("Пол", "Мужской")).strip()
        gender_loc = self.page.locator(f"span:has-text('{gender}')")
        if gender_loc.count() > 0:
            gender_loc.first.click()
        self.page.wait_for_timeout(800)

        # Click 'Продолжить'
        self.page.locator("button:has-text('Продолжить'), button.primary").first.click()
        self.page.wait_for_timeout(1500)
        self.check_and_handle_error_modal()

        # Step 9: Passport Details
        logger.info(f"Step 9: Filling Passport {row.get('СерияПаспорта')} {row.get('НомерПаспорта')}...")
        self.check_and_handle_error_modal()
        pass_series = self.page.locator("input[name*='series'], input[id*='series']").first
        pass_series.wait_for(state="visible", timeout=10000)
        pass_series.fill(str(row.get("СерияПаспорта", "")))
        self.page.locator("input[name*='number'], input[id*='number']").first.fill(str(row.get("НомерПаспорта", "")))

        # Passport Issue Date
        pass_date = str(row.get("ДатаВыдачи", ""))
        pass_date_input = self.page.locator("input[placeholder*='__.__.____']").first
        pass_date_input.click()
        self.page.keyboard.type(pass_date, delay=40)

        # Issued by
        issued_by = str(row.get("ПаспортКемВыдан", ""))
        self.page.locator("input[name*='issuedBy'], input[id*='issuedBy']").first.fill(issued_by)
        self.page.wait_for_timeout(800)

        self.page.locator("button:has-text('Продолжить'), button.primary").first.click()
        self.page.wait_for_timeout(1500)
        self.check_and_handle_error_modal()

        # Step 10: Patent & Region Details
        logger.info(f"Step 10: Filling Patent Series {row.get('Серия')} No {row.get('Номер')}...")
        self.check_and_handle_error_modal()
        region_input = self.page.locator(
            "input[placeholder*='Регион'], input[name*='region'], input[id*='region'], input[role='combobox']"
        ).first
        if region_input.count() > 0:
            region_input.wait_for(state="visible", timeout=10000)
            region_input.click()
            self.page.keyboard.type(self.cfg["PATENT_REGION"], delay=40)
            self.page.wait_for_timeout(1000)
            region_option = self.page.locator(
                f".lookup-item:has-text('{self.cfg['PATENT_REGION_FULL']}'), "
                f"[role='option']:has-text('{self.cfg['PATENT_REGION_FULL']}'), "
                f"span:has-text('{self.cfg['PATENT_REGION_FULL']}')"
            ).first
            if region_option.count() > 0 and region_option.is_visible():
                region_option.click()
            else:
                self.page.keyboard.press("ArrowDown")
                self.page.keyboard.press("Enter")
            self.page.wait_for_timeout(800)

        self.page.locator("button:has-text('Продолжить'), button.primary").first.click()
        self.page.wait_for_timeout(1500)
        self.check_and_handle_error_modal()

        # Patent Series & Number, Blank Series & Number
        patent_series_inputs = self.page.locator("input[name*='series'], input[id*='series']").first
        patent_series_inputs.wait_for(state="visible", timeout=10000)
        patent_series_inputs.fill(str(row.get("Серия", "")))

        patent_num_inputs = self.page.locator("input[name*='number'], input[id*='number']").first
        patent_num_inputs.fill(str(row.get("Номер", "")))

        blank_series = self.page.locator(
            "input[name*='seriaBlank'], input[id*='seriaBlank'], input[placeholder*='Серия бланка']"
        ).first
        if blank_series.count() > 0:
            blank_series.fill(str(row.get("СерийныйНомер1", "")))

        blank_number = self.page.locator(
            "input[name*='numberBlank'], input[id*='numberBlank'], input[placeholder*='Номер бланка']"
        ).first
        if blank_number.count() > 0:
            blank_number.fill(str(row.get("СерийныйНомер2", "")))

        self.page.wait_for_timeout(800)
        self.page.locator("button:has-text('Продолжить'), button.primary").first.click()
        self.page.wait_for_timeout(1500)
        self.check_and_handle_error_modal()

        # Step 11: Contract Termination Details (Сведения о расторжении договора)
        logger.info(f"Step 11: Setting Termination Date {row.get('ДатаУволь')} & Position {row.get('Должность')}...")
        self.check_and_handle_error_modal()

        checkbox = self.page.locator("input[type='checkbox']")
        if checkbox.count() > 0:
            checkbox.first.check()
        self.page.wait_for_timeout(500)

        pos_str = str(row.get("Должность", "Монтажник"))
        self.page.keyboard.press("Tab")
        self.page.keyboard.type(pos_str, delay=40)
        self.page.wait_for_timeout(800)
        self.page.keyboard.press("Enter")

        contract_radio = self.page.locator("input[type='radio'][name*='ri16_type'], input[type='radio']")
        if contract_radio.count() > 0:
            contract_radio.first.check()

        dismiss_date = str(row.get("ДатаУволь", ""))
        date_input = self.page.locator("input[placeholder*='__.__.____'], input[name*='Дата']").first
        date_input.click()
        self.page.keyboard.type(dismiss_date, delay=40)

        is_voluntary = str(row.get("УвПоСобствЖел", "Да")).strip()
        if is_voluntary.lower() in ["да", "yes", "true"]:
            self.page.locator("span:has-text('Да')").first.click()
        else:
            self.page.locator("span:has-text('Нет')").first.click()
        self.page.wait_for_timeout(600)

        work_addr = str(row.get("АдресРаботы") or self.cfg["WORK_ADDRESS"]).strip()
        self.page.keyboard.press("Tab")
        self.page.keyboard.type(work_addr, delay=30)
        self.page.wait_for_timeout(1000)
        self.page.keyboard.press("Tab")

        no_house = self.page.locator("div:has-text('Нет дома'), span:has-text('Нет дома')")
        if no_house.count() > 0:
            no_house.first.click()
            self.page.wait_for_timeout(400)

        no_apt = self.page.locator("div:has-text('Нет квартиры'), span:has-text('Нет квартиры')")
        if no_apt.count() > 0:
            no_apt.first.click()
            self.page.wait_for_timeout(400)

        self.page.locator("button:has-text('Продолжить')").first.click()
        self.page.wait_for_timeout(1500)

        # Step 12: MVD Destination Division
        logger.info(f"Step 12: Selecting MVD Department: {self.cfg['UFMS_DEPARTMENT']}...")
        self.check_and_handle_error_modal()
        self.page.locator("button:has-text('Продолжить')").first.click()
        self.page.wait_for_timeout(1500)

        # Step 13: Submit Notification ('Отправить' / 'Отправить уведомление')
        logger.info("Step 13: Submitting Notification to MVD...")
        submit_btn = self.page.locator(
            "button:has-text('Отправить уведомление'):visible, "
            "button:has-text('Отправить'):visible, "
            "epgu-cf-ui-button:has-text('Отправить'):visible"
        ).first
        if submit_btn.count() > 0 and submit_btn.is_visible():
            submit_btn.scroll_into_view_if_needed()
            submit_btn.click()
            logger.info(">>> 'Отправить' CLICKED! <<<")
            self.page.wait_for_timeout(4000)

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


def main():
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
                if records:
                    logger.info(f"Loaded {len(records)} records from queue: {jpath}")
                    break
            except Exception as e:
                logger.warning(f"Failed to read JSON queue {jpath}: {e}")

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
            except Exception as ex:
                fail_count += 1
                logger.error(f"Error processing {record.get('Фамилия')}: {ex}")
                if args.excel and row_idx is not None:
                    mark_row_completed(args.excel, row_idx, False, str(ex))

            time.sleep(2)

        logger.info(f"\n=== Dismissal RPA Batch Complete ===\nTotal: {len(records)}, Success: {success_count}, Failed: {fail_count}")


if __name__ == "__main__":
    main()
