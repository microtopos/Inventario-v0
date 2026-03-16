import './App.css'
import { useState, useEffect, useRef } from "react"
import { importInventory } from "./importInventory"
import { getInventory } from "./inventoryService"
import { getImageUrlSync, preloadImages } from "./getImageUrl"
import ProductDetail from "./ProductDetail"
import { deleteProduct } from "./productService"
import ProductForm from "./ProductForm"
import { getDepartments } from "./productService"
import OrderPage from "./OrderPage"
import OrderHistoryPage from "./OrderHistoryPage"
import AppHeader from "./AppHeader"
import DashboardPage from "./DashboardPage"
import { useConfirm } from "./ConfirmDialog"
import {
  exportInventarioPDF, exportInventarioXLSX,
  exportTallasPDF, exportTallasXLSX,
  exportMovimientosPDF, exportMovimientosXLSX,
  changeExportDir,
} from "./exportService"
import { getExportDir, getStockThresholds, setStockThresholds, type StockThresholds } from "./settingsService"

// Miniatura para la tabla
function ImageCell({ imageUrl }: { imageUrl: string }) {
  const [error, setError] = useState(false)
  if (!imageUrl || error) {
    return (
      <div style={{ width: 44, height: 44, backgroundColor: "#f0f0f0", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
        👕
      </div>
    )
  }
  return (
    <img
      src={imageUrl}
      style={{ width: 44, height: 44, objectFit: "cover", borderRadius: "6px", border: "1px solid #eee" }}
      onError={() => setError(true)}
    />
  )
}

// Foto grande para la cuadrícula
function GridImageCell({ imageUrl }: { imageUrl: string }) {
  const [error, setError] = useState(false)
  if (!imageUrl || error) {
    return (
      <div style={{ width: "100%", aspectRatio: "1", backgroundColor: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "48px" }}>
        👕
      </div>
    )
  }
  return (
    <img
      src={imageUrl}
      style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }}
      onError={() => setError(true)}
    />
  )
}

function App() {
  const [inventory, setInventory] = useState<any[]>([])
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [search, setSearch] = useState("")
  const [showLowStock, setShowLowStock] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [departments, setDepartments] = useState<any[]>([])
  const [departmentFilter, setDepartmentFilter] = useState<number | null>(null)
  const [page, setPage] = useState("inventory")
  const [viewMode, setViewMode] = useState<"table" | "grid">("table")
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [exportDir, setExportDirState] = useState<string | null>(null)
  const [stockThresholds, setStockThresholdsState] = useState<StockThresholds>({ red: 2, orange: 5 })
  const [thresholdInputs, setThresholdInputs] = useState({ red: "2", orange: "5" })
  const exportRef = useRef<HTMLDivElement>(null)
  const { confirm, dialog } = useConfirm()

  // Carga la carpeta de exportación guardada al arrancar
  useEffect(() => {
    getExportDir().then(setExportDirState)
    getStockThresholds().then(t => {
      setStockThresholdsState(t)
      setThresholdInputs({ red: String(t.red), orange: String(t.orange) })
    })
  }, [])

  // Cierra el menú al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  async function loadInventory() {
    const data = await getInventory()
    // Precargamos todas las imágenes en paralelo (una sola tanda de IPCs)
    await preloadImages(data.map((p: any) => p.id))
    // Ahora la asignación es síncrona desde caché
    data.forEach((item: any) => {
      item.imageUrl = getImageUrlSync(item.id)
    })
    setInventory(data)
    return data
  }

  useEffect(() => {
    async function init() {
      const deps = await getDepartments()
      setDepartments(deps)
      await importInventory()
      await loadInventory()
    }
    init()
  }, [])

  const filteredInventory = inventory.filter((p: any) =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (p.codigo ?? "").toLowerCase().includes(search.toLowerCase())
  )

  let visibleInventory = filteredInventory
  if (departmentFilter) {
    visibleInventory = visibleInventory.filter(p => p.departamento_id === departmentFilter)
  }
  if (showLowStock) {
    visibleInventory = visibleInventory.filter(p => p.min_stock !== null && p.min_stock <= stockThresholds.red)
  }

  const lowStockCount = inventory.filter(p => p.min_stock !== null && p.min_stock <= stockThresholds.red).length

  if (selectedProduct) {
    return <ProductDetail
      product={selectedProduct}
      stockThresholds={stockThresholds}
      onBack={() => setSelectedProduct(null)}
      onNavigate={(p: string) => { setSelectedProduct(null); setPage(p) }}
      onDuplicated={async (newId: number) => {
        const data = await loadInventory()               // ← usa lo que ya devuelve
        const copy = data?.find((p: any) => p.id === newId)
        if (copy) setSelectedProduct(copy)
      }}
      onProductUpdated={async (changes: any) => {
        // Actualiza el objeto selectedProduct en memoria para que el header
        // y el breadcrumb reflejen el nuevo nombre sin parpadeo
        setSelectedProduct((prev: any) => ({ ...prev, ...changes }))
        // Refresca el array inventory para que la tabla/cuadrícula esté al día
        await loadInventory()
      }}
    />
  }
  if (showForm) {
    return (
      <ProductForm
        onClose={() => setShowForm(false)}
        onNavigate={(p: string) => { setShowForm(false); setPage(p) }}
        onSaved={async () => {
          await loadInventory()
        }}
      />
    )
  }
  if (page === "orders") {
    return <OrderPage onNavigate={setPage} />
  }
  if (page === "orderHistory") {
    return <OrderHistoryPage onNavigate={setPage} />
  }
  if (page === "dashboard") {
    return <DashboardPage onNavigate={setPage as any} />
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>

      <AppHeader
        page={page as any}
        onNavigate={setPage as any}
        actions={
          <button
            onClick={() => setShowSettings(true)}
            title="Ajustes"
            style={{ background: "none", border: "1px solid #e0e0e0", borderRadius: "6px", padding: "6px 10px", fontSize: "16px", cursor: "pointer", color: "#888", lineHeight: 1 }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#aaa")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#e0e0e0")}
          >
            ⚙
          </button>
        }
      />

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 24px" }}>

        {/* TARJETAS RESUMEN */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "28px" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: "13px", color: "#888", marginBottom: "6px" }}>Total prendas</div>
            <div style={{ fontSize: "32px", fontWeight: 700, color: "#111" }}>{inventory.length}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: "13px", color: "#888", marginBottom: "6px" }}>Unidades en stock</div>
            <div style={{ fontSize: "32px", fontWeight: 700, color: "#111" }}>
              {inventory.reduce((sum, p) => sum + (p.stock || 0), 0)}
            </div>
          </div>
          <div style={{ ...cardStyle, borderLeft: lowStockCount > 0 ? "4px solid #f59e0b" : "1px solid #e0e0e0" }}>
            <div style={{ fontSize: "13px", color: "#888", marginBottom: "6px" }}>⚠️ Stock bajo (≤{stockThresholds.red} ud. por talla)</div>
            <div style={{ fontSize: "32px", fontWeight: 700, color: lowStockCount > 0 ? "#d97706" : "#111" }}>
              {lowStockCount}
            </div>
          </div>
        </div>

        {/* BARRA DE HERRAMIENTAS */}
        <div style={{
          backgroundColor: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: "10px",
          padding: "16px 20px",
          display: "flex",
          gap: "12px",
          alignItems: "center",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}>
          <input
            type="text"
            placeholder="🔍  Buscar prenda o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />
          <select
            value={departmentFilter ?? ""}
            onChange={(e) => setDepartmentFilter(e.target.value ? Number(e.target.value) : null)}
            style={inputStyle}
          >
            <option value="">Todos los departamentos</option>
            {departments.map((d: any) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
          <button
            onClick={() => setShowLowStock(!showLowStock)}
            style={{
              ...btnStyle,
              backgroundColor: showLowStock ? "#fef3c7" : "#f5f5f5",
              color: showLowStock ? "#92400e" : "#444",
              border: showLowStock ? "1px solid #fcd34d" : "1px solid #ddd",
            }}
          >
            {showLowStock ? "✕  Quitar filtro" : "⚠️  Stock bajo"}
          </button>

          {/* TOGGLE VISTA */}
          <div style={{ display: "flex", border: "1px solid #ddd", borderRadius: "6px", overflow: "hidden" }}>
            <button
              onClick={() => setViewMode("table")}
              title="Vista lista"
              style={{
                ...btnStyle,
                borderRadius: 0,
                border: "none",
                backgroundColor: viewMode === "table" ? "#111" : "#fff",
                color: viewMode === "table" ? "#fff" : "#888",
                padding: "8px 12px",
              }}
            >
              ☰
            </button>
            <button
              onClick={() => setViewMode("grid")}
              title="Vista cuadrícula"
              style={{
                ...btnStyle,
                borderRadius: 0,
                border: "none",
                borderLeft: "1px solid #ddd",
                backgroundColor: viewMode === "grid" ? "#111" : "#fff",
                color: viewMode === "grid" ? "#fff" : "#888",
                padding: "8px 12px",
              }}
            >
              ⊞
            </button>
          </div>

          <button
            onClick={() => setShowForm(true)}
            style={{ ...btnStyle, backgroundColor: "#2563eb", color: "#fff", border: "none", marginLeft: "auto" }}
          >
            + Nueva prenda
          </button>

          {/* EXPORTAR */}
          <div ref={exportRef} style={{ position: "relative" }}>
            <button
              onClick={() => setExportOpen(o => !o)}
              disabled={exporting}
              style={{ ...btnStyle, backgroundColor: "#f5f5f5", color: "#444", border: "1px solid #ddd" }}
            >
              {exporting ? "Exportando..." : "↓ Exportar"}
            </button>
            {exportOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 6px)",
                backgroundColor: "#fff", border: "1px solid #e0e0e0",
                borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                width: "260px", zIndex: 100, overflow: "hidden",
              }}>
                {[
                  { label: "Inventario completo", pdfFn: exportInventarioPDF, xlsxFn: exportInventarioXLSX },
                  { label: "Stock por tallas",    pdfFn: exportTallasPDF,     xlsxFn: exportTallasXLSX },
                  { label: "Historial movimientos", pdfFn: exportMovimientosPDF, xlsxFn: exportMovimientosXLSX },
                ].map((item, i) => (
                  <div key={i} style={{ borderBottom: i < 2 ? "1px solid #f0f0f0" : "none" }}>
                    <div style={{ padding: "10px 16px 4px", fontSize: "11px", fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {item.label}
                    </div>
                    <div style={{ display: "flex", gap: "0", padding: "0 8px 8px" }}>
                      {[
                        { fmt: "PDF", fn: item.pdfFn, color: "#dc2626", bg: "#fff5f5" },
                        { fmt: "Excel", fn: item.xlsxFn, color: "#16a34a", bg: "#f0fdf4" },
                      ].map(btn => (
                        <button
                          key={btn.fmt}
                          onClick={async () => {
                            setExportOpen(false)
                            setExporting(true)
                            try { await btn.fn() } catch (e) { console.error(e) }
                            setExporting(false)
                          }}
                          style={{
                            flex: 1,
                            margin: "0 4px",
                            padding: "7px 0",
                            borderRadius: "6px",
                            border: `1px solid ${btn.color}22`,
                            backgroundColor: btn.bg,
                            color: btn.color,
                            fontSize: "13px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {btn.fmt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* TABLA / CUADRÍCULA */}
        {viewMode === "table" ? (
        <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#fafafa", borderBottom: "2px solid #e0e0e0" }}>
                <th style={thStyle}>Foto</th>
                <th style={thStyle}>Código</th>
                <th style={thStyle}>Prenda</th>
                <th style={thStyle}>Color</th>
                <th style={thStyle}>Departamento</th>
                <th style={thStyle}>Stock</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {visibleInventory.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "48px", color: "#aaa", fontSize: "15px" }}>
                    No se encontraron prendas
                  </td>
                </tr>
              )}
              {visibleInventory.map((item: any) => (
                <tr
                  key={item.id}
                  style={{ borderBottom: "1px solid #f0f0f0", backgroundColor: "#fff", transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f0f7ff")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#fff")}
                >
                  <td style={tdStyle}><ImageCell imageUrl={item.imageUrl} /></td>
                  <td style={{ ...tdStyle, fontSize: "13px", color: "#888", fontFamily: "monospace" }}>{item.codigo || "—"}</td>
                  <td
                    style={{ ...tdStyle, fontWeight: 600, color: "#2563eb", cursor: "pointer" }}
                    onClick={() => setSelectedProduct(item)}
                  >
                    {item.nombre}
                  </td>
                  <td style={{ ...tdStyle, color: "#555" }}>{item.color || "—"}</td>
                  <td style={{ ...tdStyle, color: "#555" }}>{item.departamento}</td>
                  <td style={tdStyle}>
                    <span style={{
                      display: "inline-block", padding: "4px 12px", borderRadius: "20px", fontSize: "13px", fontWeight: 600,
                      backgroundColor: item.stock <= stockThresholds.red ? "#fee2e2" : item.stock <= stockThresholds.orange ? "#ffedd5" : "#dcfce7",
                      color: item.stock <= stockThresholds.red ? "#991b1b" : item.stock <= stockThresholds.orange ? "#c2410c" : "#166634",
                    }}>
                      {item.stock} ud.
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <button
                      onClick={async () => {
                        const ok = await confirm(`¿Eliminar "${item.nombre}"?`, { confirmLabel: "Eliminar", danger: true })
                        if (!ok) return
                        await deleteProduct(item.id)
                        await loadInventory()
                      }}
                      style={{ background: "none", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: "6px", padding: "5px 12px", fontSize: "13px", cursor: "pointer" }}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "12px 20px", borderTop: "1px solid #f0f0f0", fontSize: "13px", color: "#aaa" }}>
            {visibleInventory.length} prenda{visibleInventory.length !== 1 ? "s" : ""} mostrada{visibleInventory.length !== 1 ? "s" : ""}
          </div>
        </div>
        ) : (
        /* VISTA CUADRÍCULA */
        <div>
          {visibleInventory.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px", color: "#aaa", fontSize: "15px", backgroundColor: "#fff", borderRadius: "10px", border: "1px solid #e0e0e0" }}>
              No se encontraron prendas
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "16px" }}>
            {visibleInventory.map((item: any) => (
              <div
                key={item.id}
                onClick={() => setSelectedProduct(item)}
                style={{
                  backgroundColor: "#fff",
                  border: "1px solid #e0e0e0",
                  borderRadius: "10px",
                  overflow: "hidden",
                  cursor: "pointer",
                  transition: "box-shadow 0.15s, transform 0.15s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)"
                  ;(e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = ""
                  ;(e.currentTarget as HTMLElement).style.transform = ""
                }}
              >
                {/* FOTO */}
                <GridImageCell imageUrl={item.imageUrl} />

                {/* INFO */}
                <div style={{ padding: "12px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#111", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.nombre}
                  </div>
                  {item.color && (
                    <div style={{ fontSize: "12px", color: "#888", marginBottom: "6px" }}>{item.color}</div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "6px" }}>
                    <span style={{
                      padding: "3px 9px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
                      backgroundColor: item.stock <= stockThresholds.red ? "#fee2e2" : item.stock <= stockThresholds.orange ? "#ffedd5" : "#dcfce7",
                      color: item.stock <= stockThresholds.red ? "#991b1b" : item.stock <= stockThresholds.orange ? "#c2410c" : "#166634",
                    }}>
                      {item.stock} ud.
                    </span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        const ok = await confirm(`¿Eliminar "${item.nombre}"?`, { confirmLabel: "Eliminar", danger: true })
                        if (!ok) return
                        await deleteProduct(item.id)
                        await loadInventory()
                      }}
                      style={{ background: "none", border: "none", color: "#dc2626", fontSize: "16px", cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {visibleInventory.length > 0 && (
            <div style={{ marginTop: "12px", fontSize: "13px", color: "#aaa" }}>
              {visibleInventory.length} prenda{visibleInventory.length !== 1 ? "s" : ""} mostrada{visibleInventory.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
        )}

      </main>

      {/* MODAL DE AJUSTES */}
      {showSettings && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
          onClick={() => setShowSettings(false)}
        >
          <div
            style={{ backgroundColor: "#fff", borderRadius: "14px", width: "480px", overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ height: "4px", backgroundColor: "#111" }} />
            <div style={{ padding: "28px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 20px" }}>⚙ Ajustes</h2>

              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                  Carpeta de exportación
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <div style={{
                    flex: 1, padding: "9px 12px", borderRadius: "7px", border: "1px solid #e0e0e0",
                    fontSize: "13px", color: exportDir ? "#333" : "#aaa", fontFamily: exportDir ? "monospace" : "inherit",
                    backgroundColor: "#fafafa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {exportDir ?? "No configurada — se pedirá al exportar"}
                  </div>
                  <button
                    onClick={async () => {
                      const dir = await changeExportDir()
                      if (dir) setExportDirState(dir)
                    }}
                    style={{ padding: "9px 16px", borderRadius: "7px", border: "1px solid #ddd", backgroundColor: "#fff", fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap", fontWeight: 500 }}
                  >
                    Cambiar…
                  </button>
                </div>
                <div style={{ fontSize: "12px", color: "#aaa", marginTop: "6px" }}>
                  Los exports se guardan directamente en esta carpeta.
                </div>
              </div>

              {/* UMBRALES DE COLOR DE TALLAS */}
              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
                  Umbrales de color por talla
                </div>
                <div style={{ fontSize: "12px", color: "#aaa", marginBottom: "14px" }}>
                  Define cuántas unidades marcan el límite entre verde, naranja y rojo en el stock de cada talla.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  {/* ROJO */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#dc2626", display: "inline-block" }} />
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#555" }}>Rojo (crítico) — ≤</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="number"
                        min={0}
                        value={thresholdInputs.red}
                        onChange={e => setThresholdInputs(t => ({ ...t, red: e.target.value }))}
                        style={{ width: "70px", padding: "8px 10px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "14px", textAlign: "center" }}
                      />
                      <span style={{ fontSize: "12px", color: "#aaa" }}>unidades</span>
                    </div>
                  </div>
                  {/* NARANJA */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#f97316", display: "inline-block" }} />
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#555" }}>Naranja (aviso) — ≤</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="number"
                        min={0}
                        value={thresholdInputs.orange}
                        onChange={e => setThresholdInputs(t => ({ ...t, orange: e.target.value }))}
                        style={{ width: "70px", padding: "8px 10px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "14px", textAlign: "center" }}
                      />
                      <span style={{ fontSize: "12px", color: "#aaa" }}>unidades</span>
                    </div>
                  </div>
                </div>
                {/* Preview de los colores */}
                <div style={{ marginTop: "14px", display: "flex", gap: "8px", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Preview:</span>
                  <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, backgroundColor: "#fee2e2", color: "#991b1b" }}>
                    0–{thresholdInputs.red || "?"} ud. 🔴
                  </span>
                  <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, backgroundColor: "#ffedd5", color: "#c2410c" }}>
                    {Number(thresholdInputs.red || 0) + 1}–{thresholdInputs.orange || "?"} ud. 🟠
                  </span>
                  <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, backgroundColor: "#dcfce7", color: "#166534" }}>
                    &gt;{thresholdInputs.orange || "?"} ud. 🟢
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={async () => {
                    const red = Math.max(0, Number(thresholdInputs.red) || 0)
                    const orange = Math.max(red, Number(thresholdInputs.orange) || 0)
                    const t = { red, orange }
                    await setStockThresholds(t)
                    setStockThresholdsState(t)
                    setThresholdInputs({ red: String(red), orange: String(orange) })
                    setShowSettings(false)
                  }}
                  style={{ padding: "9px 22px", borderRadius: "8px", border: "none", backgroundColor: "#111", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
                >
                  Guardar y cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dialog}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  backgroundColor: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: "10px",
  padding: "20px 24px",
}

const inputStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "6px",
  border: "1px solid #ddd",
  fontSize: "14px",
  backgroundColor: "#fff",
  outline: "none",
  minWidth: "200px",
}

const btnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: "6px",
  fontSize: "14px",
  cursor: "pointer",
  fontWeight: 500,
  whiteSpace: "nowrap",
}

const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  fontSize: "12px",
  fontWeight: 600,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
}

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "14px",
  verticalAlign: "middle",
}

export default App
