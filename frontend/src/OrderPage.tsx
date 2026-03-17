import { useState, useEffect, useRef } from "react"
import { getProductsWithSizes } from "./inventoryService"
import { loadDraft, syncDraft, discardDraft, confirmDraft } from "./orderService"
import { jsPDF } from "jspdf"
import { join } from "@tauri-apps/api/path"
import { writeFile } from "@tauri-apps/plugin-fs"
import AppHeader from "./AppHeader"
import { useConfirm } from "./ConfirmDialog"
import { ordenarTallas } from "./sortTallas"
import { resolveExportDir } from "./exportService"
import { backupDBSilent } from "./backupService"
import { useToast } from "./Toast"

type SyncState = "idle" | "saving" | "saved" | "error"

export default function OrderPage({ onNavigate }: { onNavigate: (page: any) => void }) {
  const [products, setProducts] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [pedido, setPedido] = useState<Record<number, number>>({})
  const [notas, setNotas] = useState("")
  const [, setDraftId] = useState<number | null>(null)
  // true una vez que la carga inicial desde DB ha terminado
  const [ready, setReady] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>("idle")
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref que siempre apunta al draftId actual para usarlo dentro de callbacks/timers
  const draftIdRef = useRef<number | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { confirm, alert, dialog } = useConfirm()
  const toast = useToast()

  // Cierra el dropdown al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // ── Carga inicial ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [prods, draft] = await Promise.all([
        getProductsWithSizes(),
        loadDraft(),
      ])
      setProducts(prods)
      if (draft) {
        setDraftId(draft.id)
        draftIdRef.current = draft.id
        setPedido(draft.items)
        setNotas(draft.notas ?? "")
      }
      setReady(true)
    }
    init()
  }, [])

  // ── Sincronización con debounce ──────────────────────────────────────────────
  // Solo corre después de que ready=true, para no sobreescribir la carga inicial.
  useEffect(() => {
    if (!ready) return

    if (syncTimer.current) clearTimeout(syncTimer.current)
    setSyncState("saving")

    syncTimer.current = setTimeout(async () => {
      try {
        const newId = await syncDraft(draftIdRef.current, pedido, notas)
        draftIdRef.current = newId
        setDraftId(newId)
        setSyncState(newId !== null ? "saved" : "idle")
      } catch (e) {
        console.error("Error sincronizando borrador:", e)
        setSyncState("error")
      }
    }, 600)

    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [pedido, notas, ready])

  // ── Helpers de estado ────────────────────────────────────────────────────────

  function setCantidad(tallaId: number, value: number) {
    setPedido(prev => ({ ...prev, [tallaId]: value }))
  }

  function eliminarTalla(tallaId: number) {
    setPedido(prev => {
      const next = { ...prev }
      delete next[tallaId]
      return next
    })
  }

  function totalPedido() {
    return Object.values(pedido).reduce((s, v) => s + (Number(v) || 0), 0)
  }

  function construirPedido() {
    const map: Record<number, { producto: any; tallas: any[]; total: number }> = {}
    for (const tallaId in pedido) {
      const cantidad = pedido[Number(tallaId)]
      if (!cantidad) continue
      for (const p of products) {
        const talla = p.tallas?.find((t: any) => t.id === Number(tallaId))
        if (!talla) continue
        if (!map[p.id]) map[p.id] = { producto: p, tallas: [], total: 0 }
        map[p.id].tallas.push({ tallaId: talla.id, talla: talla.talla, cantidad })
        map[p.id].total += cantidad
      }
    }
    return Object.values(map)
  }

  // Descarta el borrador en DB y limpia el estado local
  async function resetPedido() {
    if (syncTimer.current) clearTimeout(syncTimer.current)
    const id = draftIdRef.current
    if (id !== null) {
      await discardDraft(id)
      draftIdRef.current = null
      setDraftId(null)
    }
    setPedido({})
    setNotas("")
    setSelectedProduct(null)
    setSyncState("idle")
  }

  // Fuerza la sincronización inmediata (cancela el timer pendiente)
  async function flushSync(): Promise<number | null> {
    if (syncTimer.current) {
      clearTimeout(syncTimer.current)
      syncTimer.current = null
    }
    const newId = await syncDraft(draftIdRef.current, pedido, notas)
    draftIdRef.current = newId
    setDraftId(newId)
    return newId
  }

  // ── Confirmar sin PDF (acción secundaria) ────────────────────────────────────

  async function confirmOnly() {
    setDropdownOpen(false)
    try {
      if (totalPedido() === 0) {
        toast.info("Pedido vacío", "Añade al menos una prenda antes de confirmar.")
        return
      }
      setSyncState("saving")
      const id = await flushSync()
      if (id === null) throw new Error("No se pudo crear el borrador")

      const confirmedId = await confirmDraft(id, notas)
      draftIdRef.current = null
      setDraftId(null)
      setSyncState("idle")

      toast.success("Pedido confirmado", `Pedido #${confirmedId} guardado en el historial.`)
      // Backup silencioso (si hay carpeta configurada)
      backupDBSilent().catch(() => {})
      setPedido({})
      setNotas("")
      setSelectedProduct(null)
    } catch (e: any) {
      setSyncState("error")
      await alert(e.message ?? "Error al confirmar el pedido", { confirmLabel: "Aceptar" })
    }
  }

  // ── Exportar PDF ─────────────────────────────────────────────────────────────

  async function exportPDF() {
    try {
      setSyncState("saving")
      const id = await flushSync()
      if (id === null) throw new Error("El pedido está vacío")

      // 1. Generar el PDF en memoria
      const items = construirPedido()
      const doc = new jsPDF()
      const PW = doc.internal.pageSize.getWidth()
      const PH = doc.internal.pageSize.getHeight()
      const ML = 14
      const MR = 14
      const CW = PW - ML - MR

      const fecha = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
      const totalUnidades = items.reduce((s, i) => s + i.total, 0)
      const totalLineas = items.length

      // Paleta
      const negro:    [number,number,number] = [30,  30,  30]
      const gris:     [number,number,number] = [100, 100, 100]
      const grisClar: [number,number,number] = [160, 160, 160]
      const linea:    [number,number,number] = [210, 210, 210]
      const fondoFil: [number,number,number] = [249, 249, 249]
      const fondoCab: [number,number,number] = [237, 237, 237]

      function drawHeader() {
        doc.setDrawColor(...linea)
        doc.setLineWidth(0.4)
        doc.line(ML, 12, PW - MR, 12)

        doc.setFont("helvetica", "bold")
        doc.setFontSize(9)
        doc.setTextColor(...negro)
        doc.text("Gestión de Ropa", ML, 9)

        doc.setFont("helvetica", "normal")
        doc.setFontSize(8.5)
        doc.setTextColor(...gris)
        doc.text(fecha, PW - MR, 9, { align: "right" })

        doc.setFont("helvetica", "bold")
        doc.setFontSize(14)
        doc.setTextColor(...negro)
        doc.text("Pedido de ropa", ML, 22)

        doc.setFont("helvetica", "normal")
        doc.setFontSize(8.5)
        doc.setTextColor(...gris)
        doc.text(`${totalLineas} prenda${totalLineas !== 1 ? "s" : ""}  ·  ${totalUnidades} unidades`, ML, 28)

        doc.setDrawColor(...linea)
        doc.setLineWidth(0.3)
        doc.line(ML, 31, PW - MR, 31)
      }

      function addPage() {
        doc.addPage()
        doc.setDrawColor(...linea)
        doc.setLineWidth(0.4)
        doc.line(ML, 12, PW - MR, 12)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(9)
        doc.setTextColor(...negro)
        doc.text("Gestión de Ropa", ML, 9)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8.5)
        doc.setTextColor(...gris)
        doc.text(fecha, PW - MR, 9, { align: "right" })
        doc.setDrawColor(...linea)
        doc.setLineWidth(0.3)
        doc.line(ML, 14, PW - MR, 14)
      }

      function checkPageBreak(y: number, needed: number): number {
        if (y + needed > PH - 18) { addPage(); return 20 }
        return y
      }

      drawHeader()
      let y = 35

      // Bloque de notas (opcional)
      const notasText = (notas ?? "").trim()
      if (notasText) {
        const labelH = 4
        const lineH = 4.1
        const boxPadY = 3
        const boxPadX = 3
        const maxWidth = CW - boxPadX * 2

        doc.setFont("helvetica", "bold")
        doc.setFontSize(7.5)
        doc.setTextColor(...gris)
        doc.text("NOTAS", ML + 2, y + 3.5)

        doc.setFont("helvetica", "normal")
        doc.setFontSize(8.5)
        doc.setTextColor(...negro)
        const lines = doc.splitTextToSize(notasText, maxWidth) as string[]

        const boxH = labelH + boxPadY + lines.length * lineH + 4
        y = checkPageBreak(y, boxH + 4)

        doc.setDrawColor(...linea)
        doc.setLineWidth(0.3)
        doc.rect(ML, y, CW, boxH, "S")

        // Texto dentro del recuadro
        doc.setFont("helvetica", "bold")
        doc.setFontSize(7.5)
        doc.setTextColor(...gris)
        doc.text("NOTAS", ML + boxPadX, y + 6)

        doc.setFont("helvetica", "normal")
        doc.setFontSize(8.5)
        doc.setTextColor(...negro)
        doc.text(lines, ML + boxPadX, y + 11)

        y += boxH + 8
      }

      // Cabecera tabla
      doc.setFillColor(...fondoCab)
      doc.rect(ML, y, CW, 7, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.5)
      doc.setTextColor(...gris)
      doc.text("PRENDA",   ML + 2,       y + 5)
      doc.text("TOTAL",    PW - MR - 2,  y + 5, { align: "right" })
      y += 9

      const colW = 22
      const chipsPerRow = Math.floor(CW / colW)

      items.forEach((item, idx) => {
        const p = item.producto
        const tallas = [...item.tallas].sort((a, b) => ordenarTallas(a.talla, b.talla))

        // Calcular altura: fila nombre (7) + fila código si existe (6) + filas tallas
        const hasMeta = !!(p.color || p.codigo)
        const filasTallas = Math.ceil(tallas.length / chipsPerRow)
        const blockH = 7 + (hasMeta ? 6 : 0) + filasTallas * 9 + 5
        y = checkPageBreak(y, blockH)

        if (idx % 2 === 0) {
          doc.setFillColor(...fondoFil)
          doc.rect(ML, y - 1, CW, blockH + 1, "F")
        }

        // Línea 1: Nombre + total a la derecha
        doc.setFont("helvetica", "bold")
        doc.setFontSize(9)
        doc.setTextColor(...negro)
        doc.text(p.nombre, ML + 2, y + 5)

        doc.text(`${item.total} ud.`, PW - MR - 2, y + 5, { align: "right" })

        // Línea 2: código · color (si existe)
        let tallaStartY = y + 8
        if (hasMeta) {
          doc.setFont("helvetica", "normal")
          doc.setFontSize(7.5)
          doc.setTextColor(...gris)
          const meta = [p.codigo, p.color].filter(Boolean).join("  ·  ")
          doc.text(meta, ML + 2, y + 11)
          tallaStartY = y + 14
        }

        // Tallas: ocupan todo el ancho, alineadas a la izquierda
        let tx = ML + 2
        let ty = tallaStartY
        let col = 0

        for (const t of tallas) {
          if (col >= chipsPerRow) {
            col = 0
            tx = ML + 2
            ty += 9
          }
          doc.setDrawColor(...linea)
          doc.setLineWidth(0.3)
          doc.rect(tx, ty, colW - 2, 7.5, "S")

          doc.setFont("helvetica", "bold")
          doc.setFontSize(7)
          doc.setTextColor(...negro)
          doc.text(t.talla, tx + 2, ty + 3.5)

          doc.setFont("helvetica", "normal")
          doc.setTextColor(...gris)
          doc.text(`${t.cantidad}ud`, tx + (colW - 2) - 2, ty + 3.5, { align: "right" })

          tx += colW
          col++
        }

        y += blockH
        doc.setDrawColor(...linea)
        doc.setLineWidth(0.2)
        doc.line(ML, y, PW - MR, y)
        y += 1
      })

      // Total final
      y = checkPageBreak(y, 14)
      y += 5
      doc.setDrawColor(...[180, 180, 180] as [number,number,number])
      doc.setLineWidth(0.5)
      doc.line(ML, y - 2, PW - MR, y - 2)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(10)
      doc.setTextColor(...negro)
      doc.text("Total del pedido:", ML + 2, y + 4)
      doc.text(`${totalLineas} prendas  ·  ${totalUnidades} unidades`, PW - MR - 2, y + 4, { align: "right" })

      // Pie de página
      const pages = doc.getNumberOfPages()
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        doc.setDrawColor(...linea)
        doc.setLineWidth(0.3)
        doc.line(ML, 286, PW - MR, 286)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(7.5)
        doc.setTextColor(...grisClar)
        doc.text("Gestión de Ropa", ML, 290)
        doc.text(`Página ${i} de ${pages}`, PW - MR, 290, { align: "right" })
      }

      // 2. Pedir carpeta (puede cancelar — el borrador sigue intacto)
      const pdfBytes = new Uint8Array(doc.output("arraybuffer"))
      const base = await resolveExportDir()
      const filePath = await join(base, `pedido_${new Date().toISOString().slice(0, 10)}.pdf`)
      await writeFile(filePath.replace(/\\/g, "/"), pdfBytes)

      // 3. Solo confirmar el borrador si el fichero se guardó con éxito
      await confirmDraft(id, notas)
      draftIdRef.current = null
      setDraftId(null)
      setSyncState("idle")

      toast.success("PDF guardado", filePath)
      // Backup silencioso (si hay carpeta configurada)
      backupDBSilent().catch(() => {})
      setPedido({})
      setNotas("")
      setSelectedProduct(null)
    } catch (e: any) {
      if (e?.message === "Selección cancelada") {
        setSyncState("saved") // el borrador sigue ahí
        return
      }
      console.error("ERROR EXPORTANDO PDF:", e)
      setSyncState("error")
      await alert(e?.message ?? "Error al exportar el PDF", { confirmLabel: "Aceptar" })
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const filtered = products.filter(p =>
    (p.nombre + " " + (p.color ?? "")).toLowerCase().includes(search.toLowerCase())
  )
  const items = construirPedido()
  const total = totalPedido()

  const syncBadge = (() => {
    if (!ready || total === 0) return null
    if (syncState === "saving") return (
      <span style={badgeStyle("#f0f9ff", "#0369a1", "#bae6fd")}>
        <span style={spinnerStyle} /> Guardando…
      </span>
    )
    if (syncState === "saved") return (
      <span style={badgeStyle("#f0fdf4", "#15803d", "#bbf7d0")}>
        💾 Borrador guardado
      </span>
    )
    if (syncState === "error") return (
      <span style={badgeStyle("#fff5f5", "#dc2626", "#fecaca")}>
        ⚠ Error al guardar
      </span>
    )
    return null
  })()

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>

      <AppHeader page="orders" onNavigate={onNavigate} />

      {/* BARRA DE ACCIONES */}
      <div style={{
        backgroundColor: "#fff",
        borderBottom: "1px solid #e0e0e0",
        padding: "0 32px",
        display: "flex",
        alignItems: "center",
        height: "52px",
        gap: "12px",
      }}>
        <span style={{ fontSize: "15px", fontWeight: 600, color: "#111" }}>
          🛒 Nuevo pedido
        </span>

        {syncBadge}

        <div style={{ marginLeft: "auto", display: "flex", gap: "10px", alignItems: "center" }}>
          {total > 0 && (
            <button
              onClick={async () => {
                const ok = await confirm("¿Descartar el borrador? Se perderán todos los cambios.", {
                  confirmLabel: "Descartar",
                  danger: true,
                })
                if (ok) await resetPedido()
              }}
              style={{
                padding: "7px 14px",
                backgroundColor: "#fff",
                color: "#dc2626",
                border: "1px solid #fca5a5",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              ✕ Descartar
            </button>
          )}
          {/* BOTÓN SPLIT: acción principal + dropdown secundario */}
          <div ref={dropdownRef} style={{ position: "relative", display: "flex" }}>
            {/* Parte principal */}
            <button
              onClick={exportPDF}
              disabled={total === 0 || syncState === "saving"}
              style={{
                padding: "7px 18px",
                backgroundColor: total > 0 && syncState !== "saving" ? "#2563eb" : "#ccc",
                color: "#fff",
                border: "none",
                borderRadius: "6px 0 0 6px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: total > 0 && syncState !== "saving" ? "pointer" : "not-allowed",
                borderRight: "1px solid rgba(255,255,255,0.25)",
              }}
            >
              📄 Exportar PDF y confirmar
            </button>
            {/* Flecha desplegable */}
            <button
              onClick={() => setDropdownOpen(o => !o)}
              disabled={total === 0 || syncState === "saving"}
              title="Más opciones"
              style={{
                padding: "7px 10px",
                backgroundColor: total > 0 && syncState !== "saving" ? "#2563eb" : "#ccc",
                color: "#fff",
                border: "none",
                borderRadius: "0 6px 6px 0",
                fontSize: "11px",
                cursor: total > 0 && syncState !== "saving" ? "pointer" : "not-allowed",
                lineHeight: 1,
              }}
            >
              ▾
            </button>
            {/* Dropdown */}
            {dropdownOpen && (
              <div style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                backgroundColor: "#fff",
                border: "1px solid #e0e0e0",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                minWidth: "220px",
                zIndex: 100,
                overflow: "hidden",
              }}>
                <button
                  onClick={confirmOnly}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "12px 16px",
                    background: "none",
                    border: "none",
                    textAlign: "left",
                    fontSize: "13px",
                    color: "#333",
                    cursor: "pointer",
                    lineHeight: 1.4,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f5f5f5")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "")}
                >
                  <div style={{ fontWeight: 600 }}>✓ Confirmar sin exportar</div>
                  <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                    Guarda el pedido sin generar PDF
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>

          {/* COLUMNA 1: LISTA DE PRODUCTOS */}
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#888", textTransform: "uppercase", marginBottom: "10px" }}>
              Productos
            </div>
            <input
              placeholder="🔍 Buscar producto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", padding: "9px 14px", borderRadius: "6px",
                border: "1px solid #ddd", fontSize: "14px", marginBottom: "10px",
                boxSizing: "border-box",
              }}
            />
            <div style={{
              border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden",
              backgroundColor: "#fff", maxHeight: "520px", overflowY: "auto",
            }}>
              {filtered.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  style={{
                    padding: "12px 14px", borderBottom: "1px solid #f0f0f0", cursor: "pointer",
                    fontSize: "14px",
                    backgroundColor: selectedProduct?.id === p.id ? "#eff6ff" : "#fff",
                    color: selectedProduct?.id === p.id ? "#1d4ed8" : "#333",
                    fontWeight: selectedProduct?.id === p.id ? 600 : 400,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (selectedProduct?.id !== p.id) e.currentTarget.style.backgroundColor = "#f9f9f9" }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = selectedProduct?.id === p.id ? "#eff6ff" : "#fff" }}
                >
                  <div>{p.nombre}</div>
                  {p.color && <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>{p.color}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* COLUMNA 2: EDITOR DE TALLAS */}
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#888", textTransform: "uppercase", marginBottom: "10px" }}>
              Cantidades por talla
            </div>
            {selectedProduct ? (
              <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "18px" }}>
                <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>{selectedProduct.nombre}</div>
                {selectedProduct.color && (
                  <div style={{ fontSize: "13px", color: "#888", marginBottom: "16px" }}>{selectedProduct.color}</div>
                )}
                {[...selectedProduct.tallas].sort((a: any, b: any) => ordenarTallas(a.talla, b.talla)).map((t: any) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                    <div style={{ width: "40px", fontWeight: 600, fontSize: "14px" }}>{t.talla}</div>
                    <div style={{ width: "80px", fontSize: "12px", color: "#aaa" }}>stock: {t.stock}</div>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={pedido[t.id] ?? ""}
                      onChange={e => setCantidad(t.id, Number(e.target.value))}
                      style={{
                        width: "70px", padding: "7px 10px", border: "1px solid #ddd",
                        borderRadius: "6px", fontSize: "14px", textAlign: "center",
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "8px",
                padding: "40px 20px", textAlign: "center", color: "#aaa", fontSize: "14px",
              }}>
                Selecciona un producto de la lista para añadirlo al pedido
              </div>
            )}
          </div>

          {/* COLUMNA 3: RESUMEN */}
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#888", textTransform: "uppercase", marginBottom: "10px" }}>
              Resumen del pedido
            </div>
            <div style={{
              backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "8px",
              maxHeight: "520px", overflowY: "auto",
            }}>
              {/* NOTAS */}
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f0f0" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                  Notas
                </div>
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Proveedor, albarán, condiciones de entrega…"
                  rows={4}
                  style={{
                    width: "100%",
                    resize: "vertical",
                    padding: "9px 12px",
                    borderRadius: "7px",
                    border: "1px solid #ddd",
                    fontSize: "13px",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
                <div style={{ fontSize: "11px", color: "#aaa", marginTop: "6px" }}>
                  Se guardan con el borrador y quedan visibles en el historial.
                </div>
              </div>
              {items.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "#aaa", fontSize: "14px" }}>
                  Sin productos en el pedido
                </div>
              ) : (
                <>
                  {items.map(item => {
                    const tallas = [...item.tallas].sort((a, b) => ordenarTallas(a.talla, b.talla))
                    return (
                      <div key={item.producto.id} style={{ padding: "14px 16px", borderBottom: "1px solid #f0f0f0" }}>
                        <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "8px" }}>
                          {item.producto.nombre}
                          {item.producto.color && (
                            <span style={{ fontWeight: 400, color: "#888", marginLeft: "6px" }}>({item.producto.color})</span>
                          )}
                        </div>
                        {tallas.map((t: any) => (
                          <div key={t.tallaId} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", paddingLeft: "8px" }}>
                            <span style={{ width: "36px", fontSize: "13px", color: "#555" }}>{t.talla}</span>
                            <input
                              type="number"
                              min="0"
                              value={t.cantidad}
                              onChange={e => setCantidad(t.tallaId, Number(e.target.value))}
                              style={{ width: "60px", padding: "4px 8px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "13px", textAlign: "center" }}
                            />
                            <span style={{ fontSize: "12px", color: "#aaa" }}>ud.</span>
                            <button
                              onClick={() => eliminarTalla(t.tallaId)}
                              style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "14px", marginLeft: "auto" }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "#555", paddingLeft: "8px", marginTop: "4px" }}>
                          Subtotal: {item.total} ud.
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ padding: "14px 16px", backgroundColor: "#f9f9f9", fontWeight: 700, fontSize: "15px" }}>
                    Total pedido: {total} unidades
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </main>
      {dialog}
    </div>
  )
}

// ── Estilos auxiliares ─────────────────────────────────────────────────────────

function badgeStyle(bg: string, color: string, border: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color,
    backgroundColor: bg,
    border: `1px solid ${border}`,
    borderRadius: "20px",
    padding: "3px 10px",
    fontWeight: 500,
  }
}

const spinnerStyle: React.CSSProperties = {
  display: "inline-block",
  width: "10px",
  height: "10px",
  border: "2px solid #bae6fd",
  borderTopColor: "#0369a1",
  borderRadius: "50%",
  animation: "spin 0.7s linear infinite",
}
