import os
import sqlite3
from datetime import datetime

DB_PATH = "pondera_hr.db"
INITIAL_ADMIN_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "").strip()


def init_users_table():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        scope_type TEXT NOT NULL,
        scope_value TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """)

    cursor.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()[0]

    if count == 0:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        seed_users = [
            (
                "Sistem Yöneticisi (Admin)",
                "admin@pondera.com",
                INITIAL_ADMIN_HASH,
                "admin",
                "all",
                "all",
                now,
            ),
        ]

        cursor.executemany("""
        INSERT INTO users (name, email, password, role, scope_type, scope_value, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, seed_users)
        conn.commit()
        print("Users table created and initial admin user seeded with scrypt hash.")
    else:
        print(f"Users table already has {count} users.")

    conn.close()


if __name__ == "__main__":
    init_users_table()
