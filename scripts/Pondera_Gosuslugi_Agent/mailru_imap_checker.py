#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pondera HR — Background Mail.ru IMAP Status Checker for Gosuslugi VKS & Visa/MVD Notifications.
Connects over SSL to imap.mail.ru:993, scans both INBOX ('Входящие') and Spam ('Спам' / &BCEEPwQwBDw-),
parses Gosuslugi notification emails ('Уведомления о трудовой деятельности иностранцев'),
extracts:
  - application_no (e.g. '8281910041')
  - gosuslugi_status (e.g. 'Заявление зарегистрировано', 'Заявление сформировано', 'Услуга оказана', 'Отказ в предоставлении услуги')
  - status_detail (e.g. 'На Госуслугах зарегистрировано ваше заявление... (19.10.2026 11:16)')
  - email_date (e.g. '19.10.2026 11:16')
  - service_title (e.g. 'Уведомления о трудовой деятельности иностранцев')
  - order_url (e.g. 'https://lk.gosuslugi.ru/order/...')
  - folder_name ('Входящие' or 'Спам')
Outputs a JSON object to stdout for the Next.js API route.
"""

import sys
import json
import imaplib
import email
from email.header import decode_header
import re
import html

# Ensure UTF-8 stdout/stderr on Windows and Linux
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


def extract_msg_bodies(msg: email.message.Message):
    plain_parts = []
    html_parts = []
    if msg.is_multipart():
        for part in msg.walk():
            ctype = (part.get_content_type() or "").lower()
            cdisp = str(part.get("Content-Disposition") or "").lower()
            if "attachment" in cdisp:
                continue
            payload = part.get_payload(decode=True)
            if not payload:
                continue
            charset = part.get_content_charset() or "utf-8"
            try:
                decoded = payload.decode(charset, errors="replace")
            except LookupError:
                decoded = payload.decode("utf-8", errors="replace")
            if ctype == "text/plain":
                plain_parts.append(decoded)
            elif ctype == "text/html":
                html_parts.append(decoded)
    else:
        ctype = (msg.get_content_type() or "").lower()
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            try:
                decoded = payload.decode(charset, errors="replace")
            except LookupError:
                decoded = payload.decode("utf-8", errors="replace")
            if ctype == "text/html":
                html_parts.append(decoded)
            else:
                plain_parts.append(decoded)
    return "\n".join(plain_parts), "\n".join(html_parts)


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


def status_priority(status_str: str) -> int:
    s = (status_str or "").lower().replace("ё", "е")
    if any(k in s for k in ("услуга оказана", "исполнено", "отказ", "ошибка", "возвращено", "прекращено")):
        return 40
    if any(k in s for k in ("зарегистрировано", "принято", "рассмотрен", "обработк")):
        return 30
    if any(k in s for k in ("отправлено в ведомство", "промежуточн")):
        return 20
    if any(k in s for k in ("сформировано", "отправлено", "черновик")):
        return 10
    return 15


def parse_gosuslugi_email(subject: str, sender: str, plain_text: str, html_text: str, folder_label: str):
    visible_text = html_to_visible_text(html_text) if html_text else plain_text
    if plain_text and plain_text not in visible_text:
        combined_text = f"{visible_text}\n{plain_text}".strip()
    else:
        combined_text = visible_text

    low_all = f"{subject}\n{sender}\n{combined_text}".lower().replace("ё", "е")
    if "госуслуг" not in low_all and "gosuslugi" not in low_all:
        return None

    # Exclude non-labor services if explicitly arrival/departure or work permit issuance
    if "прибытии и убытии" in low_all or "разрешение на работу иг" in low_all:
        return None

    # Extract application_no (Номер заявления № 8281910041)
    app_no = ""
    m_no = re.search(r"(?:Номер\s+заявления|заявлени[ея]|уведомлени[ея])[\s\S]{0,60}?№\s*(\d{8,14})", combined_text, re.IGNORECASE)
    if m_no:
        app_no = m_no.group(1).strip()
    if not app_no:
        m_no2 = re.search(r"№\s*(\d{8,14})", combined_text)
        if m_no2:
            app_no = m_no2.group(1).strip()
    if not app_no:
        return None

    # Extract service title
    service_title = "Уведомления о трудовой деятельности иностранцев"
    m_srv = re.search(r"«([^»]*трудовой\s+деятельности[^»]*)»", combined_text, re.IGNORECASE)
    if m_srv:
        service_title = m_srv.group(1).strip()
    elif "трудовой деятельности" in subject.lower():
        service_title = subject.strip()

    # Extract status heading (e.g. 'Заявление сформировано', 'Заявление зарегистрировано', 'Услуга оказана', 'Отказ в предоставлении услуги')
    gosuslugi_status = ""
    status_patterns = [
        (r"Услуга\s+оказана", "Услуга оказана"),
        (r"Отказ\s+в\s+предоставлении\s+услуги", "Отказ в предоставлении услуги"),
        (r"Отказано\s+в\s+предоставлении\s+услуги", "Отказано в предоставлении услуги"),
        (r"Ошибка\s+отправки\s+заявления", "Ошибка отправки заявления"),
        (r"Заявление\s+принято\s+к\s+рассмотрению", "Заявление принято к рассмотрению"),
        (r"Заявление\s+зарегистрировано", "Заявление зарегистрировано"),
        (r"Зарегистрировано\s+на\s+портале", "Зарегистрировано на портале"),
        (r"Заявление\s+отправлено\s+в\s+ведомство", "Отправлено в ведомство"),
        (r"Заявление\s+сформировано", "Заявление сформировано"),
        (r"На\s+Госуслугах\s+зарегистрировано\s+ваше\s+заявление", "Заявление зарегистрировано"),
        (r"На\s+Госуслугах\s+сформировано\s+ваше\s+заявление", "Заявление сформировано"),
    ]
    for pat, norm_stat in status_patterns:
        if re.search(pat, combined_text, re.IGNORECASE):
            gosuslugi_status = norm_stat
            break

    if not gosuslugi_status:
        # Fallback: check lines above 'Здравствуйте'
        lines = [ln.strip() for ln in combined_text.splitlines() if ln.strip()]
        for idx, ln in enumerate(lines[:10]):
            if ln.lower().startswith("здравствуйте") and idx > 0:
                cand = lines[idx - 1]
                if 4 <= len(cand) <= 65:
                    gosuslugi_status = cand
                    break
        if not gosuslugi_status:
            gosuslugi_status = "Заявление зарегистрировано" if "зарегистрирован" in low_all else "Заявление сформировано"

    # Extract 'Дата и время' (e.g. '19.10.2026 11:14')
    email_date_str = ""
    m_dt = re.search(r"(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})", combined_text)
    if m_dt:
        email_date_str = m_dt.group(1).strip()

    # Extract sentence description
    desc_sentence = ""
    for ln in combined_text.splitlines():
        if "на госуслугах" in ln.lower() or "заявление" in ln.lower() or "услуг" in ln.lower():
            if len(ln) > 18 and not ln.lower().startswith("номер заявления"):
                desc_sentence = ln.strip()
                break

    # Extract order URL from HTML ('Открыть заявление' href or lk.gosuslugi.ru/order/...)
    order_url = ""
    if html_text:
        m_link = re.search(r'href=["\'](https?://[^"\']*gosuslugi\.ru[^"\']*order[^"\']*)["\']', html_text, re.IGNORECASE)
        if m_link:
            order_url = html.unescape(m_link.group(1).strip())
        else:
            # Find link around 'Открыть заявление'
            m_btn = re.search(r'href=["\'](https?://[^"\']+)["\'][^>]*>\s*(?:<[^>]+>\s*)*Открыть\s+заявление', html_text, re.IGNORECASE)
            if m_btn:
                order_url = html.unescape(m_btn.group(1).strip())

    detail_parts = [f"Mail.ru ({folder_label}): {gosuslugi_status}"]
    if email_date_str:
        detail_parts.append(f"Дата: {email_date_str}")
    status_detail = " | ".join(detail_parts)

    return {
        "application_no": app_no,
        "service_title": service_title,
        "gosuslugi_status": gosuslugi_status,
        "status_detail": status_detail,
        "email_date": email_date_str,
        "order_url": order_url,
        "folder_name": folder_label,
        "priority": status_priority(gosuslugi_status),
    }


def discover_folders_to_scan(imap_conn: imaplib.IMAP4_SSL):
    """
    Returns list of (imap_folder_name, human_label) for INBOX ('Входящие') and Spam ('Спам').
    In Mail.ru IMAP, Spam is typically marked with \\Spam or \\Junk flag or encoded as '&BCEEPwQwBDw-'.
    """
    folders = [("INBOX", "Входящие")]
    seen_names = {"INBOX"}
    try:
        typ, data = imap_conn.list()
        if typ == "OK" and data:
            for raw_line in data:
                if not raw_line:
                    continue
                line = raw_line.decode("utf-8", errors="replace") if isinstance(raw_line, bytes) else str(raw_line)
                low_line = line.lower()
                is_spam = (
                    "\\spam" in low_line
                    or "\\junk" in low_line
                    or "&bceepwqwbdw-" in low_line
                    or "spam" in low_line
                    or "junk" in low_line
                )
                if is_spam:
                    # Extract folder name at the end of IMAP LIST response: (\HasNoChildren \Spam) "/" "&BCEEPwQwBDw-"
                    m_quoted = re.findall(r'"([^"]+)"', line)
                    folder_id = m_quoted[-1] if m_quoted else line.split()[-1]
                    if folder_id and folder_id not in seen_names:
                        seen_names.add(folder_id)
                        folders.append((folder_id, "Спам"))
    except Exception:
        pass

    # Fallback common Mail.ru spam folder names if LIST didn't expose flags
    if len(folders) == 1:
        for fallback_spam in ("&BCEEPwQwBDw-", "Spam", "Junk"):
            if fallback_spam not in seen_names:
                folders.append((fallback_spam, "Спам"))

    return folders


def main():
    try:
        raw_input = sys.stdin.read()
        cfg = json.loads(raw_input) if raw_input.strip() else {}
    except Exception as e:
        print(json.dumps({"success": False, "message": f"Invalid JSON input: {e}"}))
        return

    imap_host = str(cfg.get("imap_host") or "imap.mail.ru").strip()
    imap_port = int(cfg.get("imap_port") or 993)
    email_addr = str(cfg.get("email") or "").strip()
    app_password = str(cfg.get("app_password") or "").strip().replace(" ", "")
    max_per_folder = int(cfg.get("max_per_folder") or 120)

    if not email_addr or not app_password:
        print(
            json.dumps(
                {
                    "success": False,
                    "message": "Не указан адрес почты Mail.ru или пароль для внешнего приложения.",
                },
                ensure_ascii=False,
            )
        )
        return

    try:
        M = imaplib.IMAP4_SSL(imap_host, imap_port, timeout=20)
        M.login(email_addr, app_password)
    except imaplib.IMAP4.error as auth_err:
        err_str = str(auth_err)
        print(
            json.dumps(
                {
                    "success": False,
                    "message": (
                        "Ошибка авторизации IMAP Mail.ru. Убедитесь, что используется «Пароль для внешнего приложения» "
                        "(Настройки Mail.ru → Безопасность → Пароли для внешних приложений), а не обычный пароль от почты. "
                        f"Детали: {err_str}"
                    ),
                },
                ensure_ascii=False,
            )
        )
        return
    except Exception as conn_err:
        print(
            json.dumps(
                {
                    "success": False,
                    "message": f"Не удалось подключиться к {imap_host}:{imap_port}: {conn_err}",
                },
                ensure_ascii=False,
            )
        )
        return

    folders_to_scan = discover_folders_to_scan(M)
    all_events = []
    best_by_app_no = {}
    scanned_folders = []

    for folder_id, folder_label in folders_to_scan:
        try:
            typ, _ = M.select(f'"{folder_id}"' if " " in folder_id else folder_id, readonly=True)
            if typ != "OK":
                continue
            scanned_folders.append(folder_label)

            typ_s, msg_nums = M.search(None, "ALL")
            if typ_s != "OK" or not msg_nums or not msg_nums[0]:
                continue

            ids = msg_nums[0].split()
            recent_ids = ids[-max_per_folder:]  # newest emails at the end
            recent_ids.reverse()  # process newest first

            for m_id in recent_ids:
                try:
                    typ_f, msg_data = M.fetch(m_id, "(RFC822)")
                    if typ_f != "OK" or not msg_data:
                        continue
                    raw_bytes = None
                    for item in msg_data:
                        if isinstance(item, tuple) and len(item) >= 2 and isinstance(item[1], bytes):
                            raw_bytes = item[1]
                            break
                    if not raw_bytes:
                        continue

                    msg_obj = email.message_from_bytes(raw_bytes)
                    subj = decode_mime_str(msg_obj.get("Subject", ""))
                    sender = decode_mime_str(msg_obj.get("From", ""))

                    # Quick pre-filter on Subject / Sender before full body parse
                    low_hdr = f"{subj} {sender}".lower().replace("ё", "е")
                    if "госуслуг" not in low_hdr and "gosuslugi" not in low_hdr and "уведомлени" not in low_hdr and "заявлени" not in low_hdr:
                        continue

                    plain_body, html_body = extract_msg_bodies(msg_obj)
                    parsed = parse_gosuslugi_email(subj, sender, plain_body, html_body, folder_label)
                    if not parsed:
                        continue

                    all_events.append(parsed)
                    app_no = parsed["application_no"]
                    existing = best_by_app_no.get(app_no)
                    if not existing or parsed["priority"] > existing["priority"]:
                        best_by_app_no[app_no] = parsed
                except Exception:
                    continue
        except Exception:
            continue

    try:
        M.logout()
    except Exception:
        pass

    print(
        json.dumps(
            {
                "success": True,
                "scanned_folders": list(dict.fromkeys(scanned_folders)),
                "total_gosuslugi_emails": len(all_events),
                "unique_applications": len(best_by_app_no),
                "latest_by_application": list(best_by_app_no.values()),
                "events": all_events[:100],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
