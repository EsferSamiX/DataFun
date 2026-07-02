interface GradeBadgeProps {
  grade: "A" | "B" | "C" | "D"
  large?: boolean
}

const GRADE_STYLES: Record<string, { bg: string; border: string; color: string }> = {
  A: { bg: "#052e16", border: "#14532d", color: "#22c55e" },
  B: { bg: "#1e3a5f", border: "#1d4ed8", color: "#60a5fa" },
  C: { bg: "#1c1400", border: "#44370a", color: "#f59e0b" },
  D: { bg: "#3f1212", border: "#7f1d1d", color: "#ef4444" },
}

export default function GradeBadge({ grade, large }: GradeBadgeProps) {
  const s = GRADE_STYLES[grade] ?? GRADE_STYLES.C
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: s.bg,
      border: `2px solid ${s.border}`,
      borderRadius: large ? "12px" : "6px",
      color: s.color,
      fontWeight: 700,
      fontSize: large ? "32px" : "13px",
      width: large ? "60px" : "28px",
      height: large ? "60px" : "24px",
    }}>
      {grade}
    </div>
  )
}
