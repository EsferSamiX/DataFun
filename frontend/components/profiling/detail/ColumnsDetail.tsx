"use client"

import { useState } from "react"
import type { ProfileResult, ColumnInfo } from "@/lib/api"

interface Props { profile: ProfileResult }

const TYPE_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  integer:  { bg: "#1e3a5f", color: "#60a5fa", label: "INT" },
  float:    { bg: "#1e3a5f", color: "#93c5fd", label: "FLOAT" },
  boolean:  { bg: "#1e3a5f", color: "#a5b4fc", label: "BOOL" },
  string:   { bg: "#14532d", color: "#4ade80", label: "STR" },
  categorical: { bg: "#14532d", color: "#86efac", label: "CAT" },
  datetime: { bg: "#78350f", color: "#fbbf24", label: "DATE" },
}

function TypeBadge({ type }: { type: string }) {
  const style = TYPE_COLOR[type] ?? { bg: "#1a1a2e", color: "#9ca3af", label: type.toUpperCase().slice(0, 4) }
  return (
    <span style={{
      background: style.bg, color: style.color,
      fontSize: "10px", fontWeight: 700, padding: "2px 6px",
      borderRadius: "4px", letterSpacing: "0.05em", flexShrink: 0,
    }}>
      {style.label}
    </span>
  )
}

function MissingBar({ pct }: { pct: number }) {
  if (pct === 0) return <span style={{ color: "#22c55e", fontSize: "11px" }}>✓ none</span>
  const color = pct > 50 ? "#ef4444" : pct > 20 ? "#f59e0b" : "#9ca3af"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "50px", background: "#2a2a2a", borderRadius: "3px", height: "5px" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, background: color, height: "5px", borderRadius: "3px" }} />
      </div>
      <span style={{ color, fontSize: "11px" }}>{pct.toFixed(1)}%</span>
    </div>
  )
}

export default function ColumnsDetail({ profile }: Props) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<string>("all")

  const types = Array.from(new Set(profile.columns.map((c) => c.type).filter(Boolean)))

  const visible = profile.columns.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === "all" || c.type === filter
    return matchSearch && matchFilter
  })

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search columns…"
          style={{
            flex: 1, minWidth: "140px",
            background: "#0f0f0f", border: "1px solid #2a2a2a", borderRadius: "6px",
            padding: "6px 10px", color: "#e5e7eb", fontSize: "13px", outline: "none",
          }}
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            background: "#0f0f0f", border: "1px solid #2a2a2a", borderRadius: "6px",
            padding: "6px 10px", color: "#9ca3af", fontSize: "13px", cursor: "pointer",
          }}
        >
          <option value="all">All types ({profile.columns.length})</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t} ({profile.columns.filter((c) => c.type === t).length})
            </option>
          ))}
        </select>
      </div>

      {/* Column list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {visible.map((col, idx) => (
          <ColumnRow key={col.name} col={col} index={profile.columns.indexOf(col)} />
        ))}
        {visible.length === 0 && (
          <p style={{ color: "#4b5563", fontSize: "13px", textAlign: "center", padding: "20px 0" }}>
            No columns match.
          </p>
        )}
      </div>
    </div>
  )
}

function ColumnRow({ col, index }: { col: ColumnInfo; index: number }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{
      background: "#0f0f0f", border: "1px solid #1f1f1f",
      borderRadius: "8px", overflow: "hidden",
      transition: "border-color 0.15s",
    }}>
      {/* Header row — always visible */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "10px",
          padding: "10px 14px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Index */}
        <span style={{ color: "#374151", fontSize: "11px", width: "22px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
          {index + 1}
        </span>

        {/* Type badge */}
        <TypeBadge type={col.type ?? col.dtype ?? ""} />

        {/* Column name */}
        <span style={{ flex: 1, color: "#e5e7eb", fontSize: "13px", fontWeight: 500, wordBreak: "break-all" }}>
          {col.name}
        </span>

        {/* Missing */}
        <MissingBar pct={col.missing_pct ?? 0} />

        {/* Unique count */}
        <span style={{ color: "#4b5563", fontSize: "11px", width: "60px", textAlign: "right", flexShrink: 0 }}>
          {col.unique_count?.toLocaleString() ?? "—"} uniq
        </span>

        {/* Chevron */}
        <span style={{ color: "#374151", fontSize: "12px", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          ▼
        </span>
      </button>

      {/* Expanded detail */}
      {open && (
        <div style={{ padding: "0 14px 12px 46px", borderTop: "1px solid #1a1a1a" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", paddingTop: "10px", fontSize: "12px" }}>
            {col.mean != null && (
              <Stat label="Mean" value={col.mean.toFixed(3)} />
            )}
            {col.std != null && (
              <Stat label="Std" value={col.std.toFixed(3)} />
            )}
            {col.min != null && (
              <Stat label="Min" value={col.min.toLocaleString()} />
            )}
            {col.max != null && (
              <Stat label="Max" value={col.max.toLocaleString()} />
            )}
            {col.p25 != null && (
              <Stat label="Q1" value={col.p25.toFixed(2)} />
            )}
            {col.p50 != null && (
              <Stat label="Median" value={col.p50.toFixed(2)} />
            )}
            {col.p75 != null && (
              <Stat label="Q3" value={col.p75.toFixed(2)} />
            )}
            {col.skewness != null && (
              <Stat label="Skewness" value={col.skewness.toFixed(2)} warn={Math.abs(col.skewness) > 1} />
            )}
            {col.mode != null && (
              <Stat label="Mode" value={String(col.mode)} />
            )}
            {col.entropy != null && (
              <Stat label="Entropy" value={col.entropy.toFixed(2)} />
            )}
            {col.min_date != null && (
              <Stat label="From" value={col.min_date} />
            )}
            {col.max_date != null && (
              <Stat label="To" value={col.max_date} />
            )}
            {col.span_days != null && (
              <Stat label="Span" value={`${col.span_days.toLocaleString()} days`} />
            )}
          </div>
          {col.top_values && col.top_values.length > 0 && (
            <div style={{ marginTop: "10px" }}>
              <div style={{ color: "#4b5563", fontSize: "11px", marginBottom: "6px" }}>Top values</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {col.top_values.slice(0, 8).map((tv) => (
                  <span key={tv.value} style={{
                    background: "#1a1a1a", border: "1px solid #2a2a2a",
                    borderRadius: "4px", padding: "2px 8px",
                    color: "#9ca3af", fontSize: "11px",
                  }}>
                    {tv.value} <span style={{ color: "#4b5563" }}>({tv.pct.toFixed(1)}%)</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div style={{ color: "#4b5563", fontSize: "10px", marginBottom: "2px" }}>{label}</div>
      <div style={{ color: warn ? "#f59e0b" : "#d1d5db", fontWeight: 500 }}>{value}</div>
    </div>
  )
}
