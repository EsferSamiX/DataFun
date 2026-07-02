import type { ProfileResult } from "@/lib/api"
import PriorityBadge from "@/components/shared/PriorityBadge"

interface Props { profile: ProfileResult }

const IMPACT_COLOR: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: "11px",
      fontWeight: 600,
      color,
      background: `${color}18`,
      border: `1px solid ${color}40`,
      borderRadius: "4px",
      padding: "2px 7px",
      textTransform: "uppercase",
      letterSpacing: "0.04em",
    }}>
      {label}
    </span>
  )
}

export default function RecommendationsDetail({ profile }: Props) {
  const sorted = [...profile.recommendations].sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return order[a.priority] - order[b.priority]
  })

  if (sorted.length === 0) {
    return <p style={{ color: "#22c55e" }}>✓ No major recommendations — your dataset looks clean!</p>
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {sorted.map((rec, i) => (
        <div key={i} style={{
          background: "#0f0f0f",
          border: "1px solid #2a2a2a",
          borderRadius: "8px",
          padding: "14px",
        }}>
          {/* Header row: priority badge + message */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "8px" }}>
            <PriorityBadge priority={rec.priority} />
            <span style={{ fontSize: "14px", color: "#e5e7eb", fontWeight: 500, wordBreak: "break-word", minWidth: 0, flex: 1 }}>
              {rec.message.length > 200 ? rec.message.slice(0, 200) + "…" : rec.message}
            </span>
          </div>

          {/* Action */}
          <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#9ca3af", paddingLeft: "4px", wordBreak: "break-word" }}>
            → {rec.action}
          </p>

          {/* Metadata chips */}
          {(rec.category || rec.impact || rec.effort) && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", paddingLeft: "4px" }}>
              {rec.category && (
                <Chip label={rec.category} color="#6366f1" />
              )}
              {rec.impact && (
                <Chip label={`Impact: ${rec.impact}`} color={IMPACT_COLOR[rec.impact] ?? "#9ca3af"} />
              )}
              {rec.effort && (
                <Chip label={`Effort: ${rec.effort}`} color={IMPACT_COLOR[rec.effort] ?? "#9ca3af"} />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
