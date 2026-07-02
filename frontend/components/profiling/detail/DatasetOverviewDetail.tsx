import type { ProfileResult } from "@/lib/api"

interface Props { profile: ProfileResult }

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      background: "#0f0f0f",
      border: "1px solid #2a2a2a",
      borderRadius: "8px",
      padding: "14px 18px",
    }}>
      <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "18px", fontWeight: 700, color: "#e5e7eb" }}>{value}</div>
    </div>
  )
}

function DimBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ marginBottom: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
        <span style={{ color: "#d1d5db" }}>{label}</span>
        <span style={{ color: "#e5e7eb", fontWeight: 600 }}>{Math.round(value)}/100</span>
      </div>
      <div style={{ background: "#2a2a2a", borderRadius: "4px", height: "6px" }}>
        <div style={{
          background: value >= 80 ? "#22c55e" : value >= 60 ? "#f59e0b" : "#ef4444",
          height: "6px", borderRadius: "4px", width: `${value}%`,
        }} />
      </div>
    </div>
  )
}

function formatMemory(profile: ProfileResult): string {
  const bytes = profile.memory_usage_bytes ?? (profile.memory_mb ? profile.memory_mb * 1048576 : 0)
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export default function DatasetOverviewDetail({ profile }: Props) {
  const qs = typeof profile.quality_score === "object" ? profile.quality_score : null
  const overall = qs?.overall ?? (typeof profile.quality_score === "number" ? profile.quality_score : 0)
  const grade = qs?.grade ?? profile.quality_grade ?? "?"

  return (
    <div>
      {/* Core stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
        <StatBox label="Rows" value={profile.num_rows.toLocaleString()} />
        <StatBox label="Columns" value={profile.num_columns} />
        <StatBox label="Memory" value={formatMemory(profile)} />
        <StatBox label="Format" value={profile.file_format?.toUpperCase() ?? "—"} />
        <StatBox
          label="Missing Cells"
          value={`${(profile.missing_cells ?? 0).toLocaleString()} (${(profile.missing_cells_pct ?? 0).toFixed(1)}%)`}
        />
        <StatBox
          label="Duplicate Rows"
          value={`${(profile.duplicate_rows ?? 0).toLocaleString()} (${(profile.duplicate_rows_pct ?? 0).toFixed(1)}%)`}
        />
      </div>

      {/* Quality Score summary */}
      <div style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "8px", display: "flex", alignItems: "center",
            justifyContent: "center", fontWeight: 700, fontSize: "16px",
            background: overall >= 80 ? "#14532d" : overall >= 60 ? "#78350f" : "#7f1d1d",
            color: overall >= 80 ? "#22c55e" : overall >= 60 ? "#f59e0b" : "#ef4444",
          }}>
            {grade}
          </div>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#e5e7eb" }}>{Math.round(overall)}/100</div>
            <div style={{ fontSize: "12px", color: "#9ca3af" }}>Quality Score</div>
          </div>
        </div>
        {qs && (
          <>
            <DimBar label="Completeness" value={qs.completeness ?? 0} />
            <DimBar label="Uniqueness" value={qs.uniqueness ?? 0} />
            <DimBar label="Consistency" value={qs.consistency ?? 0} />
            <DimBar label="Validity" value={qs.validity ?? 0} />
          </>
        )}
      </div>
    </div>
  )
}
