"""
Pondera HR & Powerise Local RPA Bridge Server
Listens on http://127.0.0.1:8088 and http://localhost:8088 to bridge web UI commands
directly to local Playwright automation (VKS Salary Notification, Hiring, Dismissal, Status Check) and Chrome instances.
Includes full Chrome Private Network Access (PNA), CORS support, Human-in-the-Loop manual intervention,
and Gosuslugi Application Number (№ Заявления) + Status synchronization.
"""

import sys
import os
import json
import socket
import threading
import subprocess
import time
from pathlib import Path
from http.server import HTTPServer, ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

if sys.platform == "win32" and sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

PORT = 8088
CHROME_CDP_PORT = 9222
BRIDGE_VERSION = "2.8.6"
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
MANUAL_CONTINUE_SIGNAL = os.path.join(CURRENT_DIR, "manual_continue.signal")
PAUSE_SIGNAL_FILE = os.path.join(CURRENT_DIR, "rpa_pause.signal")
APPLICATIONS_LEDGER = os.path.join(CURRENT_DIR, "gosuslugi_applications.json")
ARCHIVED_APPS_FILE = os.path.join(CURRENT_DIR, "archived_app_nos.json")
CENTRAL_ARCHIVED_APP_NOS = {
    "8344026563",
    "8317199145",
    "8344102374",
    "8316538127",
    "8348149175",
    "8344008846",
    "8317411742",
}


def load_archived_app_nos():
    if os.path.exists(ARCHIVED_APPS_FILE):
        try:
            with open(ARCHIVED_APPS_FILE, "r", encoding="utf-8") as f:
                arr = json.load(f)
                if isinstance(arr, list):
                    for a in arr:
                        ca = str(a or "").strip()
                        if ca:
                            CENTRAL_ARCHIVED_APP_NOS.add(ca)
        except Exception:
            pass


def save_archived_app_nos():
    try:
        with open(ARCHIVED_APPS_FILE, "w", encoding="utf-8") as f:
            json.dump(sorted(CENTRAL_ARCHIVED_APP_NOS), f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def fetch_central_archived_app_nos():
    import urllib.request
    import ssl
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(
            "https://hr.pondera.network/api/gosuslugi/submissions?type=VKS_SALARY",
            headers={"User-Agent": "Pondera-RPA-Agent/2.8.2"},
        )
        with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                arch = data.get("archivedAppNos") or []
                if isinstance(arch, list):
                    for a in arch:
                        ca = str(a or "").strip()
                        if ca:
                            CENTRAL_ARCHIVED_APP_NOS.add(ca)
                    save_archived_app_nos()
    except Exception:
        pass


load_archived_app_nos()


def prevent_windows_sleep():
    """
    Prevents Windows from entering Sleep Mode, Hibernate, or turning off the screen/network
    while the RPA Bridge or Playwright robot is active.
    1) Calls Win32 SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED | ES_AWAYMODE_REQUIRED)
    2) Sets powercfg standby/monitor/hibernate timeouts to 0 (Never) for AC and DC power
    3) Starts a background heartbeat thread that refreshes SetThreadExecutionState every 30s
    """
    if sys.platform != "win32":
        return
    try:
        import ctypes
        # ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x01) | ES_DISPLAY_REQUIRED (0x02) | ES_AWAYMODE_REQUIRED (0x40)
        flags = 0x80000000 | 0x00000001 | 0x00000002 | 0x00000040
        ctypes.windll.kernel32.SetThreadExecutionState(flags)

        def _keep_awake_loop():
            while True:
                try:
                    ctypes.windll.kernel32.SetThreadExecutionState(flags)
                except Exception:
                    pass
                time.sleep(30)

        threading.Thread(target=_keep_awake_loop, daemon=True).start()
    except Exception:
        pass

    try:
        for cmd_arg in (
            "standby-timeout-ac 0",
            "standby-timeout-dc 0",
            "monitor-timeout-ac 0",
            "monitor-timeout-dc 0",
            "hibernate-timeout-ac 0",
            "hibernate-timeout-dc 0",
        ):
            subprocess.run(
                f"powercfg /change {cmd_arg}",
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
    except Exception:
        pass


def is_browser_closed_error_text(st: str) -> bool:
    s = str(st or "").lower()
    return (
        "target page, context or browser has been closed" in s
        or "browser has been closed" in s
        or "context or browser has been closed" in s
        or "targetclosederror" in s
    )


def is_outage_or_archived_app(app_no: str, status: str = "") -> bool:
    a = str(app_no or "").strip()
    if not a:
        return False
    if a in CENTRAL_ARCHIVED_APP_NOS:
        return True
    return False


def load_saved_applications():
    items = []
    if os.path.exists(APPLICATIONS_LEDGER):
        try:
            with open(APPLICATIONS_LEDGER, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    changed = False
                    cleaned_list = []
                    for it in data:
                        if isinstance(it, dict):
                            st = str(it.get("gosuslugi_status") or "")
                            app_no = str(it.get("application_no") or "").strip()
                            pdf_fn = str(it.get("pdf_filename") or "").strip()
                            if not app_no and is_browser_closed_error_text(st):
                                changed = True
                                continue
                            if is_outage_or_archived_app(app_no, st):
                                changed = True
                                continue
                            if "GosuslugiVksBot" in st or "Step 16" in st:
                                st = "Отправлено (PDF не скачан)"
                                it["gosuslugi_status"] = st
                                changed = True
                            sub_at = str(it.get("submitted_at") or "").strip()
                            if (
                                st in ("Отправлено (PDF не скачан)", "Отправлено")
                                and not pdf_fn
                                and sub_at != ""
                                and sub_at < "2026-10-26 10:15:00"
                                and (not app_no.isdigit() or int(app_no) < 8320000000)
                            ):
                                changed = True
                                continue
                            cleaned_list.append(it)
                    items = cleaned_list
                    if changed:
                        save_applications_ledger(items)
        except Exception:
            pass
    return items


def save_applications_ledger(items):
    try:
        with open(APPLICATIONS_LEDGER, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def scan_downloads_pdfs():
    """Scans ~/Downloads for Gosuslugi PDFs (<Sicil>_<AppNo>_<Name>_<Period>.pdf or <AppNo>_<Name>_<Period>.pdf)."""
    import re
    downloads_dir = Path.home() / "Downloads"
    found = []
    if not downloads_dir.exists():
        return found
    period_re = re.compile(r"^20\d{2}-[1-4]$")
    app_no_re = re.compile(r"^[789]\d{9}$")
    raw_found = []
    for pdf_path in downloads_dir.glob("*.pdf"):
        stem = pdf_path.stem
        if stem.startswith("tmp_"):
            continue
        parts = stem.split("_")
        if len(parts) >= 4 and parts[0].isdigit() and app_no_re.match(parts[1]) and period_re.match(parts[-1]):
            if parts[1] in CENTRAL_ARCHIVED_APP_NOS:
                continue
            raw_found.append({
                "sicil": parts[0],
                "sicil_no": parts[0],
                "application_no": parts[1],
                "worker_name": "_".join(parts[2:-1]),
                "period_code": parts[-1],
                "pdf_filename": pdf_path.name,
                "gosuslugi_status": "Заявление зарегистрировано",
                "submitted_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(pdf_path.stat().st_mtime)),
            })
        elif len(parts) >= 3 and app_no_re.match(parts[0]) and period_re.match(parts[-1]):
            if parts[0] in CENTRAL_ARCHIVED_APP_NOS:
                continue
            raw_found.append({
                "sicil": "",
                "sicil_no": "",
                "application_no": parts[0],
                "worker_name": "_".join(parts[1:-1]),
                "period_code": parts[-1],
                "pdf_filename": pdf_path.name,
                "gosuslugi_status": "Заявление зарегистрировано",
                "submitted_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(pdf_path.stat().st_mtime)),
            })
    # Sort ascending by application_no so higher application_no is processed last and wins
    raw_found.sort(key=lambda x: int(x["application_no"]) if str(x.get("application_no") or "").isdigit() else 0)
    by_key = {}
    for item in raw_found:
        s_key = str(item.get("sicil") or "").strip()
        p_key = str(item.get("period_code") or "").strip()
        if s_key:
            by_key[(s_key, p_key)] = item
        else:
            by_key[(item.get("application_no"), p_key)] = item
    return list(by_key.values())


UPLOADED_PDFS_SET = set()


def find_local_pdf_path(pdf_filename: str):
    if not pdf_filename:
        return None
    safe_name = os.path.basename(str(pdf_filename).strip())
    candidates = [
        Path.home() / "Downloads" / safe_name,
        Path.home() / "Downloads" / "Gosuslugi_Status_A4" / safe_name,
        Path(CURRENT_DIR) / "downloads" / safe_name,
        Path(CURRENT_DIR) / safe_name,
    ]
    for c in candidates:
        if c.exists() and c.is_file():
            return c
    return None


def upload_pdf_to_central_server_async(entry: dict):
    """Uploads a local Gosuslugi PDF receipt or Status A4 PDF to https://hr.pondera.network/api/gosuslugi/pdf in a background thread."""
    for field_name in ("pdf_filename", "status_pdf_filename"):
        pdf_filename = str(entry.get(field_name) or "").strip()
        if not pdf_filename or pdf_filename in UPLOADED_PDFS_SET:
            continue
        local_path = find_local_pdf_path(pdf_filename)
        if not local_path:
            continue

        def _worker(lp=local_path, fn=pdf_filename):
            import base64
            import urllib.request
            import ssl
            try:
                raw_bytes = lp.read_bytes()
                if not raw_bytes or len(raw_bytes) > 15 * 1024 * 1024:
                    return
                b64_str = base64.b64encode(raw_bytes).decode("ascii")
                payload = json.dumps({
                    "filename": lp.name,
                    "pdf_base64": b64_str,
                    "application_no": str(entry.get("application_no") or "").strip(),
                    "sicil_no": str(entry.get("sicil_no") or entry.get("sicil") or "").strip(),
                }).encode("utf-8")
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                req = urllib.request.Request(
                    "https://hr.pondera.network/api/gosuslugi/pdf",
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                    if resp.status == 200:
                        UPLOADED_PDFS_SET.add(fn)
                        print(f"[RPA BRIDGE] Uploaded PDF to central server: {lp.name}")
            except Exception:
                pass

        threading.Thread(target=_worker, daemon=True).start()


def sync_submission_to_central_server_async(entry: dict):
    """Pushes a submission/error record directly to https://hr.pondera.network/api/gosuslugi/submissions."""
    if not entry or not isinstance(entry, dict):
        return

    def _worker():
        import urllib.request
        import ssl
        try:
            payload = json.dumps({"records": [entry]}, ensure_ascii=False).encode("utf-8")
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(
                "https://hr.pondera.network/api/gosuslugi/submissions",
                data=payload,
                headers={"Content-Type": "application/json; charset=utf-8"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=8, context=ctx) as _:
                pass
        except Exception:
            pass

    threading.Thread(target=_worker, daemon=True).start()


class RPAState:
    is_running = False
    is_paused = False
    waiting_for_manual = False
    manual_message = None
    fatal_error = None
    mode = "vks"
    process = None
    thread = None
    logs = []
    total = 0
    processed = 0
    success = 0
    errors = 0
    active_worker_code = None
    active_worker_name = None
    completed_codes = []
    error_codes = []
    submissions = load_saved_applications()
    last_json_status_sync_ts = 0.0
    mvd_cooldown_until = 0.0
    mvd_cooldown_message = None

    @classmethod
    def upsert_submission(cls, entry: dict, sync_central: bool = True, save_ledger: bool = True):
        if not entry or not isinstance(entry, dict):
            return
        app_no = str(entry.get("application_no") or "").strip()
        sicil = str(entry.get("sicil") or entry.get("sicil_no") or "").strip()
        st = str(entry.get("gosuslugi_status") or "").strip()
        if not app_no and is_browser_closed_error_text(st):
            return
        if not app_no and not sicil:
            return
        if is_outage_or_archived_app(app_no, st):
            return
        # Guard against multi-computer / cross-worker application_no collision
        if app_no:
            for existing in cls.submissions:
                ex_app = str(existing.get("application_no") or "").strip()
                ex_sicil = str(existing.get("sicil") or existing.get("sicil_no") or "").strip()
                if ex_app == app_no and ex_sicil and sicil and ex_sicil != sicil:
                    print(
                        f"[RPA BRIDGE] Rejected duplicate application_no {app_no} for Sicil {sicil}: "
                        f"already linked to Sicil {ex_sicil} ({existing.get('worker_name')})"
                    )
                    return

        updated = False
        for idx, existing in enumerate(cls.submissions):
            ex_app = str(existing.get("application_no") or "").strip()
            ex_sicil = str(existing.get("sicil") or existing.get("sicil_no") or "").strip()
            if (app_no and ex_app == app_no) or (sicil and ex_sicil == sicil and str(existing.get("period_code") or "") == str(entry.get("period_code") or "")):
                ex_st = str(existing.get("gosuslugi_status") or "").strip()
                ex_sub_at = str(existing.get("submitted_at") or "").strip()
                in_sub_at = str(entry.get("submitted_at") or "").strip()
                # Never downgrade a higher integer application_no to an older (smaller integer) application_no
                if ex_app.isdigit() and app_no.isdigit() and len(ex_app) >= 9 and len(app_no) >= 9:
                    if int(app_no) < int(ex_app):
                        return
                    if int(app_no) > int(ex_app):
                        # Newer application supersedes older one completely
                        merged = {**existing, **entry}
                        if "pdf_filename" not in entry or (entry.get("pdf_filename") and app_no not in str(entry.get("pdf_filename"))):
                            merged["pdf_filename"] = ""
                        if "status_pdf_filename" not in entry or (entry.get("status_pdf_filename") and app_no not in str(entry.get("status_pdf_filename"))):
                            merged["status_pdf_filename"] = ""
                        if "status_detail" not in entry:
                            merged["status_detail"] = ""
                        cls.submissions[idx] = merged
                        entry = merged
                        updated = True
                        break
                # Never attach a pre-Oct-21-night (< 8300000000) order to a worker re-submitted after Oct 21 21:00
                if not ex_app and ex_sub_at >= "2026-10-21 21:00:00" and app_no.isdigit() and len(app_no) >= 9 and int(app_no) < 8300000000 and "оказана" not in st.lower():
                    return
                # Fresh re-submission (app_no == '') after an older refusal clears old application_no
                if not app_no and ex_app and in_sub_at > ex_sub_at and "отказан" in ex_st.lower():
                    merged = {**existing, **entry, "application_no": "", "pdf_filename": "", "status_pdf_filename": "", "status_detail": ""}
                    cls.submissions[idx] = merged
                    entry = merged
                    updated = True
                    break
                merged = {**existing, **entry}
                final_app_no = str(merged.get("application_no") or "").strip()
                if final_app_no:
                    import re
                    for fn_key in ("pdf_filename", "status_pdf_filename"):
                        fn_val = str(merged.get(fn_key) or "").strip()
                        if fn_val:
                            m_fn = re.search(r"(?:^|[_-])([789]\d{9})(?:[_.-]|$)", fn_val)
                            if m_fn and m_fn.group(1) != final_app_no:
                                merged[fn_key] = ""
                if (
                    ex_app == app_no
                    and (
                        ex_st in ("Услуга оказана", "Услуга отказана")
                        or ex_st.startswith("Ошибка отправки заявления")
                        or ex_st.startswith("Ошибка получения заявления")
                    )
                    and st in (
                        "Заявление зарегистрировано",
                        "Отправлено в ведомство",
                        "Отправлено",
                        "Отправлено (PDF не скачан)",
                        "В обработке",
                    )
                ):
                    merged["gosuslugi_status"] = ex_st
                cls.submissions[idx] = merged
                entry = merged
                updated = True
                break
        if not updated:
            cls.submissions.append(entry)
        if save_ledger:
            save_applications_ledger(cls.submissions)
        if sync_central:
            sync_submission_to_central_server_async(entry)
            if entry.get("pdf_filename") or entry.get("status_pdf_filename"):
                upload_pdf_to_central_server_async(entry)

    @classmethod
    def add_log(cls, msg: str):
        print(f"[RPA BRIDGE] {msg}")
        cls.logs.append({"time": time.strftime("%H:%M:%S"), "text": msg})
        if len(cls.logs) > 300:
            cls.logs = cls.logs[-300:]

    @classmethod
    def reset_stats(cls):
        cls.logs = []
        cls.is_paused = False
        cls.waiting_for_manual = False
        cls.manual_message = None
        cls.fatal_error = None
        cls.total = 0
        cls.processed = 0
        cls.success = 0
        cls.errors = 0
        cls.active_worker_code = None
        cls.active_worker_name = None
        cls.completed_codes = []
        cls.error_codes = []
        cls.mvd_cooldown_until = 0.0
        cls.mvd_cooldown_message = None
        if os.path.exists(PAUSE_SIGNAL_FILE):
            try:
                os.remove(PAUSE_SIGNAL_FILE)
            except Exception:
                pass


def is_port_open(port: int, host: str = "127.0.0.1") -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex((host, port)) == 0
    except Exception:
        return False


def kill_orphan_robot_processes():
    """Kills any orphaned gosuslugi_vks_robot.py, gosuslugi_status_checker.py, or gosuslugi_dismissal_robot.py processes."""
    if sys.platform != "win32":
        return
    try:
        my_pid = os.getpid()
        ps_cmd = (
            "Get-CimInstance Win32_Process -Filter \"Name = 'python.exe'\" | "
            "Where-Object { $_.ProcessId -ne "
            + str(my_pid)
            + " -and ($_.CommandLine -match 'gosuslugi_vks_robot|gosuslugi_status_checker|gosuslugi_dismissal_robot') } | "
            "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
        )
        subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
    except Exception:
        pass


def free_port_if_occupied(port: int):
    """Terminates any stale Python bridge process (and its child tree) occupying port 8088 so the newest script version always runs."""
    kill_orphan_robot_processes()
    if not is_port_open(port):
        return
    if sys.platform == "win32":
        try:
            out = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True, text=True)
            my_pid = os.getpid()
            for line in out.splitlines():
                if "LISTENING" in line:
                    parts = line.strip().split()
                    pid = int(parts[-1])
                    if pid != my_pid and pid > 0:
                        print(f"[RPA BRIDGE] Terminating older RPA Bridge process tree (PID {pid}) on port {port}...")
                        subprocess.run(f"taskkill /F /T /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        time.sleep(0.8)
        except Exception:
            pass


def bring_chrome_window_to_front_win32():
    """Brings the Google Chrome window (Gosuslugi / RPA) to the foreground on Windows."""
    if sys.platform != "win32":
        return
    try:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.windll.user32
        WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        matched_hwnds = []

        def _enum_cb(hwnd, _lparam):
            if not user32.IsWindowVisible(hwnd):
                return True
            length = user32.GetWindowTextLengthW(hwnd)
            if length <= 0:
                return True
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            title = (buf.value or "").lower()
            cls_buf = ctypes.create_unicode_buffer(64)
            user32.GetClassNameW(hwnd, cls_buf, 64)
            cls_name = cls_buf.value or ""
            if cls_name == "Chrome_WidgetWin_1" and "chrome" in title:
                if "госуслуг" in title or "gosuslugi" in title or "портал государственных" in title:
                    matched_hwnds.insert(0, hwnd)
                elif "pondera" not in title:
                    matched_hwnds.append(hwnd)
            return True

        user32.EnumWindows(WNDENUMPROC(_enum_cb), 0)
        if matched_hwnds:
            target_hwnd = matched_hwnds[0]
            # Simulate neutral key event so Windows allows background process to set foreground window
            user32.keybd_event(0, 0, 0, 0)
            if user32.IsIconic(target_hwnd):
                user32.ShowWindow(target_hwnd, 9)  # SW_RESTORE
            else:
                user32.ShowWindow(target_hwnd, 5)  # SW_SHOW
            user32.SetForegroundWindow(target_hwnd)
            user32.BringWindowToTop(target_hwnd)
    except Exception:
        pass


def activate_or_open_gosuslugi_tab_cdp() -> bool:
    """Uses Chrome DevTools HTTP endpoint on port 9222 to activate or open the Gosuslugi tab."""
    if not is_port_open(CHROME_CDP_PORT):
        return False
    import urllib.request
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{CHROME_CDP_PORT}/json")
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            tabs = json.loads(resp.read().decode("utf-8"))
        page_tabs = [t for t in tabs if isinstance(t, dict) and t.get("type") == "page"]
        target_tab = None
        for t in page_tabs:
            u = str(t.get("url") or "").lower()
            if "gosuslugi.ru" in u and "chrome-error" not in u:
                target_tab = t
                break
        if not target_tab and page_tabs:
            target_tab = page_tabs[0]
        if target_tab and target_tab.get("id"):
            tid = target_tab["id"]
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{CHROME_CDP_PORT}/json/activate/{tid}", timeout=2).read()
            except Exception:
                pass
            bring_chrome_window_to_front_win32()
            return True
    except Exception:
        pass
    return False


def launch_chrome_debug():
    RPAState.add_log("Запуск Google Chrome в режиме отладки (порт 9222)...")
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    ]
    chrome_exe = next((p for p in chrome_paths if os.path.exists(p)), "chrome.exe")
    user_data = os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data RPA")

    # If port 9222 is already open, activate the Gosuslugi tab via CDP and bring window to front
    if is_port_open(CHROME_CDP_PORT):
        if activate_or_open_gosuslugi_tab_cdp():
            RPAState.add_log("Google Chrome (порт 9222) уже запущен — окно выведено на передний план!")
            return True
    elif sys.platform == "win32":
        # Clean up any hung zombie Chrome processes holding 'User Data RPA' without port 9222 open
        try:
            ps_clean = (
                "Get-CimInstance Win32_Process -Filter \"Name = 'chrome.exe'\" | "
                "Where-Object { $_.CommandLine -match 'User Data RPA' } | "
                "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
            )
            subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_clean],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=4,
            )
            time.sleep(0.4)
        except Exception:
            pass

    cmd = [
        chrome_exe,
        f"--remote-debugging-port={CHROME_CDP_PORT}",
        f"--user-data-dir={user_data}",
        "--no-first-run",
        "--no-default-browser-check",
        "--start-maximized",
        "--new-window",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=CalculateNativeWindowOcclusion,IntensiveWakeUpThrottling",
        "https://www.gosuslugi.ru/600585/1/form",
    ]
    try:
        subprocess.Popen(cmd, shell=False)
        for _ in range(12):
            time.sleep(0.3)
            if is_port_open(CHROME_CDP_PORT):
                activate_or_open_gosuslugi_tab_cdp()
                break
        bring_chrome_window_to_front_win32()
        RPAState.add_log("Google Chrome успешно запущен. Войдите в Госуслуги.")
        return True
    except Exception as e:
        RPAState.add_log(f"Ошибка запуска Chrome: {e}")
        return False


def auto_update_scripts_from_server():
    """
    Automatically downloads the latest Pondera_Gosuslugi_Agent.zip from https://hr.pondera.network/Pondera_Gosuslugi_Agent.zip
    and updates local robot .py scripts so GitHub deployments immediately take effect on every client PC without manual zip re-extraction.
    """
    if os.path.basename(CURRENT_DIR).lower() == "gosuslugi_rpa" or os.path.exists(
        os.path.join(CURRENT_DIR, "..", "..", ".git")
    ):
        return  # Skip inside git dev repo (scripts/gosuslugi_rpa or scripts/Pondera_Gosuslugi_Agent)
    import io
    import zipfile
    import urllib.request
    import ssl

    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        url = f"https://hr.pondera.network/Pondera_Gosuslugi_Agent.zip?t={int(time.time())}"
        req = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
            if resp.status == 200:
                zip_bytes = resp.read()
                with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                    updated_files = []
                    for member in zf.namelist():
                        base_name = os.path.basename(member)
                        if base_name in (
                            "gosuslugi_vks_robot.py",
                            "gosuslugi_dismissal_robot.py",
                            "gosuslugi_status_checker.py",
                            "rpa_bridge_server.py",
                            "START_PONDERA_RPA_BRIDGE.bat",
                        ):
                            new_data = zf.read(member)
                            target_path = os.path.join(CURRENT_DIR, base_name)
                            old_data = b""
                            if os.path.exists(target_path):
                                try:
                                    with open(target_path, "rb") as f_old:
                                        old_data = f_old.read()
                                except Exception:
                                    pass
                            if new_data and new_data != old_data:
                                with open(target_path, "wb") as f_out:
                                    f_out.write(new_data)
                                updated_files.append(base_name)
                    if updated_files:
                        print(f"[RPA BRIDGE] Авто-обновление с сервера hr.pondera.network: обновлены {', '.join(updated_files)}")
    except Exception as e:
        print(f"[RPA BRIDGE] Проверка обновлений: {e}")


def run_robot_worker(
    mode: str = "vks",
    limit: int = 0,
    sheet: str = "Sheet1",
    json_file: str = "",
    config_file: str = "",
    search_scope: str = "pending_only",
    capture_screenshots: bool = False,
):
    RPAState.is_running = True
    RPAState.mode = mode
    auto_update_scripts_from_server()
    RPAState.add_log(f"=== Запуск робота Playwright Gosuslugi (Режим: {mode.upper()}) ===")

    if mode == "dismissal":
        script_name = "gosuslugi_dismissal_robot.py"
    elif mode in ("check_status", "check_status_fast", "check_status_single"):
        script_name = "gosuslugi_status_checker.py"
    else:
        script_name = "gosuslugi_vks_robot.py"

    script_path = os.path.join(CURRENT_DIR, script_name)
    cmd = [sys.executable, script_path]

    if mode == "check_status_fast":
        cmd.extend(["--status-only", "--single-search", "--search-scope", "pending_only", "--max-pages", "60"])
    elif mode == "check_status_single":
        if json_file and os.path.exists(json_file):
            cmd.extend(["--json", json_file])
        cmd.extend(["--single-search", "--search-scope", search_scope, "--max-pages", "60"])
        if capture_screenshots:
            cmd.append("--capture-screenshots")
    elif json_file and os.path.exists(json_file):
        cmd.extend(["--json", json_file])
    elif mode != "check_status":
        cmd.extend(["--sheet", sheet])

    if config_file and os.path.exists(config_file) and mode not in ("check_status", "check_status_fast", "check_status_single"):
        cmd.extend(["--config-json", config_file])

    if limit > 0 and mode != "check_status_fast":
        cmd.extend(["--limit", str(limit)])

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            bufsize=1,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        )
        RPAState.process = proc

        for line in iter(proc.stdout.readline, ''):
            clean_line = line.strip()
            if clean_line:
                RPAState.add_log(clean_line)

                # Detect active worker
                for marker in [
                    "Starting Gosuslugi VKS for: ",
                    "Starting Gosuslugi Dismissal for: ",
                    "Checking Gosuslugi Status for: ",
                ]:
                    if marker in clean_line:
                        try:
                            after = clean_line.split(marker)[1]
                            name = after.split(" (Код:")[0].strip()
                            code = after.split("(Код: ")[1].split(")")[0].split(",")[0].strip() if "(Код: " in after else ""
                            RPAState.active_worker_name = name
                            RPAState.active_worker_code = code
                            RPAState.waiting_for_manual = False
                            RPAState.manual_message = None
                            RPAState.mvd_cooldown_until = 0.0
                            RPAState.mvd_cooldown_message = None
                        except Exception:
                            pass

                # Detect Gosuslugi Application Number Registration & Status Updates
                for json_marker in ["APPLICATION_REGISTERED:", "APPLICATION_STATUS_UPDATED:"]:
                    if json_marker in clean_line:
                        try:
                            raw_json = clean_line.split(json_marker, 1)[1].strip()
                            parsed_entry = json.loads(raw_json)
                            RPAState.upsert_submission(parsed_entry)
                        except Exception:
                            pass

                if "FAST_JSON_STATUS_SYNC:" in clean_line:
                    RPAState.last_json_status_sync_ts = time.time()
                    RPAState.submissions = load_saved_applications()

                # Detect MVD Service Outage
                if "MVD_SERVICE_DOWN:" in clean_line:
                    RPAState.active_worker_code = None
                    RPAState.active_worker_name = "Сервис МВД не отвечает"
                    RPAState.waiting_for_manual = False
                    RPAState.manual_message = None

                if "MVD_OUTAGE_STOP:" in clean_line:
                    outage_msg = clean_line.split("MVD_OUTAGE_STOP:", 1)[1].strip()
                    RPAState.fatal_error = outage_msg
                    RPAState.waiting_for_manual = False
                    RPAState.manual_message = None

                # Detect 'Данные не найдены в базе МВД' (separate group, not an error)
                if "MVD_DATA_NOT_FOUND: Сотрудник" in clean_line:
                    RPAState.waiting_for_manual = False
                    RPAState.manual_message = None
                    RPAState.processed += 1
                    if RPAState.active_worker_code and RPAState.active_worker_code in RPAState.error_codes:
                        RPAState.error_codes.remove(RPAState.active_worker_code)

                if "MVD_WARNING_STATUS_SYNC:" in clean_line:
                    RPAState.mvd_cooldown_message = (
                        "Обнаружено предупреждение «МВД может отказать / Данные не найдены в базе МВД». "
                        "Обновляем статусы текущих заявлений перед 10-минутной паузой..."
                    )

                if "MVD_COOLDOWN_START:" in clean_line:
                    try:
                        sec_str = clean_line.split("MVD_COOLDOWN_START:", 1)[1].split("|")[0].strip()
                        cooldown_secs = int(sec_str)
                    except Exception:
                        cooldown_secs = 600
                    RPAState.mvd_cooldown_until = time.time() + cooldown_secs
                    RPAState.mvd_cooldown_message = (
                        "На Госуслугах появилось предупреждение «Данные не найдены в базе МВД — МВД может отказать». "
                        "Статусы заявлений обновлены. Робот автоматически продолжит отправку через 10 минут."
                    )

                if "MVD_COOLDOWN_END:" in clean_line:
                    RPAState.mvd_cooldown_until = 0.0
                    RPAState.mvd_cooldown_message = None

                # Detect Fatal Stop (e.g. Insufficient permissions on Gosuslugi: 'У вас недостаточно полномочий для отправки уведомлений')
                if "FATAL_STOP:" in clean_line:
                    fatal_msg = clean_line.split("FATAL_STOP:", 1)[1].strip()
                    RPAState.fatal_error = fatal_msg
                    RPAState.waiting_for_manual = False
                    RPAState.manual_message = None
                    if RPAState.active_worker_code:
                        if RPAState.active_worker_code in RPAState.completed_codes:
                            RPAState.completed_codes.remove(RPAState.active_worker_code)
                        if RPAState.active_worker_code not in RPAState.error_codes:
                            RPAState.error_codes.append(RPAState.active_worker_code)
                            RPAState.errors += 1
                            RPAState.processed += 1

                # Detect Human-in-the-Loop Manual Intervention Pause & Gosuslugi Logout Pause
                if "PAUSED_FOR_LOGIN:" in clean_line:
                    RPAState.is_paused = True
                    RPAState.waiting_for_manual = True
                    RPAState.manual_message = clean_line.split("PAUSED_FOR_LOGIN:", 1)[1].strip()
                elif "ROBOT_PAUSED:" in clean_line:
                    RPAState.is_paused = True
                    if not RPAState.manual_message:
                        RPAState.manual_message = clean_line.split("ROBOT_PAUSED:", 1)[1].strip()
                elif "WAITING_FOR_USER:" in clean_line:
                    RPAState.waiting_for_manual = True
                    RPAState.manual_message = clean_line.split("WAITING_FOR_USER:")[1].strip()
                elif "USER_RESOLVED:" in clean_line or "ROBOT_RESUMED:" in clean_line or "LOGIN_RESTORED:" in clean_line:
                    RPAState.is_paused = False
                    RPAState.waiting_for_manual = False
                    RPAState.manual_message = None
                elif "Step " in clean_line and not RPAState.is_paused:
                    if "WAITING_FOR_USER:" not in clean_line:
                        RPAState.waiting_for_manual = False
                        RPAState.manual_message = None

                if "SUCCESS: Notification submitted" in clean_line or "SUCCESS: Status checked" in clean_line:
                    if not RPAState.is_paused:
                        RPAState.waiting_for_manual = False
                        RPAState.manual_message = None
                    RPAState.success += 1
                    RPAState.processed += 1
                    if RPAState.active_worker_code:
                        if RPAState.active_worker_code in RPAState.error_codes:
                            RPAState.error_codes.remove(RPAState.active_worker_code)
                        if RPAState.active_worker_code not in RPAState.completed_codes:
                            RPAState.completed_codes.append(RPAState.active_worker_code)
                elif ("Error processing" in clean_line or "WORKER_ERROR:" in clean_line) and not is_browser_closed_error_text(clean_line):
                    if not RPAState.is_paused:
                        RPAState.waiting_for_manual = False
                        RPAState.manual_message = None
                    if RPAState.active_worker_code:
                        if RPAState.active_worker_code not in RPAState.error_codes:
                            RPAState.error_codes.append(RPAState.active_worker_code)
                            RPAState.errors += 1
                            RPAState.processed += 1
                    elif "Error processing" in clean_line:
                        RPAState.errors += 1
                        RPAState.processed += 1
                elif "Loaded" in clean_line and "records" in clean_line:
                    try:
                        parts = clean_line.split("Loaded ")[1].split(" records")[0]
                        RPAState.total = int(parts)
                    except Exception:
                        pass

        proc.stdout.close()
        proc.wait()
        RPAState.add_log(f"=== Робот завершил работу с кодом {proc.returncode} ===")
    except Exception as e:
        RPAState.add_log(f"Критическая ошибка робота: {e}")
    finally:
        if RPAState.process is None or RPAState.process == proc:
            RPAState.is_running = False
            RPAState.is_paused = False
            RPAState.waiting_for_manual = False
            RPAState.manual_message = None
            RPAState.mvd_cooldown_until = 0.0
            RPAState.mvd_cooldown_message = None
            RPAState.process = None
            RPAState.active_worker_code = None
            RPAState.active_worker_name = None


ALLOWED_ORIGINS = {
    "https://hr.pondera.network",
    "http://hr.pondera.network",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
}


class RPABridgeHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        origin = (self.headers.get("Origin") or "").strip().rstrip("/")
        if origin in ALLOWED_ORIGINS or origin.endswith(".pondera.network"):
            self.send_header("Access-Control-Allow-Origin", origin)
        else:
            self.send_header("Access-Control-Allow-Origin", "https://hr.pondera.network")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ["/health", "/status"]:
            chrome_ready = is_port_open(CHROME_CDP_PORT)
            cooldown_rem = (
                max(0, int(RPAState.mvd_cooldown_until - time.time()))
                if RPAState.is_running and RPAState.mvd_cooldown_until > time.time()
                else 0
            )
            data = {
                "status": "online",
                "bridge_version": BRIDGE_VERSION,
                "running": RPAState.is_running,
                "paused": RPAState.is_paused,
                "waiting_for_manual": RPAState.waiting_for_manual,
                "manual_message": RPAState.manual_message,
                "mvd_cooldown_remaining": cooldown_rem,
                "mvd_cooldown_message": RPAState.mvd_cooldown_message if (cooldown_rem > 0 or RPAState.mvd_cooldown_message) else None,
                "fatal_error": RPAState.fatal_error,
                "mode": RPAState.mode,
                "chrome_ready": chrome_ready,
                "total": RPAState.total,
                "processed": RPAState.processed,
                "success": RPAState.success,
                "errors": RPAState.errors,
                "active_worker_code": RPAState.active_worker_code,
                "active_worker_name": RPAState.active_worker_name,
                "completed_codes": RPAState.completed_codes,
                "error_codes": RPAState.error_codes,
                "submissions": RPAState.submissions,
                "logs": RPAState.logs[-60:],
            }
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
        elif parsed.path == "/pdf-base64":
            import base64
            from urllib.parse import parse_qs
            qs = parse_qs(parsed.query)
            file_arg = (qs.get("file") or [""])[0].strip()
            local_p = find_local_pdf_path(file_arg)
            if local_p:
                raw_bytes = local_p.read_bytes()
                b64_str = base64.b64encode(raw_bytes).decode("ascii")
                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "filename": local_p.name,
                    "pdf_base64": b64_str,
                }).encode("utf-8"))
            else:
                self.send_response(404)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "message": "PDF not found locally"}).encode("utf-8"))
        else:
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(body.decode("utf-8")) if body else {}
        except Exception:
            payload = {}

        if parsed.path == "/open-chrome":
            ok = launch_chrome_debug()
            self.send_response(200 if ok else 500)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": ok}).encode("utf-8"))

        elif parsed.path == "/scan-pdfs":
            discovered = scan_downloads_pdfs()
            for d in discovered:
                RPAState.upsert_submission(d)
            RPAState.add_log(f"Просканирована папка Загрузки: найдено {len(discovered)} PDF-квитанций Госуслуг.")
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "discovered": discovered, "submissions": RPAState.submissions}, ensure_ascii=False).encode("utf-8"))

        elif parsed.path == "/pause":
            try:
                with open(PAUSE_SIGNAL_FILE, "w", encoding="utf-8") as pf:
                    pf.write("paused")
                RPAState.is_paused = True
                if not RPAState.manual_message:
                    RPAState.manual_message = "Робот поставлен на паузу пользователем. Нажмите «Продолжить (Devam Et)», чтобы возобновить работу."
                RPAState.add_log("Робот поставлен на паузу пользователем (Ожидание нажатия «Продолжить»).")
            except Exception as e:
                RPAState.add_log(f"Ошибка постановки на паузу: {e}")

            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "paused": True}).encode("utf-8"))

        elif parsed.path in ("/resume", "/manual-continue"):
            try:
                if os.path.exists(PAUSE_SIGNAL_FILE):
                    try:
                        os.remove(PAUSE_SIGNAL_FILE)
                    except Exception:
                        pass
                with open(MANUAL_CONTINUE_SIGNAL, "w", encoding="utf-8") as sf:
                    sf.write("continue")
                RPAState.is_paused = False
                RPAState.waiting_for_manual = False
                RPAState.manual_message = None
                RPAState.mvd_cooldown_until = 0.0
                RPAState.mvd_cooldown_message = None
                RPAState.add_log("Пользователь нажал «Продолжить» — возобновляем работу робота...")
            except Exception as e:
                RPAState.add_log(f"Ошибка сигнала продолжения: {e}")

            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "paused": False}).encode("utf-8"))

        elif parsed.path == "/start":
            if RPAState.is_running:
                self.send_response(400)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Already running"}).encode("utf-8"))
                return

            RPAState.reset_stats()
            kill_orphan_robot_processes()
            mode = str(payload.get("mode", "vks"))
            limit = int(payload.get("limit", 0))
            sheet = str(payload.get("sheet", "Sheet1"))
            records = payload.get("records")
            config_overrides = payload.get("config")
            search_scope = str(payload.get("search_scope") or "pending_only")
            capture_screenshots = bool(payload.get("capture_screenshots"))
            json_file = ""
            config_file = ""

            if mode == "dismissal":
                queue_filename = "active_dismissal_queue.json"
                cfg_filename = "active_dismissal_config.json"
            elif mode in ("check_status", "check_status_single"):
                queue_filename = "active_status_check_queue.json"
                cfg_filename = "active_status_check_config.json"
            else:
                queue_filename = "active_vks_queue.json"
                cfg_filename = "active_vks_config.json"

            if records and isinstance(records, list) and len(records) > 0:
                json_file = os.path.join(CURRENT_DIR, queue_filename)
                with open(json_file, "w", encoding="utf-8") as f:
                    json.dump(records, f, ensure_ascii=False, indent=2)
                RPAState.total = len(records)
                RPAState.add_log(f"Получено {len(records)} записей напрямую из Pondera HR UI ({mode.upper()}).")
                # Purge any previous non-'Услуга оказана' entries for these queued sicils when starting VKS submission
                queued_sicils = {
                    str(r.get("Sicil") or r.get("Код") or "").strip()
                    for r in records
                    if isinstance(r, dict) and str(r.get("Sicil") or r.get("Код") or "").strip()
                }
                if queued_sicils:
                    if mode == "vks":
                        RPAState.completed_codes = [
                            c for c in RPAState.completed_codes if str(c).strip() not in queued_sicils
                        ]
                        RPAState.error_codes = [
                            c for c in RPAState.error_codes if str(c).strip() not in queued_sicils
                        ]
                    if isinstance(RPAState.submissions, list):
                        before_len = len(RPAState.submissions)
                        if mode == "vks":
                            for v in RPAState.submissions:
                                if (
                                    isinstance(v, dict)
                                    and str(v.get("sicil") or v.get("sicil_no") or "").strip() in queued_sicils
                                    and "оказан" not in str(v.get("gosuslugi_status") or "").strip().lower()
                                    and "исполнен" not in str(v.get("gosuslugi_status") or "").strip().lower()
                                ):
                                    old_app = str(v.get("application_no") or "").strip()
                                    if old_app:
                                        CENTRAL_ARCHIVED_APP_NOS.add(old_app)
                        RPAState.submissions = [
                            v
                            for v in RPAState.submissions
                            if not (
                                isinstance(v, dict)
                                and str(v.get("sicil") or v.get("sicil_no") or "").strip() in queued_sicils
                                and (
                                    (
                                        mode == "vks"
                                        and "оказан" not in str(v.get("gosuslugi_status") or "").strip().lower()
                                        and "исполнен" not in str(v.get("gosuslugi_status") or "").strip().lower()
                                    )
                                    or str(v.get("gosuslugi_status") or "").strip().lower().startswith("ошибк")
                                    or "отказ" in str(v.get("gosuslugi_status") or "").strip().lower()
                                )
                            )
                        ]
                        if len(RPAState.submissions) != before_len:
                            save_applications_ledger(RPAState.submissions)
                if mode == "vks" and len(records) > 1:
                    sync_vks_queue_to_central_master_list_async(records)

            if config_overrides and isinstance(config_overrides, dict):
                config_file = os.path.join(CURRENT_DIR, cfg_filename)
                with open(config_file, "w", encoding="utf-8") as cf:
                    json.dump(config_overrides, cf, ensure_ascii=False, indent=2)

            t = threading.Thread(
                target=run_robot_worker,
                args=(mode, limit, sheet, json_file, config_file, search_scope, capture_screenshots),
                daemon=True
            )
            RPAState.thread = t
            t.start()

            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "message": "Robot started"}).encode("utf-8"))

        elif parsed.path == "/purge-sicils":
            content_len = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_len).decode("utf-8")) if content_len > 0 else {}
            raw_sicils = body.get("sicils") if isinstance(body, dict) else []
            raw_apps = body.get("app_nos") if isinstance(body, dict) else []
            target_sicils = {str(s or "").strip() for s in (raw_sicils or []) if str(s or "").strip()}
            target_apps = {str(a or "").strip() for a in (raw_apps or []) if str(a or "").strip()}
            if target_apps:
                CENTRAL_ARCHIVED_APP_NOS.update(target_apps)

            purged_cnt = 0
            if target_sicils:
                RPAState.completed_codes = [
                    c for c in RPAState.completed_codes if str(c).strip() not in target_sicils
                ]
                RPAState.error_codes = [
                    c for c in RPAState.error_codes if str(c).strip() not in target_sicils
                ]

            if (target_sicils or target_apps) and isinstance(RPAState.submissions, list):
                for v in RPAState.submissions:
                    if (
                        isinstance(v, dict)
                        and (
                            (target_sicils and str(v.get("sicil") or v.get("sicil_no") or "").strip() in target_sicils)
                            or (target_apps and str(v.get("application_no") or "").strip() in target_apps)
                        )
                        and "оказан" not in str(v.get("gosuslugi_status") or "").strip().lower()
                        and "исполнен" not in str(v.get("gosuslugi_status") or "").strip().lower()
                    ):
                        old_app = str(v.get("application_no") or "").strip()
                        if old_app:
                            CENTRAL_ARCHIVED_APP_NOS.add(old_app)
                before_len = len(RPAState.submissions)
                RPAState.submissions = [
                    v
                    for v in RPAState.submissions
                    if not (
                        isinstance(v, dict)
                        and (
                            (target_sicils and str(v.get("sicil") or v.get("sicil_no") or "").strip() in target_sicils)
                            or (target_apps and str(v.get("application_no") or "").strip() in target_apps)
                        )
                        and "оказан" not in str(v.get("gosuslugi_status") or "").strip().lower()
                        and "исполнен" not in str(v.get("gosuslugi_status") or "").strip().lower()
                    )
                ]
                purged_cnt = before_len - len(RPAState.submissions)
                if purged_cnt > 0:
                    save_applications_ledger(RPAState.submissions)
            save_archived_app_nos()

            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                json.dumps({"success": True, "purged": purged_cnt}).encode("utf-8")
            )

        elif parsed.path == "/stop":
            proc_to_kill = RPAState.process
            RPAState.process = None
            RPAState.is_running = False
            RPAState.is_paused = False
            RPAState.waiting_for_manual = False
            RPAState.manual_message = None
            RPAState.mvd_cooldown_until = 0.0
            RPAState.mvd_cooldown_message = None
            RPAState.last_json_status_sync_ts = time.time()
            if os.path.exists(PAUSE_SIGNAL_FILE):
                try:
                    os.remove(PAUSE_SIGNAL_FILE)
                except Exception:
                    pass
            if proc_to_kill:
                try:
                    pid = proc_to_kill.pid
                    proc_to_kill.terminate()
                    if sys.platform == "win32" and pid:
                        subprocess.run(
                            f"taskkill /F /T /PID {pid}",
                            shell=True,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                        )
                except Exception:
                    pass
            kill_orphan_robot_processes()
            RPAState.add_log("Робот принудительно остановлен пользователем.")
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "message": "Stopped"}).encode("utf-8"))

        else:
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()

    def log_message(self, format, *args):
        pass


def sync_all_local_submissions_to_central_async():
    """Pushes all local non-error submissions from RPAState.submissions to https://hr.pondera.network/api/gosuslugi/submissions and uploads any local Status A4 PDFs."""
    def _worker():
        import urllib.request
        import ssl
        import re
        try:
            active_app_by_sicil = {}
            for sub_it in (RPAState.submissions or []):
                if isinstance(sub_it, dict):
                    s_sic = str(sub_it.get("sicil") or sub_it.get("sicil_no") or "").strip()
                    s_app = str(sub_it.get("application_no") or "").strip()
                    if s_sic and s_app.isdigit():
                        prev_a = active_app_by_sicil.get(s_sic, "")
                        if not prev_a or int(s_app) > int(prev_a):
                            active_app_by_sicil[s_sic] = s_app

            status_a4_dir = Path.home() / "Downloads" / "Gosuslugi_Status_A4"
            if status_a4_dir.exists():
                for sc_path in status_a4_dir.glob("*_STATUS_A4.pdf"):
                    if sc_path.name in UPLOADED_PDFS_SET:
                        continue
                    stem = sc_path.stem.replace("_STATUS_A4", "")
                    parts = stem.split("_")
                    sicil_cand = parts[0] if len(parts) >= 2 and parts[0].isdigit() else ""
                    app_cand = ""
                    for p in parts[:3]:
                        if re.match(r"^[789]\d{9}$", p):
                            app_cand = p
                            break
                    if sicil_cand and app_cand and sicil_cand in active_app_by_sicil:
                        act_app = active_app_by_sicil[sicil_cand]
                        if act_app.isdigit() and app_cand.isdigit() and int(app_cand) < int(act_app):
                            try:
                                sc_path.unlink()
                            except Exception:
                                pass
                            continue
                    upload_pdf_to_central_server_async({
                        "status_pdf_filename": sc_path.name,
                        "application_no": app_cand,
                        "sicil_no": sicil_cand if sicil_cand != app_cand else "",
                    })
        except Exception:
            pass
        try:
            subs = list(RPAState.submissions or [])
            valid_batch = [
                it for it in subs
                if isinstance(it, dict)
                and not str(it.get("gosuslugi_status") or "").strip().lower().startswith("ошибк")
                and (
                    str(it.get("application_no") or "").strip()
                    or str(it.get("submitted_at") or "").strip() >= "2026-10-26 10:15:00"
                    or str(it.get("pdf_filename") or "").strip()
                    or str(it.get("status_pdf_filename") or "").strip()
                )
            ]
            if not valid_batch:
                return
            payload = json.dumps({"records": valid_batch}, ensure_ascii=False).encode("utf-8")
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(
                "https://hr.pondera.network/api/gosuslugi/submissions",
                data=payload,
                headers={"Content-Type": "application/json; charset=utf-8"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15, context=ctx) as _:
                pass
        except Exception:
            pass

    threading.Thread(target=_worker, daemon=True).start()


def start_telegram_outbox_relay_thread():
    """
    Polls central backend /api/telegram/cron every 60 seconds so the backend computes
    the 15-min VKS report and 09:15 MSK Evrak Süreleri report. If the Russian VPS
    direct connection to api.telegram.org was blocked by Roskomnadzor, delivers the
    queued UTF-8 message from this machine and acknowledges delivery to the server.
    """
    def _worker():
        import urllib.request
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        cron_url = "https://hr.pondera.network/api/telegram/cron?relay=1"
        ack_url = "https://hr.pondera.network/api/telegram/cron"
        tick_cnt = 0
        while True:
            tick_cnt += 1
            if tick_cnt % 15 == 0:
                try:
                    auto_update_scripts_from_server()
                    sync_all_local_submissions_to_central_async()
                except Exception:
                    pass
            try:
                req = urllib.request.Request(
                    cron_url,
                    headers={"User-Agent": "Pondera-RPA-Agent/2.6"},
                )
                with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        pending = data.get("pendingOutbox") or []
                        cfg = data.get("telegramConfig") or {}
                        token = cfg.get("botToken") or cfg.get("token")
                        chat_id = cfg.get("chatId")
                        if pending and token and chat_id:
                            delivered_ids = []
                            for item in pending:
                                try:
                                    msg_text = item.get("text") or item.get("html_text") or ""
                                    if not msg_text:
                                        continue
                                    tg_payload = json.dumps({
                                        "chat_id": chat_id,
                                        "text": msg_text,
                                        "parse_mode": "HTML",
                                        "disable_web_page_preview": True,
                                    }, ensure_ascii=True).encode("ascii")
                                    tg_req = urllib.request.Request(
                                        f"https://api.telegram.org/bot{token}/sendMessage",
                                        data=tg_payload,
                                        headers={"Content-Type": "application/json; charset=utf-8"},
                                        method="POST",
                                    )
                                    with urllib.request.urlopen(tg_req, timeout=12, context=ctx) as tg_resp:
                                        tg_res = json.loads(tg_resp.read().decode("utf-8"))
                                        if tg_res.get("ok"):
                                            delivered_ids.append(item.get("id"))
                                except Exception:
                                    pass
                            if delivered_ids:
                                ack_payload = json.dumps({"deliveredIds": delivered_ids}).encode("utf-8")
                                ack_req = urllib.request.Request(
                                    ack_url,
                                    data=ack_payload,
                                    headers={"Content-Type": "application/json; charset=utf-8"},
                                    method="POST",
                                )
                                urllib.request.urlopen(ack_req, timeout=10, context=ctx).read()
            except Exception:
                pass
            time.sleep(10)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()


def sync_vks_queue_to_central_master_list_async(records: list):
    """Disabled: central master list is updated strictly via Excel upload or inline UI edit."""
    return


def start_auto_30min_gosuslugi_status_sync_thread():
    """
    Runs a fast JSON-only Gosuslugi status sync (up to 1,200 Zayavkas, no PDF download)
    every 30 minutes across all computers.
    - When a VKS robot is actively running (`RPAState.is_running == True`), `gosuslugi_vks_robot.py`
      executes the fast JSON status sync strictly between workers (right after the active Zayavka finishes),
      so no in-progress application is ever interrupted.
    - When the robot is idle (`not RPAState.is_running`) and Chrome Debug Port 9222 is open,
      this background thread triggers `check_status_fast` every 30 minutes.
    """
    def _worker():
        time.sleep(90)  # Initial grace period after bridge startup
        while True:
            try:
                now_ts = time.time()
                if (
                    not RPAState.is_running
                    and is_port_open(CHROME_CDP_PORT)
                    and (now_ts - RPAState.last_json_status_sync_ts >= 1800)
                ):
                    RPAState.last_json_status_sync_ts = now_ts
                    RPAState.reset_stats()
                    t = threading.Thread(
                        target=run_robot_worker,
                        args=("check_status_fast", 0, "Sheet1", "", ""),
                        daemon=True,
                    )
                    RPAState.thread = t
                    t.start()
            except Exception:
                pass
            time.sleep(60)

    threading.Thread(target=_worker, daemon=True).start()


def main():
    # Prevent Windows from entering Sleep Mode, Hibernate, or turning off display/network
    prevent_windows_sleep()
    # Automatically free port 8088 if an older RPA Bridge instance is still running in the background
    free_port_if_occupied(PORT)

    def _startup_sync():
        fetch_central_archived_app_nos()
        RPAState.submissions = load_saved_applications()
        for d in scan_downloads_pdfs():
            RPAState.upsert_submission(d, sync_central=False, save_ledger=False)
        save_applications_ledger(RPAState.submissions)
        auto_update_scripts_from_server()
        sync_all_local_submissions_to_central_async()

    threading.Thread(target=_startup_sync, daemon=True).start()
    # Start background Telegram report relay thread (polls backend every 60s)
    start_telegram_outbox_relay_thread()
    # Start background 30-min fast JSON Gosuslugi status sync (1,200 Zayavkas, no PDF download)
    start_auto_30min_gosuslugi_status_sync_thread()

    server = ThreadingHTTPServer(("127.0.0.1", PORT), RPABridgeHandler)
    print("=====================================================")
    print(f"  Pondera HR RPA Bridge Server v{BRIDGE_VERSION} running on http://127.0.0.1:{PORT}")
    print(f"  Chrome Debugging Port: {CHROME_CDP_PORT}")
    print(f"  Sleep Mode Protection: ACTIVE (Never Sleep / Always Awake)")
    print(f"  Telegram Central Sync: ACTIVE (15m VKS & 09:15 MSK Reports)")
    print(f"  Tracked Gosuslugi Applications: {len(RPAState.submissions)}")
    print("=====================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping RPA Bridge Server...")
        server.server_close()


if __name__ == "__main__":
    main()
