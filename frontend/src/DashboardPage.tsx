import { useEffect, useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { endOfYear, format, startOfYear, subDays, subMonths } from "date-fns"
import {
  getConsumoPorDepartamento,
  getEntradasPorDepartamento,
  getMovimientosCount,
  getMovimientosPaged,
  getStockPorDepartamento,
} from "./dashboardService"
import AppHeader from "./AppHeader"

type RangePreset = "7d" | "1m" | "3m" | "year" | "all"

function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd")
}

function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

function fmtFechaHora(fecha: string): string {
  if (!fecha) return "—"
  try {
    return new Date(fecha).toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return String(fecha)
  }
}

function pivotByMes(rows: { mes: string; departamento: string; total: number }[]) {
  const byMes = new Map<string, Record<string, any>>()
  const departmentsSet = new Set<string>()

  for (const r of rows) {
    departmentsSet.add(r.departamento)
    if (!byMes.has(r.mes)) byMes.set(r.mes, { mes: r.mes })
    byMes.get(r.mes)![r.departamento] = r.total
  }

  const departments = Array.from(departmentsSet).sort((a, b) => a.localeCompare(b))
  const data = Array.from(byMes.values())
    .sort((a, b) => String(a.mes).localeCompare(String(b.mes)))
    .map((row) => {
      for (const dep of departments) {
        if (row[dep] === undefined) row[dep] = 0
      }
      return row
    })

  return { data, departments }
}

const COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#f43f5e",
  "#3b82f6",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
]

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      backgroundColor: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: "10px",
      padding: "10px 14px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
      fontSize: "13px",
      minWidth: "140px",
    }}>
      <div style={{ fontWeight: 700, color: "#374151", marginBottom: "6px", fontSize: "12px" }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: p.color, flexShrink: 0, display: "inline-block" }} />
          <span style={{ color: "#6b7280", flex: 1 }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: "#111" }}>{p.value?.toLocaleString("es-ES")}</span>
        </div>
      ))}
    </div>
  )
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div style={{
      backgroundColor: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: "10px",
      padding: "10px 14px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
      fontSize: "13px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: p.payload.fill, display: "inline-block" }} />
        <span style={{ fontWeight: 700, color: "#111" }}>{p.name}</span>
      </div>
      <div style={{ marginTop: "4px", color: "#6b7280" }}>
        {p.value?.toLocaleString("es-ES")} ud. · <strong style={{ color: "#111" }}>{p.payload.pct}%</strong>
      </div>
    </div>
  )
}

function sumByDepartamento(pivot: ReturnType<typeof pivotByMes>) {
  const totals: Record<string, number> = {}
  for (const row of pivot.data) {
    for (const dep of pivot.departments) {
      totals[dep] = (totals[dep] || 0) + (Number(row[dep]) || 0)
    }
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0)
  return Object.entries(totals)
    .map(([name, value]) => ({ name, value, pct: total > 0 ? Math.round((value / total) * 100) : 0 }))
    .sort((a, b) => b.value - a.value)
}

// KPI totals helpers
function sumPivot(pivot: ReturnType<typeof pivotByMes>): number {
  return pivot.data.reduce((acc, row) => {
    return acc + pivot.departments.reduce((s, dep) => s + (Number(row[dep]) || 0), 0)
  }, 0)
}

function PieDonut({ data, colorOffset }: { data: { name: string; value: number; pct: number }[]; colorOffset: number }) {
  if (data.length === 0 || data.every(d => d.value === 0)) {
    return (
      <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc", fontSize: "13px" }}>
        Sin datos en el período
      </div>
    )
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0", padding: "12px 16px 20px" }}>
      {/* Pie */}
      <div style={{ width: "180px", height: "180px", flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[(i + colorOffset) % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "7px", paddingLeft: "8px" }}>
        {data.map((d, i) => (
          <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              width: "10px", height: "10px", borderRadius: "3px", flexShrink: 0,
              backgroundColor: COLORS[(i + colorOffset) % COLORS.length],
            }} />
            <span style={{ fontSize: "12px", color: "#555", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {d.name}
            </span>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#111", marginLeft: "4px" }}>
              {d.pct}%
            </span>
            <span style={{ fontSize: "11px", color: "#aaa" }}>
              {d.value.toLocaleString("es-ES")}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage({ onNavigate }: { onNavigate: (page: any) => void }) {
  const [desde, setDesde] = useState<string>("")
  const [hasta, setHasta] = useState<string>("")
  const [preset, setPreset] = useState<RangePreset>("all")

  const [stock, setStock] = useState<{ departamento: string; stock: number }[]>([])
  const [entradas, setEntradas] = useState<{ mes: string; departamento: string; total: number }[]>([])
  const [consumo, setConsumo] = useState<{ mes: string; departamento: string; total: number }[]>([])
  const [movs, setMovs] = useState<any[]>([])
  const [movsTotal, setMovsTotal] = useState(0)
  const [movsPage, setMovsPage] = useState(0)
  const [movsPageSize, setMovsPageSize] = useState(10)
  const [loading, setLoading] = useState(false)

  function applyPreset(p: RangePreset) {
    setPreset(p)
    const now = new Date()
    if (p === "all") { setDesde(""); setHasta(""); return }
    if (p === "7d") { setDesde(toISODate(subDays(now, 6))); setHasta(toISODate(now)); return }
    if (p === "1m") { setDesde(toISODate(subMonths(now, 1))); setHasta(toISODate(now)); return }
    if (p === "3m") { setDesde(toISODate(subMonths(now, 3))); setHasta(toISODate(now)); return }
    if (p === "year") {
      setDesde(toISODate(startOfYear(now)))
      setHasta(toISODate(endOfYear(now) > now ? now : endOfYear(now)))
    }
  }

  useEffect(() => {
    applyPreset("all")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const d = desde?.trim() || undefined
        const h = hasta?.trim() || undefined
        const [s, e, c, total] = await Promise.all([
          getStockPorDepartamento(),
          getEntradasPorDepartamento(d, h),
          getConsumoPorDepartamento(d, h),
          getMovimientosCount(d, h),
        ])
        setStock(s)
        setEntradas(e)
        setConsumo(c)
        setMovsTotal(total)
        setMovsPage(0)
        const first = await getMovimientosPaged(movsPageSize, 0, d, h)
        setMovs(first)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [desde, hasta, movsPageSize])

  async function loadMovsPage(page: number, pageSize = movsPageSize) {
    const d = desde?.trim() || undefined
    const h = hasta?.trim() || undefined
    const rows = await getMovimientosPaged(pageSize, page * pageSize, d, h)
    setMovs(rows as any[])
    setMovsPage(page)
  }

  const entradasPivot = useMemo(() => pivotByMes(entradas), [entradas])
  const consumoPivot = useMemo(() => pivotByMes(consumo), [consumo])
  const totalMovsPages = useMemo(() => Math.max(1, Math.ceil(movsTotal / movsPageSize)), [movsTotal, movsPageSize])

  const totalStock = useMemo(() => stock.reduce((a, r) => a + r.stock, 0), [stock])
  const totalConsumo = useMemo(() => sumPivot(consumoPivot), [consumoPivot])
  const totalEntradas = useMemo(() => sumPivot(entradasPivot), [entradasPivot])

  const presets: { key: RangePreset; label: string }[] = [
    { key: "7d", label: "7 días" },
    { key: "1m", label: "1 mes" },
    { key: "3m", label: "3 meses" },
    { key: "year", label: "Este año" },
    { key: "all", label: "Todo" },
  ]

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>
      <AppHeader page="dashboard" onNavigate={onNavigate} />

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 24px" }}>

        {/* HEADER ROW */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#111", letterSpacing: "-0.2px" }}>
              Estadísticas
            </h2>
            <div style={{ fontSize: "13px", color: "#888", marginTop: "3px" }}>
              {loading ? "Cargando datos…" : "Resumen de inventario y consumo"}
            </div>
          </div>

          {/* FILTRO PERÍODO */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {/* Preset pills */}
            <div style={{ display: "flex", gap: "4px", backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "4px" }}>
              {presets.map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: preset === p.key ? "#111" : "transparent",
                    color: preset === p.key ? "#fff" : "#555",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* Date inputs */}
            <input
              type="date"
              value={desde}
              max={hasta || todayISO()}
              onChange={(e) => { setPreset("all"); setDesde(e.target.value) }}
              style={dateInputStyle}
              title="Desde"
            />
            <span style={{ color: "#ccc", fontSize: "13px" }}>—</span>
            <input
              type="date"
              value={hasta}
              min={desde || ""}
              max={todayISO()}
              onChange={(e) => { setPreset("all"); setHasta(e.target.value) }}
              style={dateInputStyle}
              title="Hasta"
            />
            {(desde || hasta) && (
              <button
                onClick={() => { setPreset("all"); setDesde(""); setHasta("") }}
                style={{ ...btnOutlineStyle }}
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* KPI CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
          {/* CONSUMO — prioritario, destacado */}
          <div style={{
            ...cardStyle,
            padding: "20px 22px",
            borderLeft: "4px solid #dc2626",
            gridColumn: "1 / 2",
          }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
              🔻 Consumo total
            </div>
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#111", lineHeight: 1 }}>
              {loading ? "—" : totalConsumo.toLocaleString("es-ES")}
            </div>
            <div style={{ fontSize: "12px", color: "#aaa", marginTop: "6px" }}>unidades consumidas en el período</div>
          </div>

          {/* ENTRADAS */}
          <div style={{ ...cardStyle, padding: "20px 22px", borderLeft: "4px solid #16a34a" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
              🔺 Entradas totales
            </div>
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#111", lineHeight: 1 }}>
              {loading ? "—" : totalEntradas.toLocaleString("es-ES")}
            </div>
            <div style={{ fontSize: "12px", color: "#aaa", marginTop: "6px" }}>unidades recibidas en el período</div>
          </div>

          {/* STOCK */}
          <div style={{ ...cardStyle, padding: "20px 22px", borderLeft: "4px solid #2563eb" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
              📦 Stock actual
            </div>
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#111", lineHeight: 1 }}>
              {loading ? "—" : totalStock.toLocaleString("es-ES")}
            </div>
            <div style={{ fontSize: "12px", color: "#aaa", marginTop: "6px" }}>unidades en almacén ahora mismo</div>
          </div>
        </div>

        {/* GRÁFICOS: CONSUMO PRIMERO */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>

          {/* CONSUMO + ENTRADAS — pie charts side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

            {/* CONSUMO PIE */}
            <div style={{ ...cardStyle, borderTop: "3px solid #f43f5e" }}>
              <div style={{ padding: "18px 22px 0" }}>
                <div style={{ ...sectionTitleStyle, color: "#f43f5e" }}>🔻 Consumo por departamento</div>
                <div style={sectionSubStyle}>Total de unidades consumidas en el período</div>
              </div>
              <PieDonut data={sumByDepartamento(consumoPivot)} colorOffset={0} />
            </div>

            {/* ENTRADAS PIE */}
            <div style={{ ...cardStyle, borderTop: "3px solid #10b981" }}>
              <div style={{ padding: "18px 22px 0" }}>
                <div style={{ ...sectionTitleStyle, color: "#10b981" }}>🔺 Entradas por departamento</div>
                <div style={sectionSubStyle}>Total de unidades recibidas en el período</div>
              </div>
              <PieDonut data={sumByDepartamento(entradasPivot)} colorOffset={2} />
            </div>

          </div>

          {/* STOCK */}
          <div style={{ ...cardStyle, borderTop: "3px solid #2563eb" }}>
            <div style={{ padding: "16px 20px 0" }}>
              <div style={{ ...sectionTitleStyle, color: "#2563eb" }}>📦 Stock actual por departamento</div>
              <div style={sectionSubStyle}>Unidades disponibles en almacén en este momento</div>
            </div>
            <div style={{ width: "100%", height: 280, padding: "12px 8px 8px" }}>
              <ResponsiveContainer>
                <BarChart data={stock}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="departamento" tick={{ fontSize: 12, fill: "#888" }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12, fill: "#888" }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="stock" name="Stock" fill="#2563eb" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* HISTORIAL DE MOVIMIENTOS (paginado) */}
        <div style={{ ...cardStyle, marginTop: "16px", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={sectionTitleStyle}>Historial de movimientos</div>
              <div style={sectionSubStyle}>
                {movsTotal > 0
                  ? `${movsTotal} movimiento${movsTotal !== 1 ? "s" : ""} (ordenados por fecha)`
                  : "Sin movimientos en el período seleccionado"}
              </div>
            </div>

            {/* Controles paginación */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "#aaa" }}>Mostrar:</span>
                {[10, 25, 50].map(size => (
                  <button
                    key={size}
                    onClick={async () => {
                      setMovsPageSize(size)
                      await loadMovsPage(0, size)
                    }}
                    style={{
                      padding: "4px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer",
                      border: movsPageSize === size ? "1px solid #111" : "1px solid #e0e0e0",
                      backgroundColor: movsPageSize === size ? "#111" : "#fff",
                      color: movsPageSize === size ? "#fff" : "#555",
                      fontWeight: movsPageSize === size ? 600 : 400,
                    }}
                  >
                    {size}
                  </button>
                ))}
              </div>

              {movsTotal > movsPageSize && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#aaa" }}>
                    {movsPage + 1} / {totalMovsPages}
                  </span>
                  <button
                    onClick={() => loadMovsPage(movsPage - 1)}
                    disabled={movsPage === 0}
                    style={{
                      padding: "4px 10px", borderRadius: "6px", border: "1px solid #e0e0e0",
                      backgroundColor: "#fff", fontSize: "13px",
                      cursor: movsPage === 0 ? "not-allowed" : "pointer",
                      color: movsPage === 0 ? "#ccc" : "#333",
                    }}
                  >
                    ←
                  </button>
                  <button
                    onClick={() => loadMovsPage(movsPage + 1)}
                    disabled={(movsPage + 1) * movsPageSize >= movsTotal}
                    style={{
                      padding: "4px 10px", borderRadius: "6px", border: "1px solid #e0e0e0",
                      backgroundColor: "#fff", fontSize: "13px",
                      cursor: (movsPage + 1) * movsPageSize >= movsTotal ? "not-allowed" : "pointer",
                      color: (movsPage + 1) * movsPageSize >= movsTotal ? "#ccc" : "#333",
                    }}
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                <th style={thStyle}>Fecha</th>
                <th style={thStyle}>Producto</th>
                <th style={thStyle}>Talla</th>
                <th style={thStyle}>Departamento</th>
                <th style={thStyle}>Cambio</th>
                <th style={thStyle}>Origen</th>
              </tr>
            </thead>
            <tbody>
              {movs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "32px 22px", color: "#bbb", textAlign: "center", fontSize: "14px" }}>
                    No hay movimientos en el rango seleccionado
                  </td>
                </tr>
              )}
              {movs.map((m: any) => {
                const isEntrada = Number(m.cambio) > 0
                const origen = m.origen === "pedido" ? "📦 Pedido" : m.origen ? "✏️ Manual" : "—"
                return (
                  <tr
                    key={m.id}
                    style={{ borderBottom: "1px solid #f5f5f5" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "#fafafa")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "")}
                  >
                    <td style={{ ...tdStyle, color: "#888", fontSize: "13px" }}>{fmtFechaHora(m.fecha)}</td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: "#111" }}>{m.producto}</div>
                      <div style={{ fontSize: "12px", color: "#aaa", fontFamily: "monospace" }}>{m.codigo || "—"}</div>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{m.talla}</td>
                    <td style={tdStyle}>{m.departamento}</td>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontSize: "13px",
                        backgroundColor: isEntrada ? "#f0fdf4" : "#fff1f2",
                        color: isEntrada ? "#16a34a" : "#dc2626",
                      }}>
                        {isEntrada ? "▲" : "▼"} {Math.abs(Number(m.cambio))} ud.
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: "#666" }}>{origen}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  backgroundColor: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: "12px",
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#111",
  marginBottom: "2px",
}

const sectionSubStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#aaa",
  marginBottom: "0",
}

const dateInputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: "8px",
  border: "1px solid #ddd",
  fontSize: "13px",
  backgroundColor: "#fff",
  outline: "none",
  color: "#333",
}

const btnOutlineStyle: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: "8px",
  border: "1px solid #e0e0e0",
  backgroundColor: "#fff",
  color: "#555",
  fontSize: "13px",
  cursor: "pointer",
  fontWeight: 500,
}

const thStyle: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  fontSize: "11px",
  fontWeight: 700,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
}

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "14px",
  verticalAlign: "middle",
}
