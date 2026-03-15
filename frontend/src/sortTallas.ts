const ORDEN_TALLAS = [
  "5XS", "4XS", "3XS", "2XS", "XS",
  "S", "M", "L", "XL",
  "2XL", "3XL", "4XL", "5XL",
]

export function ordenarTallas(a: string, b: string): number {
  const na = String(a).trim().toUpperCase()
  const nb = String(b).trim().toUpperCase()

  const ia = ORDEN_TALLAS.indexOf(na)
  const ib = ORDEN_TALLAS.indexOf(nb)

  // Ambas reconocidas → orden del array
  if (ia !== -1 && ib !== -1) return ia - ib

  // Una reconocida, la otra no → la reconocida va primero
  if (ia !== -1) return -1
  if (ib !== -1) return 1

  // Ambas numéricas → orden numérico (cubre 36, 38, 38.5…)
  const numA = parseFloat(na)
  const numB = parseFloat(nb)
  if (!isNaN(numA) && !isNaN(numB)) return numA - numB

  // Fallback alfabético
  return na.localeCompare(nb)
}