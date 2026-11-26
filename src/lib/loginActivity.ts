export function getMoscowDateParts(now = new Date()): {
  timestamp: string;
  dateIso: string;
  hour: number;
  dayOfWeek: number; // 0 = Mon .. 6 = Sun
} {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const yyyy = map.year || '2026';
  const mm = map.month || '01';
  const dd = map.day || '01';
  const hh = map.hour === '24' ? '00' : map.hour || '00';
  const min = map.minute || '00';
  const sec = map.second || '00';
  const wkMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return {
    timestamp: `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`,
    dateIso: `${yyyy}-${mm}-${dd}`,
    hour: Number(hh) || 0,
    dayOfWeek: wkMap[map.weekday || 'Mon'] ?? 0,
  };
}

export function extractClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const cf = request.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf.slice(0, 64);
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 64);
  return '';
}

export function parseDeviceLabel(uaRaw: string | null): string {
  const ua = String(uaRaw || '');
  if (!ua) return 'Bilinmeyen';

  let browser = 'Tarayıcı';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/YaBrowser/i.test(ua)) browser = 'Yandex';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';

  let os = 'Masaüstü';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return `${browser} · ${os}`;
}

export function ensureLoginLogTables(db: any): void {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_login_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        scope_value TEXT NOT NULL DEFAULT 'all',
        event_type TEXT NOT NULL DEFAULT 'login',
        login_at TEXT NOT NULL,
        login_date TEXT NOT NULL,
        login_hour INTEGER NOT NULL DEFAULT 0,
        day_of_week INTEGER NOT NULL DEFAULT 0,
        ip_address TEXT DEFAULT '',
        device_label TEXT DEFAULT '',
        user_agent TEXT DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_login_logs_user ON user_login_logs(user_id, login_at);
      CREATE INDEX IF NOT EXISTS idx_login_logs_date ON user_login_logs(login_date);
      CREATE INDEX IF NOT EXISTS idx_login_logs_at ON user_login_logs(login_at);
    `);
    try {
      db.exec('ALTER TABLE users ADD COLUMN last_login_at TEXT DEFAULT NULL');
    } catch {}
    try {
      db.exec('ALTER TABLE users ADD COLUMN login_count INTEGER NOT NULL DEFAULT 0');
    } catch {}
  } catch {}
}

export function recordUserLoginEvent(
  db: any,
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    scope_value?: string;
  },
  request: Request,
  eventType: 'login' | 'session_visit' = 'login'
): void {
  if (!db || !user?.id) return;
  try {
    ensureLoginLogTables(db);
    const msk = getMoscowDateParts();
    const ip = extractClientIp(request);
    const ua = String(request.headers.get('user-agent') || '').slice(0, 260);
    const device = parseDeviceLabel(ua);

    if (eventType === 'session_visit') {
      // Deduplicate session pings: log at most once per 4 hours or on a new Moscow calendar date
      const lastRow = db
        .prepare(
          'SELECT login_at, login_date FROM user_login_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1'
        )
        .get(Number(user.id)) as { login_at?: string; login_date?: string } | undefined;
      if (lastRow?.login_at) {
        const sameDay = lastRow.login_date === msk.dateIso;
        const lastMs = Date.parse(String(lastRow.login_at).replace(' ', 'T') + '+03:00');
        const curMs = Date.parse(msk.timestamp.replace(' ', 'T') + '+03:00');
        if (sameDay && !Number.isNaN(lastMs) && !Number.isNaN(curMs) && curMs - lastMs < 4 * 60 * 60 * 1000) {
          // Still keep users.last_login_at fresh
          db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(msk.timestamp, Number(user.id));
          return;
        }
      }
    }

    db.prepare(`
      INSERT INTO user_login_logs (
        user_id, email, name, role, scope_value, event_type,
        login_at, login_date, login_hour, day_of_week,
        ip_address, device_label, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(user.id),
      String(user.email || '').toLowerCase(),
      String(user.name || ''),
      String(user.role || 'user'),
      String(user.scope_value || 'all'),
      eventType,
      msk.timestamp,
      msk.dateIso,
      msk.hour,
      msk.dayOfWeek,
      ip,
      device,
      ua
    );

    db.prepare(`
      UPDATE users
      SET last_login_at = ?, login_count = COALESCE(login_count, 0) + 1
      WHERE id = ?
    `).run(msk.timestamp, Number(user.id));
  } catch {
    // Non-blocking: never fail authentication due to logging error
  }
}
