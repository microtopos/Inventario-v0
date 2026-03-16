import { getDB } from "./db"

export async function getInventory(): Promise<any[]> {
  const db = await getDB()
  const rows: any = await db.select(`
    SELECT
      p.id,
      p.codigo,
      p.nombre,
      p.departamento_id,
      p.color,
      d.nombre as departamento,
      IFNULL(SUM(t.stock), 0) as stock,
      MIN(t.stock) as min_stock
    FROM productos p
    LEFT JOIN departamentos d ON d.id = p.departamento_id
    LEFT JOIN tallas t ON t.producto_id = p.id
    GROUP BY p.id
    ORDER BY p.nombre
  `)
  return rows as any[]
}

// Devuelve un mapa { producto_id: [{ talla, stock }] } solo con tallas de stock bajo (≤ threshold)
export async function getLowStockTallas(threshold: number): Promise<Record<number, { talla: string; stock: number }[]>> {
  const db = await getDB()
  const rows: any = await db.select(`
    SELECT producto_id, talla, stock
    FROM tallas
    WHERE stock <= ?
    ORDER BY producto_id, talla
  `, [threshold])
  const map: Record<number, { talla: string; stock: number }[]> = {}
  for (const r of rows) {
    if (!map[r.producto_id]) map[r.producto_id] = []
    map[r.producto_id].push({ talla: r.talla, stock: r.stock })
  }
  return map
}

export async function getProductsWithSizes(): Promise<any[]> {
  const db = await getDB()
  const productos: any = await db.select(`
    SELECT p.id, p.codigo, p.nombre, p.color, d.nombre as departamento
    FROM productos p
    LEFT JOIN departamentos d ON d.id = p.departamento_id
    ORDER BY p.nombre
  `)
  for (const p of productos) {
    const tallas: any = await db.select(`
      SELECT id, talla, stock FROM tallas
      WHERE producto_id = ? ORDER BY talla
    `, [p.id])
    p.tallas = tallas
  }
  return productos as any[]
}

export async function getAllMovements(): Promise<any[]> {
  const db = await getDB()
  const rows: any = await db.select(`
    SELECT
      m.id,
      m.cambio,
      m.fecha,
      t.talla,
      p.nombre as producto,
      p.codigo,
      p.color,
      d.nombre as departamento
    FROM movimientos m
    JOIN tallas t ON t.id = m.talla_id
    JOIN productos p ON p.id = t.producto_id
    LEFT JOIN departamentos d ON d.id = p.departamento_id
    ORDER BY m.fecha DESC
  `)
  return rows as any[]
}
