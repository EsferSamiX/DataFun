interface ConcernsListProps {
  concerns: string[]
}

export default function ConcernsList({ concerns }: ConcernsListProps) {
  if (concerns.length === 0) return null
  return (
    <div>
      <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#e5e7eb", marginBottom: "10px" }}>
        ⚠️ Concerns
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {concerns.map((concern, i) => (
          <div key={i} style={{
            display: "flex",
            gap: "10px",
            background: "#1c1400",
            border: "1px solid #44370a",
            borderRadius: "8px",
            padding: "10px 14px",
            fontSize: "14px",
            color: "#fbbf24",
          }}>
            <span style={{ flexShrink: 0 }}>•</span>
            <span>{concern}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
