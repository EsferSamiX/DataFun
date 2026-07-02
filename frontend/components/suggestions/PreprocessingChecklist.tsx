interface PreprocessingChecklistProps {
  steps: string[]
}

export default function PreprocessingChecklist({ steps }: PreprocessingChecklistProps) {
  if (steps.length === 0) return null
  return (
    <div>
      <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#e5e7eb", marginBottom: "10px" }}>
        Preprocessing Steps
      </h3>
      <ol style={{ paddingLeft: "0", margin: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
        {steps.map((step, i) => (
          <li key={i} style={{
            display: "flex",
            gap: "10px",
            background: "#0f0f0f",
            border: "1px solid #2a2a2a",
            borderRadius: "8px",
            padding: "10px 14px",
            fontSize: "14px",
            color: "#d1d5db",
            alignItems: "flex-start",
          }}>
            <span style={{
              flexShrink: 0,
              width: "22px",
              height: "22px",
              background: "#2a2a2a",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "11px",
              color: "#9ca3af",
              fontWeight: 700,
            }}>
              {i + 1}
            </span>
            <span style={{ paddingTop: "2px" }}>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
