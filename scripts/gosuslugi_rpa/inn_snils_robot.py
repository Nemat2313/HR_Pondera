#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pondera HR — INN & SNILS Verification + INN Application (Zayavka 1 & 2) Playwright Robot
Connects to visible Chrome via CDP (http://localhost:9222).

Tasks:
  - inn_check      : Checks INN on https://service.nalog.ru/inn.do, captures PNG screenshot, saves to Pondera HR.
  - snils_check    : Opens official SNILS check page in visible Chrome, pre-fills fields, pauses for human operator
                     to complete any CAPTCHA manually (no automated CAPTCHA bypass), captures screenshot & saves.
  - inn_zayavka_1  : Submits Stage 1 INN application on https://service.nalog.ru/zpufl/edit.html (PAD Zayavka 1).
  - inn_zayavka_2  : Opens email confirmation links on service.nalog.ru/zpufl, matches passport, completes Stage 2,
                     extracts application number, captures screenshot & saves to Pondera HR (PAD Zayavka 2).
"""

import argparse
import base64
import json
import logging
import os
import re
import ssl
import sys
import time
import urllib.request
from typing import Any, Dict, List, Optional

from playwright.sync_api import Page, sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PAUSE_SIGNAL_FILE = os.path.join(CURRENT_DIR, "rpa_pause.signal")
CENTRAL_API_URL = "https://hr.pondera.network/api/inn-snils"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("PonderaInnSnilsRPA")


def post_result_to_central(payload: Dict[str, Any]) -> bool:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        data = json.dumps({"action": "save_result", **payload}, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            CENTRAL_API_URL,
            data=data,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=25, context=ctx) as resp:
            return resp.status == 200
    except Exception as e:
        logger.warning(f"Central save warning: {e}")
        # Fallback: retry without screenshot so verified INN/SNILS is never lost if image payload fails
        if payload.get("inn_screenshot_base64") or payload.get("snils_screenshot_base64"):
            try:
                slim = {k: v for k, v in payload.items() if k not in ("inn_screenshot_base64", "snils_screenshot_base64")}
                data2 = json.dumps({"action": "save_result", **slim}, ensure_ascii=False).encode("utf-8")
                req2 = urllib.request.Request(
                    CENTRAL_API_URL,
                    data=data2,
                    headers={"Content-Type": "application/json; charset=utf-8"},
                    method="POST",
                )
                with urllib.request.urlopen(req2, timeout=20, context=ctx) as resp2:
                    logger.info("  -> Central save succeeded (fallback without screenshot).")
                    return resp2.status == 200
            except Exception as e2:
                logger.warning(f"Central fallback save warning: {e2}")
        return False


def capture_page_png_b64(page: Page, full_page: bool = True) -> str:
    try:
        # JPEG quality=82 keeps full-page high-DPI screenshots ~90 KB (avoids HTTP 413 limit)
        raw = page.screenshot(full_page=full_page, type="jpeg", quality=82)
        return base64.b64encode(raw).decode("ascii")
    except Exception:
        return ""


def wait_if_paused():
    if not os.path.exists(PAUSE_SIGNAL_FILE):
        return
    logger.info("ROBOT_PAUSED: Ожидание нажатия «Продолжить (Devam Et)»...")
    while os.path.exists(PAUSE_SIGNAL_FILE):
        time.sleep(0.5)
    logger.info("ROBOT_RESUMED: Продолжаем работу.")


def accept_nalog_personal_data_if_needed(page: Page):
    """Accepts service.nalog.ru/static/personal-data.html consent page (uni_checkbox hides native input)."""
    try:
        if "personal-data" not in (page.url or "").lower() and page.locator("#personalData").count() == 0:
            return
        logger.info("  -> Accepting nalog.ru personal data consent...")
        lbl = page.locator("label[for='personalData'], .checkbox-item label, #unichk_0").first
        if lbl.count() > 0 and lbl.is_visible():
            lbl.click(force=True)
        else:
            page.evaluate("""() => {
                const cb = document.getElementById('personalData');
                if (cb) { cb.click(); }
            }""")
        page.wait_for_timeout(400)
        # Ensure btnContinue is enabled (trigger jQuery click handler if still disabled)
        btn = page.locator("button#btnContinue, button:has-text('Продолжить')").first
        if btn.count() > 0:
            is_dis = btn.get_attribute("disabled")
            if is_dis is not None:
                page.evaluate("""() => {
                    const cb = document.getElementById('personalData');
                    if (cb) { cb.checked = true; cb.dispatchEvent(new Event('click', {bubbles:true})); cb.dispatchEvent(new Event('change', {bubbles:true})); }
                    const b = document.getElementById('btnContinue');
                    if (b) { b.removeAttribute('disabled'); b.classList.remove('disabled'); }
                }""")
                page.wait_for_timeout(200)
            btn.click(force=True)
            try:
                page.wait_for_load_state("domcontentloaded", timeout=15000)
            except Exception:
                pass
            page.wait_for_timeout(1200)
    except Exception as e:
        logger.warning(f"  -> Consent handling warning: {e}")


def run_inn_check(page: Page, records: List[Dict[str, Any]]):
    for idx, r in enumerate(records, 1):
        wait_if_paused()
        sicil = str(r.get("sicil_no") or "").strip()
        fam = str(r.get("fam") or "").strip()
        nam = str(r.get("nam") or "").strip()
        otch = str(r.get("otch") or "").strip()
        bdate = str(r.get("dogum_tarihi") or "").strip()
        docno = str(r.get("pasaport_no") or "").strip()
        docdt = str(r.get("pasaport_verilis") or "").strip()
        is_rf = "RUSYA" in str(r.get("uyruk") or "").upper()
        doctype_val = "21" if is_rf else "10"

        logger.info(f"[{idx}/{len(records)}] INN Check (nalog.ru): {fam} {nam} (Sicil: {sicil})")
        try:
            page.goto("https://service.nalog.ru/inn.do", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(1200)

            accept_nalog_personal_data_if_needed(page)

            page.wait_for_selector("input#fam", timeout=15000)
            page.fill("input#fam", fam)
            page.fill("input#nam", nam)
            if otch:
                page.fill("input#otch", otch)
            else:
                lbl_otch = page.locator("label[for='opt_otch']").first
                if lbl_otch.count() > 0 and lbl_otch.is_visible():
                    lbl_otch.click(force=True)
                else:
                    page.evaluate("""() => {
                        const cb = document.getElementById('opt_otch');
                        if (cb && !cb.checked) cb.click();
                    }""")

            if bdate:
                m_iso = re.match(r"^(\d{4})-(\d{2})-(\d{2})", bdate)
                bdate_ru = f"{m_iso.group(3)}.{m_iso.group(2)}.{m_iso.group(1)}" if m_iso else bdate
                page.fill("input#bdate", bdate_ru)
            try:
                page.select_option("select#doctype", doctype_val, force=True)
                page.evaluate("""(val) => {
                    const sel = document.getElementById('doctype');
                    if (sel) { sel.value = val; sel.dispatchEvent(new Event('change', {bubbles:true})); }
                }""", doctype_val)
            except Exception:
                pass
            if docno:
                page.fill("input#docno", docno)
            if docdt:
                m_iso2 = re.match(r"^(\d{4})-(\d{2})-(\d{2})", docdt)
                docdt_ru = f"{m_iso2.group(3)}.{m_iso2.group(2)}.{m_iso2.group(1)}" if m_iso2 else docdt
                page.fill("input#docdt", docdt_ru)

            page.click("button#btn_send")
            page.wait_for_timeout(2800)

            # Scroll to top; full_page=True captures the entire header, INN result, and all passport fields on any DPI/screen
            try:
                page.evaluate("() => { document.documentElement.style.zoom = '1'; window.scrollTo(0, 0); }")
                page.wait_for_timeout(250)
            except Exception:
                pass

            body_text = (page.inner_text("body") or "").strip()
            m_inn = re.search(r"\b(\d{12})\b", body_text)
            shot_b64 = capture_page_png_b64(page)

            if m_inn:
                inn_val = m_inn.group(1)
                post_result_to_central({
                    "sicil_no": sicil,
                    "ad_soyad": r.get("ad_soyad", ""),
                    "tam_adi_kiril": r.get("tam_adi_kiril", ""),
                    "inn_status": "VERIFIED",
                    "verified_inn": inn_val,
                    "inn_error": "",
                    "inn_screenshot_base64": shot_b64,
                })
                logger.info(f"  -> INN FOUND: {inn_val}")
            elif "не найдена" in body_text.lower() or "отсутствуют" in body_text.lower():
                post_result_to_central({
                    "sicil_no": sicil,
                    "ad_soyad": r.get("ad_soyad", ""),
                    "tam_adi_kiril": r.get("tam_adi_kiril", ""),
                    "inn_status": "NOT_FOUND",
                    "inn_error": "Информация об ИНН не найдена в ФНС",
                    "inn_screenshot_base64": shot_b64,
                })
                logger.info("  -> INN NOT FOUND (кандидат на Заявку 1)")
            else:
                post_result_to_central({
                    "sicil_no": sicil,
                    "ad_soyad": r.get("ad_soyad", ""),
                    "tam_adi_kiril": r.get("tam_adi_kiril", ""),
                    "inn_status": "ERROR",
                    "inn_error": "Sonuç okunamadı (ekran görüntüsünü inceleyin)",
                    "inn_screenshot_base64": shot_b64,
                })
                logger.warning("  -> Could not parse INN result")
        except Exception as e:
            logger.error(f"  -> INN check error: {e}")


def run_snils_check_human_in_loop(page: Page, records: List[Dict[str, Any]]):
    """
    Opens the official SFR/PFR SNILS verification page in visible Chrome, fills employee fields,
    and PAUSES so the human operator can manually complete reCAPTCHA and click submit.
    After the operator clicks 'Devam Et (Resume)', captures the screenshot and saves verified SNILS.
    """
    for idx, r in enumerate(records, 1):
        wait_if_paused()
        sicil = str(r.get("sicil_no") or "").strip()
        fam = str(r.get("fam") or "").strip()
        nam = str(r.get("nam") or "").strip()
        otch = str(r.get("otch") or "").strip()
        bdate = str(r.get("dogum_tarihi") or "").strip()
        snils = str(r.get("snils_no") or "").strip()

        logger.info(f"[{idx}/{len(records)}] SNILS Check (Human-in-the-loop): {fam} {nam} (SNILS: {snils})")
        try:
            page.goto("https://es.pfrf.ru/checkSnils/", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(1500)

            for sel, val in [
                ("input[name*='lastName'], input[id*='surname'], input[placeholder*='Фамилия']", fam),
                ("input[name*='firstName'], input[id*='name'], input[placeholder*='Имя']", nam),
                ("input[name*='middleName'], input[id*='patronymic'], input[placeholder*='Отчество']", otch),
                ("input[name*='birthDate'], input[placeholder*='рождения']", bdate),
                ("input[name*='snils'], input[id*='snils'], input[placeholder*='СНИЛС']", snils),
            ]:
                if not val:
                    continue
                loc = page.locator(sel).first
                if loc.count() > 0:
                    try:
                        loc.fill(val)
                    except Exception:
                        pass

            # Pause for human operator to complete reCAPTCHA & click 'Проверить'
            logger.info(
                "MANUAL_CAPTCHA_REQUIRED: Lütfen Chrome penceresinde reCAPTCHA doğrulamasını tamamlayıp 'Проверить' butonuna basın, ardından panelden 'Devam Et'e tıklayın."
            )
            with open(PAUSE_SIGNAL_FILE, "w", encoding="utf-8") as pf:
                pf.write("snils_manual_captcha")
            wait_if_paused()

            page.wait_for_timeout(1000)
            body_text = (page.inner_text("body") or "").lower()
            shot_b64 = capture_page_png_b64(page)
            is_ok = any(k in body_text for k in ("соответствует", "подтвержден", "действителен", "найден")) and "не соответств" not in body_text

            post_result_to_central({
                "sicil_no": sicil,
                "ad_soyad": r.get("ad_soyad", ""),
                "tam_adi_kiril": r.get("tam_adi_kiril", ""),
                "snils_status": "VERIFIED" if is_ok else "NOT_FOUND",
                "verified_snils": snils if is_ok else "",
                "snils_error": "" if is_ok else "СНИЛС не подтвержден (см. скриншот)",
                "snils_screenshot_base64": shot_b64,
            })
            logger.info(f"  -> SNILS saved ({'VERIFIED' if is_ok else 'NOT_FOUND'}) + screenshot archived.")
        except Exception as e:
            logger.error(f"  -> SNILS check error: {e}")


def to_ru_date(val: str) -> str:
    s = str(val or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(3)}.{m.group(2)}.{m.group(1)}"
    return s


COUNTRY_TR_TO_RU = {
    "OZBEKISTAN": "УЗБЕКИСТАН",
    "ÖZBEKISTAN": "УЗБЕКИСТАН",
    "ÖZBEKİSTAN": "УЗБЕКИСТАН",
    "UZBEKISTAN": "УЗБЕКИСТАН",
    "TACIKISTAN": "ТАДЖИКИСТАН",
    "TACİKİSTAN": "ТАДЖИКИСТАН",
    "TAJIKISTAN": "ТАДЖИКИСТАН",
    "KIRGIZISTAN": "КИРГИЗИЯ",
    "KIRGIZİSTAN": "КИРГИЗИЯ",
    "KIRSIZISTAN": "КИРГИЗИЯ",
    "KYRGYZSTAN": "КИРГИЗИЯ",
    "TURKMENISTAN": "ТУРКМЕНИЯ",
    "TÜRKMENİSTAN": "ТУРКМЕНИЯ",
    "TURKIYE": "ТУРЦИЯ",
    "TÜRKİYE": "ТУРЦИЯ",
    "TURKEY": "ТУРЦИЯ",
    "HINDISTAN": "ИНДИЯ",
    "HİNDİSTAN": "ИНДИЯ",
    "INDIA": "ИНДИЯ",
    "AZERBAYCAN": "АЗЕРБАЙДЖАН",
    "AZERBAIJAN": "АЗЕРБАЙДЖАН",
    "KAZAKISTAN": "КАЗАХСТАН",
    "KAZAKİSTAN": "КАЗАХСТАН",
    "KAZAKHSTAN": "КАЗАХСТАН",
    "RUSYA": "РОССИЯ",
    "RUSSIA": "РОССИЯ",
    "BANGLADES": "БАНГЛАДЕШ",
    "BANGLADEŞ": "БАНГЛАДЕШ",
    "BANGLADESH": "БАНГЛАДЕШ",
    "BELARUS": "БЕЛАРУСЬ",
    "MOLDOVA": "МОЛДОВА",
    "ERMENISTAN": "АРМЕНИЯ",
    "UKRAYNA": "УКРАИНА",
    "GURCISTAN": "ГРУЗИЯ",
    "SIRBISTAN": "СЕРБИЯ",
    "BOSNA": "БОСНИЯ И ГЕРЦЕГОВИНА",
    "MISIR": "ЕГИПЕТ",
    "NEPAL": "НЕПАЛ",
    "VIETNAM": "ВЬЕТНАМ",
    "CIN": "КИТАЙ",
    "ÇİN": "КИТАЙ",
}


def to_ru_country(val: str) -> str:
    s = str(val or "").strip()
    if not s:
        return ""
    up = s.upper()
    return COUNTRY_TR_TO_RU.get(up, s)


def fill_uni_select(page: Page, selector: str, value: str):
    """Fills nalog.ru uni_select combobox and picks the matching dropdown item."""
    if not value:
        return
    inp = page.locator(selector).first
    if inp.count() == 0:
        return
    try:
        inp.click(force=True)
        inp.fill("")
        inp.type(value, delay=35)
        page.wait_for_timeout(500)
        # Click first visible dropdown item matching text, or press ArrowDown + Enter
        item = page.locator(f".uni-select-list li:visible, .ui-autocomplete li:visible, .select-list li:visible, .dropdown-item:visible").first
        if item.count() > 0 and item.is_visible():
            item.click(force=True)
        else:
            inp.press("ArrowDown")
            page.wait_for_timeout(150)
            inp.press("Enter")
        page.wait_for_timeout(300)
    except Exception:
        try:
            inp.fill(value)
        except Exception:
            pass


def type_masked_date(page: Page, selector: str, ru_date: str):
    """Types DD.MM.YYYY into nalog.ru masked date inputs (input#bd, input#dt_doc, input#rd)."""
    if not ru_date:
        return
    inp = page.locator(selector).first
    if inp.count() == 0:
        return
    try:
        inp.click(force=True)
        inp.press("Control+a")
        inp.press("Backspace")
        # Send digits with keystroke delay so jQuery date mask accepts it cleanly
        inp.type(ru_date, delay=45)
        inp.press("Tab")
        page.wait_for_timeout(200)
    except Exception:
        try:
            inp.fill(ru_date)
        except Exception:
            pass


def fill_fias_address(page: Page, addr: str) -> bool:
    """Opens nalog.ru FIAS modal (iframe#uniDialogFrame), searches addr in #text, picks suggestion, clicks #btn_ok."""
    if not addr:
        return False
    try:
        btn = page.locator("#fias").locator("..").locator("button, .btn, a").first
        if btn.count() > 0:
            btn.click(force=True)
        else:
            page.locator("#fias").click(force=True)
        page.wait_for_selector("iframe#uniDialogFrame", timeout=8000)
        page.wait_for_timeout(800)

        fias_frame = None
        for f in page.frames:
            if f != page.main_frame and "fias" in (f.url or "").lower():
                fias_frame = f
                break
        if not fias_frame:
            return False

        search_inp = fias_frame.locator("input#text").first
        if search_inp.count() == 0:
            return False

        # Try full address first, then without leading 6-digit postal code if no suggestion appears
        candidates = [addr]
        no_zip = re.sub(r"^\s*\d{6}\s*,?\s*", "", addr).strip()
        if no_zip and no_zip != addr:
            candidates.append(no_zip)

        for cand in candidates:
            search_inp.click(force=True)
            search_inp.fill("")
            search_inp.type(cand, delay=20)
            page.wait_for_timeout(1400)

            sugg = fias_frame.locator(
                ".ui-autocomplete li:visible, .uni-search-list li:visible, .search-results li:visible, ul.dropdown-menu li:visible, .suggestions li:visible, .fias-item:visible"
            ).first
            if sugg.count() > 0 and sugg.is_visible():
                sugg.click(force=True)
            else:
                search_inp.press("ArrowDown")
                page.wait_for_timeout(200)
                search_inp.press("Enter")
            page.wait_for_timeout(700)

            ok_btn = fias_frame.locator("button#btn_ok").first
            if ok_btn.count() > 0 and ok_btn.get_attribute("disabled") is None and "disabled" not in (ok_btn.get_attribute("class") or ""):
                ok_btn.click(force=True)
                page.wait_for_timeout(600)
                logger.info(f"  -> FIAS address selected & confirmed: {cand[:60]}")
                return True

        logger.warning("  -> FIAS suggestion did not enable ОК button; leaving modal open for quick manual pick.")
        return False
    except Exception as e:
        logger.warning(f"  -> FIAS address helper warning: {e}")
        return False


def run_inn_zayavka_1(page: Page, records: List[Dict[str, Any]], cfg: Dict[str, Any]):
    """Implements PAD ИНН_Заявка_1.txt on https://service.nalog.ru/zpufl/edit.html"""
    default_addr = str(cfg.get("REG_ADDRESS") or "").strip()
    default_mail = str(cfg.get("CONTACT_EMAIL") or "ikbildirim@pondera.ru").strip()
    default_tel = str(cfg.get("CONTACT_PHONE") or "").strip()
    default_reg_date = to_ru_date(str(cfg.get("REG_DATE") or "").strip())

    for idx, r in enumerate(records, 1):
        wait_if_paused()
        sicil = str(r.get("sicil_no") or "").strip()
        fam = str(r.get("fam") or "").strip()
        nam = str(r.get("nam") or "").strip()
        otch = str(r.get("otch") or "").strip()
        gender = str(r.get("cinsiyet") or "Муж").strip().lower()
        bdate = to_ru_date(str(r.get("dogum_tarihi") or "").strip())
        ctz = to_ru_country(str(r.get("uyruk") or "").strip())
        bp = str(r.get("dogum_yeri") or "").strip() or ctz
        docno = str(r.get("pasaport_no") or "").strip()
        issued_by = str(r.get("pasaport_veren") or "").strip() or (f"МВД {ctz}" if ctz else "МВД")
        issue_date = to_ru_date(str(r.get("pasaport_verilis") or "").strip())
        addr = str(r.get("reg_address") or default_addr).strip()
        reg_date = to_ru_date(str(r.get("reg_date") or default_reg_date).strip())

        logger.info(f"[{idx}/{len(records)}] INN Zayavka 1 (service.nalog.ru/zpufl): {fam} {nam} (Sicil: {sicil}, bdate={bdate}, ctz={ctz})")
        try:
            page.goto("https://service.nalog.ru/zpufl/edit.html", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(1500)
            accept_nalog_personal_data_if_needed(page)

            page.wait_for_selector("input#fam", timeout=15000)
            page.fill("input#fam", fam)
            page.fill("input#nam", nam)
            if otch:
                page.fill("input#otch", otch)
            page.locator("text=Женский" if gender.startswith(("ж", "k", "f")) else "text=Мужской").first.click()

            # Fill Дата рождения (input#bd — masked date field, must use emulate-typing!)
            type_masked_date(page, "input#bd", bdate)

            if bp:
                page.fill("input#bp", bp)
            page.locator("text=Гражданин").first.click()
            page.wait_for_timeout(300)

            # Fill Страна (Гражданство) combobox in Russian & select dropdown option
            if ctz:
                fill_uni_select(page, "input#uni_select_3, input[id^='uni_select_']:visible", ctz)

            page.locator("text=Место пребывания").first.click()
            page.wait_for_timeout(300)
            page.locator("button:has-text('Далее')").first.click()
            page.wait_for_timeout(2200)

            # Screen 2: Passport, Address (FIAS), Reg Date, Email, Phone, Representative
            page.wait_for_selector("input#sn_doc", timeout=20000)
            doc_type_label = (
                "Паспорт гражданина Российской Федерации"
                if ctz == "РОССИЯ"
                else "Паспорт иностранного гражданина"
            )
            fill_uni_select(page, "input#uni_select_3, input[id^='uni_select_']:visible", doc_type_label)
            if docno:
                page.fill("input#sn_doc", docno)
            if issued_by:
                page.fill("input#nv_doc", issued_by)
            type_masked_date(page, "input#dt_doc", issue_date)
            type_masked_date(page, "input#rd", reg_date)
            if default_mail:
                page.fill("input#mail", default_mail)
            if default_tel:
                tel_digits = re.sub(r"\D+", "", default_tel)
                if len(tel_digits) == 10:
                    tel_digits = "7" + tel_digits
                tel_inp = page.locator("input#tel").first
                if tel_inp.count() > 0:
                    tel_inp.click(force=True)
                    tel_inp.press("Control+a")
                    tel_inp.type(tel_digits, delay=35)
            rep = page.locator("text=Представитель заявителя").first
            if rep.count() > 0:
                rep.click()

            # Legacy addr input (if present & writable) OR FIAS readonly picker (#fias)
            if addr:
                legacy_addr = page.locator("input#addr:not([readonly])").first
                if legacy_addr.count() > 0:
                    legacy_addr.fill(addr)
                elif page.locator("input#fias").count() > 0:
                    fill_fias_address(page, addr)

            if cfg.get("AUTO_SUBMIT", False):
                page.locator("button:has-text('Отправить')").first.click()
                page.wait_for_timeout(2500)
            else:
                logger.info("AUTO_SUBMIT=False: Zayavka 1 dolduruldu -> kontrol edip 'Отправить' basın ve Devam Et'e tıklayın.")
                with open(PAUSE_SIGNAL_FILE, "w", encoding="utf-8") as pf:
                    pf.write("zayavka1_review")
                wait_if_paused()

            shot_b64 = capture_page_png_b64(page)
            post_result_to_central({
                "sicil_no": sicil,
                "ad_soyad": r.get("ad_soyad", ""),
                "tam_adi_kiril": r.get("tam_adi_kiril", ""),
                "inn_status": "APPLIED_STEP1",
                "inn_screenshot_base64": shot_b64,
            })
            logger.info("  -> Zayavka 1 saved (APPLIED_STEP1).")
        except Exception as e:
            logger.error(f"  -> Zayavka 1 error: {e}")


def run_inn_zayavka_2(page: Page, records: List[Dict[str, Any]], cfg: Dict[str, Any]):
    """Implements PAD ИНН_Заявка_2.txt: opens email links, matches passport, completes submission & captures application no."""
    links = [str(u).strip() for u in (cfg.get("EMAIL_LINKS") or []) if str(u).strip().startswith("http")]
    rep_fam = str(cfg.get("APPLICANT_FAM") or "").strip()
    rep_nam = str(cfg.get("APPLICANT_NAM") or "").strip()
    ifns_code = str(cfg.get("IFNS_CODE") or "4707").strip()
    default_reg_date = str(cfg.get("REG_DATE") or "").strip()

    rec_by_pass = {
        re.sub(r"\s+", "", str(r.get("pasaport_no") or "")).upper(): r
        for r in records
        if r.get("pasaport_no")
    }

    for idx, url in enumerate(links, 1):
        wait_if_paused()
        logger.info(f"[{idx}/{len(links)}] INN Zayavka 2: Opening link {url[:75]}...")
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(1800)

            page_text = page.inner_text("body") or ""
            matched_rec = None
            for p_key, r in rec_by_pass.items():
                if p_key and p_key in re.sub(r"\s+", "", page_text).upper():
                    matched_rec = r
                    break

            page.locator("button:has-text('Далее')").first.click()
            page.wait_for_timeout(1500)

            sel3 = page.locator("input#uni_select_3").first
            if sel3.count() > 0:
                sel3.fill("Иные документы")
            page.fill("input#sn_doc", "1")
            page.fill("input#nv_doc", "УФМС")
            d_inp = page.locator("input[placeholder*='ДД.ММ.ГГГГ']").first
            reg_date = str((matched_rec or {}).get("reg_date") or default_reg_date).strip()
            if d_inp.count() > 0 and reg_date:
                d_inp.fill(reg_date)
            if rep_fam:
                page.fill("input#fam", rep_fam)
            if rep_nam:
                page.fill("input#nam", rep_nam)

            if ifns_code:
                opt = page.locator(f"a:has-text('{ifns_code}')").first
                if opt.count() > 0:
                    opt.click()

            page.locator("button:has-text('Далее')").first.click()
            page.wait_for_timeout(2500)

            tds = page.locator("table tbody tr td")
            app_no = tds.nth(0).inner_text().strip() if tds.count() >= 1 else ""
            app_code = tds.nth(1).inner_text().strip() if tds.count() >= 2 else ""
            shot_b64 = capture_page_png_b64(page)

            if matched_rec:
                post_result_to_central({
                    "sicil_no": matched_rec.get("sicil_no", ""),
                    "ad_soyad": matched_rec.get("ad_soyad", ""),
                    "tam_adi_kiril": matched_rec.get("tam_adi_kiril", ""),
                    "inn_status": "APPLIED_STEP2",
                    "inn_application_no": app_no,
                    "inn_application_code": app_code,
                    "inn_screenshot_base64": shot_b64,
                })
            logger.info(f"  -> Zayavka 2 completed! AppNo={app_no} Code={app_code}")
        except Exception as e:
            logger.error(f"  -> Zayavka 2 error: {e}")


def main():
    parser = argparse.ArgumentParser(description="Pondera HR — INN & SNILS RPA Robot")
    parser.add_argument("--task", required=True, choices=["inn_check", "snils_check", "inn_zayavka_1", "inn_zayavka_2"])
    parser.add_argument("--json", required=True)
    parser.add_argument("--config-json", default="")
    args = parser.parse_args()

    with open(args.json, "r", encoding="utf-8") as f:
        records = json.load(f)
    cfg: Dict[str, Any] = {}
    if args.config_json and os.path.exists(args.config_json):
        with open(args.config_json, "r", encoding="utf-8") as cf:
            cfg = json.load(cf)

    cdp_url = str(cfg.get("CHROME_CDP_URL") or "http://localhost:9222")
    logger.info(f"Starting INN/SNILS Robot (task={args.task}, records={len(records)}) on {cdp_url}...")
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(cdp_url)
        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        page = ctx.pages[0] if ctx.pages else ctx.new_page()

        if args.task == "inn_check":
            run_inn_check(page, records)
        elif args.task == "snils_check":
            run_snils_check_human_in_loop(page, records)
        elif args.task == "inn_zayavka_1":
            run_inn_zayavka_1(page, records, cfg)
        elif args.task == "inn_zayavka_2":
            run_inn_zayavka_2(page, records, cfg)

    logger.info("=== INN/SNILS Robot Batch Complete ===")


if __name__ == "__main__":
    main()
