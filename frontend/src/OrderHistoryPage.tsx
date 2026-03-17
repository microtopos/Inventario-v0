import { useState, useEffect, useRef } from "react"
import { getOrders, getOrderDetail, receiveOrder, deleteOrder } from "./orderService"
import AppHeader from "./AppHeader"
import { useConfirm } from "./ConfirmDialog"
import { ordenarTallas } from "./sortTallas"
import { jsPDF } from "jspdf"
import { join } from "@tauri-apps/api/path"
import { writeFile } from "@tauri-apps/plugin-fs"
import { resolveExportDir } from "./exportService"
import { useToast } from "./Toast"
import { useSortableTable } from "./useSortableTable"

function formatDate(dateStr: string) {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

// Agrupa los items por producto para mostrarlos más limpio
function agruparItems(items: any[]) {
  const map: any = {}
  for (const item of items) {
    const key = `${item.producto_nombre}__${item.producto_color ?? ""}`
    if (!map[key]) {
      map[key] = {
        nombre: item.producto_nombre,
        codigo: item.producto_codigo,
        color: item.producto_color,
        tallas: [],
        total: 0,
      }
    }
    map[key].tallas.push({ talla: item.talla, cantidad: item.cantidad, stock_actual: item.stock_actual })
    map[key].total += item.cantidad
  }
  for (const key in map) {
    map[key].tallas.sort((a: any, b: any) => ordenarTallas(a.talla, b.talla))
  }
  return Object.values(map)
}

export default function OrderHistoryPage({ onNavigate }: { onNavigate: (page: any) => void }) {
  const [orders, setOrders] = useState<any[]>([])
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [orderDetail, setOrderDetail] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [receiving, setReceiving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [filter, setFilter] = useState<"all" | "pending" | "received">("all")
  const { confirm, dialog } = useConfirm()
  const toast = useToast()

  // Barrera síncrona: evita doble-clic antes de que receiving (async) se actualice
  const receivingRef = useRef(false)
  // Guarda de desmontaje: evita setState después de desmontar el componente
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    loadOrders()
  }, [])

  async function loadOrders() {
    setLoading(true)
    const data = await getOrders()
    setOrders(data)
    setLoading(false)
  }

  async function openOrder(order: any) {
    setSelectedOrder(order)
    const detail = await getOrderDetail(order.id)
    setOrderDetail(detail)
  }

  async function handleReceive() {
    if (!selectedOrder) return
    if (receivingRef.current) return // barrera síncrona anti-doble-clic

    const ok = await confirm(
      `¿Marcar el pedido #${selectedOrder.id} como recibido? Esto actualizará el stock de todas las prendas incluidas.`,
      { confirmLabel: "Marcar como recibido" }
    )
    if (!ok) return

    receivingRef.current = true
    setReceiving(true)

    try {
      await receiveOrder(selectedOrder.id)

      if (!mountedRef.current) return // componente desmontado: no tocar estado

      await loadOrders()
      const detail = await getOrderDetail(selectedOrder.id)

      if (mountedRef.current) {
        setOrderDetail(detail)
        setSelectedOrder((prev: any) => ({ ...prev, recibido: 1 }))
      }
      toast.success("Pedido recibido", `Pedido #${selectedOrder.id} marcado como recibido`)
    } finally {
      receivingRef.current = false
      if (mountedRef.current) setReceiving(false)
    }
  }

  async function handleDelete(order: any) {
    if (order.recibido) {
      await confirm("Este pedido ya fue recibido y no se puede eliminar.", {
        confirmLabel: "Entendido",
        danger: false,
      })
      return
    }
    const ok = await confirm(
      `¿Eliminar el pedido #${order.id}? Esta acción no se puede deshacer.`,
      { confirmLabel: "Eliminar", danger: true }
    )
    if (!ok) return
    try {
      await deleteOrder(order.id)
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(null)
        setOrderDetail([])
      }
      await loadOrders()
      toast.success("Pedido eliminado", `Pedido #${order.id} eliminado`)
    } catch (e: any) {
      console.error("Error eliminando pedido:", e)
      toast.error("No se pudo eliminar el pedido", e?.message ?? String(e))
    }
  }

  async function exportOrderPDF() {
    if (!selectedOrder || orderDetail.length === 0) return
    setExporting(true)
    try {
      const grouped = agruparItems(orderDetail)
      const doc = new jsPDF()
      const PW = doc.internal.pageSize.getWidth()
      const PH = doc.internal.pageSize.getHeight()
      const ML = 14
      const MR = 14
      const CW = PW - ML - MR

      const fecha = formatDate(selectedOrder.fecha)
      const totalUnidades = grouped.reduce((s: number, g: any) => s + g.total, 0)
      const totalLineas = grouped.length

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
        doc.text(new Date().toLocaleDateString("es-ES"), PW - MR, 9, { align: "right" })

        doc.setFont("helvetica", "bold")
        doc.setFontSize(14)
        doc.setTextColor(...negro)
        doc.text(`Pedido #${selectedOrder.id}`, ML, 22)

        doc.setFont("helvetica", "normal")
        doc.setFontSize(8.5)
        doc.setTextColor(...gris)
        const sub = `${fecha}  ·  ${totalLineas} prenda${totalLineas !== 1 ? "s" : ""}  ·  ${totalUnidades} unidades`
          + (selectedOrder.recibido ? "  ·  Recibido" : "  ·  Pendiente")
        doc.text(sub, ML, 28)

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
        doc.text(`Pedido #${selectedOrder.id}`, PW - MR, 9, { align: "right" })
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
      const notasText = String(selectedOrder.notas ?? "").trim()
      if (notasText) {
        const labelH = 4
        const lineH = 4.1
        const boxPadY = 3
        const boxPadX = 3
        const maxWidth = CW - boxPadX * 2

        doc.setFont("helvetica", "normal")
        doc.setFontSize(8.5)
        const lines = doc.splitTextToSize(notasText, maxWidth) as string[]

        const boxH = labelH + boxPadY + lines.length * lineH + 4
        y = checkPageBreak(y, boxH + 4)

        doc.setDrawColor(...linea)
        doc.setLineWidth(0.3)
        doc.rect(ML, y, CW, boxH, "S")

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
      doc.text("PRENDA",   ML + 2,      y + 5)
      doc.text("TOTAL",    PW - MR - 2, y + 5, { align: "right" })
      y += 9

      const colW = 22
      const chipsPerRow = Math.floor(CW / colW)
      // Si el pedido está recibido, los chips son más altos (tienen línea de stock)
      const chipH = selectedOrder.recibido ? 10 : 7.5

      grouped.forEach((g: any, idx: number) => {
        const tallas = [...g.tallas].sort((a: any, b: any) => ordenarTallas(a.talla, b.talla))

        const hasMeta = !!(g.color || g.codigo)
        const filasTallas = Math.ceil(tallas.length / chipsPerRow)
        const blockH = 7 + (hasMeta ? 6 : 0) + filasTallas * (chipH + 1.5) + 5
        y = checkPageBreak(y, blockH)

        if (idx % 2 === 0) {
          doc.setFillColor(...fondoFil)
          doc.rect(ML, y - 1, CW, blockH + 1, "F")
        }

        // Línea 1: nombre + total a la derecha
        doc.setFont("helvetica", "bold")
        doc.setFontSize(9)
        doc.setTextColor(...negro)
        doc.text(g.nombre, ML + 2, y + 5)
        doc.text(`${g.total} ud.`, PW - MR - 2, y + 5, { align: "right" })

        // Línea 2: código · color (si existe)
        let tallaStartY = y + 8
        if (hasMeta) {
          doc.setFont("helvetica", "normal")
          doc.setFontSize(7.5)
          doc.setTextColor(...gris)
          doc.text([g.codigo, g.color].filter(Boolean).join("  ·  "), ML + 2, y + 11)
          tallaStartY = y + 14
        }

        // Tallas: ocupan todo el ancho, alineadas a la izquierda
        let tx = ML + 2
        let ty = tallaStartY
        let col = 0

        for (const t of tallas) {
          if (col >= chipsPerRow) { col = 0; tx = ML + 2; ty += chipH + 1.5 }

          doc.setDrawColor(...linea)
          doc.setLineWidth(0.3)
          doc.rect(tx, ty, colW - 2, chipH, "S")

          doc.setFont("helvetica", "bold")
          doc.setFontSize(7)
          doc.setTextColor(...negro)
          doc.text(t.talla, tx + 2, ty + 3.5)

          doc.setFont("helvetica", "normal")
          doc.setTextColor(...gris)
          doc.text(`${t.cantidad}ud`, tx + (colW - 2) - 2, ty + 3.5, { align: "right" })

          // Si el pedido está recibido, mostrar stock actual en segunda línea del chip
          if (selectedOrder.recibido && t.stock_actual !== undefined) {
            doc.setFontSize(6)
            doc.setTextColor(...grisClar)
            doc.text(`→${t.stock_actual}`, tx + (colW - 2) / 2, ty + 7.5, { align: "center" })
          }

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

      const pdfBytes = new Uint8Array(doc.output("arraybuffer"))
      const base = await resolveExportDir()
      const filePath = await join(base, `pedido_${selectedOrder.id}_${new Date().toISOString().slice(0, 10)}.pdf`)
      await writeFile(filePath.replace(/\\/g, "/"), pdfBytes)
      toast.success("PDF guardado", filePath)
    } catch (e: any) {
      if (e?.message !== "Selección cancelada") {
        console.error("Error exportando PDF:", e)
        toast.error("Error al exportar el PDF", e?.message ?? String(e))
      }
    }
    setExporting(false)
  }

  const visibleOrders = orders.filter(o => {
    if (filter === "pending") return !o.recibido
    if (filter === "received") return o.recibido
    return true
  })

  const orderSort = useSortableTable<any, "fecha" | "recibido">(visibleOrders as any[], "fecha")
  const sortedOrders = orderSort.sorted
  function orderArrow(key: any) {
    if (orderSort.sortKey !== key) return ""
    return orderSort.sortDir === "asc" ? " ▲" : " ▼"
  }

  const pendingCount = orders.filter(o => !o.recibido).length

  const grouped = agruparItems(orderDetail)
  // Totales calculados desde el detalle real cargado, no desde los agregados de la lista
  const detailTotalLineas = grouped.length
  const detailTotalUnidades = grouped.reduce((s: number, g: any) => s + g.total, 0)

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>

      <AppHeader page="orderHistory" onNavigate={onNavigate} />

      {/* SUBHEADER con título y badge */}
      <div style={{
        backgroundColor: "#fff",
        borderBottom: "1px solid #e0e0e0",
        padding: "0 32px",
        display: "flex",
        alignItems: "center",
        height: "48px",
        gap: "12px",
      }}>
        <span style={{ fontSize: "15px", fontWeight: 600, color: "#111" }}>
          📋 Historial de pedidos
        </span>
        {pendingCount > 0 && (
          <span style={{
            backgroundColor: "#fef3c7",
            color: "#92400e",
            border: "1px solid #fcd34d",
            borderRadius: "20px",
            padding: "2px 10px",
            fontSize: "12px",
            fontWeight: 600,
          }}>
            {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 24px", display: "flex", gap: "24px" }}>

        {/* LISTA DE PEDIDOS */}
        <div style={{ width: "340px", flexShrink: 0 }}>

          {/* FILTROS */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
            {(["all", "pending", "received"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid #ddd",
                  fontSize: "13px",
                  cursor: "pointer",
                  fontWeight: filter === f ? 600 : 400,
                  backgroundColor: filter === f ? "#111" : "#fff",
                  color: filter === f ? "#fff" : "#555",
                }}
              >
                {f === "all" ? "Todos" : f === "pending" ? "⏳ Pendientes" : "✅ Recibidos"}
              </button>
            ))}
          </div>

          {/* CABECERAS ORDENACIÓN */}
          <div style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
            padding: "10px 12px",
            backgroundColor: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: "10px",
          }}>
            <button
              onClick={() => orderSort.toggleSort("fecha")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 700,
                color: "#555",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
              title="Ordenar por fecha"
            >
              Fecha{orderArrow("fecha")}
            </button>
            <button
              onClick={() => orderSort.toggleSort("recibido")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 700,
                color: "#555",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
              title="Ordenar por estado"
            >
              Estado{orderArrow("recibido")}
            </button>
          </div>

          <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#aaa" }}>Cargando...</div>
            ) : visibleOrders.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#aaa", fontSize: "14px" }}>
                No hay pedidos{filter !== "all" ? " en esta categoría" : ""}
              </div>
            ) : (
              sortedOrders.map(order => (
                <div
                  key={order.id}
                  onClick={() => openOrder(order)}
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #f0f0f0",
                    cursor: "pointer",
                    backgroundColor: selectedOrder?.id === order.id ? "#eff6ff" : "#fff",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (selectedOrder?.id !== order.id) e.currentTarget.style.backgroundColor = "#f9f9f9" }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = selectedOrder?.id === order.id ? "#eff6ff" : "#fff" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "14px", color: "#111" }}>
                        Pedido #{order.id}
                      </div>
                      <div style={{ fontSize: "12px", color: "#888", marginTop: "3px" }}>
                        {formatDate(order.fecha)}
                      </div>
                      <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>
                        {order.num_lineas > 0 ? `${order.num_lineas} línea${order.num_lineas !== 1 ? "s" : ""} · ${order.total_unidades ?? 0} unidades` : "Sin artículos"}
                      </div>
                    </div>
                    <span style={{
                      padding: "3px 10px",
                      borderRadius: "20px",
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: order.recibido ? "#dcfce7" : "#fef3c7",
                      color: order.recibido ? "#166534" : "#92400e",
                      whiteSpace: "nowrap",
                      marginLeft: "8px",
                    }}>
                      {order.recibido ? "✅ Recibido" : "⏳ Pendiente"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* DETALLE DEL PEDIDO */}
        <div style={{ flex: 1 }}>
          {!selectedOrder ? (
            <div style={{
              backgroundColor: "#fff",
              border: "1px solid #e0e0e0",
              borderRadius: "10px",
              padding: "60px 40px",
              textAlign: "center",
              color: "#aaa",
              fontSize: "15px",
            }}>
              Selecciona un pedido para ver su detalle
            </div>
          ) : (
            <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", overflow: "hidden" }}>

              {/* CABECERA DEL DETALLE */}
              <div style={{
                padding: "20px 24px",
                borderBottom: "1px solid #f0f0f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "#fafafa",
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "17px", color: "#111" }}>
                    Pedido #{selectedOrder.id}
                  </div>
                  <div style={{ fontSize: "13px", color: "#888", marginTop: "3px" }}>
                    Creado el {formatDate(selectedOrder.fecha)}
                  </div>
                  {!!selectedOrder.notas && (
                    <div style={{ marginTop: "10px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                        Notas
                      </div>
                      <div style={{
                        fontSize: "13px",
                        color: "#444",
                        backgroundColor: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        maxWidth: "520px",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.35,
                      }}>
                        {selectedOrder.notas}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button
                    onClick={exportOrderPDF}
                    disabled={exporting || orderDetail.length === 0}
                    style={{
                      padding: "9px 16px",
                      backgroundColor: "#fff",
                      color: "#2563eb",
                      border: "1px solid #bfdbfe",
                      borderRadius: "7px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: exporting || orderDetail.length === 0 ? "not-allowed" : "pointer",
                      opacity: orderDetail.length === 0 ? 0.5 : 1,
                    }}
                  >
                    {exporting ? "Exportando…" : "📄 Exportar PDF"}
                  </button>
                  {!selectedOrder.recibido && (
                    <button
                      onClick={handleReceive}
                      disabled={receiving}
                      style={{
                        padding: "9px 20px",
                        backgroundColor: receiving ? "#ccc" : "#16a34a",
                        color: "#fff",
                        border: "none",
                        borderRadius: "7px",
                        fontSize: "14px",
                        fontWeight: 600,
                        cursor: receiving ? "not-allowed" : "pointer",
                      }}
                    >
                      {receiving ? "Actualizando stock..." : "✓ Marcar como recibido"}
                    </button>
                  )}
                  {selectedOrder.recibido && (
                    <span style={{
                      padding: "9px 16px",
                      backgroundColor: "#dcfce7",
                      color: "#166534",
                      borderRadius: "7px",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}>
                      ✅ Pedido recibido
                    </span>
                  )}
                  {!selectedOrder.recibido && (
                  <button
                    onClick={() => handleDelete(selectedOrder)}
                    style={{
                      padding: "9px 16px",
                      background: "none",
                      border: "1px solid #fca5a5",
                      color: "#dc2626",
                      borderRadius: "7px",
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    Eliminar
                  </button>
                  )}
                </div>
              </div>

              {/* TABLA DE PRODUCTOS */}
              <div style={{ padding: "20px 24px" }}>
                {grouped.length === 0 ? (
                  <div style={{ color: "#aaa", textAlign: "center", padding: "32px" }}>Sin artículos</div>
                ) : (
                  grouped.map((g: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        marginBottom: "16px",
                        border: "1px solid #f0f0f0",
                        borderRadius: "8px",
                        overflow: "hidden",
                      }}
                    >
                      {/* Cabecera del producto */}
                      <div style={{
                        padding: "10px 16px",
                        backgroundColor: "#f9f9f9",
                        borderBottom: "1px solid #f0f0f0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: "14px" }}>{g.nombre}</span>
                          {g.color && <span style={{ color: "#888", fontSize: "13px", marginLeft: "8px" }}>({g.color})</span>}
                          {g.codigo && <span style={{ color: "#aaa", fontSize: "12px", fontFamily: "monospace", marginLeft: "8px" }}>{g.codigo}</span>}
                        </div>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "#555" }}>
                          {g.total} ud. pedidas
                        </span>
                      </div>

                      {/* Tallas */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", padding: "12px 16px" }}>
                        {g.tallas.map((t: any, j: number) => (
                          <div
                            key={j}
                            style={{
                              border: "1px solid #e0e0e0",
                              borderRadius: "8px",
                              padding: "8px 14px",
                              textAlign: "center",
                              minWidth: "80px",
                            }}
                          >
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "#111" }}>{t.talla}</div>
                            <div style={{ fontSize: "13px", color: "#2563eb", fontWeight: 600, marginTop: "2px" }}>
                              +{t.cantidad} ud.
                            </div>
                            {selectedOrder.recibido && (
                              <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                                stock: {t.stock_actual}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}

                {/* TOTALES */}
                <div style={{
                  marginTop: "8px",
                  padding: "14px 16px",
                  backgroundColor: "#f9f9f9",
                  borderRadius: "8px",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "32px",
                }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "12px", color: "#888" }}>Líneas</div>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "#111" }}>{detailTotalLineas}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "12px", color: "#888" }}>Total unidades</div>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "#111" }}>{detailTotalUnidades}</div>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

      </main>
      {dialog}
    </div>
  )
}
