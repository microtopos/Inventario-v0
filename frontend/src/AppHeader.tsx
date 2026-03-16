type Page = "inventory" | "dashboard" | "orders" | "orderHistory"

interface AppHeaderProps {
  page: Page
  onNavigate: (page: Page) => void
  onBack?: () => void
  title?: string
  actions?: React.ReactNode
}

export default function AppHeader({ page, onNavigate, onBack, title, actions }: AppHeaderProps) {
  return (
    <header style={{
      backgroundColor: "#fff",
      borderBottom: "1px solid #e0e0e0",
      padding: "0 32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: "64px",
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      {/* LADO IZQUIERDO: logo + breadcrumb */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <h1
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "#111",
            margin: 0,
            letterSpacing: "-0.3px",
            whiteSpace: "nowrap",
          }}
        >
          Gestión de Ropa
        </h1>

        {onBack && (
          <div style={{ display: "flex", alignItems: "center", marginLeft: "12px" }}>
            <span style={{ color: "#ddd", fontSize: "20px", fontWeight: 300, margin: "0 8px" }}>/</span>
            {/* Clic en la sección vuelve atrás */}
            <button
              onClick={onBack}
              style={{
                background: "none", border: "none", padding: "4px 8px",
                fontSize: "14px", color: "#888", cursor: "pointer",
                borderRadius: "5px", fontWeight: 500,
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f5f5f5")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "")}
            >
              {page === "inventory"
                ? "Inventario"
                : page === "dashboard"
                ? "Estadísticas"
                : page === "orders"
                ? "Pedidos"
                : "Historial"}
            </button>
            {title && (
              <>
                <span style={{ color: "#ddd", fontSize: "20px", fontWeight: 300, margin: "0 8px" }}>/</span>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "#111" }}>
                  {title}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* LADO DERECHO: acciones opcionales + tabs (siempre visibles) */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {actions}
        {([
          { key: "inventory", label: "📦 Inventario" },
          { key: "dashboard", label: "📊 Estadísticas" },
          { key: "orders",    label: "🛒 Pedidos" },
          { key: "orderHistory", label: "📋 Historial" },
        ] as { key: Page; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onNavigate(key)}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: page === key ? "#111" : "transparent",
              color: page === key ? "#fff" : "#555",
              fontWeight: 500,
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </header>
  )
}
