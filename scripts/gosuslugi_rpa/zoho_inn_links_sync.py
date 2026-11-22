#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scans Zoho Mail IMAP (ikbildirim@pondera.ru) for FNS INN Zayavka confirmation links
(https://service.nalog.ru/zpufl/...) from the last few days.
Reads JSON from stdin, writes JSON to stdout.
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
    max_msgs = int(cfg.get("max_messages") or 80)

    if not user or not password:
        print(json.dumps({"success": False, "message": "Zoho e-posta (ikbildirim@pondera.ru) bilgisi eksik."}))
        return

    link_re = re.compile(r"https?://service\.nalog\.ru/zpufl/[^\s\"'<>)\]]+", re.IGNORECASE)
    found = []
    seen_urls = set()
    scanned = 0

    try:
        imap = imaplib.IMAP4_SSL(host, port, timeout=25)
        imap.login(user, password)

        folders_to_check = ["INBOX"]
        # Also check Spam/Junk if available (FNS emails occasionally land in Spam)
        try:
            typ, flist = imap.list()
            if typ == "OK" and flist:
                for line in flist:
                    s = line.decode("utf-8", errors="replace")
                    if any(k in s.lower() for k in ("spam", "junk")):
                        m = re.search(r'"([^"]+)"\s*$', s)
                        fname = m.group(1) if m else s.split()[-1]
                        if fname not in folders_to_check:
                            folders_to_check.append(fname)
        except Exception:
            pass

        for folder in folders_to_check:
            try:
                typ, _ = imap.select(f'"{folder}"' if " " in folder else folder, readonly=True)
                if typ != "OK":
                    continue
                typ, data = imap.search(None, "ALL")
                if typ != "OK" or not data or not data[0]:
                    continue
                uids = data[0].split()
                recent_uids = list(reversed(uids[-max_msgs:]))
                for uid in recent_uids:
                    scanned += 1
                    try:
                        t2, msg_data = imap.fetch(uid, "(RFC822)")
                        if t2 != "OK" or not msg_data or not msg_data[0]:
                            continue
                        raw_bytes = msg_data[0][1]
                        if not isinstance(raw_bytes, (bytes, bytearray)):
                            continue
                        msg = email.message_from_bytes(raw_bytes)
                        sender = decode_str(msg.get("From", "")).lower()
                        subj = decode_str(msg.get("Subject", ""))
                        date_hdr = decode_str(msg.get("Date", ""))
                        if "nalog.ru" not in sender and "инн" not in subj.lower() and "налог" not in subj.lower() and "постановк" not in subj.lower():
                            continue
                        body = extract_body_text(msg)
                        urls = link_re.findall(body)
                        person_match = re.search(r"Уважаем(?:ый|ая)\s+([А-ЯЁа-яё\s\-]{5,70})", body)
                        person_hint = person_match.group(1).strip() if person_match else ""
                        for u in urls:
                            clean_u = u.replace("&amp;", "&").rstrip(".,;")
                            if "edit" in clean_u.lower() or "confirm" in clean_u.lower() or "id=" in clean_u.lower() or "code=" in clean_u.lower() or len(clean_u) > 36:
                                if clean_u not in seen_urls:
                                    seen_urls.add(clean_u)
                                    found.append({
                                        "url": clean_u,
                                        "subject": subj[:120],
                                        "date": date_hdr[:40],
                                        "personHint": person_hint,
                                        "folder": folder,
                                    })
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
            "links": found,
        }, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"success": False, "message": f"Zoho IMAP hatası: {e}"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
