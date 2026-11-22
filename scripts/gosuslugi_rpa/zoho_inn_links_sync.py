#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scans Zoho Mail IMAP (ikbildirim@pondera.ru) UNSEEN emails across INBOX, Notification,
and Spam/Junk for FNS INN Zayavka confirmation links (https://service.nalog.ru/zpufl/...).
Marks processed emails as Read (\\Seen) so subsequent scans stay instant and never duplicate.
"""
import email
from email.header import decode_header
import imaplib
import json
import re
import sys


def decode_str(raw) -> str:
    if not raw:
        return ""
    parts = decode_header(str(raw))
    out = []
    for data, enc in parts:
        if isinstance(data, bytes):
            out.append(data.decode(enc or "utf-8", errors="replace"))
        else:
            out.append(str(data))
    return "".join(out).strip()


def extract_body_text(msg) -> str:
    chunks = []
    if msg.is_multipart():
        for part in msg.walk():
            ctype = (part.get_content_type() or "").lower()
            if ctype in ("text/plain", "text/html"):
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    chunks.append(payload.decode(charset, errors="replace"))
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            chunks.append(payload.decode(charset, errors="replace"))
    return "\n".join(chunks)


def connect_imap(host: str, port: int, user: str, password: str):
    hosts = []
    for h in (host, "imappro.zoho.com", "imap.zoho.com", "imap.zoho.eu"):
        if h and h not in hosts:
            hosts.append(h)
    last_err = ""
    for h in hosts:
        try:
            conn = imaplib.IMAP4_SSL(h, port, timeout=15)
            conn.login(user, password)
            return conn, h, ""
        except Exception as e:
            last_err = f"{h}: {e}"
    return None, "", last_err


def main():
    try:
        cfg = json.loads(sys.stdin.read() or "{}")
    except Exception:
        print(json.dumps({"success": False, "message": "Geçersiz giriş verisi."}))
        return

    host = str(cfg.get("imap_host") or "imappro.zoho.com").strip()
    port = int(cfg.get("imap_port") or 993)
    user = str(cfg.get("email") or "").strip()
    password = str(cfg.get("password") or "").strip()
    max_msgs = int(cfg.get("max_messages") or 60)

    if not user or not password:
        print(json.dumps({"success": False, "message": "Zoho e-posta (ikbildirim@pondera.ru) bilgisi eksik."}))
        return

    link_re = re.compile(r"https?://service\.nalog\.ru/zpufl/[^\s\"'<>)\]]+", re.IGNORECASE)
    found = []
    seen_urls = set()
    scanned = 0
    marked_read = 0

    imap, _connected_host, conn_err = connect_imap(host, port, user, password)
    if not imap:
        print(json.dumps({"success": False, "message": f"Zoho IMAP bağlantı hatası: {conn_err}"}, ensure_ascii=False))
        return

    try:
        folders_to_check = ["INBOX"]
        try:
            typ, flist = imap.list()
            if typ == "OK" and flist:
                for line in flist:
                    s = line.decode("utf-8", errors="replace")
                    if any(k in s.lower() for k in ("notification", "spam", "junk")):
                        m = re.search(r'"([^"]+)"\s*$', s)
                        fname = m.group(1) if m else s.split()[-1]
                        if fname not in folders_to_check:
                            folders_to_check.append(fname)
        except Exception:
            pass

        for folder in folders_to_check:
            try:
                typ, _ = imap.select(f'"{folder}"' if " " in folder else folder, readonly=False)
                if typ != "OK":
                    continue
                # Scan ONLY UNSEEN (unread) messages so scanning completes in ~1-2 seconds
                typ, data = imap.search(None, "UNSEEN")
                if typ != "OK" or not data or not data[0]:
                    continue
                uids = data[0].split()
                recent_uids = list(reversed(uids[-max_msgs:]))
                for uid in recent_uids:
                    scanned += 1
                    try:
                        # Peek headers first so non-nalog emails stay unread!
                        th, hdr_data = imap.fetch(uid, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
                        if th != "OK" or not hdr_data or not isinstance(hdr_data[0], tuple):
                            continue
                        hdr_msg = email.message_from_bytes(hdr_data[0][1])
                        sender = decode_str(hdr_msg.get("From", "")).lower()
                        subj = decode_str(hdr_msg.get("Subject", ""))
                        date_hdr = decode_str(hdr_msg.get("Date", ""))
                        if "nalog.ru" not in sender and "инн" not in subj.lower() and "налог" not in subj.lower() and "постановк" not in subj.lower():
                            continue

                        t2, msg_data = imap.fetch(uid, "(BODY.PEEK[])")
                        if t2 != "OK" or not msg_data or not isinstance(msg_data[0], tuple):
                            continue
                        msg = email.message_from_bytes(msg_data[0][1])
                        body = extract_body_text(msg)
                        urls = link_re.findall(body)
                        person_match = re.search(r"Уважаем(?:ый|ая)\s+([А-ЯЁа-яё\s\-]{5,70})", body)
                        person_hint = person_match.group(1).strip() if person_match else ""
                        matched_any_link = False
                        for u in urls:
                            clean_u = u.replace("&amp;", "&").rstrip(".,;")
                            if any(tok in clean_u.lower() for tok in ("edit", "confirm", "id=", "code=")) or len(clean_u) > 36:
                                matched_any_link = True
                                if clean_u not in seen_urls:
                                    seen_urls.add(clean_u)
                                    found.append({
                                        "url": clean_u,
                                        "subject": subj[:120],
                                        "date": date_hdr[:40],
                                        "personHint": person_hint,
                                        "folder": folder,
                                    })
                        # Mark processed nalog.ru confirmation email as Read (\Seen)
                        if matched_any_link:
                            try:
                                imap.store(uid, "+FLAGS", "\\Seen")
                                marked_read += 1
                            except Exception:
                                pass
                    except Exception:
                        continue
            except Exception:
                continue

        try:
            imap.logout()
        except Exception:
            pass

        print(json.dumps({
            "success": True,
            "scannedEmails": scanned,
            "markedRead": marked_read,
            "links": found,
        }, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"success": False, "message": f"Zoho IMAP hatası: {e}"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
