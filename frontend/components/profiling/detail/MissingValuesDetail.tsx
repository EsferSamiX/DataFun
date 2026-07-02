"use client"

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import type { ProfileResult } from "@/lib/api"

interface Props { profile: ProfileResult }

export default function MissingValuesDetail({ profile }: Props) {
  const columnsWithMissing = profile.columns
    .filter((c) => c.missing_count > 0)
    .sort((a, b) => b.missing_pct - a.missing_pct)

  if (columnsWithMissing.length === 0) {
    return (
      <p style={{ color: "#22c55e", fontSize: "15px" }}>
        ✓ No missing values found in this dataset.
      </p>
    )
  }

  const chartData = columnsWithMissing.slice(0, 20).map((c) => ({
    name: c.name.length > 12 ? c.name.slice(0, 12) + "…" : c.name,
    value: parseFloat(c.missing_pct.toFixed(1)),
    fullName: c.name,
  }))

  const chart = profile.plots?.missing_values_chart

  return (
    <div>
      {/* matplotlib chart from backend */}
      {chart && (
        <div style={{ marginBottom: "20px" }}>
          <img src={`data:image/png;base64,${chart}`} alt="Missing values chart"
               style={{ maxWidth: "100%", borderRadius: "8px", border: "1px solid #2a2a2a" }} />
        </div>
      )}

      {/* recharts fallback / interactive version */}
      <div style={{ height: 220, marginBottom: "20px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 40, left: 0 }}>
            <XAxis
              dataKey="name"
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              angle={-35}
              textAnchor="end"
              interval={0}
            />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} unit="%" />
            <Tooltip
              contentStyle={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px" }}
              labelStyle={{ color: "#e5e7eb" }}
              itemStyle={{ color: "#a5b4fc" }}
              formatter={(v: number) => [`${v}%`, "Missing"]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.value >= 50 ? "#ef4444" : entry.value >= 20 ? "#f59e0b" : "#6366f1"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
            {["Column", "Type", "Missing Count", "Missing %"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#9ca3af", fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columnsWithMissing.map((col) => (
            <tr key={col.name} style={{ borderBottom: "1px solid #1f1f1f" }}>
              <td style={{ padding: "8px 12px", color: "#e5e7eb" }}>{col.name}</td>
              <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{col.dtype}</td>
              <td style={{ padding: "8px 12px", color: "#e5e7eb" }}>{col.missing_count.toLocaleString()}</td>
              <td style={{ padding: "8px 12px", color: col.missing_pct >= 50 ? "#ef4444" : col.missing_pct >= 20 ? "#f59e0b" : "#e5e7eb" }}>
                {col.missing_pct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
