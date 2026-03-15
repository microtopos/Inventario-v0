import { useState, useEffect, useRef } from "react"
import { getColors, addColor } from "./productService"

interface Props {
  value: string
  onChange: (color: string) => void
  style?: React.CSSProperties
}

export default function ColorSelect({ value, onChange, style }: Props) {
  const [colors, setColors] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [newColor, setNewColor] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getColors().then(setColors)
  }, [])

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  function isDuplicate(name: string) {
    return colors.some(c => c.toLowerCase() === name.trim().toLowerCase())
  }

  async function handleAdd() {
    const trimmed = newColor.trim()
    if (!trimmed) { cancel(); return }
    if (isDuplicate(trimmed)) {
      // Seleccionar el existente y cerrar
      const existing = colors.find(c => c.toLowerCase() === trimmed.toLowerCase())!
      onChange(existing)
      cancel()
      return
    }
    await addColor(trimmed)
    const updated = await getColors()
    setColors(updated)
    onChange(trimmed)
    cancel()
  }

  function cancel() {
    setAdding(false)
    setNewColor("")
    setError("")
  }

  if (adding) {
    return (
      <div style={{ width: "100%", boxSizing: "border-box", ...style }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", width: "100%", boxSizing: "border-box" }}>
          <input
            ref={inputRef}
            value={newColor}
            onChange={e => { setNewColor(e.target.value); setError("") }}
            onKeyDown={e => {
              if (e.key === "Enter") handleAdd()
              if (e.key === "Escape") cancel()
            }}
            placeholder="Nombre del color..."
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
        {error && (
          <div style={{ fontSize: "12px", color: "#dc2626", marginTop: "5px" }}>{error}</div>
        )}
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={e => {
        if (e.target.value === "__add__") {
          setAdding(true)
        } else {
          onChange(e.target.value)
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
      <option value="">Sin color</option>
      {colors.map(c => (
        <option key={c} value={c}>{c}</option>
      ))}
      <option disabled style={{ color: "#ccc" }}>──────────</option>
      <option value="__add__">+ Añadir color...</option>
    </select>
  )
}