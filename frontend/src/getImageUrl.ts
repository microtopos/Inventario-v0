import { invoke } from "@tauri-apps/api/core"

// Caché en memoria: productId → data URL base64
const _cache: Map<number, string> = new Map()

/**
 * Devuelve una data URL (base64) de la imagen del producto.
 * Si no existe imagen, devuelve "".
 * Cachea el resultado para no releer de disco en cada render.
 */
export async function getImageUrl(productId: number): Promise<string> {
  if (_cache.has(productId)) return _cache.get(productId)!

  const b64: string = await invoke("read_product_image", { productId })
  const url = b64 ? `data:image/jpeg;base64,${b64}` : ""
  _cache.set(productId, url)
  return url
}

/**
 * Versión síncrona — solo devuelve algo si ya está en caché.
 * Útil para render inicial cuando ya se ha precargado.
 */
export function getImageUrlSync(productId: number): string {
  return _cache.get(productId) ?? ""
}

/** Invalida la caché de un producto (llamar tras guardar imagen nueva). */
export function invalidateImageCache(productId: number): void {
  _cache.delete(productId)
}

/** Precarga las imágenes de una lista de IDs en paralelo. */
export async function preloadImages(productIds: number[]): Promise<void> {
  const missing = productIds.filter(id => !_cache.has(id))
  if (!missing.length) return
  await Promise.all(missing.map(id => getImageUrl(id)))
}
