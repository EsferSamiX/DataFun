interface SpeedBadgeProps {
  speed: "fast" | "medium" | "slow"
}

const SPEED_STYLES: Record<string, { color: string; label: string; emoji: string }> = {
  fast: { color: "#22c55e", label: "Fast", emoji: "⚡" },
  medium: { color: "#f59e0b", label: "Medium", emoji: "⏱" },
  slow: { color: "#ef4444", label: "Slow", emoji: "🐢" },
}

export default function SpeedBadge({ speed }: SpeedBadgeProps) {
  const s = SPEED_STYLES[speed] ?? SPEED_STYLES.medium
  return (
    <span style={{
      color: s.color,
      fontSize: "12px",
      fontWeight: 600,
    }}>
      {s.emoji} {s.label}
    </span>
  )
}
