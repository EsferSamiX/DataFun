"use client"

import type { ProfileResult } from "@/lib/api"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"

interface Props { profile: ProfileResult }

const BAR_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#f97316", "#14b8a6"]

const SEVERITY_COLORS: Record<string, string> = {
  none: "#22c55e",
  mild: "#84cc16",
  moderate: "#f59e0b",
  severe: "#ef4444",
}

export default function TargetAnalysisDetail({ profile }: Props) {
  const ta = profile.target_analysis
  if (!ta) {
    return <p style={{ color: "#9ca3af" }}>No target column was specified. Re-upload with a target column selected.</p>
  }

  const taskTypeLabel = ta.task_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

  // Look up column stats for the confirmed target column
  const colName = ta.column
  const colStats = colName ? profile.columns?.find((c) => c.name === colName) : undefined

  // Use per-column distribution plot from profiling (always available), fall back to target_distribution
  const targetDistImg = colName
    ? ((profile.plots as any)?.column_distributions?.[colName] ?? profile.plots?.target_distribution)
    : profile.plots?.target_distribution

  // Build distribution data: prefer class_distribution, fall back to column top_values
  const distData = ta.class_distribution && ta.class_distribution.length > 0
    ? ta.class_distribution
    : colStats?.top_values?.map((tv) => ({ label: String(tv.value), count: tv.count, pct: tv.pct }))

  const isRegression = ta.task_type === "regression"
  const isNumeric = isRegression && colStats && (colStats.type === "float" || colStats.type === "integer")

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Badges */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        {colName && (
          <div style={{
            background: "#0f172a", border: "1px solid #1e293b",
            borderRadius: "8px", padding: "8px 16px",
            color: "#94a3b8", fontSize: "13px", fontWeight: 500,
          }}>
            column: <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{colName}</span>
          </div>
        )}
        <div style={{
          background: "#1e1b4b", border: "1px solid #3730a3",
          borderRadius: "8px", padding: "8px 16px",
          color: "#a5b4fc", fontSize: "14px", fontWeight: 600,
        }}>
          {taskTypeLabel}
        </div>
        {ta.imbalance_severity && ta.imbalance_severity !== "none" && (
          <div style={{
            background: "#1c1400", border: "1px solid #44370a",
            borderRadius: "8px", padding: "8px 16px",
            color: SEVERITY_COLORS[ta.imbalance_severity] ?? "#9ca3af",
            fontSize: "14px", fontWeight: 600,
          }}>
            Imbalance: {ta.imbalance_ratio?.toFixed(1)}:1 ({ta.imbalance_severity})
          </div>
        )}
      </div>

      {/* Distribution: precomputed PNG if available */}
      {targetDistImg && (
        <img
          src={`data:image/png;base64,${targetDistImg}`}
          alt="Target distribution"
          style={{ width: "100%", height: "auto", maxHeight: "360px", objectFit: "contain", borderRadius: "10px", display: "block", margin: "0 auto" }}
        />
      )}

      {/* Numeric stats when no plot and column is numeric */}
      {!targetDistImg && isNumeric && colStats && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "10px",
        }}>
          {[
            { label: "Min", value: colStats.min?.toFixed(3) },
            { label: "Max", value: colStats.max?.toFixed(3) },
            { label: "Mean", value: colStats.mean?.toFixed(3) },
            { label: "Std", value: colStats.std?.toFixed(3) },
            { label: "Median (p50)", value: colStats.p50?.toFixed(3) },
            { label: "Unique values", value: colStats.unique_count?.toLocaleString() },
          ].filter((s) => s.value !== undefined).map((s) => (
            <div key={s.label} style={{
              background: "#111", border: "1px solid #1f1f1f", borderRadius: "8px", padding: "10px 14px",
            }}>
              <div style={{ color: "#6b7280", fontSize: "11px", marginBottom: "4px" }}>{s.label}</div>
              <div style={{ color: "#e5e7eb", fontSize: "15px", fontWeight: 600 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Class distribution bar chart */}
      {!targetDistImg && distData && distData.length > 0 && (
        <div>
          <h4 style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "12px", fontWeight: 500 }}>
            Class Distribution
          </h4>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={distData}
                margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              >
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#9ca3af", fontSize: 13 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px" }}
                  formatter={(v: number, _name: string, entry: any) => [
                    `${v.toLocaleString()} (${entry.payload.pct?.toFixed(1)}%)`,
                    "Count",
                  ]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {distData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {ta.recommended_strategy && (
        <div style={{ fontSize: "14px" }}>
          <span style={{ color: "#9ca3af" }}>Recommended strategy: </span>
          <span style={{ color: "#a5b4fc", fontWeight: 500 }}>{ta.recommended_strategy}</span>
        </div>
      )}

      {ta.top_correlated_features && ta.top_correlated_features.length > 0 && (
        <div>
          <h4 style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "10px", fontWeight: 500 }}>Top Correlated Features</h4>
          {ta.top_correlated_features.slice(0, 8).map((f, i) => (
            <div key={i} style={{ marginBottom: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "2px" }}>
                <span style={{ color: "#d1d5db" }}>{f.name}</span>
                <span style={{ color: "#9ca3af" }}>{f.correlation.toFixed(3)}</span>
              </div>
              <div style={{ background: "#2a2a2a", borderRadius: "2px", height: "5px" }}>
                <div style={{ background: "#6366f1", borderRadius: "2px", height: "5px", width: `${Math.abs(f.correlation) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {ta.leakage_candidates && ta.leakage_candidates.length > 0 && (
        <div style={{ background: "#3f1212", border: "1px solid #7f1d1d", borderRadius: "8px", padding: "12px" }}>
          <div style={{ color: "#fca5a5", fontWeight: 600, marginBottom: "6px", fontSize: "13px" }}>
            Potential Data Leakage Detected
          </div>
          {ta.leakage_candidates.map((c) => (
            <div key={c} style={{ color: "#fca5a5", fontSize: "13px" }}>{c}</div>
          ))}
        </div>
      )}
    </div>
  )
}
