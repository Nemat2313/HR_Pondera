import os
import sys
import json
import gzip
import shutil
import struct
import sqlite3

DB_PATH = "pondera_hr.db"
BUNDLE_PATH = os.path.join("scripts", "recovery_seed_bundle.json.gz")
PDF_DIR = os.path.join("public", "gosuslugi_pdfs")


def read_varint(buf, offset):
    val = 0
    for i in range(8):
        if offset + i >= len(buf):
            return val, offset + i
        b = buf[offset + i]
        val = (val << 7) | (b & 0x7F)
        if not (b & 0x80):
            return val, offset + i + 1
    if offset + 8 < len(buf):
        b = buf[offset + 8]
        val = (val << 8) | b
        return val, offset + 9
    return val, len(buf)


def decode_serial_value(buf, offset, st):
    if st == 0:
        return None, offset
    if st == 1:
        return struct.unpack(">b", buf[offset : offset + 1])[0], offset + 1
    if st == 2:
        return struct.unpack(">h", buf[offset : offset + 2])[0], offset + 2
    if st == 3:
        raw = buf[offset : offset + 3]
        val = int.from_bytes(raw, byteorder="big", signed=True)
        return val, offset + 3
    if st == 4:
        return struct.unpack(">i", buf[offset : offset + 4])[0], offset + 4
    if st == 5:
        raw = buf[offset : offset + 6]
        val = int.from_bytes(raw, byteorder="big", signed=True)
        return val, offset + 6
    if st == 6:
        return struct.unpack(">q", buf[offset : offset + 8])[0], offset + 8
    if st == 7:
        return struct.unpack(">d", buf[offset : offset + 8])[0], offset + 8
    if st == 8:
        return 0, offset
    if st == 9:
        return 1, offset
    if st >= 12 and st % 2 == 0:
        ln = (st - 12) // 2
        return buf[offset : offset + ln], offset + ln
    if st >= 13 and st % 2 == 1:
        ln = (st - 13) // 2
        raw = buf[offset : offset + ln]
        return raw.decode("utf-8", errors="replace"), offset + ln
    return None, offset


def parse_leaf_page_cells(page_bytes):
    if not page_bytes or page_bytes[0] != 0x0D:
        return []
    cell_count = struct.unpack(">H", page_bytes[3:5])[0]
    if cell_count == 0 or cell_count > 1000:
        return []
    records = []
    for i in range(cell_count):
        ptr_off = 8 + i * 2
        if ptr_off + 2 > len(page_bytes):
            break
        cell_off = struct.unpack(">H", page_bytes[ptr_off : ptr_off + 2])[0]
        if cell_off <= 0 or cell_off >= len(page_bytes):
            continue
        try:
            payload_size, pos = read_varint(page_bytes, cell_off)
            rowid, pos = read_varint(page_bytes, pos)
            hdr_start = pos
            hdr_size, pos = read_varint(page_bytes, pos)
            hdr_end = hdr_start + hdr_size
            if hdr_end > len(page_bytes) or payload_size > len(page_bytes):
                continue
            serial_types = []
            while pos < hdr_end:
                st, pos = read_varint(page_bytes, pos)
                serial_types.append(st)
            vals = []
            for st in serial_types:
                v, pos = decode_serial_value(page_bytes, pos, st)
                vals.append(v)
            records.append((rowid, vals))
        except Exception:
            continue
    return records


def scan_raw_sqlite_pages(db_path):
    recovered = {
        "master": {},
        "subs": {},
        "history": [],
        "archive": [],
        "users": {},
        "mail_config": None,
    }
    if not os.path.exists(db_path):
        return recovered

    page_size = 4096
    files_to_scan = [db_path]
    if os.path.exists(db_path + "-wal"):
        files_to_scan.append(db_path + "-wal")

    for fpath in files_to_scan:
        is_wal = fpath.endswith("-wal")
        with open(fpath, "rb") as f:
            if is_wal:
                data = f.read()
                off = 32
                while off + page_size <= len(data):
                    page = data[off + 24 : off + 24 + page_size]
                    off += 24 + page_size
                    if len(page) == page_size and page[0] == 0x0D:
                        classify_cells(parse_leaf_page_cells(page), recovered)
            else:
                f.seek(0, os.SEEK_END)
                total_len = f.tell()
                # Start scanning from page 33000 onwards where users & gosuslugi tables live
                start_page = max(1, min(33000, (total_len // page_size) - 5000))
                f.seek(start_page * page_size)
                while True:
                    page = f.read(page_size)
                    if not page or len(page) < page_size:
                        break
                    if page[0] == 0x0D:
                        classify_cells(parse_leaf_page_cells(page), recovered)

    return recovered


def classify_cells(cells, recovered):
    for rowid, vals in cells:
        n = len(vals)
        # 1. gosuslugi_vks_master_list (7 cols: row_key, sicil_no, row_order, assigned_computer, worker_json, source_tag, updated_at)
        if n == 7 and isinstance(vals[0], str) and isinstance(vals[4], str) and vals[4].startswith("{"):
            rk = vals[0].strip()
            if rk:
                recovered["master"][rk] = (
                    rk,
                    str(vals[1] or rk).strip(),
                    int(vals[2] if isinstance(vals[2], int) else 0),
                    int(vals[3] if isinstance(vals[3], int) else 1),
                    vals[4],
                    str(vals[5] or "master_excel"),
                    str(vals[6] or ""),
                )
        # 2. gosuslugi_submissions (13 cols)
        elif n == 13 and (isinstance(vals[1], str) or isinstance(vals[4], str)):
            sic = str(vals[1] or "").strip()
            ntype = str(vals[4] or "").strip()
            if sic and ntype in ("vks_salary", "dismissal", "hiring", ""):
                rec_id = int(vals[0] if isinstance(vals[0], int) else rowid)
                recovered["subs"][sic] = (
                    rec_id,
                    sic,
                    str(vals[2] or ""),
                    str(vals[3] or ""),
                    ntype or "vks_salary",
                    str(vals[5] or "2026-3"),
                    str(vals[6] or ""),
                    str(vals[7] or "Отправлено"),
                    str(vals[8] or ""),
                    str(vals[9] or ""),
                    str(vals[10] or ""),
                    str(vals[11] or ""),
                    str(vals[12] or ""),
                )
        # 3. gosuslugi_refused_archive (12 cols)
        elif n == 12 and isinstance(vals[1], str):
            sic = str(vals[1] or "").strip()
            if sic:
                rec_id = int(vals[0] if isinstance(vals[0], int) else rowid)
                recovered["archive"].append(
                    (
                        rec_id,
                        sic,
                        str(vals[2] or ""),
                        str(vals[3] or ""),
                        str(vals[4] or "vks_salary"),
                        str(vals[5] or "2026-3"),
                        str(vals[6] or ""),
                        str(vals[7] or "Услуга отказана"),
                        str(vals[8] or ""),
                        str(vals[9] or ""),
                        str(vals[10] or ""),
                        str(vals[11] or ""),
                    )
                )
        # 4. gosuslugi_submission_history (9 cols)
        elif n == 9 and isinstance(vals[1], str) and isinstance(vals[4], str) and vals[4] != "vks_salary":
            sic = str(vals[1] or "").strip()
            if sic and sic[0].isdigit():
                rec_id = int(vals[0] if isinstance(vals[0], int) else rowid)
                recovered["history"].append(
                    (
                        rec_id,
                        sic,
                        str(vals[2] or ""),
                        str(vals[3] or ""),
                        str(vals[4] or ""),
                        str(vals[5] or ""),
                        str(vals[6] or ""),
                        str(vals[7] or ""),
                        str(vals[8] or ""),
                    )
                )
        # 5. users or gosuslugi_mail_config (8 cols)
        elif n == 8:
            if isinstance(vals[2], str) and "@" in vals[2] and isinstance(vals[4], str) and vals[4] in ("admin", "user", "viewer"):
                uid = int(vals[0] if isinstance(vals[0], int) else rowid)
                recovered["users"][vals[2].lower()] = (
                    uid,
                    str(vals[1] or ""),
                    str(vals[2] or ""),
                    str(vals[3] or ""),
                    str(vals[4] or "user"),
                    str(vals[5] or "all"),
                    str(vals[6] or "all"),
                    str(vals[7] or ""),
                )
            elif isinstance(vals[1], str) and "imap" in vals[1].lower():
                recovered["mail_config"] = (
                    1,
                    str(vals[1] or "imap.mail.ru"),
                    int(vals[2] if isinstance(vals[2], int) else 993),
                    str(vals[3] or ""),
                    str(vals[4] or ""),
                    int(vals[5] if isinstance(vals[5], int) else 1),
                    str(vals[6] or ""),
                    str(vals[7] or ""),
                )


def needs_repair(db_path):
    if not os.path.exists(db_path):
        return False
    if os.path.exists(db_path + "-wal"):
        # Check quick_check or table counts
        pass
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        qc = cur.execute("PRAGMA quick_check(1)").fetchone()
        if not qc or qc[0] != "ok":
            conn.close()
            return True
        admin_row = cur.execute("SELECT email, password FROM users WHERE LOWER(email)='admin@pondera.com'").fetchone()
        if not admin_row or not str(admin_row[1] or "").startswith("scrypt$"):
            conn.close()
            return True
        m_cnt = cur.execute("SELECT COUNT(*) FROM gosuslugi_vks_master_list NOT INDEXED").fetchone()[0]
        s_cnt = cur.execute("SELECT COUNT(*) FROM gosuslugi_submissions NOT INDEXED").fetchone()[0]
        conn.close()
        if m_cnt < 3000 or s_cnt < 2900:
            return True
        return False
    except Exception:
        return True


def sync_verified_statuses():
    if not os.path.exists(DB_PATH) or not os.path.exists(BUNDLE_PATH):
        return
    try:
        with gzip.open(BUNDLE_PATH, "rt", encoding="utf-8") as gz:
            bundle = json.load(gz)
        local_subs = {str(s.get("sicil_no") or "").strip(): s for s in bundle.get("local_subs", []) if s.get("sicil_no")}
        vps_idx_sicils = {str(r.get("sicil_no") or "").strip() for r in bundle.get("vps_idx", []) if r.get("sicil_no")}

        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()

        # 1. Remove any resurrected pre-18:19 rows not in local_subs and not in vps_idx
        db_rows = cur.execute("SELECT id, sicil_no, application_no, gosuslugi_status, status_detail, submitted_at, checked_at FROM gosuslugi_submissions").fetchall()
        for row_id, sic, app_no, st, sd, sub_at, chk_at in db_rows:
            if sic not in local_subs and str(sub_at or "") < "2026-10-26 18:19:00" and sic not in vps_idx_sicils:
                cur.execute("DELETE FROM gosuslugi_submissions WHERE id = ?", (row_id,))
                continue
            l_row = local_subs.get(sic)
            if l_row:
                l_app = str(l_row.get("application_no") or "").strip()
                l_st = str(l_row.get("gosuslugi_status") or "").strip()
                l_sd = str(l_row.get("status_detail") or "").strip()
                l_sub = str(l_row.get("submitted_at") or "").strip()
                l_chk = str(l_row.get("checked_at") or "").strip()
                # Restore 90 official portal errors & 37 verified pending rows & 9 local RPA error rows if overwritten by unvacuumed pages
                if (
                    (l_st == "Ошибка отправки заявления в ведомство" and app_no == l_app)
                    or (l_st == "Заявление зарегистрировано" and "Заявление принято ведомством" in l_sd and app_no == l_app and str(chk_at or "") < "2026-10-26 18:20:00")
                    or (not l_app and app_no and str(sub_at or "") < "2026-10-26 18:19:00")
                ):
                    cur.execute(
                        "UPDATE gosuslugi_submissions SET application_no=?, gosuslugi_status=?, status_detail=?, submitted_at=?, checked_at=? WHERE id=?",
                        (l_app, l_st, l_sd, l_sub, l_chk, row_id),
                    )
                    if l_app and l_st == "Ошибка отправки заявления в ведомство":
                        cur.execute("DELETE FROM gosuslugi_refused_archive WHERE application_no = ? AND gosuslugi_status = 'Ошибка отправки заявления в ведомство'", (l_app,))

        # 2. Promote Oct 26 Fast-Mode rows to Заявление зарегистрировано
        cur.execute(
            """
            UPDATE gosuslugi_submissions
            SET gosuslugi_status = 'Заявление зарегистрировано'
            WHERE gosuslugi_status = 'Отправлено (PDF не скачан)'
              AND (status_detail LIKE 'Заявление зарегистрировано%' OR submitted_at >= '2026-10-26 18:00:00')
            """
        )

        # 3. Clean history anomalies
        cur.execute("DELETE FROM gosuslugi_submission_history WHERE gosuslugi_status = 'vks_salary'")
        cur.execute(
            """
            DELETE FROM gosuslugi_submission_history
            WHERE gosuslugi_status = 'Услуга оказана'
              AND status_detail LIKE 'Ошибка отправки заявления в ведомство%'
            """
        )

        # 4. Reset Telegram snapshot so next check reflects exact counts
        cur.execute("DELETE FROM system_info WHERE key LIKE 'telegram_vks_%'")

        conn.commit()
        conn.close()
        print("Verified statuses synchronized cleanly.")
    except Exception as e:
        print(f"Warning in sync_verified_statuses: {e}")


def repair_database():
    if not os.path.exists(DB_PATH):
        print("No pondera_hr.db found, skipping repair.")
        return
    if not needs_repair(DB_PATH):
        print("pondera_hr.db passed integrity & row count checks! Skipping repair.")
        return

    print("=== Starting pondera_hr.db Automated Recovery & Repair ===")
    raw_recovered = scan_raw_sqlite_pages(DB_PATH)
    print(
        f"Raw leaf scan recovered: master={len(raw_recovered['master'])}, "
        f"subs={len(raw_recovered['subs'])}, history={len(raw_recovered['history'])}, "
        f"archive={len(raw_recovered['archive'])}, users={len(raw_recovered['users'])}"
    )

    bundle = {"users": [], "master_records": [], "local_subs": [], "vps_idx": []}
    if os.path.exists(BUNDLE_PATH):
        with gzip.open(BUNDLE_PATH, "rt", encoding="utf-8") as gz:
            bundle = json.load(gz)

    # 1. Merge Master List (3,088 rows)
    final_master = {}
    for m in bundle.get("master_records", []):
        rk = m["row_key"]
        final_master[rk] = (
            rk,
            m["sicil_no"],
            int(m["row_order"]),
            int(m["assigned_computer"]),
            m["worker_json"],
            m.get("source_tag", "master_excel"),
            m.get("updated_at", ""),
        )
    # Overlay any raw recovered master rows (preserves inline edits & PC splits)
    for rk, tup in raw_recovered["master"].items():
        if rk in final_master:
            # Keep row_order from bundle if tup has 0
            ro = tup[2] if tup[2] > 0 else final_master[rk][2]
            final_master[rk] = (tup[0], tup[1], ro, tup[3], tup[4], tup[5], tup[6])
        else:
            final_master[rk] = tup

    # 2. Merge Submissions (2,980+ rows)
    final_subs = {}
    for s in bundle.get("local_subs", []):
        sic = str(s.get("sicil_no") or "").strip()
        if not sic:
            continue
        final_subs[sic] = {
            "id": int(s.get("id") or 0),
            "sicil_no": sic,
            "worker_name": str(s.get("worker_name") or ""),
            "citizenship": str(s.get("citizenship") or ""),
            "notification_type": str(s.get("notification_type") or "vks_salary"),
            "period_code": str(s.get("period_code") or "2026-3"),
            "application_no": str(s.get("application_no") or ""),
            "gosuslugi_status": str(s.get("gosuslugi_status") or "Отправлено"),
            "status_detail": str(s.get("status_detail") or ""),
            "pdf_filename": str(s.get("pdf_filename") or ""),
            "submitted_at": str(s.get("submitted_at") or ""),
            "checked_at": str(s.get("checked_at") or ""),
            "updated_at": str(s.get("updated_at") or ""),
        }

    # Overlay raw recovered submissions if newer or missing
    for sic, tup in raw_recovered["subs"].items():
        ex = final_subs.get(sic)
        if not ex or (tup[6] and not ex["application_no"]) or (tup[10] > ex["submitted_at"]):
            final_subs[sic] = {
                "id": tup[0],
                "sicil_no": tup[1],
                "worker_name": tup[2] or (ex["worker_name"] if ex else ""),
                "citizenship": tup[3] or (ex["citizenship"] if ex else ""),
                "notification_type": tup[4] or "vks_salary",
                "period_code": tup[5] or "2026-3",
                "application_no": tup[6] or (ex["application_no"] if ex else ""),
                "gosuslugi_status": tup[7] or (ex["gosuslugi_status"] if ex else "Отправлено"),
                "status_detail": tup[8] or (ex["status_detail"] if ex else ""),
                "pdf_filename": tup[9] or (ex["pdf_filename"] if ex else ""),
                "submitted_at": tup[10] or (ex["submitted_at"] if ex else ""),
                "checked_at": tup[11] or (ex["checked_at"] if ex else ""),
                "updated_at": tup[12] or (ex["updated_at"] if ex else ""),
            }
        elif (
            ex
            and tup[6]
            and tup[6] == ex["application_no"]
            and tup[7] == "Услуга оказана"
            and ex["gosuslugi_status"] == "Заявление зарегистрировано"
        ):
            ex["gosuslugi_status"] = "Услуга оказана"
            if tup[11]:
                ex["checked_at"] = tup[11]

    # Overlay intact index rows (restores any applications submitted between 18:19 and 19:07)
    for idx_row in bundle.get("vps_idx", []):
        sic = str(idx_row.get("sicil_no") or "").strip()
        app_no = str(idx_row.get("application_no") or "").strip()
        sub_at = str(idx_row.get("submitted_at") or "").strip()
        if not sic or not app_no:
            continue
        ex = final_subs.get(sic)
        if not ex:
            m_tup = final_master.get(sic)
            w_name = ""
            cit = "Турция"
            if m_tup:
                try:
                    wj = json.loads(m_tup[4])
                    ln = str(wj.get("lastName") or "").strip()
                    fn = str(wj.get("firstName") or "").strip()
                    w_name = fn if ln.lower() == "нет" else f"{ln} {fn}".strip()
                    cit = str(wj.get("citizenship") or "Турция").strip()
                except Exception:
                    pass
            final_subs[sic] = {
                "id": int(idx_row.get("id") or 0),
                "sicil_no": sic,
                "worker_name": w_name,
                "citizenship": cit,
                "notification_type": "vks_salary",
                "period_code": "2026-3",
                "application_no": app_no,
                "gosuslugi_status": "Заявление зарегистрировано",
                "status_detail": "",
                "pdf_filename": "",
                "submitted_at": sub_at,
                "checked_at": sub_at,
                "updated_at": sub_at,
            }
        elif ex["application_no"] != app_no and sub_at >= ex["submitted_at"]:
            ex["application_no"] = app_no
            ex["submitted_at"] = sub_at
            if ex["gosuslugi_status"].lower().startswith("ошибк") or "отказан" in ex["gosuslugi_status"].lower():
                ex["gosuslugi_status"] = "Заявление зарегистрировано"
                ex["status_detail"] = ""

    # Scan public/gosuslugi_pdfs to link any PDF filenames
    if os.path.isdir(PDF_DIR):
        for fn in os.listdir(PDF_DIR):
            if not fn.lower().endswith(".pdf"):
                continue
            parts = fn.split("_")
            if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
                sic, app_no = parts[0], parts[1]
                if sic in final_subs and not final_subs[sic]["pdf_filename"]:
                    final_subs[sic]["pdf_filename"] = fn

    # 3. Build clean database
    repaired_path = DB_PATH + ".repaired"
    if os.path.exists(repaired_path):
        os.remove(repaired_path)

    new_conn = sqlite3.connect(repaired_path)
    new_cur = new_conn.cursor()
    new_cur.execute("PRAGMA synchronous = OFF;")
    new_cur.execute("PRAGMA journal_mode = MEMORY;")

    # Copy personnel, columns_meta, system_info from current DB
    old_conn = sqlite3.connect(DB_PATH)
    old_cur = old_conn.cursor()

    for tbl in ("system_info", "columns_meta", "personnel"):
        sql_row = old_cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (tbl,)).fetchone()
        if sql_row and sql_row[0]:
            new_cur.execute(sql_row[0])
            rows = old_cur.execute(f"SELECT * FROM {tbl} NOT INDEXED").fetchall()
            if rows:
                ph = ",".join(["?"] * len(rows[0]))
                new_cur.executemany(f"INSERT INTO {tbl} VALUES ({ph})", rows)

    old_conn.close()

    # Create users & gosuslugi tables
    new_cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          scope_type TEXT NOT NULL DEFAULT 'all',
          scope_value TEXT NOT NULL DEFAULT 'all',
          created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS gosuslugi_vks_master_list (
          row_key TEXT PRIMARY KEY,
          sicil_no TEXT NOT NULL,
          row_order INTEGER NOT NULL DEFAULT 0,
          assigned_computer INTEGER NOT NULL DEFAULT 1,
          worker_json TEXT NOT NULL,
          source_tag TEXT DEFAULT 'master_excel',
          updated_at TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS gosuslugi_submissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sicil_no TEXT NOT NULL,
          worker_name TEXT,
          citizenship TEXT,
          notification_type TEXT NOT NULL DEFAULT 'vks_salary',
          period_code TEXT DEFAULT '',
          application_no TEXT NOT NULL DEFAULT '',
          gosuslugi_status TEXT NOT NULL DEFAULT 'Отправлено',
          status_detail TEXT DEFAULT '',
          pdf_filename TEXT DEFAULT '',
          submitted_at TEXT NOT NULL,
          checked_at TEXT DEFAULT '',
          updated_at TEXT DEFAULT '',
          UNIQUE(sicil_no, notification_type, period_code)
        );

        CREATE TABLE IF NOT EXISTS gosuslugi_refused_archive (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sicil_no TEXT NOT NULL,
          worker_name TEXT,
          citizenship TEXT,
          notification_type TEXT NOT NULL DEFAULT 'vks_salary',
          period_code TEXT DEFAULT '',
          application_no TEXT NOT NULL DEFAULT '',
          gosuslugi_status TEXT NOT NULL DEFAULT 'Услуга отказана',
          status_detail TEXT DEFAULT '',
          pdf_filename TEXT DEFAULT '',
          submitted_at TEXT DEFAULT '',
          archived_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS gosuslugi_submission_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sicil_no TEXT NOT NULL,
          worker_name TEXT,
          application_no TEXT NOT NULL DEFAULT '',
          gosuslugi_status TEXT NOT NULL,
          status_detail TEXT DEFAULT '',
          pdf_filename TEXT DEFAULT '',
          submitted_at TEXT DEFAULT '',
          event_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS gosuslugi_mail_config (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          imap_host TEXT NOT NULL DEFAULT 'imap.mail.ru',
          imap_port INTEGER NOT NULL DEFAULT 993,
          email TEXT NOT NULL DEFAULT '',
          app_password TEXT NOT NULL DEFAULT '',
          auto_sync_enabled INTEGER NOT NULL DEFAULT 1,
          last_sync_at TEXT DEFAULT '',
          last_sync_result TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS gosuslugi_mail_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          application_no TEXT NOT NULL,
          service_title TEXT DEFAULT '',
          gosuslugi_status TEXT NOT NULL,
          status_detail TEXT DEFAULT '',
          email_date TEXT DEFAULT '',
          order_url TEXT DEFAULT '',
          folder_name TEXT DEFAULT '',
          synced_at TEXT NOT NULL,
          UNIQUE(application_no, gosuslugi_status, email_date)
        );

        CREATE TABLE IF NOT EXISTS telegram_outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          report_type TEXT NOT NULL DEFAULT 'vks_15m',
          html_text TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          claimed_at_ms INTEGER NOT NULL DEFAULT 0,
          delivered INTEGER NOT NULL DEFAULT 0
        );
        """
    )

    # Insert users
    for u in bundle.get("users", []):
        new_cur.execute(
            "INSERT OR REPLACE INTO users (id, name, email, password, role, scope_type, scope_value, created_at) VALUES (?,?,?,?,?,?,?,?)",
            tuple(u),
        )
    for email_k, u_tup in raw_recovered["users"].items():
        if email_k != "admin@pondera.com":
            new_cur.execute(
                "INSERT OR IGNORE INTO users (name, email, password, role, scope_type, scope_value, created_at) VALUES (?,?,?,?,?,?,?)",
                u_tup[1:],
            )

    if raw_recovered["mail_config"]:
        new_cur.execute(
            "INSERT OR REPLACE INTO gosuslugi_mail_config VALUES (?,?,?,?,?,?,?,?)",
            raw_recovered["mail_config"],
        )

    # Insert master list
    new_cur.executemany(
        "INSERT OR REPLACE INTO gosuslugi_vks_master_list VALUES (?,?,?,?,?,?,?)",
        list(final_master.values()),
    )

    # Insert submissions
    sub_tuples = []
    for idx_s, s in enumerate(final_subs.values(), start=1):
        sub_tuples.append(
            (
                s["sicil_no"],
                s["worker_name"],
                s["citizenship"],
                s["notification_type"],
                s["period_code"],
                s["application_no"],
                s["gosuslugi_status"],
                s["status_detail"],
                s["pdf_filename"],
                s["submitted_at"],
                s["checked_at"],
                s["updated_at"],
            )
        )
    new_cur.executemany(
        """
        INSERT OR REPLACE INTO gosuslugi_submissions (
          sicil_no, worker_name, citizenship, notification_type, period_code,
          application_no, gosuslugi_status, status_detail, pdf_filename,
          submitted_at, checked_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        sub_tuples,
    )

    # Insert archive & history (deduplicated)
    seen_arch = set()
    arch_tuples = []
    for a in raw_recovered["archive"]:
        key = (a[1], a[6], a[7], a[10])
        if key not in seen_arch:
            seen_arch.add(key)
            arch_tuples.append(a[1:])
    if arch_tuples:
        new_cur.executemany(
            """
            INSERT INTO gosuslugi_refused_archive (
              sicil_no, worker_name, citizenship, notification_type, period_code,
              application_no, gosuslugi_status, status_detail, pdf_filename,
              submitted_at, archived_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """,
            arch_tuples,
        )

    seen_hist = set()
    hist_tuples = []
    for h in sorted(raw_recovered["history"], key=lambda x: x[0]):
        key = (h[1], h[3], h[4], h[8])
        if key not in seen_hist:
            seen_hist.add(key)
            hist_tuples.append(h[1:])
    if hist_tuples:
        new_cur.executemany(
            """
            INSERT INTO gosuslugi_submission_history (
              sicil_no, worker_name, application_no, gosuslugi_status,
              status_detail, pdf_filename, submitted_at, event_at
            ) VALUES (?,?,?,?,?,?,?,?)
            """,
            hist_tuples,
        )

    # Create all indexes
    new_cur.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_p_genel_durum ON personnel(genel_durum);
        CREATE INDEX IF NOT EXISTS idx_p_region ON personnel(region);
        CREATE INDEX IF NOT EXISTS idx_p_proje ON personnel(proje_adi);
        CREATE INDEX IF NOT EXISTS idx_p_departman ON personnel(departman);
        CREATE INDEX IF NOT EXISTS idx_p_kategori ON personnel(kategori);
        CREATE INDEX IF NOT EXISTS idx_p_uyruk ON personnel(uyruk);
        CREATE INDEX IF NOT EXISTS idx_p_endirekt ON personnel(endirekt_direkt);
        CREATE INDEX IF NOT EXISTS idx_p_giris_tarih ON personnel(ise_giris_tarihi);
        CREATE INDEX IF NOT EXISTS idx_p_cikis_tarih ON personnel(cikis_tarihi);
        CREATE INDEX IF NOT EXISTS idx_p_sicil ON personnel(sicil_no);
        CREATE INDEX IF NOT EXISTS idx_p_rhi ON personnel(rhi_id);
        CREATE INDEX IF NOT EXISTS idx_p_saren ON personnel(saren_no);
        CREATE INDEX IF NOT EXISTS idx_p_ad_soyad ON personnel(ad_soyad);
        CREATE INDEX IF NOT EXISTS idx_p_guncel_durum ON personnel(guncel_durum);
        CREATE INDEX IF NOT EXISTS idx_personnel_sicil ON personnel(sicil_no);
        CREATE INDEX IF NOT EXISTS idx_personnel_durum ON personnel(genel_durum);
        CREATE INDEX IF NOT EXISTS idx_personnel_region ON personnel(region);
        CREATE INDEX IF NOT EXISTS idx_personnel_proje ON personnel(proje_adi);
        CREATE INDEX IF NOT EXISTS idx_personnel_dept ON personnel(departman);
        CREATE INDEX IF NOT EXISTS idx_personnel_uyruk ON personnel(uyruk);
        CREATE INDEX IF NOT EXISTS idx_personnel_sira ON personnel(sira_no);
        CREATE INDEX IF NOT EXISTS idx_vks_master_sicil ON gosuslugi_vks_master_list(sicil_no);
        CREATE INDEX IF NOT EXISTS idx_vks_master_order ON gosuslugi_vks_master_list(row_order);
        CREATE INDEX IF NOT EXISTS idx_vks_master_comp ON gosuslugi_vks_master_list(assigned_computer);
        CREATE INDEX IF NOT EXISTS idx_gos_subs_sicil ON gosuslugi_submissions(sicil_no);
        CREATE INDEX IF NOT EXISTS idx_gos_subs_type ON gosuslugi_submissions(notification_type);
        CREATE INDEX IF NOT EXISTS idx_gos_subs_appno ON gosuslugi_submissions(application_no);
        CREATE INDEX IF NOT EXISTS idx_gos_subs_subat ON gosuslugi_submissions(submitted_at);
        CREATE INDEX IF NOT EXISTS idx_refused_arch_appno ON gosuslugi_refused_archive(application_no);
        CREATE INDEX IF NOT EXISTS idx_refused_arch_sicil ON gosuslugi_refused_archive(sicil_no);
        CREATE INDEX IF NOT EXISTS idx_sub_hist_sicil ON gosuslugi_submission_history(sicil_no);
        CREATE INDEX IF NOT EXISTS idx_sub_hist_appno ON gosuslugi_submission_history(application_no);
        """
    )

    # Clear corrupted Telegram snapshot so next cron calculates cleanly
    new_cur.execute("DELETE FROM system_info WHERE key LIKE 'telegram_vks_%'")

    new_conn.commit()
    qc = new_cur.execute("PRAGMA quick_check").fetchone()
    print("Repaired DB quick_check:", qc)
    new_conn.close()

    # Remove stale WAL/SHM files BEFORE moving repaired DB into place!
    for suffix in ("-wal", "-shm", ""):
        p = DB_PATH + suffix
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception as e:
                print(f"Warning removing {p}: {e}")

    shutil.move(repaired_path, DB_PATH)
    sync_verified_statuses()
    print(
        f"=== Repair Complete: master={len(final_master)}, subs={len(final_subs)}, "
        f"history={len(hist_tuples)}, archive={len(arch_tuples)} ==="
    )


if __name__ == "__main__":
    repair_database()
