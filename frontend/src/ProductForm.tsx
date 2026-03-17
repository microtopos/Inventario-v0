import { useState } from "react"
import { getDB } from "./db"
import ColorSelect from "./ColorSelect"
import DepartmentSelect from "./DepartmentSelect"
import AppHeader from "./AppHeader"
import { useToast } from "./Toast"

export default function ProductForm({ onClose, onSaved, onNavigate }: any) {
  const [nombre, setNombre] = useState("")
  const [codigo, setCodigo] = useState("")
  const [tallas, setTallas] = useState<string[]>([])
  const [nuevaTalla, setNuevaTalla] = useState("")
  const [color, setColor] = useState("")
  const [departamento, setDepartamento] = useState<number | null>(null)
  const toast = useToast()

  async function save() {
    if (!nombre) {
      toast.error("Falta el nombre", "Introduce un nombre para la prenda")
      return
    }
    const db = await getDB()
    await db.execute(
      "INSERT INTO productos (codigo,nombre,departamento_id,color) VALUES (?,?,?,?)",
      [codigo || null, nombre, departamento, color || null]
    )
    const row: any = await db.select("SELECT last_insert_rowid() as id")
    const productId = row[0].id
    for (const talla of tallas) {
      await db.execute(
        "INSERT INTO tallas (producto_id,talla,stock) VALUES (?,?,0)",
        [productId, talla]
      )
    }
    onSaved()
    toast.success("Prenda guardada", `"${nombre}" añadida al inventario`)
    onClose()
  }

  function addTallas() {
    if (!nuevaTalla) return
    const nuevas = nuevaTalla.split(",").map((t: string) => t.trim()).filter((t: string) => t.length > 0)
    setTallas([...new Set([...tallas, ...nuevas])])
    setNuevaTalla("")
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>

      <AppHeader
        page="inventory"
        onNavigate={onNavigate}
        onBack={onClose}
        title="Nueva prenda"
      />

      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", padding: "28px" }}>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

            <div>
              <label style={labelStyle}>Nombre de la prenda *</label>
              <input
                placeholder="Ej: Camiseta básica"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoFocus
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Código (opcional)</label>
              <input
                placeholder="Ej: CAM-001"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Color</label>
              <ColorSelect value={color} onChange={setColor} />
            </div>

            <div>
              <label style={labelStyle}>Departamento</label>
              <DepartmentSelect value={departamento} onChange={setDepartamento} />
            </div>

            <div>
              <label style={labelStyle}>Tallas</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  placeholder="Ej: S, M, L o 36, 38, 40"
                  value={nuevaTalla}
                  onChange={(e) => setNuevaTalla(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addTallas() }}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={addTallas}
                  style={{
                    padding: "10px 16px", backgroundColor: "#2563eb", color: "#fff",
                    border: "none", borderRadius: "6px", fontSize: "14px",
                    cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap",
                  }}
                >
                  Añadir
                </button>
              </div>
              <div style={{ fontSize: "12px", color: "#aaa", marginTop: "5px" }}>
                Separa varias tallas con comas: S, M, L, XL
              </div>
              {tallas.length > 0 && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                  {tallas.map((t, i) => (
                    <span
                      key={i}
                      onClick={() => setTallas(tallas.filter((_, idx) => idx !== i))}
                      title="Clic para eliminar"
                      style={{
                        backgroundColor: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe",
                        padding: "4px 12px", borderRadius: "20px", fontSize: "13px", fontWeight: 500,
                        display: "flex", alignItems: "center", gap: "6px", cursor: "pointer",
                      }}
                    >
                      {t} ✕
                    </span>
                  ))}
                </div>
              )}
            </div>

          </div>

          <div style={{ display: "flex", gap: "12px", marginTop: "28px", borderTop: "1px solid #f0f0f0", paddingTop: "24px" }}>
            <button
              onClick={save}
              style={{
                padding: "10px 24px", backgroundColor: "#16a34a", color: "#fff",
                border: "none", borderRadius: "7px", fontSize: "14px", fontWeight: 600, cursor: "pointer",
              }}
            >
              ✓ Guardar prenda
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "10px 20px", backgroundColor: "#fff", color: "#555",
                border: "1px solid #ddd", borderRadius: "7px", fontSize: "14px", cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>

        </div>
      </main>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "13px", fontWeight: 600, color: "#555",
  marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em",
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: "6px",
  border: "1px solid #ddd", fontSize: "14px", backgroundColor: "#fff", boxSizing: "border-box",
}
