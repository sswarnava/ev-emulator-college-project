import { createClient } from "@libsql/client";

// Local SQLite file: ev-sim.db (auto-created)
export const db = createClient({
  url: "file:./ev-sim.db"
});

// Initialize schema
export async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      chargerId TEXT,
      start_ts TEXT,
      stop_ts TEXT,
      energy_kWh REAL DEFAULT 0,
      status TEXT,
      stop_reason TEXT
    );
  `);
  // Add duration columns if not exist
  try {
    await db.execute(`ALTER TABLE sessions ADD COLUMN duration_seconds REAL DEFAULT 0`);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('duplicate column')) throw e;
  }
  try {
    await db.execute(`ALTER TABLE sessions ADD COLUMN duration_minutes REAL DEFAULT 0`);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('duplicate column')) throw e;
  }
  try {
    await db.execute(`ALTER TABLE sessions ADD COLUMN duration_human TEXT`);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('duplicate column')) throw e;
  }
  try {
    await db.execute(`ALTER TABLE sessions ADD COLUMN bill_amount REAL DEFAULT 0`);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('duplicate column')) throw e;
  }
}

export async function insertSessionStart(id: string, chargerId: string, start_ts: string) {
  if (await sessionExists(id)) {
    const err = new Error("SESSION_EXISTS");
    (err as any).code = "SESSION_EXISTS";
    throw err;
  }
  await db.execute({
    sql: `INSERT INTO sessions (id, chargerId, start_ts, status) VALUES (?, ?, ?, ?)`,
    args: [id, chargerId, start_ts, "STARTED"],
  });
}

export async function sessionExists(id: string) {
  const result = await db.execute({
    sql: "SELECT id FROM sessions WHERE id = ?",
    args: [id],
  });
  return result.rows.length > 0;
}

export async function getSessionStartTime(sessionId: string): Promise<string | null> {
  const result = await db.execute({
    sql: `SELECT start_ts FROM sessions WHERE id = ?`,
    args: [sessionId],
  });
  if (result.rows.length > 0) {
    return result.rows[0].start_ts as string;
  }
  return null;
}

export async function getSessionById(id: string) {
  const result = await db.execute({
    sql: `SELECT * FROM sessions WHERE id = ?`,
    args: [id],
  });
  return result.rows?.[0] ?? null;
}

export async function updateSessionStop(id: string, stop_ts: string, energy_kWh: number, stop_reason: string, duration_seconds: number, duration_minutes: number, duration_human: string, bill_amount: number) {
  await db.execute({
    sql: `
      UPDATE sessions
      SET stop_ts = ?, energy_kWh = ?, status = ?, stop_reason = ?, duration_seconds = ?, duration_minutes = ?, duration_human = ?, bill_amount = ?
      WHERE id = ?
    `,
    args: [stop_ts, energy_kWh, "STOPPED", stop_reason, duration_seconds, duration_minutes, duration_human, bill_amount, id],
  });
}