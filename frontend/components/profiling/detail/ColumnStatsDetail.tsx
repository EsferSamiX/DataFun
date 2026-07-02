"use client"

import { useState } from "react"
import type { ProfileResult, ColumnInfo } from "@/lib/api"

interface Props { profile: ProfileResult }

const NUMERIC_TYPES = new Set(["integer", "float", "boolean"])
const CAT_TYPES = new Set(["string", "categorical"])
const DT_TYPES = new Set(["datetime"])

function isNumeric(c: ColumnInfo) { return NUMERIC_TYPES.has(c.type) || c.kind === "numeric" }
function isCat(c: ColumnInfo) { return CAT_TYPES.has(c.type) || c.kind === "categorical" }
function isDt(c: ColumnInfo) { return DT_TYPES.has(c.type) || c.kind === "datetime" }

function SummaryTable({ columns }: { columns: ColumnInfo[] }) {
  return (
    <div style={{ overflowX: "auto", marginBottom: "20px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #2a2a2a", background: "#161616" }}>
            {["Column", "Type", "Missing %", "Unique"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#9ca3af", fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => (
            <tr key={col.name} style={{ borderBottom: "1px solid #1f1f1f" }}>
              <td style={{ padding: "8px 12px", color: "#e5e7eb", fontWeight: 500 }}>{col.name}</td>
              <td style={{ padding: "8px 12px", color: "#a5b4fc" }}>{col.type ?? col.dtype ?? "—"}</td>
              <td style={{ padding: "8px 12px", color: col.missing_pct > 0 ? "#f59e0b" : "#22c55e" }}>
                {col.missing_pct.toFixed(1)}%
              </td>
              <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{col.unique_count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NumericTable({ columns }: { columns: ColumnInfo[] }) {
  if (columns.length === 0) return <p style={{ color: "#9ca3af" }}>No numeric columns.</p>
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "600px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
            {["Column", "Min", "Max", "Mean", "Std", "Skewness", "Missing%"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#9ca3af", fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => (
            <tr key={col.name} style={{ borderBottom: "1px solid #1f1f1f" }}>
              <td style={{ padding: "8px 12px", color: "#e5e7eb", fontWeight: 500 }}>{col.name}</td>
              <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{col.min?.toLocaleString() ?? "—"}</td>
              <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{col.max?.toLocaleString() ?? "—"}</td>
              <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{col.mean != null ? col.mean.toFixed(2) : "—"}</td>
              <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{col.std != null ? col.std.toFixed(2) : "—"}</td>
              <td style={{ padding: "8px 12px", color: col.skewness != null && Math.abs(col.skewness) > 1 ? "#f59e0b" : "#9ca3af" }}>
                {col.skewness != null ? col.skewness.toFixed(2) : "—"}
                {col.skewness != null && Math.abs(col.skewness) > 1 ? " ⚠️" : ""}
              </td>
              <td style={{ padding: "8px 12px", color: col.missing_pct > 0 ? "#f59e0b" : "#9ca3af" }}>
                {col.missing_pct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CategoricalPanel({ columns }: { columns: ColumnInfo[] }) {
  if (columns.length === 0) return <p style={{ color: "#9ca3af" }}>No categorical columns.</p>
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {columns.map((col) => (
        <div key={col.name} style={{ background: "#0f0f0f", borderRadius: "8px", padding: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontWeight: 600, color: "#e5e7eb" }}>{col.name}</span>
            <span style={{ color: "#9ca3af", fontSize: "13px" }}>{col.unique_count} unique values</span>
          </div>
          {col.top_values?.slice(0, 5).map((tv) => (
            <div key={tv.value} style={{ marginBottom: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "2px" }}>
                <span style={{ color: "#d1d5db" }}>{tv.value}</span>
                <span style={{ color: "#9ca3af" }}>{tv.count.toLocaleString()} ({tv.pct.toFixed(1)}%)</span>
              </div>
              <div style={{ background: "#2a2a2a", borderRadius: "2px", height: "6px" }}>
                <div style={{ background: "#6366f1", borderRadius: "2px", height: "6px", width: `${tv.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function DatetimePanel({ columns }: { columns: ColumnInfo[] }) {
  if (columns.length === 0) return <p style={{ color: "#9ca3af" }}>No datetime columns.</p>
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {columns.map((col) => (
        <div key={col.name} style={{ background: "#0f0f0f", borderRadius: "8px", padding: "14px" }}>
          <div style={{ fontWeight: 600, color: "#e5e7eb", marginBottom: "10px" }}>{col.name}</div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "13px" }}>
            <div><span style={{ color: "#9ca3af" }}>Min: </span><span style={{ color: "#e5e7eb" }}>{col.min_date ?? "—"}</span></div>
            <div><span style={{ color: "#9ca3af" }}>Max: </span><span style={{ color: "#e5e7eb" }}>{col.max_date ?? "—"}</span></div>
            <div><span style={{ color: "#9ca3af" }}>Span: </span><span style={{ color: "#e5e7eb" }}>{col.span_days?.toLocaleString() ?? "—"} days</span></div>
          </div>
        </div>
      ))}
    </div>
  )
}

function DistributionPlots({ plots, columns }: { plots: Record<string, string>; columns: ColumnInfo[] }) {
  const [selected, setSelected] = useState<string>(columns[0]?.name ?? "")
  if (columns.length === 0) return null
  const img = plots[selected]
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
        {columns.map((c) => (
          <button
            key={c.name}
            onClick={() => setSelected(c.name)}
            style={{
              background: selected === c.name ? "#312e81" : "#0f0f0f",
              border: `1px solid ${selected === c.name ? "#6366f1" : "#2a2a2a"}`,
              borderRadius: "6px",
              padding: "4px 10px",
              color: selected === c.name ? "#a5b4fc" : "#9ca3af",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
      {img ? (
        <img src={`data:image/png;base64,${img}`} alt={`Distribution of ${selected}`}
             style={{ maxWidth: "100%", borderRadius: "8px", border: "1px solid #2a2a2a" }} />
      ) : (
        <p style={{ color: "#9ca3af", fontSize: "13px" }}>No distribution plot for this column.</p>
      )}
    </div>
  )
}

export default function ColumnStatsDetail({ profile }: Props) {
  const [activeTab, setActiveTab] = useState<"numeric" | "categorical" | "datetime" | "distributions">("numeric")

  const numericCols = profile.columns.filter(isNumeric)
  const catCols = profile.columns.filter(isCat)
  const dtCols = profile.columns.filter(isDt)
  const distPlots = profile.plots?.column_distributions ?? {}
  const hasPlots = Object.keys(distPlots).length > 0

  const tabs = [
    { id: "numeric" as const, label: "Numeric", count: numericCols.length },
    { id: "categorical" as const, label: "Categorical", count: catCols.length },
    { id: "datetime" as const, label: "Datetime", count: dtCols.length },
    ...(hasPlots ? [{ id: "distributions" as const, label: "Distributions", count: profile.columns.length }] : []),
  ]

  return (
    <div>
      <SummaryTable columns={profile.columns} />

      <div style={{ display: "flex", gap: "4px", marginBottom: "16px", borderBottom: "1px solid #2a2a2a", paddingBottom: "12px" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            style={{
              background: activeTab === tab.id ? "#312e81" : "none",
              border: `1px solid ${activeTab === tab.id ? "#6366f1" : "#2a2a2a"}`,
              borderRadius: "6px",
              padding: "6px 14px",
              color: activeTab === tab.id ? "#a5b4fc" : "#9ca3af",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>
      {activeTab === "numeric" && <NumericTable columns={numericCols} />}
      {activeTab === "categorical" && <CategoricalPanel columns={catCols} />}
      {activeTab === "datetime" && <DatetimePanel columns={dtCols} />}
      {activeTab === "distributions" && (
        <DistributionPlots plots={distPlots} columns={profile.columns} />
      )}
    </div>
  )
}
