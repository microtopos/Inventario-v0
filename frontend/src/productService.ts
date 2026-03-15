import { getDB } from "./db"
import { deleteProductImage } from "./imageService"

export async function getProductSizes(productId: number) {
  const db = await getDB()
  const rows = await db.select(`
    SELECT id, talla, stock
    FROM tallas
    WHERE producto_id = ?
    ORDER BY talla
  `, [productId])
  return rows
}

export async function updateStock(tallaId: number, stock: number) {
  const db = await getDB()
  const current = await db.select("SELECT stock FROM tallas WHERE id = ?", [tallaId])
  const oldStock = (current as any)[0].stock
  const diff = stock - oldStock
  await db.execute("UPDATE tallas SET stock = ? WHERE id = ?", [stock, tallaId])
  await db.execute("INSERT INTO movimientos (talla_id, cambio) VALUES (?, ?)", [tallaId, diff])
}

export async function createProduct(nombre: string, codigo: string, departamento: number) {
  const db = await getDB()
  await db.execute(
    `INSERT INTO productos (codigo, nombre, departamento_id) VALUES (?, ?, ?)`,
    [codigo || null, nombre, departamento]
  )
}

export async function deleteProduct(productId: number) {
  const db = await getDB()
  await deleteProductImage(productId).catch((e) => console.error("Error borrando imagen:", e))
  // Borrar movimientos antes que tallas (FK: movimientos.talla_id → tallas.id)
  await db.execute(
    "DELETE FROM movimientos WHERE talla_id IN (SELECT id FROM tallas WHERE producto_id = ?)",
    [productId]
  )
  await db.execute("DELETE FROM tallas WHERE producto_id = ?", [productId])
  await db.execute("DELETE FROM productos WHERE id = ?", [productId])
}

export async function getDepartments() {
  const db = await getDB()
  const rows = await db.select("SELECT id, nombre FROM departamentos ORDER BY nombre")
  return rows
}

export async function addDepartment(nombre: string): Promise<number> {
  const db = await getDB()
  await db.execute("INSERT OR IGNORE INTO departamentos (nombre) VALUES (?)", [nombre.trim()])
  const row: any = await db.select("SELECT id FROM departamentos WHERE nombre = ?", [nombre.trim()])
  return row[0].id
}

export async function addStock(tallaId: number, cantidad: number, origen: "manual" | "pedido" = "manual") {
  const db = await getDB()
  const row: any = await db.select("SELECT stock FROM tallas WHERE id = ?", [tallaId])
  const nuevoStock = row[0].stock + cantidad
  await db.execute("UPDATE tallas SET stock = ? WHERE id = ?", [nuevoStock, tallaId])
  await db.execute(
    "INSERT INTO movimientos (talla_id, cambio, origen) VALUES (?, ?, ?)",
    [tallaId, cantidad, origen]
  )
}

export async function updateProduct(productId: number, fields: { nombre: string; codigo: string; departamento_id: number | null }) {
  const db = await getDB()
  await db.execute(
    "UPDATE productos SET nombre = ?, codigo = ?, departamento_id = ? WHERE id = ?",
    [fields.nombre || null, fields.codigo || null, fields.departamento_id, productId]
  )
}

export async function updateProductColor(productId: number, color: string) {
  const db = await getDB()
  await db.execute("UPDATE productos SET color = ? WHERE id = ?", [color || null, productId])
}

export async function getColors(): Promise<string[]> {
  const db = await getDB()
  const rows: any = await db.select("SELECT nombre FROM colores ORDER BY nombre")
  return rows.map((r: any) => r.nombre)
}

export async function addColor(nombre: string): Promise<void> {
  const db = await getDB()
  await db.execute("INSERT OR IGNORE INTO colores (nombre) VALUES (?)", [nombre.trim()])
}

export async function getProductMovements(productId: number) {
  const db = await getDB()
  const rows = await db.select(`
    SELECT
      m.id,
      m.cambio,
      m.fecha,
      m.origen,
      t.talla
    FROM movimientos m
    JOIN tallas t ON t.id = m.talla_id
    WHERE t.producto_id = ?
    ORDER BY m.fecha DESC
    LIMIT 100
  `, [productId])
  return rows
}

export async function duplicateProduct(productId: number, nombre?: string, codigo?: string): Promise<number> {
  const db = await getDB()

  const original: any = await db.select(
    "SELECT codigo, nombre, departamento_id, color FROM productos WHERE id = ?",
    [productId]
  )
  const p = original[0]
  await db.execute(
    "INSERT INTO productos (codigo, nombre, departamento_id, color) VALUES (?, ?, ?, ?)",
    [codigo ?? p.codigo ?? null, nombre ?? `${p.nombre} (copia)`, p.departamento_id, p.color || null]
  )
  const row: any = await db.select("SELECT last_insert_rowid() as id")
  const newId = row[0].id

  const tallas: any = await db.select(
    "SELECT talla FROM tallas WHERE producto_id = ?",
    [productId]
  )
  for (const t of tallas) {
    await db.execute(
      "INSERT INTO tallas (producto_id, talla, stock) VALUES (?, ?, 0)",
      [newId, t.talla]
    )
  }

  return newId
}
