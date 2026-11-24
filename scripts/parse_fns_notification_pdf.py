#!/usr/bin/env python3
"""
Parses official Russian FNS Notification PDFs (Форма по КНД 1125023 — Уведомление ИФНС о праве на зачет авансов НДФЛ).
Reads file path as argv[1], prints JSON:
  { "success": true, "notification_no": "19759", "notification_date": "2026-10-14", "inn": "027699777577", "full_name": "...", "passport": "...", "ifns_name": "..." }
"""
import json
import re
import sys


def extract_pdf_text(path: str) -> str:
    for mod in ("pypdf", "PyPDF2", "fitz", "pdfplumber"):
        try:
            if mod == "pypdf":
                import pypdf
                reader = pypdf.PdfReader(path)
                return "\n".join(p.extract_text() or "" for p in reader.pages)
            if mod == "PyPDF2":
                import PyPDF2
                reader = PyPDF2.PdfReader(path)
                return "\n".join(p.extract_text() or "" for p in reader.pages)
            if mod == "fitz":
                import fitz
                doc = fitz.open(path)
                return "\n".join(p.get_text() for p in doc)
            if mod == "pdfplumber":
                import pdfplumber
                with pdfplumber.open(path) as pdf:
                    return "\n".join(p.extract_text() or "" for p in pdf.pages)
        except Exception:
            continue
    return ""


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "message": "PDF path missing"}))
        return
    txt = extract_pdf_text(sys.argv[1])
    if not txt.strip():
        print(json.dumps({"success": False, "message": "PDF metni okunamadı (taranmış görsel olabilir)."}))
        return

    norm = re.sub(r"[ \t]+", " ", txt)

    m_no = re.search(r"УВЕДОМЛЕНИЕ\s*№\s*([0-9A-Za-zА-Яа-я/-]+)", norm, re.IGNORECASE)
    notif_no = m_no.group(1).strip() if m_no else ""

    # Date right after УВЕДОМЛЕНИЕ № ... от DD.MM.YYYY
    m_dt = re.search(r"УВЕДОМЛЕНИЕ[\s\S]{0,220}?от\s+(\d{2})\.(\d{2})\.(\d{4})", norm, re.IGNORECASE)
    notif_date = f"{m_dt.group(3)}-{m_dt.group(2)}-{m_dt.group(1)}" if m_dt else ""

    # Taxpayer 12-digit INN + Cyrillic FIO right after "с доходов налогоплательщика"
    m_person = re.search(
        r"налогоплательщика\s+(\d{12})\s*,\s*([А-ЯЁа-яё\-]+(?:\s+[А-ЯЁа-яё\-]+){1,4})",
        norm,
        re.IGNORECASE,
    )
    if not m_person:
        m_person = re.search(r"\b(\d{12})\s*,\s*([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){1,3})", norm)

    inn = m_person.group(1).strip() if m_person else ""
    full_name = re.sub(r"\s+", " ", m_person.group(2)).strip() if m_person else ""

    m_pass = re.search(r"Паспорт[^\n,]{0,40}?([A-ZА-Я]{1,3}\s*\d{6,9})", norm, re.IGNORECASE)
    passport = m_pass.group(1).strip() if m_pass else ""

    m_ifns = re.search(r"(Межрайонная инспекция[^\n]+|ИФНС[^\n]+)", norm, re.IGNORECASE)
    ifns_name = m_ifns.group(1).strip() if m_ifns else ""

    print(
        json.dumps(
            {
                "success": bool(notif_no or full_name),
                "notification_no": notif_no,
                "notification_date": notif_date,
                "inn": inn,
                "full_name": full_name,
                "passport": passport,
                "ifns_name": ifns_name,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
