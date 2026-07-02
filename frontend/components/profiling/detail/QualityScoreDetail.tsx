import type { ProfileResult } from "@/lib/api"
import GradeBadge from "@/components/shared/GradeBadge"

interface Props { profile: ProfileResult }

function DimensionBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "13px" }}>
        <span style={{ color: "#d1d5db" }}>{label}</span>
        <span style={{ color: "#e5e7eb", fontWeight: 600 }}>{Math.round(value)}/100</span>
      </div>
      <div style={{ background: "#2a2a2a", borderRadius: "4px", height: "8px", overflow: "hidden" }}>
        <div style={{
          background: value >= 80 ? "#22c55e" : value >= 60 ? "#f59e0b" : "#ef4444",
          height: "8px",
          borderRadius: "4px",
          width: `${value}%`,
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  )
}

export default function QualityScoreDetail({ profile }: Props) {
  const qs = typeof profile.quality_score === "object" ? profile.quality_score : null
  const overall = qs?.overall ?? (typeof profile.quality_score === "number" ? profile.quality_score : 0)
  const grade = qs?.grade ?? profile.quality_grade ?? "?"
  const bd = qs ?? profile.quality_breakdown

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "24px" }}>
        <GradeBadge grade={grade as any} large />
        <div>
          <div style={{ fontSize: "32px", fontWeight: 700, color: "#e5e7eb" }}>{Math.round(overall)}/100</div>
          <div style={{ fontSize: "13px", color: "#9ca3af" }}>Overall data quality score</div>
        </div>
      </div>
      <DimensionBar label="Completeness" value={bd?.completeness ?? 0} />
      <DimensionBar label="Uniqueness" value={bd?.uniqueness ?? 0} />
      <DimensionBar label="Consistency" value={bd?.consistency ?? 0} />
      <DimensionBar label="Validity" value={bd?.validity ?? 0} />
    </div>
  )
}
