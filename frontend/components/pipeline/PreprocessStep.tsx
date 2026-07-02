"use client"

import { useState, useMemo } from "react"
import type { ProfileResult } from "@/lib/api"

interface Op {
  op: string
  columns?: string[]
  value?: unknown
  lower_pct?: number
  upper_pct?: number
}

interface Props {
  profile: ProfileResult
  onApply: (ops: Op[]) => Promise<void>
  isApplying: boolean
  targetColumn?: string
  taskType?: string
  onSkip?: () => void
}

const AVAILABLE_OPS = [
  { op: "drop_duplicates",   label: "Drop Duplicate Rows",              desc: "Remove exact duplicate rows" },
  { op: "drop_missing_rows", label: "Drop Rows with Missing Values",    desc: "Remove rows that have any missing value" },
  { op: "impute_median",     label: "Impute Missing (Median)",          desc: "Fill numeric missing values with column median" },
  { op: "impute_mode",       label: "Impute Missing (Mode)",            desc: "Fill categorical missing values with most frequent value" },
  { op: "one_hot_encode",    label: "One-Hot Encode Categoricals",      desc: "Convert categorical columns to binary dummy columns" },
  { op: "label_encode",      label: "Label Encode Categoricals",        desc: "Convert categorical columns to integer labels" },
  { op: "standard_scale",    label: "Standardise Numerics (Z-score)",   desc: "Scale numeric columns to mean=0, std=1" },
  { op: "minmax_scale",      label: "Min-Max Scale Numerics",           desc: "Scale numeric columns to [0, 1] range" },
  { op: "log_transform",     label: "Log Transform Numerics",           desc: "Apply log1p to numeric columns (handles skew)" },
  { op: "clip_outliers",     label: "Clip Outliers",                    desc: "Clip values outside 1st–99th percentile" },
  { op: "drop_columns",      label: "Drop Columns",                     desc: "Remove specific columns from the dataset" },
]

interface Suggestion {
  op: string
  reason: string
  priority: "high" | "medium" | "low"
  suggestedCols?: string[]
}

function buildSuggestions(p: ProfileResult, targetColumn?: string, taskType?: string): Suggestion[] {
  const suggestions: Suggestion[] = []
  // Use confirmed target or fall back to auto-detected target from profile
  const effectiveTarget = targetColumn ?? p.target_analysis?.column
  // Exclude the target column from ALL feature-level suggestions
  const allCols = p.columns.filter((c) => c.name !== effectiveTarget)
  const numCols = allCols.filter((c) => ["integer", "float"].includes(c.type))
  const catCols = allCols.filter((c) => ["string", "categorical"].includes(c.type))
  const numColsMissing = numCols.filter((c) => c.missing_count > 0)
  const catColsMissing = catCols.filter((c) => c.missing_count > 0)

  if (p.duplicate_rows > 0) {
    suggestions.push({
      op: "drop_duplicates",
      reason: `${p.duplicate_rows} duplicate rows found (${p.duplicate_rows_pct?.toFixed(1) ?? "?"}%)`,
      priority: p.duplicate_rows_pct > 5 ? "high" : "medium",
    })
  }

  if (p.missing_cells_pct > 30) {
    suggestions.push({
      op: "drop_missing_rows",
      reason: `${p.missing_cells_pct.toFixed(1)}% cells missing — dropping incomplete rows may help`,
      priority: "medium",
    })
  }

  if (numColsMissing.length > 0) {
    suggestions.push({
      op: "impute_median",
      reason: `${numColsMissing.length} numeric column${numColsMissing.length > 1 ? "s" : ""} have missing values: ${numColsMissing.slice(0, 3).map((c) => c.name).join(", ")}${numColsMissing.length > 3 ? "…" : ""}`,
      priority: "high",
    })
  }

  if (catColsMissing.length > 0) {
    suggestions.push({
      op: "impute_mode",
      reason: `${catColsMissing.length} categorical column${catColsMissing.length > 1 ? "s" : ""} have missing values: ${catColsMissing.slice(0, 3).map((c) => c.name).join(", ")}${catColsMissing.length > 3 ? "…" : ""}`,
      priority: "high",
    })
  }

  const lowCardCat = catCols.filter((c) => (c.unique_count ?? 0) <= 20)
  const highCardCat = catCols.filter((c) => (c.unique_count ?? 0) > 20)

  if (lowCardCat.length > 0) {
    suggestions.push({
      op: "one_hot_encode",
      reason: `${lowCardCat.length} low-cardinality categorical column${lowCardCat.length > 1 ? "s" : ""} (≤20 values) — ideal for one-hot encoding`,
      priority: "medium",
    })
  }

  if (highCardCat.length > 0) {
    suggestions.push({
      op: "label_encode",
      reason: `${highCardCat.length} high-cardinality column${highCardCat.length > 1 ? "s" : ""} (>20 values) — label encoding is more efficient`,
      priority: "medium",
    })
  }

  const isRegression = taskType === "regression"

  const skewedCols = numCols.filter((c) => Math.abs(c.skewness ?? 0) > 1)
  if (skewedCols.length > 0) {
    suggestions.push({
      op: "log_transform",
      reason: `${skewedCols.length} feature column${skewedCols.length > 1 ? "s" : ""} are skewed: ${skewedCols.slice(0, 3).map((c) => c.name).join(", ")}${targetColumn ? " (target is protected)" : ""}`,
      priority: isRegression ? "high" : "medium",
    })
  }

  // Detect outliers in feature columns
  const outlierCols = numCols.filter((c) => {
    if (c.p75 == null || c.max == null) return false
    return c.max > c.p75 * 3 + 1
  })
  if (outlierCols.length > 0) {
    suggestions.push({
      op: "clip_outliers",
      reason: `${outlierCols.length} feature column${outlierCols.length > 1 ? "s" : ""} have extreme outliers: ${outlierCols.slice(0, 3).map((c) => c.name).join(", ")}`,
      priority: isRegression ? "high" : "medium",
    })
  }

  // Standard scale — skip recommendation for regression (tree models dominate; scaling hurts interpretability)
  if (numCols.length >= 1 && !isRegression) {
    const means = numCols.map((c) => Math.abs(c.mean ?? 0)).filter((m) => m > 0)
    const maxMean = means.length ? Math.max(...means) : 0
    const minMean = means.length ? Math.min(...means) : 0
    const scaleRatio = minMean > 0 ? maxMean / minMean : 1
    const reason = scaleRatio > 10
      ? `Feature columns have very different scales (${minMean.toFixed(1)}–${maxMean.toFixed(1)}) — standardising is strongly recommended`
      : `Standardising feature columns (mean=0, std=1) is recommended for SVM and KNN; harmless for tree-based models`
    suggestions.push({
      op: "standard_scale",
      reason,
      priority: scaleRatio > 10 ? "high" : "medium",
    })
  }

  // Drop columns: >50% missing, zero-variance, or ID-like — never suggest the target
  const dropCandidates: { name: string; reason: string }[] = []
  for (const col of p.columns) {
    if (col.name === effectiveTarget) continue  // never suggest dropping the target
    if (col.missing_pct > 50) {
      dropCandidates.push({ name: col.name, reason: `${col.missing_pct.toFixed(0)}% missing` })
    } else if ((col.unique_count ?? 0) <= 1 && col.missing_pct < 100) {
      dropCandidates.push({ name: col.name, reason: "zero variance (only 1 unique value)" })
    } else if (col.unique_count === p.num_rows && ["integer", "string"].includes(col.type)) {
      dropCandidates.push({ name: col.name, reason: "all values unique — likely an ID column" })
    }
  }
  if (dropCandidates.length > 0) {
    suggestions.push({
      op: "drop_columns",
      reason: `${dropCandidates.length} column${dropCandidates.length > 1 ? "s" : ""} recommended to drop`,
      priority: dropCandidates.some((d) => d.reason.includes("missing")) ? "high" : "low",
      suggestedCols: dropCandidates.map((d) => d.name),
    })
  }

  return suggestions
}

function priorityColor(p: "high" | "medium" | "low") {
  return p === "high" ? "#f87171" : p === "medium" ? "#fbbf24" : "#6b7280"
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: "20px", height: "20px", borderRadius: "6px", flexShrink: 0,
        border: checked ? "none" : "1.5px solid #374151",
        background: checked ? "#6366f1" : "transparent",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {checked && <span style={{ color: "#fff", fontSize: "12px", fontWeight: 700 }}>✓</span>}
    </div>
  )
}

export default function PreprocessStep({ profile, onApply, isApplying, targetColumn, taskType, onSkip }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dropCols, setDropCols] = useState<string[]>([])

  // Use confirmed target or fall back to auto-detected target so the target is
  // always excluded from suggestions/filtering even before the user confirms it
  const effectiveTarget = targetColumn ?? profile.target_analysis?.column

  const suggestions = useMemo(() => buildSuggestions(profile, targetColumn, taskType), [profile, targetColumn, taskType])
  const suggestionMap = useMemo(() => new Map(suggestions.map((s) => [s.op, s])), [suggestions])

  // Exclude target from the feature column lists shown in UI
  const numCols = profile.columns.filter((c) => ["integer", "float"].includes(c.type) && c.name !== effectiveTarget).map((c) => c.name)
  const catCols = profile.columns.filter((c) => ["string", "categorical"].includes(c.type) && c.name !== effectiveTarget).map((c) => c.name)

  const toggle = (op: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(op) ? next.delete(op) : next.add(op)
      return next
    })
  }

  const applyRecommended = () => {
    const recommended = new Set(suggestions.map((s) => s.op))
    setSelected(recommended)
    const colSugg = suggestions.find((s) => s.op === "drop_columns")
    if (colSugg?.suggestedCols) setDropCols(colSugg.suggestedCols)
  }

  const handleApply = async () => {
    const ops: Op[] = []
    for (const op of AVAILABLE_OPS) {
      if (!selected.has(op.op)) continue
      const entry: Op = { op: op.op }
      if (op.op === "drop_columns" && dropCols.length > 0) entry.columns = dropCols
      if (op.op === "clip_outliers") { entry.lower_pct = 1; entry.upper_pct = 99 }
      ops.push(entry)
    }
    if (ops.length === 0) return
    await onApply(ops)
  }

  const nSelected = selected.size
  const highPriority = suggestions.filter((s) => s.priority === "high")

  // Column drop suggestion details for tooltip
  const dropSugg = suggestionMap.get("drop_columns")
  const dropColDetails = useMemo(() => {
    const details: Record<string, string> = {}
    if (!dropSugg?.suggestedCols) return details
    for (const col of profile.columns) {
      if (!dropSugg.suggestedCols.includes(col.name)) continue
      if (col.missing_pct > 50) details[col.name] = `${col.missing_pct.toFixed(0)}% missing`
      else if ((col.unique_count ?? 0) <= 1) details[col.name] = "zero variance"
      else if (col.unique_count === profile.num_rows) details[col.name] = "likely ID column"
    }
    return details
  }, [dropSugg, profile.columns])

  if (isApplying) {
    return (
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        height: "100%", gap: "24px", background: "#0a0a0a",
      }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse-text {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
        <div style={{
          width: "64px", height: "64px", borderRadius: "50%",
          border: "4px solid #1f1f1f",
          borderTopColor: "#6366f1",
          borderRightColor: "#818cf8",
          animation: "spin 0.9s linear infinite",
        }} />
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: "20px", fontWeight: 700, color: "#f9fafb",
            animation: "pulse-text 1.8s ease-in-out infinite",
            marginBottom: "8px",
          }}>
            Applying preprocessing…
          </div>
          <div style={{ fontSize: "14px", color: "#6b7280" }}>
            Running {nSelected} operation{nSelected !== 1 ? "s" : ""} and re-profiling your dataset
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "20px 28px 16px",
        borderBottom: "1px solid #1a1a1a",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#f9fafb" }}>Preprocess Dataset</h2>
          <p style={{ margin: "4px 0 0", color: "#9ca3af", fontSize: "14px" }}>
            Select operations to apply. They run in order top-to-bottom.
          </p>
        </div>
        {nSelected > 0 ? (
          <button
            onClick={handleApply}
            disabled={isApplying}
            style={{
              background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
              border: "none", borderRadius: "10px",
              padding: "11px 24px", color: "#fff",
              fontSize: "15px", fontWeight: 600,
              cursor: isApplying ? "default" : "pointer",
              opacity: isApplying ? 0.6 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {`Apply (${nSelected}) & Re-profile →`}
          </button>
        ) : onSkip ? (
          <button
            onClick={onSkip}
            style={{
              background: "none", border: "1px solid #2a2a2a",
              borderRadius: "10px", padding: "11px 24px",
              color: "#9ca3af", fontSize: "15px", fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Skip to Model Suggestions →
          </button>
        ) : null}
      </div>

      {/* Two-column body */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", gap: "0" }}>

        {/* LEFT — ops list */}
        <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto", borderRight: "1px solid #1a1a1a" }}>
          {/* Target protection banner */}
          {targetColumn && (
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 14px", marginBottom: "16px",
              background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)",
              borderRadius: "10px",
            }}>
              <span style={{ fontSize: "14px" }}>🔒</span>
              <div>
                <span style={{ color: "#34d399", fontWeight: 700, fontSize: "13px" }}>
                  Target column protected:
                </span>{" "}
                <span style={{ color: "#6ee7b7", fontSize: "13px", fontFamily: "monospace" }}>
                  {targetColumn}
                </span>
                <span style={{ color: "#4b7c69", fontSize: "12px", marginLeft: "8px" }}>
                  ({taskType?.replace(/_/g, " ")}) — excluded from all preprocessing ops
                </span>
              </div>
            </div>
          )}

          {/* Dataset info strip */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
            {[
              { label: "Rows", value: profile.num_rows.toLocaleString() },
              { label: "Columns", value: profile.num_columns },
              { label: "Missing", value: `${profile.missing_cells_pct?.toFixed(1) ?? 0}%` },
              { label: "Duplicates", value: profile.duplicate_rows ?? 0 },
              { label: "Numeric", value: numCols.length },
              { label: "Categorical", value: catCols.length },
            ].map(({ label, value }) => (
              <div key={label} style={{
                background: "#111", border: "1px solid #1f1f1f", borderRadius: "8px",
                padding: "8px 14px",
              }}>
                <div style={{ color: "#6b7280", fontSize: "11px", marginBottom: "2px" }}>{label}</div>
                <div style={{ color: "#f9fafb", fontSize: "15px", fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Operations list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {AVAILABLE_OPS.map((op) => {
              const sugg = suggestionMap.get(op.op)
              const isSelected = selected.has(op.op)
              return (
                <div key={op.op}>
                  <div
                    onClick={() => toggle(op.op)}
                    style={{
                      display: "flex", alignItems: "center", gap: "14px",
                      padding: "13px 16px", borderRadius: "10px",
                      border: isSelected
                        ? "1px solid #3730a3"
                        : sugg
                        ? `1px solid ${priorityColor(sugg.priority)}33`
                        : "1px solid #1f1f1f",
                      background: isSelected
                        ? "rgba(99,102,241,0.08)"
                        : sugg
                        ? "rgba(255,255,255,0.02)"
                        : "#111",
                      cursor: "pointer",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    <Checkbox checked={isSelected} onChange={() => toggle(op.op)} />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#f9fafb", fontSize: "15px", fontWeight: 600 }}>{op.label}</div>
                      <div style={{ color: "#9ca3af", fontSize: "13px", marginTop: "3px" }}>{op.desc}</div>
                    </div>
                    {sugg && (
                      <span style={{
                        fontSize: "12px", fontWeight: 600,
                        color: priorityColor(sugg.priority),
                        background: `${priorityColor(sugg.priority)}18`,
                        border: `1px solid ${priorityColor(sugg.priority)}44`,
                        borderRadius: "6px", padding: "3px 9px",
                        whiteSpace: "nowrap", flexShrink: 0,
                      }}>
                        💡 {sugg.priority === "high" ? "Recommended" : "Suggested"}
                      </span>
                    )}
                  </div>

                  {/* Drop columns sub-picker */}
                  {op.op === "drop_columns" && isSelected && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        margin: "6px 0 4px 50px",
                        background: "#0d0d0d", border: "1px solid #1f1f1f",
                        borderRadius: "10px", padding: "14px 16px",
                      }}
                    >
                      <div style={{ fontSize: "13px", color: "#9ca3af", marginBottom: "10px", fontWeight: 500 }}>
                        Select columns to drop:
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {profile.columns.map((c) => {
                          const isTarget = c.name === effectiveTarget
                          const isSuggested = dropSugg?.suggestedCols?.includes(c.name)
                          const isDropped = dropCols.includes(c.name)
                          if (isTarget) {
                            return (
                              <div key={c.name} style={{
                                background: "rgba(16,185,129,0.07)",
                                border: "1px solid rgba(16,185,129,0.25)",
                                borderRadius: "7px", padding: "5px 11px",
                                display: "flex", flexDirection: "column", alignItems: "flex-start",
                                cursor: "not-allowed", opacity: 0.7,
                              }}>
                                <span style={{ fontSize: "13px", fontWeight: 500, color: "#34d399" }}>
                                  🔒 {c.name}
                                </span>
                                <span style={{ fontSize: "11px", color: "#4b7c69", marginTop: "2px" }}>target — protected</span>
                              </div>
                            )
                          }
                          return (
                            <button
                              key={c.name}
                              onClick={() => setDropCols((prev) =>
                                prev.includes(c.name) ? prev.filter((x) => x !== c.name) : [...prev, c.name]
                              )}
                              style={{
                                background: isDropped ? "rgba(99,102,241,0.15)" : "#111",
                                border: isDropped
                                  ? "1px solid #4338ca"
                                  : isSuggested
                                  ? `1px solid ${priorityColor(dropSugg!.priority)}66`
                                  : "1px solid #1f1f1f",
                                borderRadius: "7px", padding: "5px 11px",
                                cursor: "pointer", transition: "all 0.12s",
                                display: "flex", flexDirection: "column", alignItems: "flex-start",
                              }}
                            >
                              <span style={{
                                fontSize: "13px", fontWeight: isDropped ? 600 : 500,
                                color: isDropped ? "#a5b4fc" : isSuggested ? "#f9fafb" : "#9ca3af",
                              }}>
                                {isDropped ? "✓ " : ""}{c.name}
                              </span>
                              {isSuggested && dropColDetails[c.name] && (
                                <span style={{ fontSize: "11px", color: priorityColor(dropSugg!.priority), marginTop: "2px" }}>
                                  💡 {dropColDetails[c.name]}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                      <div style={{ marginTop: "10px", fontSize: "12px", color: "#4b5563" }}>
                        {dropCols.length} column{dropCols.length !== 1 ? "s" : ""} selected to drop
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT — suggestions panel */}
        <div style={{
          width: "300px", flexShrink: 0, padding: "20px 20px",
          overflowY: "auto",
        }}>
          <div style={{
            fontSize: "12px", fontWeight: 700, color: "#4b5563",
            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "14px",
          }}>
            💡 DataFun Suggests
          </div>

          {suggestions.length === 0 ? (
            <div style={{
              background: "#0f0f0f", border: "1px solid #1a1a1a",
              borderRadius: "10px", padding: "16px",
              fontSize: "13px", color: "#4b5563", textAlign: "center",
            }}>
              Dataset looks clean — no issues detected.
            </div>
          ) : (
            <>
              {/* Apply recommended button */}
              <button
                onClick={applyRecommended}
                style={{
                  width: "100%", background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                  border: "none", borderRadius: "10px",
                  padding: "11px 0", color: "#fff",
                  fontSize: "14px", fontWeight: 700, cursor: "pointer",
                  marginBottom: "16px", transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                ✦ Apply All Recommended
              </button>

              {/* High priority first */}
              {highPriority.length > 0 && (
                <div style={{ marginBottom: "6px", fontSize: "11px", color: "#f87171", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Urgent
                </div>
              )}
              {suggestions
                .sort((a, b) => {
                  const order = { high: 0, medium: 1, low: 2 }
                  return order[a.priority] - order[b.priority]
                })
                .map((s) => {
                  const opMeta = AVAILABLE_OPS.find((o) => o.op === s.op)
                  return (
                    <div
                      key={s.op}
                      onClick={() => {
                        toggle(s.op)
                        if (s.op === "drop_columns" && s.suggestedCols) {
                          setDropCols(s.suggestedCols)
                        }
                      }}
                      style={{
                        background: selected.has(s.op) ? "rgba(99,102,241,0.08)" : "#0f0f0f",
                        border: `1px solid ${selected.has(s.op) ? "#3730a3" : `${priorityColor(s.priority)}33`}`,
                        borderRadius: "10px", padding: "12px 14px",
                        marginBottom: "8px", cursor: "pointer",
                        transition: "background 0.15s, border-color 0.15s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                        <span style={{
                          width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                          background: priorityColor(s.priority),
                        }} />
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#e5e7eb", flex: 1 }}>
                          {opMeta?.label}
                        </span>
                        {selected.has(s.op) && (
                          <span style={{ fontSize: "11px", color: "#818cf8", fontWeight: 600 }}>✓ On</span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: "12px", color: "#6b7280", lineHeight: 1.5 }}>
                        {s.reason}
                      </p>
                      {s.op === "drop_columns" && s.suggestedCols && (
                        <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {s.suggestedCols.map((col) => (
                            <span key={col} style={{
                              background: "#1a1a1a", border: `1px solid ${priorityColor(s.priority)}44`,
                              borderRadius: "5px", padding: "2px 8px",
                              fontSize: "11px", color: "#9ca3af",
                            }}>{col}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

              <div style={{
                marginTop: "12px", padding: "12px 14px",
                background: "#0a0a0a", border: "1px solid #1a1a1a",
                borderRadius: "10px",
                fontSize: "12px", color: "#374151", lineHeight: 1.6,
              }}>
                Click any card to toggle that operation on the left, or use <strong style={{ color: "#4b5563" }}>Apply All Recommended</strong> to select everything at once.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
