interface PriorityBadgeProps {
  priority: "HIGH" | "MEDIUM" | "LOW"
}

const PRIORITY_STYLES: Record<string, { bg: string; color: string; emoji: string }> = {
  HIGH: { bg: "#3f1212", color: "#fca5a5", emoji: "🔴" },
  MEDIUM: { bg: "#1c1400", color: "#fbbf24", emoji: "🟡" },
  LOW: { bg: "#052e16", color: "#86efac", emoji: "🟢" },
}

export default function PriorityBadge({ priority }: PriorityBadgeProps) {
  const s = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.MEDIUM
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      background: s.bg,
      color: s.color,
      borderRadius: "4px",
      padding: "2px 8px",
      fontSize: "11px",
      fontWeight: 700,
      flexShrink: 0,
    }}>
      {s.emoji} {priority}
    </span>
  )
}
