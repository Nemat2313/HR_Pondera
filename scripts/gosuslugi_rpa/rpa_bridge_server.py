"""
Pondera HR & Powerise Local RPA Bridge Server
Listens on http://127.0.0.1:8088 and http://localhost:8088 to bridge web UI commands
directly to local Playwright automation (VKS Salary Notification, Hiring, Dismissal) and Chrome instances.
Includes full Chrome Private Network Access (PNA), CORS support, and Human-in-the-Loop manual intervention.
"""

import sys
import os
import json
import socket
import threading
import subprocess
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

PORT = 8088
CHROME_CDP_PORT = 9222
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
MANUAL_CONTINUE_SIGNAL = os.path.join(CURRENT_DIR, "manual_continue.signal")


class RPAState:
    is_running = False
    waiting_for_manual = False
    manual_message = None
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

    @classmethod
    def add_log(cls, msg: str):
        print(f"[RPA BRIDGE] {msg}")
        cls.logs.append({"time": time.strftime("%H:%M:%S"), "text": msg})
        if len(cls.logs) > 300:
            cls.logs = cls.logs[-300:]

    @classmethod
    def reset_stats(cls):
        cls.logs = []
        cls.waiting_for_manual = False
        cls.manual_message = None
        cls.total = 0
        cls.processed = 0
        cls.success = 0
        cls.errors = 0
        cls.active_worker_code = None
        cls.active_worker_name = None
        cls.completed_codes = []
        cls.error_codes = []


def is_port_open(port: int, host: str = "127.0.0.1") -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex((host, port)) == 0
    except Exception:
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
    cmd = [
        chrome_exe,
        f"--remote-debugging-port={CHROME_CDP_PORT}",
        f"--user-data-dir={user_data}",
        "https://www.gosuslugi.ru/600585/1/form"
    ]
    try:
        subprocess.Popen(cmd, shell=False)
        RPAState.add_log("Google Chrome успешно запущен. Войдите в Госуслуги.")
        return True
    except Exception as e:
        RPAState.add_log(f"Ошибка запуска Chrome: {e}")
        return False


def run_robot_worker(mode: str = "vks", limit: int = 0, sheet: str = "Sheet1", json_file: str = "", config_file: str = ""):
    RPAState.is_running = True
    RPAState.mode = mode
    RPAState.add_log(f"=== Запуск робота Playwright Gosuslugi (Режим: {mode.upper()}) ===")

    if mode == "dismissal":
        script_name = "gosuslugi_dismissal_robot.py"
    else:
        script_name = "gosuslugi_vks_robot.py"

    script_path = os.path.join(CURRENT_DIR, script_name)
    cmd = [sys.executable, script_path]

    if json_file and os.path.exists(json_file):
        cmd.extend(["--json", json_file])
    else:
        cmd.extend(["--sheet", sheet])

    if config_file and os.path.exists(config_file):
        cmd.extend(["--config-json", config_file])

    if limit > 0:
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
                for marker in ["Starting Gosuslugi VKS for: ", "Starting Gosuslugi Dismissal for: "]:
                    if marker in clean_line:
                        try:
                            after = clean_line.split(marker)[1]
                            name = after.split(" (Код:")[0].strip()
                            code = after.split("(Код: ")[1].split(")")[0].strip() if "(Код: " in after else ""
                            RPAState.active_worker_name = name
                            RPAState.active_worker_code = code
                            RPAState.waiting_for_manual = False
                            RPAState.manual_message = None
                        except Exception:
                            pass

                # Detect Human-in-the-Loop Manual Intervention Pause
                if "WAITING_FOR_USER:" in clean_line:
                    RPAState.waiting_for_manual = True
                    RPAState.manual_message = clean_line.split("WAITING_FOR_USER:")[1].strip()
                elif "USER_RESOLVED:" in clean_line or "Step " in clean_line:
                    if "WAITING_FOR_USER:" not in clean_line:
                        RPAState.waiting_for_manual = False
                        RPAState.manual_message = None

                if "SUCCESS: Notification submitted" in clean_line:
                    RPAState.waiting_for_manual = False
                    RPAState.manual_message = None
                    RPAState.success += 1
                    RPAState.processed += 1
                    if RPAState.active_worker_code and RPAState.active_worker_code not in RPAState.completed_codes:
                        RPAState.completed_codes.append(RPAState.active_worker_code)
                elif "Error processing" in clean_line or "[ERROR]" in clean_line:
                    RPAState.waiting_for_manual = False
                    RPAState.manual_message = None
                    RPAState.errors += 1
                    RPAState.processed += 1
                    if RPAState.active_worker_code and RPAState.active_worker_code not in RPAState.error_codes:
                        RPAState.error_codes.append(RPAState.active_worker_code)
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
        RPAState.is_running = False
        RPAState.waiting_for_manual = False
        RPAState.manual_message = None
        RPAState.process = None
        RPAState.active_worker_code = None
        RPAState.active_worker_name = None


class RPABridgeHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
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
            data = {
                "status": "online",
                "running": RPAState.is_running,
                "waiting_for_manual": RPAState.waiting_for_manual,
                "manual_message": RPAState.manual_message,
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
                "logs": RPAState.logs[-60:],
            }
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
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

        elif parsed.path == "/manual-continue":
            try:
                with open(MANUAL_CONTINUE_SIGNAL, "w", encoding="utf-8") as sf:
                    sf.write("continue")
                RPAState.waiting_for_manual = False
                RPAState.manual_message = None
                RPAState.add_log("Пользователь подтвердил ручное исправление — продолжаем выполнение...")
            except Exception as e:
                RPAState.add_log(f"Ошибка сигнала продолжения: {e}")

            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode("utf-8"))

        elif parsed.path == "/start":
            if RPAState.is_running:
                self.send_response(400)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Already running"}).encode("utf-8"))
                return

            RPAState.reset_stats()
            mode = str(payload.get("mode", "vks"))
            limit = int(payload.get("limit", 0))
            sheet = str(payload.get("sheet", "Sheet1"))
            records = payload.get("records")
            config_overrides = payload.get("config")
            json_file = ""
            config_file = ""

            queue_filename = "active_dismissal_queue.json" if mode == "dismissal" else "active_vks_queue.json"
            cfg_filename = "active_dismissal_config.json" if mode == "dismissal" else "active_vks_config.json"

            if records and isinstance(records, list) and len(records) > 0:
                json_file = os.path.join(CURRENT_DIR, queue_filename)
                with open(json_file, "w", encoding="utf-8") as f:
                    json.dump(records, f, ensure_ascii=False, indent=2)
                RPAState.total = len(records)
                RPAState.add_log(f"Получено {len(records)} записей напрямую из Pondera HR UI ({mode.upper()}).")

            if config_overrides and isinstance(config_overrides, dict):
                config_file = os.path.join(CURRENT_DIR, cfg_filename)
                with open(config_file, "w", encoding="utf-8") as cf:
                    json.dump(config_overrides, cf, ensure_ascii=False, indent=2)

            t = threading.Thread(
                target=run_robot_worker,
                args=(mode, limit, sheet, json_file, config_file),
                daemon=True
            )
            RPAState.thread = t
            t.start()

            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "message": "Robot started"}).encode("utf-8"))

        elif parsed.path == "/stop":
            if RPAState.process:
                try:
                    RPAState.process.terminate()
                    RPAState.add_log("Робот принудительно остановлен пользователем.")
                except Exception:
                    pass
            RPAState.is_running = False
            RPAState.waiting_for_manual = False
            RPAState.manual_message = None
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


def main():
    server = HTTPServer(("127.0.0.1", PORT), RPABridgeHandler)
    print("=====================================================")
    print(f"  Pondera HR RPA Bridge Server running on http://127.0.0.1:{PORT}")
    print(f"  Chrome Debugging Port: {CHROME_CDP_PORT}")
    print("=====================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping RPA Bridge Server...")
        server.server_close()


if __name__ == "__main__":
    main()
