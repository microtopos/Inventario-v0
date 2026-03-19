import { invoke } from "@tauri-apps/api/core"
import { appDataDir, join } from "@tauri-apps/api/path"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { getBackupDir, setBackupDir } from "./settingsService"

/**
 * Devuelve la carpeta de backups.
 * Si no hay ninguna guardada, usa appDataDir/backups/ sin preguntar al usuario.
 */
async function resolveBackupDir(): Promise<string> {
  const saved = await getBackupDir()
  if (saved) return saved
  const base = await appDataDir()
  const dir = await join(base, "backups")
  await setBackupDir(dir)
  return dir
}

/**
 * Crea una copia de seguridad en la carpeta configurada (o en appDataDir/backups/).
 * Devuelve la ruta completa del archivo creado.
 */
export async function backupDB(): Promise<string> {
  const dir = await resolveBackupDir()
  const path: string = await invoke("backup_database", { destPath: dir })
  return path
}

/**
 * Igual que backupDB pero no lanza errores — para usar en confirmaciones silenciosas.
 */
export async function backupDBSilent(): Promise<void> {
  try {
    await backupDB()
  } catch {
    // silencioso
  }
}

/**
 * Abre el selector de carpeta y guarda la nueva ruta de backups.
 * Devuelve la ruta elegida, o null si se cancela.
 */
export async function changeBackupDir(): Promise<string | null> {
  const selected = await openDialog({
    directory: true,
    title: "Selecciona la carpeta donde guardar las copias de seguridad",
  })
  if (!selected) return null
  const dir = typeof selected === "string" ? selected : (selected as any)[0]
  await setBackupDir(dir)
  return dir
}
