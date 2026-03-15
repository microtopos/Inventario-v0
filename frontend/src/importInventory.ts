import { getDB } from "./db"
import inventario from "./data/inventario.json"

export async function importInventory() {

  const db = await getDB()

  const check = await db.select(
    "SELECT COUNT(*) as total FROM departamentos"
  )

  if ((check as any)[0].total > 0) {
    console.log("Inventario ya importado")
    return
  }

  console.log("Importando inventario...")

  for (const d of inventario.departamentos) {

    await db.execute(
      "INSERT OR IGNORE INTO departamentos (id, nombre) VALUES (?, ?)",
      [d.id, d.nombre]
    )

  }

  for (const p of inventario.productos) {

    await db.execute(
      "INSERT OR IGNORE INTO productos (id, codigo, nombre, departamento_id) VALUES (?, ?, ?, ?)",
      [p.id, p.sku, p.nombre, p.departamento_id]
    )

    for (const s of p.stock) {

      await db.execute(
        "INSERT OR IGNORE INTO tallas (producto_id, talla, stock) VALUES (?, ?, ?)",
        [p.id, s.talla, s.cantidad]
      )

    }

  }

  console.log("Inventario importado correctamente")

}