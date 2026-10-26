#!/usr/bin/env python3
"""
Creates a WAL-consistent Pre-Action Automatic Protection Backup (VACUUM INTO -> .db.gz + .meta.json)
in backups/pre_action/ before deployments or database rebuilds.
"""
import datetime
import gzip
import json
import os
import sqlite3
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT_DIR, "pondera_hr.db")
BACKUP_DIR = os.path.join(ROOT_DIR, "backups", "pre_action")
MAX_BACKUPS = 15


def create_pre_action_backup(action_type="deploy", label_tr="Yeni Sürüm Dağıtımı (Deploy) Öncesi", label_ru="Перед обновлением сервера (Deploy)"):
    if not os.path.exists(DB_PATH):
        return None

    os.makedirs(BACKUP_DIR, exist_ok=True)
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    now_msk = now_utc + datetime.timedelta(hours=3)
    slug = now_msk.strftime("%Y%m%d_%H%M%S")
    display = now_msk.strftime("%d.%m.%Y %H:%M:%S MSK")
    safe_type = "".join(c if c.isalnum() or c in ("_", "-") else "_" for c in action_type)[:32] or "action"
    base_name = f"pondera_hr_pre_{safe_type}_{slug}"
    tmp_db = os.path.join(BACKUP_DIR, f"{base_name}.tmp.db")
    gz_path = os.path.join(BACKUP_DIR, f"{base_name}.db.gz")
    meta_path = os.path.join(BACKUP_DIR, f"{base_name}.meta.json")

    try:
        if os.path.exists(tmp_db):
            os.remove(tmp_db)

        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        qc = cur.execute("PRAGMA quick_check(1)").fetchone()
        if not qc or qc[0] != "ok":
            conn.close()
            return None

        stats = {
            "personnelTotal": 0,
            "personnelActive": 0,
            "sourceFile": "",
            "dataFreshness": "",
            "vksMasterTotal": 0,
            "vksSubmissionsTotal": 0,
            "vksServiceRendered": 0,
            "vksRegistered": 0,
            "vksRefused": 0,
            "vksErrors": 0,
        }

        try:
            stats["personnelTotal"] = int(cur.execute("SELECT COUNT(*) FROM personnel").fetchone()[0])
            stats["personnelActive"] = int(cur.execute("SELECT COUNT(*) FROM personnel WHERE genel_durum = 'Mevcut'").fetchone()[0])
        except Exception:
            pass

        try:
            for k, v in cur.execute("SELECT key, value FROM system_info WHERE key IN ('source_file', 'data_freshness')").fetchall():
                if k == "source_file":
                    stats["sourceFile"] = str(v or "")
                elif k == "data_freshness":
                    stats["dataFreshness"] = str(v or "")
        except Exception:
            pass

        try:
            stats["vksMasterTotal"] = int(cur.execute("SELECT COUNT(*) FROM gosuslugi_vks_master_list").fetchone()[0])
        except Exception:
            pass

        try:
            for st, cnt in cur.execute("SELECT gosuslugi_status, COUNT(*) FROM gosuslugi_submissions GROUP BY gosuslugi_status").fetchall():
                c = int(cnt or 0)
                s = str(st or "")
                stats["vksSubmissionsTotal"] += c
                if s == "Услуга оказана":
                    stats["vksServiceRendered"] += c
                elif s == "Услуга отказана":
                    stats["vksRefused"] += c
                elif s.lower().startswith("ошибк"):
                    stats["vksErrors"] += c
                else:
                    stats["vksRegistered"] += c
        except Exception:
            pass

        escaped = tmp_db.replace("'", "''")
        cur.execute(f"VACUUM INTO '{escaped}';")
        conn.close()

        if not os.path.exists(tmp_db):
            return None

        with open(tmp_db, "rb") as f_in:
            raw_bytes = f_in.read()
        os.remove(tmp_db)

        compressed = gzip.compress(raw_bytes, compresslevel=6)
        with open(gz_path, "wb") as f_out:
            f_out.write(compressed)

        # Also keep root pondera_hr.db.gz updated
        try:
            with open(os.path.join(ROOT_DIR, "pondera_hr.db.gz"), "wb") as f_root:
                f_root.write(compressed)
        except Exception:
            pass

        meta = {
            "id": f"{base_name}.db.gz",
            "createdAt": display,
            "createdAtMs": int(now_utc.timestamp() * 1000),
            "actionType": safe_type,
            "actionLabelTr": label_tr,
            "actionLabelRu": label_ru,
            "sizeBytes": len(compressed),
            "sizeMB": f"{len(compressed) / (1024 * 1024):.2f}",
            "stats": stats,
        }
        with open(meta_path, "w", encoding="utf-8") as f_meta:
            json.dump(meta, f_meta, ensure_ascii=False, indent=2)

        # Prune older backups beyond MAX_BACKUPS
        gz_files = sorted(
            [f for f in os.listdir(BACKUP_DIR) if f.endswith(".db.gz")],
            key=lambda x: os.path.getmtime(os.path.join(BACKUP_DIR, x)),
            reverse=True,
        )
        for old_f in gz_files[MAX_BACKUPS:]:
            try:
                os.remove(os.path.join(BACKUP_DIR, old_f))
            except Exception:
                pass
            old_meta = os.path.join(BACKUP_DIR, old_f[:-6] + ".meta.json")
            if os.path.exists(old_meta):
                try:
                    os.remove(old_meta)
                except Exception:
                    pass

        print(f"Pre-action backup created: {meta['id']} ({meta['sizeMB']} MB)")
        return meta
    except Exception as e:
        print(f"Warning creating pre-action backup: {e}")
        if os.path.exists(tmp_db):
            try:
                os.remove(tmp_db)
            except Exception:
                pass
        return None


if __name__ == "__main__":
    act = sys.argv[1] if len(sys.argv) > 1 else "deploy"
    lbl_tr = sys.argv[2] if len(sys.argv) > 2 else "Yeni Sürüm Dağıtımı (Deploy) Öncesi"
    lbl_ru = sys.argv[3] if len(sys.argv) > 3 else "Перед обновлением сервера (Deploy)"
    create_pre_action_backup(act, lbl_tr, lbl_ru)
