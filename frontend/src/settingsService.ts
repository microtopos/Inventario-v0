import { getDB } from "./db"

async function ensureTable(): Promise<void> {
  const db = await getDB()
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)
}

export async function getSetting(key: string): Promise<string | null> {
  try {
    await ensureTable()
    const db = await getDB()
    const rows: any = await db.select("SELECT value FROM settings WHERE key = ?", [key])
    return rows?.[0]?.value ?? null
  } catch {
    return null
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  try {
    await ensureTable()
    const db = await getDB()
    await db.execute(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value]
    )
  } catch (e) {
    console.error("Error guardando ajuste:", e)
  }
}

export async function getExportDir(): Promise<string | null> {
  return getSetting("exportDir")
}

export async function setExportDir(dir: string): Promise<void> {
  return setSetting("exportDir", dir)
}
