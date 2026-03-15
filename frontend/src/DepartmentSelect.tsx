import { useState, useEffect, useRef } from "react"
import { getDepartments, addDepartment } from "./productService"

interface Props {
  value: number | null
  onChange: (id: number, nombre?: string) => void
  style?: React.CSSProperties
}

export default function DepartmentSelect({ value, onChange, style }: Props) {
  const [departments, setDepartments] = useState<any[]>([])
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getDepartments().then((data) => setDepartments(data as any[]))
  }, [])

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  function isDuplicate(name: string) {
    return departments.some(d => d.nombre.toLowerCase() === name.trim().toLowerCase())
  }

  async function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) { cancel(); return }
    if (isDuplicate(trimmed)) {
      const existing = departments.find(d => d.nombre.toLowerCase() === trimmed.toLowerCase())!
      onChange(existing.id, existing.nombre)
      cancel()
      return
    }
    const newId = await addDepartment(trimmed)
    const updated: any = await getDepartments()
    setDepartments(updated)
    onChange(newId, trimmed)
    cancel()
  }

  function cancel() {
    setAdding(false)
    setNewName("")
  }

  if (adding) {
    return (
      <div style={{ width: "100%", boxSizing: "border-box", ...style }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", width: "100%", boxSizing: "border-box" }}>
          <input
            ref={inputRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleAdd()
              if (e.key === "Escape") cancel()
            }}
            placeholder="Nombre del departamento..."
            style={{
              flex: 1,
              minWidth: 0,
              padding: "9px 12px",
              borderRadius: "7px",
              border: "1px solid #86efac",
              fontSize: "14px",
              backgroundColor: "#f0fdf4",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={handleAdd}
            style={{
              flexShrink: 0,
              padding: "9px 12px",
              borderRadius: "7px",
              border: "none",
              backgroundColor: "#16a34a",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ✓
          </button>
          <button
            onClick={cancel}
            style={{
              flexShrink: 0,
              padding: "9px 12px",
              borderRadius: "7px",
              border: "1px solid #ddd",
              backgroundColor: "#fff",
              color: "#666",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  return (
    <select
      value={value ?? ""}
      onChange={e => {
        if (e.target.value === "__add__") {
          setAdding(true)
        } else {
          const id = Number(e.target.value)
          const dep = departments.find((d: any) => d.id === id)
          onChange(id, dep?.nombre)
        }
      }}
      style={{
        width: "100%",
        padding: "9px 12px",
        borderRadius: "7px",
        border: "1px solid #ddd",
        fontSize: "14px",
        backgroundColor: "#fff",
        cursor: "pointer",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {departments.map((d: any) => (
        <option key={d.id} value={d.id}>{d.nombre}</option>
      ))}
      <option disabled style={{ color: "#ccc" }}>──────────</option>
      <option value="__add__">+ Añadir departamento...</option>
    </select>
  )
}
