import { jsPDF } from "jspdf"
import * as XLSX from "xlsx"
import { join } from "@tauri-apps/api/path"
import { writeFile } from "@tauri-apps/plugin-fs"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { getInventory, getProductsWithSizes, getAllMovements } from "./inventoryService"
import { ordenarTallas } from "./sortTallas"
import { getExportDir, setExportDir, getStockThresholds } from "./settingsService"

// ─── Fecha ────────────────────────────────────────────────────────────────────

function getToday() { return new Date().toLocaleDateString("es-ES") }
function getTimestamp() { return new Date().toISOString().slice(0, 10) }

// ─── Carpeta de exportación ───────────────────────────────────────────────────

export async function resolveExportDir(): Promise<string> {
  const saved = await getExportDir()
  if (saved) return saved
  const selected = await openDialog({ directory: true, title: "Selecciona la carpeta donde guardar los exports" })
  if (!selected) throw new Error("Selección cancelada")
  const dir = typeof selected === "string" ? selected : (selected as any)[0]
  await setExportDir(dir)
  return dir
}

export async function changeExportDir(): Promise<string | null> {
  const selected = await openDialog({ directory: true, title: "Selecciona la carpeta donde guardar los exports" })
  if (!selected) return null
  const dir = typeof selected === "string" ? selected : (selected as any)[0]
  await setExportDir(dir)
  return dir
}

async function savePDF(doc: jsPDF, filename: string) {
  const base = await resolveExportDir()
  const path = await join(base, filename)
  await writeFile(path.replace(/\\/g, "/"), new Uint8Array(doc.output("arraybuffer")))
}

async function saveXLSX(wb: XLSX.WorkBook, filename: string) {
  const base = await resolveExportDir()
  const path = await join(base, filename)
  const buf: ArrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  await writeFile(path.replace(/\\/g, "/"), new Uint8Array(buf))
}

// ─── Paleta ───────────────────────────────────────────────────────────────────
// Discreta, imprimible en B/N. Sin fondos negros ni verdes.

const C = {
  negro:    [30,  30,  30]  as [number,number,number],
  gris:     [100, 100, 100] as [number,number,number],
  grisClar: [160, 160, 160] as [number,number,number],
  linea:    [210, 210, 210] as [number,number,number],
  fondoFil: [249, 249, 249] as [number,number,number],
  fondoCab: [237, 237, 237] as [number,number,number],
  alerta:   [175, 55,  15]  as [number,number,number], // stock bajo: óxido oscuro
}

const ML = 14
const MR = 14
const PW = 210
const CW = PW - ML - MR

// ─── Cabecera / pie ───────────────────────────────────────────────────────────

function pdfHeader(doc: jsPDF, titulo: string, subtitulo?: string) {
  doc.setDrawColor(...C.linea)
  doc.setLineWidth(0.4)
  doc.line(ML, 12, PW - MR, 12)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...C.negro)
  doc.text("Gestión de Ropa", ML, 9)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...C.gris)
  doc.text(getToday(), PW - MR, 9, { align: "right" })

  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.setTextColor(...C.negro)
  doc.text(titulo, ML, 22)

  if (subtitulo) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(...C.gris)
    doc.text(subtitulo, ML, 28)
  }

  doc.setDrawColor(...C.linea)
  doc.setLineWidth(0.3)
  doc.line(ML, subtitulo ? 31 : 25, PW - MR, subtitulo ? 31 : 25)
}

function startY(subtitulo: boolean) { return subtitulo ? 35 : 29 }

function pdfFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...C.linea)
    doc.setLineWidth(0.3)
    doc.line(ML, 286, PW - MR, 286)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(...C.grisClar)
    doc.text("Gestión de Ropa", ML, 290)
    doc.text(`Página ${i} de ${pages}`, PW - MR, 290, { align: "right" })
    doc.setTextColor(...C.negro)
  }
}

// ─── 1. Inventario completo ───────────────────────────────────────────────────

export async function exportInventarioPDF() {
  const data: any = await getInventory()
  const { red: umbral } = await getStockThresholds()
  const doc = new jsPDF()

  const totalUd = data.reduce((s: number, p: any) => s + p.stock, 0)
  const bajos   = data.filter((p: any) => p.stock <= umbral).length
  const sub = `${data.length} prendas · ${totalUd} unidades en stock` + (bajos > 0 ? ` · ${bajos} con stock bajo` : "")
  pdfHeader(doc, "Inventario completo", sub)

  let y = startY(true)

  // Cabecera de tabla
  doc.setFillColor(...C.fondoCab)
  doc.rect(ML, y, CW, 7, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...C.gris)
  doc.text("CÓDIGO",        ML + 2,       y + 5)
  doc.text("PRENDA",        ML + 26,      y + 5)
  doc.text("COLOR",         ML + 96,      y + 5)
  doc.text("DEPARTAMENTO",  ML + 126,     y + 5)
  doc.text("STOCK",         PW - MR - 2,  y + 5, { align: "right" })
  y += 9

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)

  data.forEach((item: any, idx: number) => {
    if (y > 278) {
      doc.addPage()
      pdfHeader(doc, "Inventario completo (cont.)")
      y = startY(false)
    }

    if (idx % 2 === 0) {
      doc.setFillColor(...C.fondoFil)
      doc.rect(ML, y - 1, CW, 7, "F")
    }

    doc.setTextColor(...C.gris)
    doc.text(item.codigo || "—", ML + 2, y + 4)

    doc.setTextColor(...C.negro)
    doc.text(doc.splitTextToSize(item.nombre, 66)[0], ML + 26, y + 4)

    doc.setTextColor(...C.gris)
    doc.text(item.color || "—",        ML + 96,  y + 4)
    doc.text(item.departamento || "—", ML + 126, y + 4)

    const bajo = item.stock <= umbral
    doc.setFont("helvetica", bajo ? "bold" : "normal")
    doc.setTextColor(...(bajo ? C.alerta : C.negro))
    doc.text(String(item.stock), PW - MR - 2, y + 4, { align: "right" })
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...C.negro)

    doc.setDrawColor(...C.linea)
    doc.setLineWidth(0.2)
    doc.line(ML, y + 6.5, PW - MR, y + 6.5)
    y += 7.5
  })

  y += 5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(...C.negro)
  doc.text(`Total: ${data.length} prendas, ${totalUd} unidades en stock.`, ML + 2, y)
  if (bajos > 0) {
    doc.setTextColor(...C.alerta)
    doc.text(`Prendas con stock bajo (≤ ${umbral} ud.): ${bajos}`, ML + 2, y + 6)
    doc.setTextColor(...C.negro)
  }

  pdfFooter(doc)
  await savePDF(doc, `inventario_${getTimestamp()}.pdf`)
}

export async function exportInventarioXLSX() {
  const data: any = await getInventory()
  const rows = data.map((p: any) => ({
    Código: p.codigo || "",
    Prenda: p.nombre,
    Color: p.color || "",
    Departamento: p.departamento || "",
    Stock: p.stock,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws["!cols"] = [{ wch: 14 }, { wch: 32 }, { wch: 18 }, { wch: 22 }, { wch: 8 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Inventario")
  await saveXLSX(wb, `inventario_${getTimestamp()}.xlsx`)
}

// ─── 2. Stock por tallas ──────────────────────────────────────────────────────

export async function exportTallasPDF() {
  const productos: any = await getProductsWithSizes()
  const { red: umbral } = await getStockThresholds()
  const doc = new jsPDF()
  pdfHeader(doc, "Stock por tallas", `${productos.length} prendas`)

  let y = startY(true)

  for (const p of productos) {
    const tallas = [...(p.tallas || [])].sort((a: any, b: any) => ordenarTallas(a.talla, b.talla))
    if (!tallas.length) continue

    const filas  = Math.ceil(tallas.length / 9)
    const blockH = 11 + filas * 9 + 5
    if (y + blockH > 278) {
      doc.addPage()
      pdfHeader(doc, "Stock por tallas (cont.)")
      y = startY(false)
    }

    // Línea 1: nombre completo (con color si lo tiene)
    const nombreCompleto = p.nombre + (p.color ? "  —  " + p.color : "")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.setTextColor(...C.negro)
    doc.text(nombreCompleto, ML, y + 5)

    // Línea 2: código en gris pequeño (sin departamento)
    if (p.codigo) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.5)
      doc.setTextColor(...C.grisClar)
      doc.text(p.codigo, ML, y + 11)
    }

    y += p.codigo ? 14 : 9

    const colW = 20
    const colH = 8
    let x = ML

    for (const t of tallas) {
      if (x + colW > PW - MR + 1) {
        x = ML
        y += colH + 2
        if (y > 278) {
          doc.addPage()
          pdfHeader(doc, "Stock por tallas (cont.)")
          y = startY(false)
        }
      }

      const bajo = t.stock <= umbral
      doc.setDrawColor(...(bajo ? C.alerta : C.linea))
      doc.setLineWidth(bajo ? 0.6 : 0.3)
      doc.rect(x, y - 1, colW - 1, colH, "S")

      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.5)
      doc.setTextColor(...(bajo ? C.alerta : C.negro))
      doc.text(t.talla, x + (colW - 1) / 2, y + 3, { align: "center" })

      doc.setFont("helvetica", "normal")
      doc.setFontSize(7)
      doc.setTextColor(...C.gris)
      doc.text(String(t.stock), x + (colW - 1) / 2, y + 6.5, { align: "center" })

      x += colW
    }

    y += colH + 5
    doc.setDrawColor(...C.linea)
    doc.setLineWidth(0.2)
    doc.line(ML, y - 2, PW - MR, y - 2)
  }

  pdfFooter(doc)
  await savePDF(doc, `stock_tallas_${getTimestamp()}.pdf`)
}

export async function exportTallasXLSX() {
  const productos: any = await getProductsWithSizes()
  const rows: any[] = []
  for (const p of productos) {
    const tallas = [...(p.tallas || [])].sort((a: any, b: any) => ordenarTallas(a.talla, b.talla))
    for (const t of tallas) {
      rows.push({
        Código: p.codigo || "",
        Prenda: p.nombre,
        Color: p.color || "",
        Departamento: p.departamento || "",
        Talla: t.talla,
        Stock: t.stock,
      })
    }
  }
  const ws = XLSX.utils.json_to_sheet(rows)
  ws["!cols"] = [{ wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 8 }, { wch: 8 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Stock por tallas")
  await saveXLSX(wb, `stock_tallas_${getTimestamp()}.xlsx`)
}

// ─── 3. Historial de movimientos ──────────────────────────────────────────────

export async function exportMovimientosPDF() {
  const data: any = await getAllMovements()
  const doc = new jsPDF()
  pdfHeader(doc, "Historial de movimientos", `${data.length} registros`)

  let y = startY(true)

  doc.setFillColor(...C.fondoCab)
  doc.rect(ML, y, CW, 7, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...C.gris)
  doc.text("FECHA",      ML + 2,       y + 5)
  doc.text("PRENDA",     ML + 40,      y + 5)
  doc.text("TALLA",      ML + 126,     y + 5)
  doc.text("TIPO",       ML + 146,     y + 5)
  doc.text("MOVIM.",     PW - MR - 2,  y + 5, { align: "right" })
  y += 9

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)

  data.forEach((m: any, idx: number) => {
    if (y > 278) {
      doc.addPage()
      pdfHeader(doc, "Historial de movimientos (cont.)")
      y = startY(false)
    }

    if (idx % 2 === 0) {
      doc.setFillColor(...C.fondoFil)
      doc.rect(ML, y - 1, CW, 7, "F")
    }

    const fecha = m.fecha ? new Date(m.fecha).toLocaleString("es-ES", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }) : "—"

    doc.setTextColor(...C.gris)
    doc.text(fecha, ML + 2, y + 4)

    doc.setTextColor(...C.negro)
    doc.text(doc.splitTextToSize(m.producto + (m.color ? " / " + m.color : ""), 82)[0], ML + 40, y + 4)

    doc.setTextColor(...C.gris)
    doc.text(m.talla,                              ML + 126, y + 4)
    doc.text(m.cambio > 0 ? "Entrada" : "Salida", ML + 146, y + 4)

    doc.setFont("helvetica", "bold")
    doc.setTextColor(...(m.cambio > 0 ? C.negro : C.alerta))
    doc.text(`${m.cambio > 0 ? "+" : ""}${m.cambio}`, PW - MR - 2, y + 4, { align: "right" })

    doc.setFont("helvetica", "normal")
    doc.setTextColor(...C.negro)
    doc.setDrawColor(...C.linea)
    doc.setLineWidth(0.2)
    doc.line(ML, y + 6.5, PW - MR, y + 6.5)
    y += 7.5
  })

  pdfFooter(doc)
  await savePDF(doc, `movimientos_${getTimestamp()}.pdf`)
}

export async function exportMovimientosXLSX() {
  const data: any = await getAllMovements()
  const rows = data.map((m: any) => ({
    Fecha: m.fecha ? new Date(m.fecha).toLocaleString("es-ES") : "",
    Prenda: m.producto,
    Código: m.codigo || "",
    Color: m.color || "",
    Departamento: m.departamento || "",
    Talla: m.talla,
    Movimiento: m.cambio,
    Tipo: m.cambio > 0 ? "Entrada" : "Salida",
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws["!cols"] = [{ wch: 18 }, { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 8 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Movimientos")
  await saveXLSX(wb, `movimientos_${getTimestamp()}.xlsx`)
}
