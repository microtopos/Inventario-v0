import { useState, useEffect, useRef } from "react"
import { getOrders, getOrderDetail, receivePrendaItems, modifyItem, updateOrderNotes, deleteOrder } from "./orderService"
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
    map[key].tallas.push({
      itemId: item.id,
      talla: item.talla,
      cantidad: item.cantidad,
      cantidad_acordada: item.cantidad_acordada,
      cantidad_recibida: item.cantidad_recibida,
      estado: item.estado,
      stock_actual: item.stock_actual,
    })
    map[key].total += Number(item.cantidad_acordada ?? item.cantidad) || 0
  }
  for (const key in map) {
    map[key].tallas.sort((a: any, b: any) => ordenarTallas(a.talla, b.talla))
  }
  return Object.values(map)
}

export default function OrderHistoryPage({ onNavigate, draftCount }: { onNavigate: (page: any) => void; draftCount?: number }) {
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
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [notesDraft, setNotesDraft] = useState("")
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")

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
    setNotesDraft(order.notas ?? "")
    setEditingItemId(null)
    setEditValue("")
  }

  function orderBadge(o: any): { text: string; bg: string; color: string } {
    if (o.recibido) return { text: "✅ Completado", bg: "#dcfce7", color: "#166534" }
    const recibidas = Number(o.lineas_recibidas) || 0
    const total = Number(o.num_lineas) || 0
    if (recibidas > 0) return { text: `📦 En curso (${recibidas}/${total})`, bg: "#eff6ff", color: "#1d4ed8" }
    return { text: "⏳ Pendiente", bg: "#fef3c7", color: "#92400e" }
  }

  async function refreshSelectedOrder() {
    if (!selectedOrder) return
    const [ordersList, detail] = await Promise.all([getOrders(), getOrderDetail(selectedOrder.id)])
    const row = ordersList.find((o: any) => o.id === selectedOrder.id) ?? selectedOrder
    if (mountedRef.current) {
      setOrders(ordersList)
      setSelectedOrder(row)
      setOrderDetail(detail)
    }
  }

  async function handleReceivePrenda(itemIds: number[]) {
    if (!selectedOrder) return
    if (receivingRef.current) return
    receivingRef.current = true
    setReceiving(true)
    try {
      await receivePrendaItems(itemIds)
      await refreshSelectedOrder()
    } catch (e: any) {
      console.error(e)
      toast.error("No se pudo recibir la prenda", e?.message ?? String(e))
    } finally {
      receivingRef.current = false
      if (mountedRef.current) setReceiving(false)
    }
  }

  async function handleReceiveAll() {
    if (!selectedOrder) return
    const pendingIds = orderDetail
      .filter((it: any) => {
        const st = String(it.estado ?? "pendiente")
        return st === "pendiente" || st === "modificado"
      })
      .map((it: any) => it.id as number)
    if (pendingIds.length === 0) return
    const ok = await confirm(
      "¿Marcar todo el pedido como recibido? Se actualizará el stock de todas las prendas pendientes.",
      { confirmLabel: "Recibir todo" }
    )
    if (!ok) return
    if (receivingRef.current) return
    receivingRef.current = true
    setReceiving(true)
    try {
      await receivePrendaItems(pendingIds)
      await refreshSelectedOrder()
    } catch (e: any) {
      console.error(e)
      toast.error("No se pudo recibir el pedido", e?.message ?? String(e))
    } finally {
      receivingRef.current = false
      if (mountedRef.current) setReceiving(false)
    }
  }

  async function handleSaveModify(itemId: number) {
    const raw = editValue.trim()
    const n = raw === "" ? null : Number(raw)
    if (raw !== "" && (!Number.isFinite(n) || n! < 0)) {
      toast.error("Cantidad inválida", "Usa un número (0 para cancelar).")
      return
    }
    if (receivingRef.current) return
    receivingRef.current = true
    setReceiving(true)
    try {
      await modifyItem(itemId, raw === "" ? null : Math.trunc(n as number))
      setEditingItemId(null)
      setEditValue("")
      await refreshSelectedOrder()
    } catch (e: any) {
      console.error(e)
      toast.error("No se pudo modificar", e?.message ?? String(e))
    } finally {
      receivingRef.current = false
      if (mountedRef.current) setReceiving(false)
    }
  }

  function scheduleSaveNotes(next: string) {
    if (!selectedOrder) return
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      try {
        await updateOrderNotes(selectedOrder.id, next)
        await loadOrders()
        setSelectedOrder((prev: any) => ({ ...prev, notas: next }))
        toast.success("Notas guardadas")
      } catch (e: any) {
        toast.error("No se pudieron guardar las notas", e?.message ?? String(e))
      }
    }, 600)
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

      <AppHeader page="orderHistory" onNavigate={onNavigate} draftCount={draftCount} />

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

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 24px", display: "flex", gap: "24px", boxSizing: "border-box" }}>

        {/* LISTA DE PEDIDOS */}
        <div style={{ width: "320px", flexShrink: 0 }}>

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
                    {(() => {
                      const b = orderBadge(order)
                      return (
                        <span style={{
                          padding: "3px 10px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: 600,
                          backgroundColor: b.bg,
                          color: b.color,
                          whiteSpace: "nowrap",
                          marginLeft: "8px",
                        }}>
                          {b.text}
                        </span>
                      )
                    })()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* DETALLE DEL PEDIDO */}
        <div style={{ flex: 1, minWidth: 0 }}>
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
                backgroundColor: "#fafafa",
              }}>
                {/* Fila superior: título + botones */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "17px", color: "#111" }}>
                      Pedido #{selectedOrder.id}
                    </div>
                    <div style={{ fontSize: "13px", color: "#888", marginTop: "3px" }}>
                      Creado el {formatDate(selectedOrder.fecha)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexShrink: 0 }}>
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
                    {!!selectedOrder.recibido && (
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
                    {!selectedOrder.recibido && (() => {
                      const hasPending = orderDetail.some((it: any) => {
                        const st = String(it.estado ?? "pendiente")
                        return st === "pendiente" || st === "modificado"
                      })
                      return hasPending ? (
                        <button
                          onClick={handleReceiveAll}
                          disabled={receiving}
                          style={{
                            padding: "9px 16px",
                            backgroundColor: receiving ? "#ccc" : "#16a34a",
                            color: "#fff",
                            border: "none",
                            borderRadius: "7px",
                            fontSize: "14px",
                            fontWeight: 600,
                            cursor: receiving ? "not-allowed" : "pointer",
                          }}
                        >
                          ✓ Recibir todo
                        </button>
                      ) : null
                    })()}
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
                {/* Fila inferior: notas a ancho completo */}
                <div style={{ marginTop: "16px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                    Notas
                  </div>
                  <textarea
                    value={notesDraft}
                    onChange={(e) => {
                      setNotesDraft(e.target.value)
                      scheduleSaveNotes(e.target.value)
                    }}
                    onBlur={() => scheduleSaveNotes(notesDraft)}
                    placeholder="Proveedor, albarán, condiciones…"
                    rows={2}
                    style={{
                      width: "100%",
                      resize: "vertical",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      fontSize: "13px",
                      boxSizing: "border-box",
                      backgroundColor: "#fff",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* TABLA DE PRODUCTOS */}
              <div style={{ padding: "20px 24px" }}>
                {/* PROGRESO */}
                {orderDetail.length > 0 ? (() => {
                  const totals = { recibido: 0, pendiente: 0, modificado: 0, cancelado: 0 }
                  for (const it of orderDetail as any[]) {
                    const st = String(it.estado ?? "pendiente")
                    if (st === "recibido") totals.recibido++
                    else if (st === "cancelado") totals.cancelado++
                    else if (st === "modificado") totals.modificado++
                    else totals.pendiente++
                  }
                  const total = orderDetail.length || 1
                  const done = totals.recibido + totals.cancelado
                  const pct = Math.round((done / total) * 100)
                  return (
                    <div style={{ marginBottom: "14px" }}>
                      <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>
                        Recibidos: <b>{totals.recibido}</b> · Pendientes: <b>{totals.pendiente}</b> · Modificados: <b>{totals.modificado}</b> · Cancelados: <b>{totals.cancelado}</b>
                      </div>
                      <div style={{ height: "8px", backgroundColor: "#f0f0f0", borderRadius: "999px", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", backgroundColor: pct === 100 ? "#16a34a" : "#2563eb" }} />
                      </div>
                    </div>
                  )
                })() : null}

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
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#555" }}>
                            {g.total} ud. pedidas
                          </span>
                          {!selectedOrder.recibido && (() => {
                            const pendingIds = g.tallas
                              .filter((t: any) => {
                                const st = String(t.estado ?? "pendiente")
                                return st === "pendiente" || st === "modificado"
                              })
                              .map((t: any) => t.itemId as number)
                            return pendingIds.length > 0 ? (
                              <button
                                onClick={() => handleReceivePrenda(pendingIds)}
                                disabled={receiving}
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: "7px",
                                  border: "none",
                                  backgroundColor: receiving ? "#ccc" : "#16a34a",
                                  color: "#fff",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  cursor: receiving ? "not-allowed" : "pointer",
                                }}
                              >
                                ✓ Recibir prenda
                              </button>
                            ) : null
                          })()}
                        </div>
                      </div>

                      {/* Tallas — tabla compacta */}
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ backgroundColor: "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                            <th style={tallaThStyle}>Talla</th>
                            <th style={tallaThStyle}>Pedido</th>
                            <th style={tallaThStyle}>Acordado</th>
                            <th style={tallaThStyle}>Estado</th>
                            <th style={tallaThStyle}>Stock tras recibir</th>
                            <th style={{ ...tallaThStyle, textAlign: "right" }}>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.tallas.map((t: any, j: number) => {
                            const isCompleted = !!selectedOrder.recibido
                            const estado = isCompleted ? "recibido" : String(t.estado ?? "pendiente")
                            const acordada = t.cantidad_acordada
                            const effective = Number(acordada ?? t.cantidad) || 0
                            const isEditing = editingItemId === t.itemId
                            const canAct = !isCompleted && (estado === "pendiente" || estado === "modificado")

                            const rowBg = estado === "recibido" ? "#f0fdf4" : estado === "cancelado" ? "#fafafa" : "transparent"

                            const badgeEl = (() => {
                              if (estado === "recibido") return <span style={{ ...tallaBadgeStyle, backgroundColor: "#dcfce7", color: "#166534" }}>Recibido</span>
                              if (estado === "cancelado") return <span style={{ ...tallaBadgeStyle, backgroundColor: "#f3f4f6", color: "#6b7280" }}>Cancelado</span>
                              if (estado === "modificado") return <span style={{ ...tallaBadgeStyle, backgroundColor: "#ffedd5", color: "#c2410c" }}>Modificado</span>
                              return <span style={{ ...tallaBadgeStyle, backgroundColor: "#eff6ff", color: "#2563eb" }}>Pendiente</span>
                            })()

                            return isEditing ? (
                              <tr key={j} style={{ borderBottom: "1px solid #f5f5f5", backgroundColor: "#fffbeb" }}>
                                <td colSpan={6} style={{ padding: "10px 14px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                                    <span style={{ fontWeight: 700, fontSize: "14px", minWidth: "32px" }}>{t.talla}</span>
                                    <span style={{ fontSize: "13px", color: "#888" }}>Pedido: <b style={{ color: "#2563eb" }}>{t.cantidad} ud.</b></span>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                      <span style={{ fontSize: "13px", color: "#555" }}>Acordar:</span>
                                      <input
                                        autoFocus
                                        type="number"
                                        min={0}
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") handleSaveModify(t.itemId)
                                          if (e.key === "Escape") { setEditingItemId(null); setEditValue("") }
                                        }}
                                        style={{
                                          width: "72px", padding: "6px 8px", borderRadius: "6px",
                                          border: "1px solid #fcd34d", fontSize: "14px", textAlign: "center",
                                          backgroundColor: "#fffbeb",
                                        }}
                                      />
                                      <span style={{ fontSize: "12px", color: "#aaa" }}>ud. (0 = cancelar)</span>
                                    </div>
                                    <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
                                      <button
                                        onClick={() => handleSaveModify(t.itemId)}
                                        disabled={receiving}
                                        style={{
                                          padding: "6px 16px", borderRadius: "6px", border: "none",
                                          backgroundColor: receiving ? "#ccc" : "#111", color: "#fff",
                                          fontSize: "13px", fontWeight: 600, cursor: receiving ? "not-allowed" : "pointer",
                                        }}
                                      >Guardar</button>
                                      <button
                                        onClick={() => { setEditingItemId(null); setEditValue("") }}
                                        style={{
                                          padding: "6px 14px", borderRadius: "6px", border: "1px solid #e0e0e0",
                                          backgroundColor: "#fff", color: "#555", fontSize: "13px", fontWeight: 600, cursor: "pointer",
                                        }}
                                      >Cancelar</button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              <tr key={j} style={{ borderBottom: "1px solid #f5f5f5", backgroundColor: rowBg, opacity: estado === "cancelado" ? 0.55 : 1 }}>
                                <td style={{ ...tallaTdStyle, fontWeight: 700, fontSize: "14px" }}>{t.talla}</td>
                                <td style={{ ...tallaTdStyle, color: "#2563eb", fontWeight: 600 }}>{t.cantidad} ud.</td>
                                <td style={tallaTdStyle}>
                                  {acordada !== null && acordada !== undefined && Number(acordada) !== Number(t.cantidad)
                                    ? <span style={{ fontWeight: 700, color: "#c2410c" }}>{effective} ud.</span>
                                    : <span style={{ color: "#aaa" }}>—</span>}
                                </td>
                                <td style={tallaTdStyle}>{badgeEl}</td>
                                <td style={{ ...tallaTdStyle, color: "#888", fontSize: "13px" }}>
                                  {estado === "recibido"
                                    ? <span style={{ fontWeight: 600, color: "#111" }}>{t.stock_actual} ud.</span>
                                    : "—"}
                                </td>
                                <td style={{ ...tallaTdStyle, textAlign: "right" }}>
                                  {canAct && estado === "pendiente" && (
                                    <button
                                      onClick={() => { setEditingItemId(t.itemId); setEditValue(String(effective)) }}
                                      disabled={receiving}
                                      style={{
                                        padding: "5px 12px", borderRadius: "6px", border: "1px solid #e0e0e0",
                                        backgroundColor: "#fff", color: "#555", fontSize: "12px", fontWeight: 600,
                                        cursor: receiving ? "not-allowed" : "pointer",
                                      }}
                                    >✎ Modificar</button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
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

const tallaThStyle: React.CSSProperties = {
  padding: "8px 14px",
  textAlign: "left",
  fontSize: "11px",
  fontWeight: 700,
  color: "#aaa",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
}

const tallaTdStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: "13px",
  verticalAlign: "middle",
}

const tallaBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 9px",
  borderRadius: "20px",
  fontSize: "11px",
  fontWeight: 700,
}