import path from 'path';
import fs from 'fs';

// Using Node 22 built-in sqlite DatabaseSync
let dbInstance: any = null;

export function getDb() {
  if (!dbInstance) {
    const dbPath = path.join(process.cwd(), 'pondera_hr.db');
    const dbGzPath = path.join(process.cwd(), 'pondera_hr.db.gz');

    // Auto-extract compressed database if raw .db is missing
    if (!fs.existsSync(dbPath) && fs.existsSync(dbGzPath)) {
      const zlib = require('zlib');
      const compressedData = fs.readFileSync(dbGzPath);
      const decompressedData = zlib.gunzipSync(compressedData);
      fs.writeFileSync(dbPath, decompressedData);
    }

    // Dynamically require to avoid client-side bundling issues
    const { DatabaseSync } = require('node:sqlite');
    dbInstance = new DatabaseSync(dbPath);
  }
  return dbInstance;
}
