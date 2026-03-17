import { invoke } from "@tauri-apps/api/core"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { getBackupDir, setBackupDir } from "./settingsService"

function normalizeDir(selected: unknown): string | null {
  if (!selected) return null
  return typeof selected === "string" ? selected : (selected as any)[0]
}

export async function resolveBackupDir(): Promise<string> {
  const saved = await getBackupDir()
  if (saved) return saved
  const selected = await openDialog({ directory: true, title: "Selecciona la carpeta donde guardar las copias de seguridad" })
  const dir = normalizeDir(selected)
  if (!dir) throw new Error("Selección cancelada")
  await setBackupDir(dir)
  return dir
}

export async function changeBackupDir(): Promise<string | null> {
  const selected = await openDialog({ directory: true, title: "Selecciona la carpeta donde guardar las copias de seguridad" })
  const dir = normalizeDir(selected)
  if (!dir) return null
  await setBackupDir(dir)
  return dir
}

export async function backupDB(): Promise<string> {
  const dir = await resolveBackupDir()
  const savedPath: string = await invoke("backup_database", { destPath: dir })
  return savedPath
}

// Backup silencioso: si no hay carpeta configurada, no hace nada.
export async function backupDBSilent(): Promise<string | null> {
  try {
    const dir = await getBackupDir()
    if (!dir) return null
    const savedPath: string = await invoke("backup_database", { destPath: dir })
    return savedPath
  } catch {
    return null
  }
}

