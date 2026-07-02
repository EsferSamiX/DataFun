import type { ProfileResult } from "@/lib/api"

interface Props { profile: ProfileResult }

export default function DuplicatesDetail({ profile }: Props) {
  const hasDups = profile.duplicate_rows > 0
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{
        display: "flex",
        gap: "16px",
        flexWrap: "wrap",
      }}>
        <div style={{
          background: "#0f0f0f",
          border: "1px solid #2a2a2a",
          borderRadius: "8px",
          padding: "14px 20px",
          minWidth: "160px",
        }}>
          <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>Duplicate Rows</div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: hasDups ? "#f59e0b" : "#22c55e" }}>
            {profile.duplicate_rows.toLocaleString()}
          </div>
        </div>
        <div style={{
          background: "#0f0f0f",
          border: "1px solid #2a2a2a",
          borderRadius: "8px",
          padding: "14px 20px",
          minWidth: "160px",
        }}>
          <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>Percentage</div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: hasDups ? "#f59e0b" : "#22c55e" }}>
            {profile.duplicate_rows_pct.toFixed(2)}%
          </div>
        </div>
      </div>
      {hasDups ? (
        <div style={{
          background: "#1c1400",
          border: "1px solid #44370a",
          borderRadius: "8px",
          padding: "14px",
          color: "#fbbf24",
          fontSize: "14px",
        }}>
          ⚠️ {profile.duplicate_rows.toLocaleString()} duplicate rows detected ({profile.duplicate_rows_pct.toFixed(2)}% of dataset).
          Consider deduplicating before model training using <code style={{ color: "#a5b4fc" }}>df.drop_duplicates()</code>.
        </div>
      ) : (
        <div style={{
          background: "#052e16",
          border: "1px solid #14532d",
          borderRadius: "8px",
          padding: "14px",
          color: "#22c55e",
          fontSize: "14px",
        }}>
          ✓ No duplicate rows found. Your dataset is clean on this dimension.
        </div>
      )}
    </div>
  )
}
