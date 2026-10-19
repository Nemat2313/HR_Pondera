import sqlite3
from datetime import datetime

DB_PATH = "pondera_hr.db"

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

    # Seed default users if empty
    cursor.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()[0]

    if count == 0:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        seed_users = [
            (
                "Sistem Yöneticisi (Admin)",
                "admin@pondera.com",
                "admin123",
                "admin",
                "all",
                "all",
                now,
            ),
            (
                "Kazan Şantiye Sorumlusu",
                "kazan@pondera.com",
                "kazan123",
                "user",
                "region",
                "Kazan",
                now,
            ),
            (
                "Svobodny Şantiye Müdürü",
                "svobodny@pondera.com",
                "svobodny123",
                "user",
                "region",
                "Svobodny-AGHK",
                now,
            ),
            (
                "Ust Luga Saha Sorumlusu",
                "ustluga@pondera.com",
                "ustluga123",
                "user",
                "region",
                "Ust Luga",
                now,
            ),
            (
                "Tobolsk DGP-2 Proje Lideri",
                "dgp02@pondera.com",
                "dgp123",
                "user",
                "project",
                "DGP-02",
                now,
            ),
        ]

        cursor.executemany("""
        INSERT INTO users (name, email, password, role, scope_type, scope_value, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, seed_users)
        conn.commit()
        print(f"Users table created and {len(seed_users)} default users seeded!")
    else:
        print(f"Users table already has {count} users.")

    conn.close()

if __name__ == "__main__":
    init_users_table()
