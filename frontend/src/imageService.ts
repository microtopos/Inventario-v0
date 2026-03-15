import { invoke } from "@tauri-apps/api/core"
import { open as openDialog } from "@tauri-apps/plugin-dialog"

/**
 * Abre el selector de archivo nativo y guarda la imagen elegida.
 * Rust lee el fichero directamente desde disco → JS no se bloquea.
 * Devuelve true si se eligió una imagen, false si se canceló.
 */
export async function pickAndSaveProductImage(productId: number): Promise<boolean> {
  const selected = await openDialog({
    title: "Seleccionar imagen",
    filters: [{ name: "Imágenes", extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"] }],
    multiple: false,
    directory: false,
  })

  if (!selected) return false

  const path = typeof selected === "string" ? selected : (selected as any)[0]

  await invoke("save_product_image_from_path", {
    productId,
    srcPath: path,
  })

  return true
}

/** Fallback original por si se necesita subir desde un <input type="file"> */
export async function saveProductImage(productId: number, file: File) {
  const buffer = await file.arrayBuffer()
  await invoke("save_product_image", {
    productId,
    data: new Uint8Array(buffer),
  })
}

export async function deleteProductImage(productId: number) {
  await invoke("delete_product_image", { productId })
}
