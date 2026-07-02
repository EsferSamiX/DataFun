"use client"

import type { ProfileResult, ColumnInfo } from "@/lib/api"
import { useState, useEffect } from "react"
import ProfilingCardGrid, { ProfilingStage } from "@/components/profiling/ProfilingCardGrid"
import CardDetailPanel from "@/components/profiling/CardDetailPanel"

const ALL_STAGES: ProfilingStage[] = [
  "dataset_overview", "missing_values", "duplicates", "column_statistics",
  "correlations", "quality_score", "target_analysis", "recommendations", "columns",
]

function stageSummary(stage: ProfilingStage, p: ProfileResult): string {
  switch (stage) {
    case "dataset_overview": {
      const bytes = p.memory_usage_bytes ?? (p.memory_mb ? p.memory_mb * 1048576 : 0)
      const mem = bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`
      return `${p.num_rows} rows × ${p.num_columns} cols · ${mem} in memory`
    }
    case "missing_values": return `${p.missing_cells_pct?.toFixed(1) ?? 0}% missing`
    case "duplicates": return `${p.duplicate_rows ?? 0} duplicate rows`
    case "column_statistics": return `${p.columns?.length ?? 0} columns analysed`
    case "correlations": return `${p.correlations?.filter((c) => c.significant).length ?? 0} significant correlations`
    case "quality_score": return `Grade ${(p as any).quality_score?.grade ?? p.quality_grade ?? "?"} · ${((p as any).quality_score?.overall ?? p.quality_score ?? 0).toFixed?.(0) ?? "?"}%`
    case "target_analysis": return p.target_analysis ? `${p.target_analysis.task_type}` : "No target column"
    case "recommendations": return `${p.recommendations?.length ?? 0} recommendation(s)`
    case "columns": return `${p.columns?.length ?? 0} columns`
  }
}

function inferTaskType(col: ColumnInfo): string {
  const isNumeric = col.type === "float" || col.type === "integer"
  if (isNumeric && col.unique_count > 10) return "regression"
  if (col.unique_count === 2) return "binary_classification"
  return "multiclass_classification"
}

const TASK_TYPE_LABELS: Record<string, string> = {
  regression: "Regression",
  binary_classification: "Binary Classification",
  multiclass_classification: "Multiclass Classification",
}


interface Props {
  profile: ProfileResult
  label?: string
  onNext: () => void
  nextLabel?: string
  targetColumn?: string
  taskType?: string
  timeColumn?: string
  onTargetConfirm?: (column: string, taskType: string, timeColumn?: string) => Promise<void>
  lockedTarget?: boolean
}

export default function ProfileStep({
  profile,
  label = "Dataset Profile",
  onNext,
  nextLabel = "Continue to Preprocess",
  targetColumn = "",
  taskType = "",
  onTargetConfirm,
  lockedTarget = false,
}: Props) {
  const [selectedStage, setSelectedStage] = useState<ProfilingStage | null>(null)
  const [localColumn, setLocalColumn] = useState(targetColumn)
  const [localTaskType, setLocalTaskType] = useState(taskType)
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    setLocalColumn(targetColumn)
    setLocalTaskType(taskType)
  }, [targetColumn, taskType])

  const completedStages = new Map<ProfilingStage, string>(
    ALL_STAGES.map((s) => [s, stageSummary(s, profile)])
  )

  function handleColumnChange(colName: string) {
    setLocalColumn(colName)
    setConfirmed(false)
    setConfirmError(null)
    const col = profile.columns?.find((c) => c.name === colName)
    if (col) setLocalTaskType(inferTaskType(col))
  }

  async function handleConfirm() {
    if (!onTargetConfirm || !localColumn) return
    setIsConfirming(true)
    setConfirmError(null)
    try {
      await onTargetConfirm(localColumn, localTaskType)
      setConfirmed(true)
    } catch {
      setConfirmError("Failed to save target column. Please try again.")
    } finally {
      setIsConfirming(false)
    }
  }

  const isUnchanged = localColumn === targetColumn && !!targetColumn && localTaskType === taskType
  const columns = profile.columns ?? []

  const badgeColor = localTaskType === "regression"
    ? { bg: "rgba(16,185,129,0.15)", color: "#34d399", border: "rgba(16,185,129,0.3)" }
    : { bg: "rgba(99,102,241,0.15)", color: "#818cf8", border: "rgba(99,102,241,0.3)" }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "20px 28px 12px",
        borderBottom: "1px solid #1a1a1a",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#f9fafb" }}>{label}</h2>
          <p style={{ margin: "4px 0 0", color: "#9ca3af", fontSize: "14px" }}>
            {profile.file_name} · {profile.num_rows?.toLocaleString()} rows · {profile.num_columns} columns
          </p>
        </div>
        <button
          onClick={onNext}
          style={{
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            border: "none", borderRadius: "10px",
            padding: "11px 24px", color: "#fff", fontSize: "15px",
            fontWeight: 600, cursor: "pointer",
          }}
        >
          {nextLabel}
        </button>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        <ProfilingCardGrid
          activeStage={null}
          selectedStage={selectedStage}
          completedStages={completedStages}
          onCardClick={(stage) => setSelectedStage(selectedStage === stage ? null : stage)}
        />
        {selectedStage && (
          <CardDetailPanel
            stage={selectedStage}
            profileResult={profile}
            onClose={() => setSelectedStage(null)}
          />
        )}

        {/* Target column — locked read-only display in re-profile, editable in initial profile */}
        {lockedTarget && targetColumn ? (
          <div style={{
            marginTop: "16px", padding: "14px 20px",
            background: "#111", border: "1px solid #1f1f1f", borderRadius: "12px",
            display: "flex", alignItems: "center", gap: "12px",
          }}>
            <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Target Column
            </p>
            <span style={{
              padding: "6px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
              background: "#0f172a", border: "1px solid #1e293b", color: "#e2e8f0",
            }}>
              {targetColumn}
            </span>
            {taskType && (
              <span style={{
                padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
                background: badgeColor.bg, color: badgeColor.color,
                border: `1px solid ${badgeColor.border}`,
              }}>
                {TASK_TYPE_LABELS[taskType] ?? taskType}
              </span>
            )}
            <span style={{ fontSize: "12px", color: "#4b5563" }}>🔒 locked after preprocessing</span>
          </div>
        ) : onTargetConfirm && columns.length > 0 ? (
          <div style={{
            marginTop: "16px",
            padding: "16px 20px",
            background: "#111",
            border: "1px solid #1f1f1f",
            borderRadius: "12px",
          }}>
            <p style={{ margin: "0 0 12px", fontSize: "13px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Target Column
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <select
                value={localColumn}
                onChange={(e) => handleColumnChange(e.target.value)}
                style={{
                  background: "#1a1a1a", border: "1px solid #2a2a2a",
                  borderRadius: "8px", padding: "8px 12px",
                  color: "#f9fafb", fontSize: "14px", cursor: "pointer",
                  minWidth: "180px",
                }}
              >
                <option value="">— select column —</option>
                {columns.filter((c) =>
                  c.type !== "datetime" &&
                  !(c.type === "string" && c.unique_count >= profile.num_rows)
                ).map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>

              {localColumn && (
                <span style={{
                  padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
                  background: badgeColor.bg, color: badgeColor.color,
                  border: `1px solid ${badgeColor.border}`,
                }}>
                  {TASK_TYPE_LABELS[localTaskType] ?? localTaskType}
                </span>
              )}

              <button
                onClick={handleConfirm}
                disabled={!localColumn || isUnchanged || isConfirming}
                style={{
                  background: confirmed && isUnchanged
                    ? "rgba(16,185,129,0.15)"
                    : "linear-gradient(135deg, #4f46e5, #7c3aed)",
                  border: confirmed && isUnchanged ? "1px solid rgba(16,185,129,0.3)" : "none",
                  borderRadius: "8px", padding: "8px 16px",
                  color: confirmed && isUnchanged ? "#34d399" : "#fff",
                  fontSize: "13px", fontWeight: 600,
                  cursor: (!localColumn || isUnchanged || isConfirming) ? "not-allowed" : "pointer",
                  opacity: (!localColumn || isUnchanged || isConfirming) ? 0.5 : 1,
                  transition: "all 0.2s",
                }}
              >
                {isConfirming ? "Saving…" : confirmed && isUnchanged ? "✓ Confirmed" : "Confirm target"}
              </button>
            </div>

            {confirmError && (
              <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#f87171" }}>{confirmError}</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
