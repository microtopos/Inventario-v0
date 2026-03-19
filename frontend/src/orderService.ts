import { getDB } from "./db"
import { addStock } from "./productService"

// ─── Pedidos normales ─────────────────────────────────────────────────────────

export async function getOrders() {
  const db = await getDB()
  const orders: any = await db.select(`
    SELECT
      p.id,
      p.fecha,
      p.recibido,
      p.notas,
      COUNT(pi.id) as num_lineas,
      SUM(CASE WHEN pi.estado = 'recibido' THEN 1 ELSE 0 END) as lineas_recibidas,
      SUM(CASE WHEN pi.estado = 'cancelado' THEN 1 ELSE 0 END) as lineas_canceladas,
      SUM(COALESCE(pi.cantidad_acordada, pi.cantidad)) as total_unidades
    FROM pedidos p
    LEFT JOIN pedido_items pi ON pi.pedido_id = p.id
    WHERE p.borrador = 0
    GROUP BY p.id
    ORDER BY p.fecha DESC
  `)
  return orders
}

export async function getOrderDetail(orderId: number) {
  const db = await getDB()
  const items: any = await db.select(`
    SELECT
      pi.id,
      pi.cantidad,
      pi.cantidad_acordada,
      pi.cantidad_recibida,
      pi.estado,
      t.talla,
      t.id as talla_id,
      t.stock as stock_actual,
      pr.nombre as producto_nombre,
      pr.codigo as producto_codigo,
      pr.color as producto_color
    FROM pedido_items pi
    JOIN tallas t ON t.id = pi.talla_id
    JOIN productos pr ON pr.id = t.producto_id
    WHERE pi.pedido_id = ?
    ORDER BY pr.nombre, t.talla
  `, [orderId])
  return items
}

async function checkAndCloseOrder(orderId: number): Promise<void> {
  const db = await getDB()
  const rows: any = await db.select(
    "SELECT COUNT(*) as total FROM pedido_items WHERE pedido_id = ? AND estado NOT IN ('recibido','cancelado')",
    [orderId]
  )
  const remaining = Number(rows?.[0]?.total) || 0
  if (remaining === 0) {
    await db.execute(
      "UPDATE pedidos SET recibido = 1, fecha_recibido = datetime('now', 'localtime') WHERE id = ?",
      [orderId]
    )
  }
}

export async function receiveItem(itemId: number): Promise<void> {
  const db = await getDB()

  const rows: any = await db.select(
    "SELECT id, pedido_id, talla_id, cantidad, cantidad_acordada, estado FROM pedido_items WHERE id = ?",
    [itemId]
  )
  const it = rows?.[0]
  if (!it) throw new Error("Ítem no encontrado")

  const estado = String(it.estado ?? "pendiente")
  if (estado !== "pendiente" && estado !== "modificado") {
    throw new Error("Este ítem ya fue recibido o no se puede recibir")
  }

  const effective = Number(it.cantidad_acordada ?? it.cantidad) || 0

  await addStock(Number(it.talla_id), effective, "pedido")
  await db.execute(
    "UPDATE pedido_items SET estado = 'recibido', cantidad_recibida = ? WHERE id = ?",
    [effective, itemId]
  )
  await checkAndCloseOrder(Number(it.pedido_id))
}

export async function receivePrendaItems(itemIds: number[]): Promise<void> {
  if (itemIds.length === 0) return
  const db = await getDB()

  // Fetch all items in one query
  const placeholders = itemIds.map(() => "?").join(",")
  const rows: any = await db.select(
    `SELECT id, pedido_id, talla_id, cantidad, cantidad_acordada, estado FROM pedido_items WHERE id IN (${placeholders})`,
    itemIds
  )

  let pedidoId: number | null = null
  for (const it of rows) {
    const estado = String(it.estado ?? "pendiente")
    if (estado !== "pendiente" && estado !== "modificado") continue
    const effective = Number(it.cantidad_acordada ?? it.cantidad) || 0
    await addStock(Number(it.talla_id), effective, "pedido")
    await db.execute(
      "UPDATE pedido_items SET estado = 'recibido', cantidad_recibida = ? WHERE id = ?",
      [effective, Number(it.id)]
    )
    if (pedidoId === null) pedidoId = Number(it.pedido_id)
  }

  if (pedidoId !== null) {
    await checkAndCloseOrder(pedidoId)
  }
}

export async function modifyItem(itemId: number, nuevaCantidad: number | null): Promise<void> {
  const db = await getDB()

  const rows: any = await db.select(
    "SELECT id, pedido_id, cantidad, estado FROM pedido_items WHERE id = ?",
    [itemId]
  )
  const it = rows?.[0]
  if (!it) throw new Error("Ítem no encontrado")

  const estado = String(it.estado ?? "pendiente")
  if (estado !== "pendiente") {
    throw new Error("Solo se puede modificar un ítem pendiente")
  }

  const next = nuevaCantidad === null ? null : Math.max(0, Number(nuevaCantidad) || 0)

  if (next === null || next === 0) {
    await db.execute(
      "UPDATE pedido_items SET cantidad_acordada = 0, estado = 'cancelado' WHERE id = ?",
      [itemId]
    )
  } else {
    await db.execute(
      "UPDATE pedido_items SET cantidad_acordada = ?, estado = 'modificado' WHERE id = ?",
      [next, itemId]
    )
  }
  await checkAndCloseOrder(Number(it.pedido_id))
}

export async function updateOrderNotes(orderId: number, notas: string): Promise<void> {
  const db = await getDB()
  await db.execute("UPDATE pedidos SET notas = ? WHERE id = ?", [notas || null, orderId])
}

export async function deleteOrder(orderId: number) {
  const db = await getDB()
  const check: any = await db.select(
    "SELECT COUNT(*) as total FROM pedido_items WHERE pedido_id = ? AND estado = 'recibido'",
    [orderId]
  )
  if ((check?.[0]?.total ?? 0) > 0) throw new Error("No se puede eliminar un pedido con líneas ya recibidas")
  await db.execute("DELETE FROM pedido_items WHERE pedido_id = ?", [orderId])
  await db.execute("DELETE FROM pedidos WHERE id = ?", [orderId])
}

// ─── Borrador ─────────────────────────────────────────────────────────────────
// Un borrador es un pedido con borrador = 1.
// Solo puede existir uno a la vez. Se crea al primer cambio y se reutiliza
// entre sesiones hasta que se confirma o descarta explícitamente.

/** Carga el borrador activo. Devuelve { id, items } o null si no existe. */
export async function loadDraft(): Promise<{ id: number; items: Record<number, number>; notas: string } | null> {
  const db = await getDB()
  const rows: any = await db.select(
    "SELECT id, notas FROM pedidos WHERE borrador = 1 ORDER BY id DESC LIMIT 1"
  )
  if (!rows || rows.length === 0) return null

  const draftId: number = rows[0].id
  const notas: string = (rows[0].notas ?? "") as string
  const itemRows: any = await db.select(
    "SELECT talla_id, cantidad FROM pedido_items WHERE pedido_id = ?",
    [draftId]
  )

  const items: Record<number, number> = {}
  for (const r of itemRows) {
    items[Number(r.talla_id)] = Number(r.cantidad)
  }

  return { id: draftId, items, notas }
}

/**
 * Sincroniza el borrador con el estado actual del pedido en memoria.
 * - Si no existe borrador aún, lo crea.
 * - Si items está vacío, descarta el borrador y devuelve null.
 * - Devuelve el id del borrador activo.
 */
export async function syncDraft(
  draftId: number | null,
  items: Record<number, number>,
  notas: string
): Promise<number | null> {
  const db = await getDB()

  const entries = Object.entries(items).filter(([, v]) => Number(v) > 0)

  if (entries.length === 0) {
    if (draftId !== null) {
      await db.execute("DELETE FROM pedido_items WHERE pedido_id = ?", [draftId])
      await db.execute("DELETE FROM pedidos WHERE id = ?", [draftId])
    }
    return null
  }

  let id = draftId
  if (id === null) {
    await db.execute("INSERT INTO pedidos (borrador, notas) VALUES (1, ?)", [notas || null])
    const row: any = await db.select("SELECT last_insert_rowid() as id")
    id = row[0].id as number
  }
  // Mantén las notas sincronizadas con el borrador
  await db.execute("UPDATE pedidos SET notas = ? WHERE id = ?", [notas || null, id])

  // Reemplaza todos los items del borrador
  await db.execute("DELETE FROM pedido_items WHERE pedido_id = ?", [id])
  for (const [tallaId, cantidad] of entries) {
    await db.execute(
      "INSERT INTO pedido_items (pedido_id, talla_id, cantidad) VALUES (?, ?, ?)",
      [id, Number(tallaId), Number(cantidad)]
    )
  }

  return id
}

/** Elimina el borrador de la DB. */
export async function discardDraft(draftId: number): Promise<void> {
  const db = await getDB()
  await db.execute("DELETE FROM pedido_items WHERE pedido_id = ?", [draftId])
  await db.execute("DELETE FROM pedidos WHERE id = ?", [draftId])
}

/**
 * Convierte el borrador en un pedido real (borrador = 0, recibido = 0).
 * Devuelve el id del pedido confirmado.
 */
export async function confirmDraft(draftId: number, notas?: string): Promise<number> {
  const db = await getDB()

  const check: any = await db.select(
    "SELECT COUNT(*) as total FROM pedido_items WHERE pedido_id = ?",
    [draftId]
  )
  if (!check[0] || check[0].total === 0) throw new Error("El pedido está vacío")

  if (notas !== undefined) {
    await db.execute("UPDATE pedidos SET notas = ? WHERE id = ?", [notas || null, draftId])
  }
  await db.execute(
    "UPDATE pedidos SET borrador = 0, recibido = 0 WHERE id = ?",
    [draftId]
  )
  return draftId
}
