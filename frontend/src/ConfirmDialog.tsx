import { useState, useEffect, useRef, useCallback } from "react"

// ─── Tipos ────────────────────────────────────────────────────────────────────

type DialogType = "confirm" | "alert"

interface DialogState {
  type: DialogType
  message: string
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  resolve: (value: boolean) => void
}

// ─── Componente visual ────────────────────────────────────────────────────────

function Dialog({ state, onConfirm, onCancel }: {
  state: DialogState
  onConfirm: () => void
  onCancel: () => void
}) {
  const isDanger = state.danger
  const isAlert = state.type === "alert"

  // Refs para que el listener siempre llame a la versión más reciente
  const onConfirmRef = useRef(onConfirm)
  const onCancelRef = useRef(onCancel)
  const isAlertRef = useRef(isAlert)
  useEffect(() => { onConfirmRef.current = onConfirm }, [onConfirm])
  useEffect(() => { onCancelRef.current = onCancel }, [onCancel])
  useEffect(() => { isAlertRef.current = isAlert }, [isAlert])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Enter") { e.preventDefault(); onConfirmRef.current() }
      if (e.key === "Escape") { e.preventDefault(); isAlertRef.current ? onConfirmRef.current() : onCancelRef.current() }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, []) // solo se registra una vez al montar

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={isAlert ? onConfirm : undefined}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "14px",
          width: "400px",
          overflow: "hidden",
          boxShadow: "0 16px 48px rgba(0,0,0,0.18)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Franja de color superior */}
        <div style={{
          height: "4px",
          backgroundColor: isDanger ? "#dc2626" : isAlert ? "#2563eb" : "#111",
        }} />

        {/* Contenido */}
        <div style={{ padding: "28px" }}>

          {/* Icono + mensaje */}
          <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", marginBottom: "20px" }}>
            <div style={{
              width: "38px",
              height: "38px",
              borderRadius: "50%",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "17px",
              backgroundColor: isDanger ? "#fee2e2" : isAlert ? "#eff6ff" : "#f3f4f6",
            }}>
              {isDanger ? "⚠️" : isAlert ? "✓" : "?"}
            </div>
            <div style={{ paddingTop: "4px" }}>
              <p style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#111", lineHeight: 1.45 }}>
                {state.message}
              </p>
              {state.detail && (
                <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#666", lineHeight: 1.5 }}>
                  {state.detail}
                </p>
              )}
            </div>
          </div>

          {/* Botones */}
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            {!isAlert && (
              <button
                onClick={onCancel}
                style={{
                  padding: "9px 22px",
                  borderRadius: "8px",
                  border: "1px solid #e0e0e0",
                  backgroundColor: "#fff",
                  color: "#555",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                  minWidth: "90px",
                }}
              >
                {state.cancelLabel ?? "Cancelar"}
              </button>
            )}
            <button
              onClick={onConfirm}
              autoFocus
              style={{
                padding: "9px 22px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: isDanger ? "#dc2626" : isAlert ? "#2563eb" : "#111",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                minWidth: "90px",
              }}
            >
              {state.confirmLabel ?? (isAlert ? "Entendido" : "Confirmar")}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useConfirm() {
  const [state, setState] = useState<DialogState | null>(null)

  const confirm = useCallback((
    message: string,
    options?: { detail?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
  ): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ type: "confirm", message, ...options, resolve })
    })
  }, [])

  const alert = useCallback((
    message: string,
    options?: { detail?: string; confirmLabel?: string }
  ): Promise<void> => {
    return new Promise(resolve => {
      setState({ type: "alert", message, danger: false, ...options, resolve: () => resolve() })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    setState(prev => { prev?.resolve(true); return null })
  }, [])

  const handleCancel = useCallback(() => {
    setState(prev => { prev?.resolve(false); return null })
  }, [])

  const dialog = state ? (
    <Dialog state={state} onConfirm={handleConfirm} onCancel={handleCancel} />
  ) : null

  return { confirm, alert, dialog }
}