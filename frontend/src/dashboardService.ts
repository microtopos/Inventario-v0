import { getDB } from "./db"

function buildDateRangeWhere(
  column: string,
  desde?: string,
  hasta?: string
): { whereSql: string; params: any[] } {
  const where: string[] = []
  const params: any[] = []

  if (desde) {
    where.push(`date(${column}) >= date(?)`)
    params.push(desde)
  }
  if (hasta) {
    where.push(`date(${column}) <= date(?)`)
    params.push(hasta)
  }

  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", params }
}

export async function getStockPorDepartamento(): Promise<
  { departamento: string; stock: number }[]
> {
  const db = await getDB()
  const rows: any = await db.select(`
    SELECT
      COALESCE(d.nombre, '(Sin departamento)') as departamento,
      IFNULL(SUM(t.stock), 0) as stock
    FROM tallas t
    JOIN productos p ON p.id = t.producto_id
    LEFT JOIN departamentos d ON d.id = p.departamento_id
    GROUP BY COALESCE(d.nombre, '(Sin departamento)')
    ORDER BY stock DESC, departamento ASC
  `)
  return rows.map((r: any) => ({ departamento: r.departamento, stock: Number(r.stock) || 0 }))
}

export async function getEntradasPorDepartamento(
  desde?: string,
  hasta?: string
): Promise<{ mes: string; departamento: string; total: number }[]> {
  const db = await getDB()
  const { whereSql, params } = buildDateRangeWhere("m.fecha", desde, hasta)
  const rows: any = await db.select(
    `
      SELECT
        strftime('%Y-%m', m.fecha) as mes,
        COALESCE(d.nombre, '(Sin departamento)') as departamento,
        IFNULL(SUM(m.cambio), 0) as total
      FROM movimientos m
      JOIN tallas t ON t.id = m.talla_id
      JOIN productos p ON p.id = t.producto_id
      LEFT JOIN departamentos d ON d.id = p.departamento_id
      ${whereSql ? `${whereSql} AND m.cambio > 0` : "WHERE m.cambio > 0"}
      GROUP BY mes, COALESCE(d.nombre, '(Sin departamento)')
      ORDER BY mes ASC, departamento ASC
    `,
    params
  )
  return rows.map((r: any) => ({
    mes: r.mes,
    departamento: r.departamento,
    total: Number(r.total) || 0,
  }))
}

export async function getConsumoPorDepartamento(
  desde?: string,
  hasta?: string
): Promise<{ mes: string; departamento: string; total: number }[]> {
  const db = await getDB()
  const { whereSql, params } = buildDateRangeWhere("m.fecha", desde, hasta)
  const rows: any = await db.select(
    `
      SELECT
        strftime('%Y-%m', m.fecha) as mes,
        COALESCE(d.nombre, '(Sin departamento)') as departamento,
        IFNULL(SUM(ABS(m.cambio)), 0) as total
      FROM movimientos m
      JOIN tallas t ON t.id = m.talla_id
      JOIN productos p ON p.id = t.producto_id
      LEFT JOIN departamentos d ON d.id = p.departamento_id
      ${whereSql ? `${whereSql} AND m.cambio < 0` : "WHERE m.cambio < 0"}
      GROUP BY mes, COALESCE(d.nombre, '(Sin departamento)')
      ORDER BY mes ASC, departamento ASC
    `,
    params
  )
  return rows.map((r: any) => ({
    mes: r.mes,
    departamento: r.departamento,
    total: Number(r.total) || 0,
  }))
}

export async function getMovimientosCount(
  desde?: string,
  hasta?: string
): Promise<number> {
  const db = await getDB()
  const { whereSql, params } = buildDateRangeWhere("m.fecha", desde, hasta)
  const rows: any = await db.select(
    `SELECT COUNT(*) as total
     FROM movimientos m
     JOIN tallas t ON t.id = m.talla_id
     JOIN productos p ON p.id = t.producto_id
     LEFT JOIN departamentos d ON d.id = p.departamento_id
     ${whereSql}`,
    params
  )
  return Number(rows[0]?.total) || 0
}

export async function getMovimientos(
  desde?: string,
  hasta?: string,
  limit = 25,
  offset = 0
): Promise<
  {
    id: number
    fecha: string
    cambio: number
    origen: string | null
    talla: string
    producto: string
    codigo: string | null
    color: string | null
    departamento: string
  }[]
> {
  const db = await getDB()
  const { whereSql, params } = buildDateRangeWhere("m.fecha", desde, hasta)
  const rows: any = await db.select(
    `
      SELECT
        m.id,
        m.fecha,
        m.cambio,
        m.origen,
        t.talla,
        p.nombre as producto,
        p.codigo,
        p.color,
        COALESCE(d.nombre, '(Sin departamento)') as departamento
      FROM movimientos m
      JOIN tallas t ON t.id = m.talla_id
      JOIN productos p ON p.id = t.producto_id
      LEFT JOIN departamentos d ON d.id = p.departamento_id
      ${whereSql}
      ORDER BY m.fecha DESC
      LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  )
  return rows.map((r: any) => ({
    id: Number(r.id),
    fecha: r.fecha,
    cambio: Number(r.cambio) || 0,
    origen: r.origen ?? null,
    talla: r.talla,
    producto: r.producto,
    codigo: r.codigo ?? null,
    color: r.color ?? null,
    departamento: r.departamento,
  }))
}

