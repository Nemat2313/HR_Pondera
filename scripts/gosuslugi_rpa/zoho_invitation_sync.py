#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pondera HR — Zoho Mail IMAP Sync & Russian MVD Electronic Invitation PDF Parser
Connects to Zoho IMAP (imappro.zoho.com:993 / imap.zoho.com:993), finds MVD invitation emails
('Одобрено ваше ходатайство ... о выдаче приглашения на въезд в РФ'), extracts PDF attachments,
parses all structured fields from the MVD Electronic Invitation PDF (including ToUnicode CMap
FlateDecode streams), and returns JSON to the Next.js API.
"""

import sys
import json
import imaplib
import poplib
import email
from email.header import decode_header
from email.utils import parsedate_to_datetime
import base64
import zlib
import re
import html
import subprocess
import tempfile
import os

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def decode_mime_str(val: str) -> str:
    if not val:
        return ""
    parts = decode_header(val)
    out = []
    for content, enc in parts:
        if isinstance(content, bytes):
            charset = enc or "utf-8"
            try:
                out.append(content.decode(charset, errors="replace"))
            except LookupError:
                out.append(content.decode("utf-8", errors="replace"))
        else:
            out.append(str(content))
    return "".join(out).strip()


def html_to_visible_text(raw_html: str) -> str:
    if not raw_html:
        return ""
    cleaned = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", raw_html, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"<br\s*/?>", "\n", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"</(p|div|tr|li|h[1-6]|td)>", "\n", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = html.unescape(cleaned)
    lines = [re.sub(r"[ \t\xa0]+", " ", ln).strip() for ln in cleaned.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def extract_pdf_text_multi_strategy(pdf_bytes: bytes) -> str:
    """
    Extracts Unicode text from a Russian MVD Invitation PDF using:
    1) pypdf / PyPDF2 / fitz (PyMuPDF) if installed
    2) pdftotext CLI (poppler-utils) if installed
    3) Built-in pure-Python PDF FlateDecode + ToUnicode CMap parser (zero external dependencies)
    """
    texts = []

    # Strategy 1: pypdf / PyPDF2
    for mod_name in ("pypdf", "PyPDF2"):
        try:
            mod = __import__(mod_name)
            import io
            reader = mod.PdfReader(io.BytesIO(pdf_bytes))
            page_texts = []
            for p in reader.pages:
                t = p.extract_text() or ""
                if t.strip():
                    page_texts.append(t)
            joined = "\n".join(page_texts).strip()
            if joined:
                texts.append(joined)
                break
        except Exception:
            pass

    # Strategy 2: PyMuPDF (fitz)
    if not texts:
        try:
            import fitz  # type: ignore
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            page_texts = [page.get_text("text") for page in doc]
            joined = "\n".join(page_texts).strip()
            if joined:
                texts.append(joined)
        except Exception:
            pass

    # Strategy 3: pdftotext CLI
    if not texts:
        try:
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
                tf.write(pdf_bytes)
                temp_pdf_path = tf.name
            try:
                res = subprocess.run(
                    ["pdftotext", "-layout", "-enc", "UTF-8", temp_pdf_path, "-"],
                    capture_output=True,
                    timeout=10,
                )
                if res.returncode == 0 and res.stdout:
                    decoded = res.stdout.decode("utf-8", errors="replace").strip()
                    if decoded:
                        texts.append(decoded)
            finally:
                try:
                    os.remove(temp_pdf_path)
                except Exception:
                    pass
        except Exception:
            pass

    # Strategy 4: Pure-Python PDF FlateDecode + ToUnicode CMap parser
    try:
        pure_text = extract_pdf_text_pure_python(pdf_bytes)
        if pure_text.strip():
            texts.append(pure_text.strip())
    except Exception:
        pass

    return "\n\n".join(texts).strip()


def extract_pdf_text_pure_python(pdf_bytes: bytes) -> str:
    """
    Decompresses all FlateDecode streams in a PDF, builds font ToUnicode mappings
    (beginbfchar / beginbfrange), and decodes all text operators (Tj, TJ, ').
    Works reliably on Russian MVD / Gosuslugi PDFs without any third-party libraries.
    """
    decompressed_streams = []
    for m in re.finditer(rb"stream[\r\n]+([\s\S]*?)[\r\n]+endstream", pdf_bytes):
        raw_stream = m.group(1)
        for wbits in (zlib.MAX_WBITS, -zlib.MAX_WBITS):
            try:
                dec = zlib.decompress(raw_stream, wbits)
                decompressed_streams.append(dec)
                break
            except Exception:
                pass

    # 1. Collect all ToUnicode CMap mappings across streams
    # Note: A PDF may have multiple fonts; we store both 2-byte (4 hex chars) and 1-byte (2 hex chars) maps
    cmap_list = []
    content_streams = []

    for dec in decompressed_streams:
        text_latin = dec.decode("latin1", errors="replace")
        if "beginbfchar" in text_latin or "beginbfrange" in text_latin:
            cmap = {}
            # Parse beginbfchar ... endbfchar
            for block in re.findall(r"beginbfchar([\s\S]*?)endbfchar", text_latin):
                for src_hex, dst_hex in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block):
                    code = int(src_hex, 16)
                    # dst_hex can be 4 hex chars (1 UTF-16BE char) or multiple
                    chars = []
                    for i in range(0, len(dst_hex), 4):
                        chunk = dst_hex[i : i + 4]
                        if len(chunk) == 4:
                            chars.append(chr(int(chunk, 16)))
                    if chars:
                        cmap[(len(src_hex), code)] = "".join(chars)

            # Parse beginbfrange ... endbfrange
            for block in re.findall(r"beginbfrange([\s\S]*?)endbfrange", text_latin):
                for line in block.splitlines():
                    m_rng = re.search(
                        r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", line
                    )
                    if m_rng:
                        start_h, end_h, dst_h = m_rng.group(1), m_rng.group(2), m_rng.group(3)
                        start_c = int(start_h, 16)
                        end_c = int(end_h, 16)
                        base_u = int(dst_h, 16)
                        hlen = len(start_h)
                        for offset in range(max(0, min(512, end_c - start_c + 1))):
                            cmap[(hlen, start_c + offset)] = chr(base_u + offset)
                    else:
                        m_arr = re.search(
                            r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]", line
                        )
                        if m_arr:
                            start_h = m_arr.group(1)
                            start_c = int(start_h, 16)
                            hlen = len(start_h)
                            targets = re.findall(r"<([0-9A-Fa-f]+)>", m_arr.group(3))
                            for idx, th in enumerate(targets):
                                cmap[(hlen, start_c + idx)] = chr(int(th[:4], 16))
            if cmap:
                cmap_list.append(cmap)
        elif "BT" in text_latin and ("Tj" in text_latin or "TJ" in text_latin):
            content_streams.append(text_latin)

    # Merge cmaps (preserving first seen or overriding cleanly)
    merged_cmap = {}
    for cm in cmap_list:
        merged_cmap.update(cm)

    def decode_hex_token(hex_str: str) -> str:
        clean_h = re.sub(r"\s+", "", hex_str)
        if not clean_h:
            return ""
        # Try 4-hex-digit (2-byte CID) first if 4-len keys exist in merged_cmap
        has_4 = any(k[0] == 4 for k in merged_cmap.keys())
        if has_4 and len(clean_h) % 4 == 0:
            out = []
            for i in range(0, len(clean_h), 4):
                code = int(clean_h[i : i + 4], 16)
                if (4, code) in merged_cmap:
                    out.append(merged_cmap[(4, code)])
                elif 32 <= code <= 126 or 0x0400 <= code <= 0x04FF:
                    out.append(chr(code))
            if out:
                return "".join(out)
        # Fallback to 2-hex-digit (1-byte)
        out = []
        for i in range(0, len(clean_h), 2):
            code = int(clean_h[i : i + 2], 16)
            if (2, code) in merged_cmap:
                out.append(merged_cmap[(2, code)])
            elif 32 <= code <= 126:
                out.append(chr(code))
        return "".join(out)

    def unescape_pdf_literal(lit: str) -> bytes:
        out = bytearray()
        i = 0
        n = len(lit)
        while i < n:
            ch = lit[i]
            if ch == "\\" and i + 1 < n:
                nxt = lit[i + 1]
                if nxt in "01234567":
                    oct_digits = lit[i + 1 : i + 4]
                    m_oct = re.match(r"^[0-7]{1,3}", oct_digits)
                    if m_oct:
                        ov = m_oct.group(0)
                        out.append(int(ov, 8) & 0xFF)
                        i += 1 + len(ov)
                        continue
                elif nxt == "n":
                    out.append(10)
                elif nxt == "r":
                    out.append(13)
                elif nxt == "t":
                    out.append(9)
                else:
                    out.append(ord(nxt) & 0xFF)
                i += 2
            else:
                out.append(ord(ch) & 0xFF)
                i += 1
        return bytes(out)

    def decode_literal_token(lit: str) -> str:
        raw_b = unescape_pdf_literal(lit)
        if not raw_b:
            return ""
        # Check if 2-byte big-endian CID matches merged_cmap
        has_4 = any(k[0] == 4 for k in merged_cmap.keys())
        if has_4 and len(raw_b) % 2 == 0:
            out = []
            matched = 0
            for i in range(0, len(raw_b), 2):
                code = (raw_b[i] << 8) | raw_b[i + 1]
                if (4, code) in merged_cmap:
                    out.append(merged_cmap[(4, code)])
                    matched += 1
                elif 32 <= code <= 126 or 0x0400 <= code <= 0x04FF:
                    out.append(chr(code))
            if matched > 0:
                return "".join(out)
        # Check 1-byte CID in merged_cmap
        has_2 = any(k[0] == 2 for k in merged_cmap.keys())
        if has_2:
            out = []
            matched = 0
            for b in raw_b:
                if (2, b) in merged_cmap:
                    out.append(merged_cmap[(2, b)])
                    matched += 1
                elif 32 <= b <= 126:
                    out.append(chr(b))
            if matched > 0:
                return "".join(out)
        # Fallback CP1251 or UTF-8
        try:
            return raw_b.decode("utf-8")
        except Exception:
            return raw_b.decode("cp1251", errors="replace")

    lines_out = []
    for cs in content_streams:
        for bt_block in re.findall(r"BT([\s\S]*?)ET", cs):
            parts = []
            for tok in re.finditer(r"<([0-9A-Fa-f\s]+)>|\(((?:\\.|[^\\()])*)\)", bt_block):
                if tok.group(1) is not None:
                    s = decode_hex_token(tok.group(1))
                else:
                    s = decode_literal_token(tok.group(2))
                if s:
                    parts.append(s)
            line_str = "".join(parts).strip()
            if line_str:
                lines_out.append(line_str)

    return "\n".join(lines_out)


def parse_mvd_invitation_fields(raw_text: str, email_subject: str = "", email_body: str = "") -> dict:
    """
    Parses all structured fields from the Russian MVD Electronic Invitation PDF text
    and accompanying forwarding email text.
    """
    combined = f"{raw_text}\n{email_subject}\n{email_body}"
    norm_text = re.sub(r"[ \t\xa0]+", " ", raw_text)

    # 1. Petition No (Ходатайство, e.g. 2Y8860086) & Petition Date (e.g. 08.10.2026)
    petition_no = ""
    petition_date = ""
    m_pet = re.search(
        r"ходатайств[уао]\s+([0-9A-ZА-Я]{6,14})(?:\s+от\s+(\d{2}\.\d{2}\.\d{4}))?",
        f"{email_subject}\n{email_body}",
        re.IGNORECASE,
    )
    if m_pet:
        petition_no = m_pet.group(1).strip().upper()
        if m_pet.group(2):
            petition_date = m_pet.group(2).strip()

    # 2. Invitation Number (Номер приглашения, e.g. 7726002Y8860086)
    invitation_no = ""
    m_inv = re.search(
        r"(?:Invitation\s+number|Номер\s+приглашения)[\s\S]{0,80}?\b(\d{4,7}[0-9A-ZА-Я]{6,12})\b",
        norm_text,
        re.IGNORECASE,
    )
    if m_inv:
        invitation_no = m_inv.group(1).strip().upper()
    if not invitation_no:
        m_inv2 = re.search(r"\b(\d{6}[0-9A-ZА-Я]{7,10})\b", norm_text)
        if m_inv2:
            invitation_no = m_inv2.group(1).strip().upper()
    if not invitation_no and petition_no:
        m_inv3 = re.search(r"\b(\d{4,7}" + re.escape(petition_no) + r")\b", combined, re.IGNORECASE)
        if m_inv3:
            invitation_no = m_inv3.group(1).strip().upper()
        else:
            invitation_no = petition_no

    if not petition_no and len(invitation_no) > 9:
        petition_no = invitation_no[-9:]

    # 3. Issuing Authority (Орган, оформивший приглашение)
    issuing_authority = ""
    m_auth = re.search(
        r"(\d{3}-\d{3}\s+ОТДЕЛ\s+ОФОРМЛЕНИЯ\s+ВИЗ[\s\S]{0,120}?)(?:Дата\s+и\s+место|Date\s+and\s+place|\n\n)",
        norm_text,
        re.IGNORECASE,
    )
    if m_auth:
        issuing_authority = re.sub(r"\s+", " ", m_auth.group(1)).strip()
    elif "ОТДЕЛ ОФОРМЛЕНИЯ ВИЗ" in email_body.upper():
        m_auth_em = re.search(
            r"(ОТДЕЛ\s+ОФОРМЛЕНИЯ\s+ВИЗ[^\n.,]+)", email_body, re.IGNORECASE
        )
        if m_auth_em:
            issuing_authority = re.sub(r"\s+", " ", m_auth_em.group(1)).strip()

    # 4. Date of Birth & Place of Birth (01.01.2000, РЕСПУБЛИКА ИНДИЯ, ДЖАУНПУР УТТАР ПРАДЕШ)
    birth_date = ""
    birth_place_ru = ""
    m_dob_place = re.search(
        r"(\d{2}\.\d{2}\.(?:19\d{2}|20\d{2}))\s*,\s*([А-ЯЁA-Z0-9\s,.\-/]+?)(?=\s+(?:Пол|Sex|МУЖ|ЖЕН|Гражданство|Nationality)\b|\n)",
        norm_text,
    )
    if m_dob_place:
        birth_date = m_dob_place.group(1).strip()
        birth_place_ru = re.sub(r"\s+", " ", m_dob_place.group(2)).strip(" ,.-")

    # 5. Gender (Пол / Sex: МУЖ or ЖЕН)
    gender_ru = ""
    m_sex = re.search(r"\b(МУЖ|ЖЕН)\b", norm_text)
    if m_sex:
        gender_ru = m_sex.group(1).strip()

    # 6. Nationality (Гражданство / Nationality: ИНДИЯ)
    nationality_ru = ""
    m_nat = re.search(
        r"(?:Гражданство|Nationality)\s+([А-ЯЁA-Z\s\-]+?)(?=\s+(?:Документ|Passport|Номер|Number)\b|\n)",
        norm_text,
        re.IGNORECASE,
    )
    if m_nat:
        cand_nat = re.sub(r"\s+", " ", m_nat.group(1)).strip()
        # Strip English label if stuck together
        cand_nat = re.sub(r"^(?:Nationality|Гражданство)\s*", "", cand_nat, flags=re.IGNORECASE).strip()
        if cand_nat:
            nationality_ru = cand_nat
    if not nationality_ru and "ИНДИЯ" in birth_place_ru:
        nationality_ru = "ИНДИЯ"
    elif not nationality_ru and "ТУРЦИЯ" in birth_place_ru:
        nationality_ru = "ТУРЦИЯ"

    # 7. Masked Passport Number (*****410) & Last 3 digits (410)
    passport_masked = ""
    passport_last3 = ""
    m_pass = re.search(r"(\*{2,}[0-9A-ZА-Я]{2,5})", norm_text)
    if m_pass:
        passport_masked = m_pass.group(1).strip()
        m_l3 = re.search(r"([0-9A-ZА-Я]{3,4})$", passport_masked)
        if m_l3:
            passport_last3 = m_l3.group(1)

    # 8. All dates in the document to accurately map passport_issue_date, entry_from, stay_until
    # Standard order of dates in MVD Electronic Invitation:
    #   [0] Date of birth (e.g. 01.01.2000)
    #   [1] Passport Date of issue (e.g. 12.10.2020)
    #   [2] Entry from (e.g. 27.10.2026)
    #   [3] Stay until (e.g. 24.01.2027)
    all_pdf_dates = re.findall(r"\b(\d{2}\.\d{2}\.(?:19\d{2}|20\d{2}))\b", norm_text)
    if not birth_date and len(all_pdf_dates) >= 1:
        birth_date = all_pdf_dates[0]

    passport_issue_date = ""
    entry_from = ""
    stay_until = ""

    # Try explicit label match first
    m_pissue = re.search(
        r"(?:Дата\s+выдачи|Date\s+of\s+issue)[\s\S]{0,60}?\b(\d{2}\.\d{2}\.(?:19\d{2}|20\d{2}))\b",
        norm_text,
        re.IGNORECASE,
    )
    if m_pissue:
        passport_issue_date = m_pissue.group(1)

    m_entry = re.search(
        r"(?:Въезд\s+с|Entry\s+from)[\s\S]{0,60}?\b(\d{2}\.\d{2}\.20\d{2})\b",
        norm_text,
        re.IGNORECASE,
    )
    if m_entry:
        entry_from = m_entry.group(1)

    m_until = re.search(
        r"(?:Пребывание\s+по|Stay\s+until)[\s\S]{0,60}?\b(\d{2}\.\d{2}\.20\d{2})\b",
        norm_text,
        re.IGNORECASE,
    )
    if m_until:
        stay_until = m_until.group(1)

    # Fallback by positional order of dates in MVD invitation table
    remaining_dates = [d for d in all_pdf_dates if d != birth_date]
    if not passport_issue_date and len(remaining_dates) >= 1:
        passport_issue_date = remaining_dates[0]
    if not entry_from and len(remaining_dates) >= 2:
        entry_from = remaining_dates[1]
    if not stay_until and len(remaining_dates) >= 3:
        stay_until = remaining_dates[2]

    # 9. Duration days (На срок (дней), e.g. 90)
    duration_days = ""
    m_dur = re.search(
        r"(?:Duration\s+of\s+stay\s*\(days\)|На\s+срок\s*\(дней\))[\s\S]{0,50}?\b(\d{1,3})\b",
        norm_text,
        re.IGNORECASE,
    )
    if m_dur:
        duration_days = m_dur.group(1)
    elif stay_until:
        m_after_until = re.search(re.escape(stay_until) + r"[\s\S]{0,60}?\b(30|60|90|180|365)\b", norm_text)
        if m_after_until:
            duration_days = m_after_until.group(1)

    # 10. Visa Category & Multiplicity
    visa_category = ""
    if "ОБЫКНОВЕННАЯ РАБОЧАЯ" in norm_text.upper():
        visa_category = "ОБЫКНОВЕННАЯ РАБОЧАЯ [ОР]"
    visa_multiplicity = ""
    if "ОДНОКРАТНАЯ" in norm_text.upper():
        visa_multiplicity = "ОДНОКРАТНАЯ [О]"
    elif "МНОГОКРАТНАЯ" in norm_text.upper():
        visa_multiplicity = "МНОГОКРАТНАЯ [М]"
    elif "ДВУКРАТНАЯ" in norm_text.upper():
        visa_multiplicity = "ДВУКРАТНАЯ [Д]"

    # 11. Place of visa issuance (Место получения визы: ИНДИЯ, НЬЮ-ДЕЛИ)
    visa_issuance_place = ""
    m_vplace = re.search(
        r"(?:Place\s+of\s+visa\s+issuance|Место\s+получения\s+визы)\s*([А-ЯЁA-Z\s,\-]+?)(?=\s+(?:Цель\s+поездки|Purpose\s+of\s+entry|ТРУДОВАЯ)\b)",
        norm_text,
        re.IGNORECASE,
    )
    if m_vplace:
        visa_issuance_place = re.sub(r"\s+", " ", m_vplace.group(1)).strip(" ,")

    # 12. Purpose of entry (Цель поездки: ТРУДОВАЯ ДЕЯТЕЛЬНОСТЬ)
    purpose_of_entry = "ТРУДОВАЯ ДЕЯТЕЛЬНОСТЬ" if "ТРУДОВАЯ ДЕЯТЕЛЬНОСТЬ" in norm_text.upper() else ""

    return {
        "invitation_no": invitation_no,
        "petition_no": petition_no,
        "petition_date": petition_date,
        "issuing_authority": issuing_authority,
        "birth_date": birth_date,
        "birth_place_ru": birth_place_ru,
        "gender_ru": gender_ru,
        "nationality_ru": nationality_ru,
        "passport_masked": passport_masked,
        "passport_last3": passport_last3,
        "passport_issue_date": passport_issue_date,
        "visa_category": visa_category,
        "visa_multiplicity": visa_multiplicity,
        "entry_from": entry_from,
        "stay_until": stay_until,
        "duration_days": duration_days,
        "visa_issuance_place": visa_issuance_place,
        "purpose_of_entry": purpose_of_entry,
        "extracted_text": raw_text[:4000],
    }


def connect_zoho_imap(primary_host: str, port: int, email_addr: str, password: str):
    hosts_to_try = []
    for h in [primary_host, "imappro.zoho.com", "imap.zoho.com", "imappro.zoho.eu", "imap.zoho.eu"]:
        if h and h not in hosts_to_try:
            hosts_to_try.append(h)

    primary_err = ""
    for h in hosts_to_try:
        try:
            conn = imaplib.IMAP4_SSL(h, port, timeout=20)
            conn.login(email_addr, password)
            return conn, h, ""
        except Exception as e:
            if not primary_err:
                primary_err = f"{h}: {e}"
    return None, "", primary_err


def process_raw_email_bytes(raw_email: bytes, fallback_id: str, items: list):
    msg = email.message_from_bytes(raw_email)
    subject = decode_mime_str(msg.get("Subject", ""))
    sender = decode_mime_str(msg.get("From", ""))
    msg_id_hdr = str(msg.get("Message-ID") or "").strip()
    date_hdr = str(msg.get("Date") or "").strip()

    email_received_iso = ""
    email_received_display = ""
    if date_hdr:
        try:
            dt = parsedate_to_datetime(date_hdr)
            email_received_iso = dt.strftime("%Y-%m-%d")
            email_received_display = dt.strftime("%d.%m.%Y %H:%M")
        except Exception:
            email_received_display = date_hdr[:25]

    plain_parts = []
    html_parts = []
    pdf_attachments = []

    if msg.is_multipart():
        for part in msg.walk():
            ctype = (part.get_content_type() or "").lower()
            fname = decode_mime_str(part.get_filename() or "")
            if ctype == "application/pdf" or fname.lower().endswith(".pdf"):
                pdf_bytes = part.get_payload(decode=True)
                if pdf_bytes:
                    pdf_attachments.append((fname or "Invitation.pdf", pdf_bytes))
            elif ctype == "text/plain" and not fname:
                b = part.get_payload(decode=True)
                if b:
                    ch = part.get_content_charset() or "utf-8"
                    plain_parts.append(b.decode(ch, errors="replace"))
            elif ctype == "text/html" and not fname:
                b = part.get_payload(decode=True)
                if b:
                    ch = part.get_content_charset() or "utf-8"
                    html_parts.append(b.decode(ch, errors="replace"))
    else:
        b = msg.get_payload(decode=True)
        if b:
            ch = msg.get_content_charset() or "utf-8"
            plain_parts.append(b.decode(ch, errors="replace"))

    body_text = "\n".join(plain_parts).strip()
    if not body_text and html_parts:
        body_text = html_to_visible_text("\n".join(html_parts))

    combined_check = f"{subject}\n{sender}\n{body_text}".lower()
    is_invitation_mail = (
        "ходатайств" in combined_check
        or "приглашен" in combined_check
        or "invitation@pondera.ru" in combined_check
        or "srv_pvm_invitation@mvd.ru" in combined_check
    )
    if not is_invitation_mail or not pdf_attachments:
        return

    for orig_fname, pdf_bytes in pdf_attachments:
        extracted_text = extract_pdf_text_multi_strategy(pdf_bytes)
        parsed_fields = parse_mvd_invitation_fields(extracted_text, subject, body_text)
        items.append(
            {
                "message_id": msg_id_hdr or fallback_id,
                "subject": subject,
                "sender": sender,
                "email_received_iso": email_received_iso,
                "email_received_display": email_received_display,
                "original_filename": orig_fname,
                "pdf_size_bytes": len(pdf_bytes),
                "pdf_base64": base64.b64encode(pdf_bytes).decode("ascii"),
                "fields": parsed_fields,
            }
        )


def try_pop3_fallback(email_addr: str, password: str, max_messages: int):
    for pop_host in ("poppro.zoho.com", "pop.zoho.com"):
        try:
            pop = poplib.POP3_SSL(pop_host, 995, timeout=20)
            pop.user(email_addr)
            pop.pass_(password)
            num_messages = len(pop.list()[1])
            start_idx = max(1, num_messages - max_messages + 1)
            items = []
            scanned = 0
            for i in range(num_messages, start_idx - 1, -1):
                scanned += 1
                resp, lines, octets = pop.retr(i)
                raw_email = b"\r\n".join(lines)
                process_raw_email_bytes(raw_email, f"pop3-{i}", items)
            pop.quit()
            return {
                "success": True,
                "connected_host": f"{pop_host}:995 (POP3)",
                "scanned_emails": scanned,
                "found_invitations": len(items),
                "items": items,
            }
        except Exception:
            pass
    return None


def sync_imap_invitations(payload: dict) -> dict:
    imap_host = payload.get("imap_host") or "imappro.zoho.com"
    imap_port = int(payload.get("imap_port") or 993)
    email_addr = (payload.get("email") or "").strip()
    password = payload.get("password") or ""
    max_messages = int(payload.get("max_messages") or 80)

    if not email_addr or not password:
        return {"success": False, "message": "Zoho e-posta veya şifre tanımlı değil."}

    conn, connected_host, err = connect_zoho_imap(imap_host, imap_port, email_addr, password)
    if not conn:
        pop_res = try_pop3_fallback(email_addr, password, max_messages)
        if pop_res:
            return pop_res
        return {
            "success": False,
            "message": (
                f"Zoho IMAP erişimi henüz açık değil ({err}). "
                "Zoho Mail (mail.zoho.com) → Sağ üst Ayarlar (⚙️) → Mail Accounts → IMAP sekmesinden "
                "'IMAP Access' kutucuğunu işaretleyerek IMAP erişimini aktif edin."
            ),
        }

    items = []
    scanned_count = 0
    try:
        conn.select("INBOX", readonly=True)
        typ, data = conn.search(None, "ALL")
        if typ == "OK" and data and data[0]:
            msg_ids = data[0].split()
            recent_ids = msg_ids[-max_messages:]
            for mid in reversed(recent_ids):
                scanned_count += 1
                t_f, msg_data = conn.fetch(mid, "(RFC822)")
                if t_f != "OK" or not msg_data:
                    continue
                raw_email = None
                for part_tuple in msg_data:
                    if isinstance(part_tuple, tuple) and len(part_tuple) >= 2:
                        raw_email = part_tuple[1]
                        break
                if not raw_email:
                    continue
                process_raw_email_bytes(
                    raw_email,
                    f"imap-{mid.decode('utf-8', errors='ignore')}",
                    items,
                )
    finally:
        try:
            conn.logout()
        except Exception:
            pass

    return {
        "success": True,
        "connected_host": connected_host,
        "scanned_emails": scanned_count,
        "found_invitations": len(items),
        "items": items,
    }


def main():
    raw_in = sys.stdin.read()
    if not raw_in.strip():
        print(json.dumps({"success": False, "message": "Empty input"}))
        return
    payload = json.loads(raw_in)
    action = payload.get("action") or "sync_imap"

    if action == "parse_pdf":
        b64 = payload.get("pdf_base64") or ""
        pdf_bytes = base64.b64decode(b64)
        extracted_text = extract_pdf_text_multi_strategy(pdf_bytes)
        fields = parse_mvd_invitation_fields(
            extracted_text,
            payload.get("subject") or "",
            payload.get("body") or "",
        )
        print(
            json.dumps(
                {
                    "success": True,
                    "pdf_size_bytes": len(pdf_bytes),
                    "fields": fields,
                },
                ensure_ascii=False,
            )
        )
    else:
        res = sync_imap_invitations(payload)
        print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    main()

