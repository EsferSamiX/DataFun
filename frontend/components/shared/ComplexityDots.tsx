interface ComplexityDotsProps {
  complexity: "low" | "medium" | "high"
}

export default function ComplexityDots({ complexity }: ComplexityDotsProps) {
  const filled = complexity === "low" ? 1 : complexity === "medium" ? 2 : 3
  return (
    <span style={{ display: "inline-flex", gap: "3px" }}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: i <= filled ? "#6366f1" : "#2a2a2a",
            display: "inline-block",
          }}
        />
      ))}
    </span>
  )
}
