import { useEffect, useState } from "react"
import { getProductSizes, getProductMovements, getProductMovementsCount, duplicateProduct, updateProduct } from "./productService"
import { pickAndSaveProductImage } from "./imageService"
import { addStock, updateProductColor } from "./productService"
import { useConfirm } from "./ConfirmDialog"
import { ordenarTallas } from "./sortTallas"
import ColorSelect from "./ColorSelect"
import DepartmentSelect from "./DepartmentSelect"
import { getImageUrl, invalidateImageCache } from "./getImageUrl"
import AppHeader from "./AppHeader"
import type { StockThresholds } from "./settingsService"

export default function ProductDetail({ product, onBack, onNavigate, onDuplicated, onProductUpdated, stockThresholds }: any) {
  const [sizes, setSizes] = useState<any[]>([])
  const [entrada, setEntrada] = useState<any>({})
  const [movements, setMovements] = useState<any[]>([])
  const [movementsTotal, setMovementsTotal] = useState(0)
  const [movementsPage, setMovementsPage] = useState(0)
  const [movementsPageSize, setMovementsPageSize] = useState(10)
  const [colorSaved, setColorSaved] = useState(false)
  const [editingInfo, setEditingInfo] = useState(false)
  const [editNombre, setEditNombre] = useState(product.nombre ?? "")
  const [editCodigo, setEditCodigo] = useState(product.codigo ?? "")
  const [editDepartamentoId, setEditDepartamentoId] = useState<number | null>(product.departamento_id ?? null)
  const [editDepartamentoNombre, setEditDepartamentoNombre] = useState<string>(product.departamento ?? "")
  const [infoSaved, setInfoSaved] = useState(false)
  // Estado de visualización — se actualiza tras guardar sin necesidad de recargar la página
  const [displayNombre, setDisplayNombre] = useState(product.nombre ?? "")
  const [displayCodigo, setDisplayCodigo] = useState(product.codigo ?? "")
  const [displayDepartamento, setDisplayDepartamento] = useState(product.departamento ?? "")
  const [duplicating, setDuplicating] = useState(false)
  const [dupNombre, setDupNombre] = useState("")
  const [dupCodigo, setDupCodigo] = useState("")
  const [imageError, setImageError] = useState(false)
  const [imageUrl, setImageUrl] = useState<string>(product.imageUrl ?? "")
  const [uploadingImage, setUploadingImage] = useState(false)
  const { confirm, dialog } = useConfirm()

  const thresholds: StockThresholds = stockThresholds ?? { red: 2, orange: 5 }
  function stockColor(stock: number): { bg: string; color: string } {
    if (stock <= thresholds.red) return { bg: "#fee2e2", color: "#991b1b" }
    if (stock <= thresholds.orange) return { bg: "#ffedd5", color: "#c2410c" }
    return { bg: "#dcfce7", color: "#166534" }
  }

  async function reloadSizes() {
    const data = await getProductSizes(product.id)
    setSizes([...data].sort((a, b) => ordenarTallas(a.talla, b.talla)))
    const [movs, total] = await Promise.all([
      getProductMovements(product.id, movementsPageSize, 0),
      getProductMovementsCount(product.id),
    ])
    setMovements(movs as any[])
    setMovementsTotal(total)
    setMovementsPage(0)
    setEntrada({})
  }

  async function loadMovementsPage(page: number, pageSize = movementsPageSize) {
    const movs = await getProductMovements(product.id, pageSize, page * pageSize)
    setMovements(movs as any[])
    setMovementsPage(page)
  }

  async function reloadImage() {
    invalidateImageCache(product.id)
    const url = await getImageUrl(product.id)
    setImageUrl(url)
    setImageError(false)
  }

  useEffect(() => {
    setImageError(false)
    setImageUrl(product.imageUrl ?? "")
    reloadSizes()
    // Siempre refresca la imagen desde caché/disco al montar, ignorando el valor del objeto padre
    getImageUrl(product.id).then(url => {
      setImageUrl(url)
    })
  }, [product])

  const totalEntrada = Object.values(entrada).reduce((s: any, v: any) => s + (Number(v) || 0), 0) as number

  const duplicarBtn = (
    <button
      onClick={() => {
        setDupNombre(`${product.nombre} (copia)`)
        setDupCodigo(product.codigo ?? "")
        setDuplicating(true)
      }}
      style={{
        background: "none", border: "1px solid #ddd", borderRadius: "6px",
        padding: "6px 14px", fontSize: "14px", cursor: "pointer", color: "#555",
      }}
    >
      ⧉ Duplicar prenda
    </button>
  )

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>

      <AppHeader
        page="inventory"
        onNavigate={onNavigate}
        onBack={onBack}
        title={product.nombre}
        actions={duplicarBtn}
      />

      {/* MODAL DUPLICAR */}
      {duplicating && (
        <div style={{
          position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
        }}>
          <div style={{
            backgroundColor: "#fff", borderRadius: "14px", width: "420px",
            boxShadow: "0 16px 48px rgba(0,0,0,0.18)", overflow: "hidden",
          }}>
            <div style={{ height: "4px", backgroundColor: "#111" }} />
            <div style={{ padding: "28px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 6px" }}>Duplicar prenda</h2>
              <p style={{ fontSize: "13px", color: "#888", margin: "0 0 22px" }}>
                Se copiarán las tallas sin stock. Edita el nombre y código antes de crear.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Nombre</div>
                  <input
                    autoFocus
                    value={dupNombre}
                    onChange={e => setDupNombre(e.target.value)}
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: "7px",
                      border: "1px solid #ddd", fontSize: "14px", boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Código</div>
                  <input
                    value={dupCodigo}
                    onChange={e => setDupCodigo(e.target.value)}
                    placeholder="Opcional"
                    onKeyDown={async e => {
                      if (e.key === "Enter") {
                        if (!dupNombre.trim()) return
                        const newId = await duplicateProduct(product.id, dupNombre.trim(), dupCodigo.trim())
                        setDuplicating(false)
                        onDuplicated?.(newId)
                      }
                      if (e.key === "Escape") setDuplicating(false)
                    }}
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: "7px",
                      border: "1px solid #ddd", fontSize: "14px", boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "24px" }}>
                <button
                  onClick={() => setDuplicating(false)}
                  style={{
                    padding: "9px 20px", borderRadius: "8px", border: "1px solid #e0e0e0",
                    backgroundColor: "#fff", color: "#555", fontSize: "14px", cursor: "pointer", minWidth: "90px",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    if (!dupNombre.trim()) return
                    const newId = await duplicateProduct(product.id, dupNombre.trim(), dupCodigo.trim())
                    setDuplicating(false)
                    onDuplicated?.(newId)
                  }}
                  style={{
                    padding: "9px 20px", borderRadius: "8px", border: "none",
                    backgroundColor: "#111", color: "#fff", fontSize: "14px",
                    fontWeight: 600, cursor: "pointer", minWidth: "90px",
                  }}
                >
                  ⧉ Crear copia
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 24px", display: "grid", gridTemplateColumns: "320px 1fr", gap: "20px", alignItems: "start" }}>

        {/* COLUMNA IZQUIERDA: PRODUCTO */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* FOTO */}
          <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "12px", padding: "24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            {!imageError && imageUrl ? (
              <img
                src={imageUrl}
                style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "8px", border: "1px solid #e0e0e0" }}
                onError={() => setImageError(true)}
              />
            ) : (
              <div style={{
                width: "100%", aspectRatio: "1", backgroundColor: "#f0f0f0", borderRadius: "8px",
                border: "1px solid #e0e0e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "80px",
              }}>
                👕
              </div>
            )}
            <button
              onClick={async () => {
                setUploadingImage(true)
                try {
                  const saved = await pickAndSaveProductImage(product.id)
                  if (saved) await reloadImage()
                } finally {
                  setUploadingImage(false)
                }
              }}
              disabled={uploadingImage}
              style={{
                display: "block",
                width: "100%",
                padding: "9px 0",
                borderRadius: "7px",
                border: "1px solid #ddd",
                backgroundColor: uploadingImage ? "#f5f5f5" : "#fff",
                color: uploadingImage ? "#aaa" : "#444",
                fontSize: "13px",
                fontWeight: 500,
                cursor: uploadingImage ? "not-allowed" : "pointer",
                textAlign: "center",
                boxSizing: "border-box",
              }}
            >
              {uploadingImage ? "Guardando…" : "📷 Cambiar foto"}
            </button>
          </div>

          {/* INFO */}
          <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "12px", padding: "24px" }}>

            {/* Cabecera del card: título + botón editar/guardar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Información
              </span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                {infoSaved && (
                  <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: 600 }}>✓ Guardado</span>
                )}
                {editingInfo ? (
                  <>
                    <button
                      onClick={async () => {
                        if (!editNombre.trim()) return
                        await updateProduct(product.id, {
                          nombre: editNombre.trim(),
                          codigo: editCodigo.trim(),
                          departamento_id: editDepartamentoId,
                        })
                        await updateProductColor(product.id, product.color ?? "")
                        product.nombre = editNombre.trim()
                        product.codigo = editCodigo.trim()
                        product.departamento_id = editDepartamentoId
                        product.departamento = editDepartamentoNombre
                        setDisplayNombre(editNombre.trim())
                        setDisplayCodigo(editCodigo.trim())
                        setDisplayDepartamento(editDepartamentoNombre)
                        setEditingInfo(false)
                        setInfoSaved(true)
                        setTimeout(() => setInfoSaved(false), 2500)
                        // Notificar al padre para que refresque selectedProduct e inventory
                        onProductUpdated?.({
                          nombre: editNombre.trim(),
                          codigo: editCodigo.trim(),
                          departamento_id: editDepartamentoId,
                          departamento: editDepartamentoNombre,
                        })
                      }}
                      style={{
                        padding: "5px 14px", borderRadius: "6px", border: "none",
                        backgroundColor: "#111", color: "#fff", fontSize: "12px",
                        fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      ✓ Guardar
                    </button>
                    <button
                      onClick={() => {
                        setEditNombre(product.nombre ?? "")
                        setEditCodigo(product.codigo ?? "")
                        setEditDepartamentoId(product.departamento_id ?? null)
                        setEditingInfo(false)
                      }}
                      style={{
                        padding: "5px 12px", borderRadius: "6px", border: "1px solid #ddd",
                        backgroundColor: "#fff", color: "#555", fontSize: "12px", cursor: "pointer",
                      }}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditingInfo(true)}
                    style={{
                      background: "none", border: "1px solid #e0e0e0", borderRadius: "6px",
                      padding: "5px 12px", fontSize: "12px", color: "#888", cursor: "pointer",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "#aaa")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#e0e0e0")}
                  >
                    ✏︎ Editar
                  </button>
                )}
              </div>
            </div>

            {/* Filas de campos — siempre la misma estructura, cambia solo el contenido */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

              {/* Nombre */}
              <div>
                <div style={fieldLabelStyle}>Nombre</div>
                {editingInfo ? (
                  <input autoFocus value={editNombre} onChange={e => setEditNombre(e.target.value)} style={fieldInputStyle} />
                ) : (
                  <div style={fieldValueStyle}>{displayNombre}</div>
                )}
              </div>

              {/* Código */}
              <div>
                <div style={fieldLabelStyle}>Código</div>
                {editingInfo ? (
                  <input value={editCodigo} onChange={e => setEditCodigo(e.target.value)} placeholder="Opcional" style={fieldInputStyle} />
                ) : (
                  <div style={{ ...fieldValueStyle, fontFamily: displayCodigo ? "monospace" : "inherit", color: displayCodigo ? "#555" : "#ccc" }}>
                    {displayCodigo || "—"}
                  </div>
                )}
              </div>

              {/* Departamento */}
              <div>
                <div style={fieldLabelStyle}>Departamento</div>
                {editingInfo ? (
                  <DepartmentSelect
                    value={editDepartamentoId}
                    onChange={(id, nombre) => {
                      setEditDepartamentoId(id)
                      setEditDepartamentoNombre(nombre ?? "")
                    }}
                  />
                ) : (
                  <div style={{ ...fieldValueStyle, color: displayDepartamento ? "#333" : "#ccc" }}>
                    {displayDepartamento || "—"}
                  </div>
                )}
              </div>

              {/* Color */}
              <div>
                <div style={fieldLabelStyle}>Color</div>
                {editingInfo ? (
                  <ColorSelect
                    value={product.color ?? ""}
                    onChange={value => { product.color = value }}
                  />
                ) : (
                  <ColorSelect
                    value={product.color ?? ""}
                    onChange={async (value) => {
                      await updateProductColor(product.id, value)
                      product.color = value
                      setColorSaved(true)
                      setTimeout(() => setColorSaved(false), 2500)
                    }}
                  />
                )}
                {colorSaved && !editingInfo && (
                  <div style={{ fontSize: "11px", color: "#16a34a", fontWeight: 600, marginTop: "5px" }}>✓ Guardado</div>
                )}
              </div>

            </div>
          </div>

        </div>

        {/* COLUMNA DERECHA: TALLAS */}
        <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "12px", padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#111", margin: 0 }}>Stock por tallas</h2>
            {totalEntrada !== 0 && (
              <span style={{ fontSize: "13px", fontWeight: 500, color: totalEntrada > 0 ? "#16a34a" : "#dc2626" }}>
                {totalEntrada > 0 ? `+${totalEntrada}` : totalEntrada} unidades a aplicar
              </span>
            )}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f0f0f0" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: "12px", color: "#888", fontWeight: 600, textTransform: "uppercase" }}>Talla</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: "12px", color: "#888", fontWeight: 600, textTransform: "uppercase" }}>Stock actual</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: "12px", color: "#888", fontWeight: 600, textTransform: "uppercase" }}>Ajuste</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: "12px", color: "#888", fontWeight: 600, textTransform: "uppercase" }}>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {sizes.map((s: any) => {
                const ajuste = Number(entrada[s.id] ?? 0)
                const resultado = s.stock + ajuste
                const hayAjuste = entrada[s.id] !== undefined && entrada[s.id] !== ""
                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "12px 12px", fontWeight: 600, fontSize: "15px" }}>{s.talla}</td>
                    <td style={{ padding: "12px 12px" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "4px 12px",
                        borderRadius: "20px",
                        fontSize: "13px",
                        fontWeight: 600,
                        backgroundColor: stockColor(s.stock).bg,
                        color: stockColor(s.stock).color,
                      }}>
                        {s.stock} ud.
                      </span>
                    </td>
                    <td style={{ padding: "12px 12px" }}>
                      <input
                        type="number"
                        placeholder="0"
                        value={entrada[s.id] ?? ""}
                        onChange={(e) => setEntrada({ ...entrada, [s.id]: e.target.value === "" ? "" : Number(e.target.value) })}
                        style={{
                          padding: "7px 10px",
                          borderRadius: "6px",
                          border: `1px solid ${!hayAjuste ? "#ddd" : ajuste > 0 ? "#86efac" : ajuste < 0 ? "#fca5a5" : "#ddd"}`,
                          fontSize: "14px",
                          width: "90px",
                          textAlign: "center",
                          backgroundColor: !hayAjuste ? "#fff" : ajuste > 0 ? "#f0fdf4" : ajuste < 0 ? "#fff5f5" : "#fff",
                        }}
                      />
                    </td>
                    <td style={{ padding: "12px 12px" }}>
                      {hayAjuste && ajuste !== 0 && (
                        <span style={{ fontSize: "14px", fontWeight: 600, color: resultado < 0 ? "#dc2626" : "#111" }}>
                          {resultado < 0 ? "⚠️ " : ""}{resultado} ud.
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: "16px" }}>
            <button
              onClick={async () => {
                for (const tallaId in entrada) {
                  const ajuste = Number(entrada[tallaId])
                  if (!ajuste) continue
                  const talla = sizes.find((s: any) => s.id === Number(tallaId))
                  if (talla && talla.stock + ajuste < 0) {
                    await confirm(
                      `La talla ${talla.talla} no tiene suficiente stock (stock actual: ${talla.stock}, intentas restar: ${Math.abs(ajuste)})`,
                      { confirmLabel: "Entendido", danger: false }
                    )
                    return
                  }
                }
                const ok = await confirm("¿Aplicar los cambios de stock?", { confirmLabel: "Aplicar" })
                if (!ok) return
                for (const tallaId in entrada) {
                  const ajuste = Number(entrada[tallaId])
                  if (!ajuste) continue
                  await addStock(Number(tallaId), ajuste)
                }
                await reloadSizes()
              }}
              style={{
                padding: "10px 24px",
                backgroundColor: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: "7px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ✓ Aplicar ajuste de stock
            </button>
            <span style={{ fontSize: "12px", color: "#aaa" }}>
              Usa números negativos para restar (ej: −3)
            </span>
          </div>
        </div>

      </main>

      {/* HISTORIAL DE MOVIMIENTOS — ancho completo debajo de las columnas */}
      {(movements.length > 0 || movementsTotal > 0) && (
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 24px 32px" }}>
          <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "12px", overflow: "hidden" }}>

            <div style={{ padding: "18px 24px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#111", margin: 0 }}>Historial de movimientos</h2>
                <span style={{ fontSize: "12px", color: "#aaa" }}>
                  {movementsTotal} movimiento{movementsTotal !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "12px", color: "#aaa" }}>Mostrar:</span>
                  {[10, 25, 50].map(size => (
                    <button
                      key={size}
                      onClick={async () => {
                        setMovementsPageSize(size)
                        await loadMovementsPage(0, size)
                      }}
                      style={{
                        padding: "4px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer",
                        border: movementsPageSize === size ? "1px solid #111" : "1px solid #e0e0e0",
                        backgroundColor: movementsPageSize === size ? "#111" : "#fff",
                        color: movementsPageSize === size ? "#fff" : "#555",
                        fontWeight: movementsPageSize === size ? 600 : 400,
                      }}
                    >
                      {size}
                    </button>
                  ))}
                </div>
                {movementsTotal > movementsPageSize && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px", color: "#aaa" }}>
                      {movementsPage + 1} / {Math.ceil(movementsTotal / movementsPageSize)}
                    </span>
                    <button
                      onClick={() => loadMovementsPage(movementsPage - 1)}
                      disabled={movementsPage === 0}
                      style={{
                        padding: "4px 10px", borderRadius: "6px", border: "1px solid #e0e0e0",
                        backgroundColor: "#fff", fontSize: "13px", cursor: movementsPage === 0 ? "not-allowed" : "pointer",
                        color: movementsPage === 0 ? "#ccc" : "#333",
                      }}
                    >
                      ←
                    </button>
                    <button
                      onClick={() => loadMovementsPage(movementsPage + 1)}
                      disabled={(movementsPage + 1) * movementsPageSize >= movementsTotal}
                      style={{
                        padding: "4px 10px", borderRadius: "6px", border: "1px solid #e0e0e0",
                        backgroundColor: "#fff", fontSize: "13px",
                        cursor: (movementsPage + 1) * movementsPageSize >= movementsTotal ? "not-allowed" : "pointer",
                        color: (movementsPage + 1) * movementsPageSize >= movementsTotal ? "#ccc" : "#333",
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
                  <th style={thStyle}>Talla</th>
                  <th style={thStyle}>Movimiento</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Origen</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m: any, i: number) => {
                  const isEntrada = m.cambio > 0
                  const isPedido = m.origen === "pedido"
                  return (
                    <tr
                      key={m.id ?? i}
                      style={{ borderBottom: "1px solid #f5f5f5" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#fafafa")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "")}
                    >
                      <td style={{ ...tdStyle, color: "#888", fontSize: "13px" }}>
                        {m.fecha ? new Date(m.fecha).toLocaleString("es-ES", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit"
                        }) : "—"}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{m.talla}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, fontSize: "15px", color: isEntrada ? "#16a34a" : "#dc2626" }}>
                        {isEntrada ? "+" : ""}{m.cambio} ud.
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: "20px",
                          fontSize: "12px", fontWeight: 600,
                          backgroundColor: isEntrada ? "#dcfce7" : "#fee2e2",
                          color: isEntrada ? "#166534" : "#991b1b",
                        }}>
                          {isEntrada ? "Entrada" : "Salida"}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: "20px",
                          fontSize: "12px", fontWeight: 600,
                          backgroundColor: isPedido ? "#eff6ff" : "#f5f5f5",
                          color: isPedido ? "#1d4ed8" : "#666",
                        }}>
                          {isPedido ? "📦 Pedido" : "✏️ Manual"}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>



          </div>
        </div>
      )}

      {dialog}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: "11px 16px",
  textAlign: "left",
  verticalAlign: "middle",
  fontSize: "11px",
  fontWeight: 600,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
}

const tdStyle: React.CSSProperties = {
  padding: "11px 16px",
  fontSize: "14px",
  verticalAlign: "middle",
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "#aaa",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "6px",
}

const fieldValueStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#333",
  fontWeight: 500,
  padding: "2px 0",
}

const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "7px",
  border: "1px solid #ddd",
  fontSize: "14px",
  boxSizing: "border-box",
}
