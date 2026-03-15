import Database from "@tauri-apps/plugin-sql"

export async function getDB() {
  return await Database.load("sqlite:inventario.db")
}