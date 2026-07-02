import type { ProfileResult } from "@/lib/api"

interface Props { profile: ProfileResult }

export default function CorrelationDetail({ profile }: Props) {
  const sorted = [...profile.correlations].sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
  const heatmap = profile.plots?.correlation_heatmap

  if (sorted.length === 0 && !heatmap) {
    return <p style={{ color: "#9ca3af" }}>No correlations computed (need at least 2 numeric columns).</p>
  }

  return (
    <div>
      {/* matplotlib heatmap */}
      {heatmap && (
        <div style={{ marginBottom: "20px" }}>
          <img src={`data:image/png;base64,${heatmap}`} alt="Correlation heatmap"
               style={{ maxWidth: "100%", borderRadius: "8px", border: "1px solid #2a2a2a" }} />
        </div>
      )}

      {/* table below */}
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
            {["Column 1", "Column 2", "Correlation", "Method", "p-value", "Significant"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#9ca3af", fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((pair, i) => {
            const absCorr = Math.abs(pair.correlation)
            const color = absCorr >= 0.7 ? "#22c55e" : absCorr >= 0.4 ? "#f59e0b" : "#9ca3af"
            return (
              <tr key={i} style={{ borderBottom: "1px solid #1f1f1f" }}>
                <td style={{ padding: "8px 12px", color: "#e5e7eb" }}>{pair.col1}</td>
                <td style={{ padding: "8px 12px", color: "#e5e7eb" }}>{pair.col2}</td>
                <td style={{ padding: "8px 12px", color, fontWeight: 600 }}>
                  {pair.correlation.toFixed(3)}
                </td>
                <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{pair.method}</td>
                <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{pair.p_value.toFixed(4)}</td>
                <td style={{ padding: "8px 12px" }}>
                  {pair.significant ? (
                    <span style={{ color: "#22c55e", fontSize: "12px", background: "#052e16", padding: "2px 8px", borderRadius: "4px" }}>Yes</span>
                  ) : (
                    <span style={{ color: "#6b7280", fontSize: "12px" }}>No</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </div>
  )
}
