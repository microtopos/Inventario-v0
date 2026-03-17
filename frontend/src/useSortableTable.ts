import { useMemo, useState } from "react"

export type SortDir = "asc" | "desc"

function isNil(v: any) {
  return v === null || v === undefined
}

function toComparable(value: any, key?: string): { type: "nil" | "number" | "string"; v: any } {
  if (isNil(value)) return { type: "nil", v: null }
  if (typeof value === "number") return { type: "number", v: value }
  if (typeof value === "boolean") return { type: "number", v: value ? 1 : 0 }

  // Fechas: si el key sugiere fecha y parsea bien → número (timestamp)
  if (typeof value === "string" && key && key.toLowerCase().includes("fecha")) {
    const ts = Date.parse(value)
    if (!Number.isNaN(ts)) return { type: "number", v: ts }
  }

  return { type: "string", v: String(value).toLowerCase() }
}

export function useSortableTable<T extends Record<string, any>, K extends keyof T>(
  data: T[],
  defaultKey: K
): {
  sorted: T[]
  sortKey: K
  sortDir: SortDir
  toggleSort: (key: K) => void
} {
  const [sortKey, setSortKey] = useState<K>(defaultKey)
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  function toggleSort(key: K) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1
    return [...data].sort((a, b) => {
      const av = toComparable(a[sortKey], String(sortKey))
      const bv = toComparable(b[sortKey], String(sortKey))

      // nil al final
      if (av.type === "nil" && bv.type === "nil") return 0
      if (av.type === "nil") return 1
      if (bv.type === "nil") return -1

      if (av.type === "number" && bv.type === "number") {
        return (av.v - bv.v) * dir
      }

      // string
      return String(av.v).localeCompare(String(bv.v), "es-ES") * dir
    })
  }, [data, sortKey, sortDir])

  return { sorted, sortKey, sortDir, toggleSort }
}

